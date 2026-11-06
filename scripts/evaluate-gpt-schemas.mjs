import http from "node:http";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { strictSchemaProblems, schemaShape, validateAgainstSchema } from "../lib/schema-check.mjs";
import { llmTriageSecondOpinion } from "../lib/triage-llm.mjs";
import { evaluateCue, evaluateCueBatch } from "../lib/cue.mjs";
import { composeIngredientRationales, composeRoutineContext, synthesizeIngredientSelection, synthesizeRoutine } from "../lib/synthesis.mjs";
import { scanProductLabel } from "../lib/label-scan.mjs";

/**
 * C2: GPT output schema contract test (offline, against a local mock of the
 * OpenAI Responses API). For every structured-output call the app makes:
 *   1. the schema sent is accepted by OpenAI strict mode (no unsupported
 *      keywords, additionalProperties false, every property required);
 *   2. its shape matches the committed snapshot
 *      (data/evaluation/fixtures/gpt-schemas.snapshot.json), so any change to
 *      a schema fails this test until the snapshot is deliberately updated
 *      with `npm run eval:gpt-schemas -- --update`;
 *   3. a reply that matches the schema is read and used (parser and schema
 *      agree);
 *   4. replies that do not match (a required field missing, a wrong type,
 *      not JSON) are rejected and the rule-based path is used;
 *   5. every json_schema call in lib/ is covered by this test.
 */

const update = process.argv.includes("--update");
const snapshotUrl = new URL("../data/evaluation/fixtures/gpt-schemas.snapshot.json", import.meta.url);

const captured = new Map();
let mode = "valid";
const input = (req) => { try { return JSON.parse(req.input); } catch { return {}; } };
const builders = {
  triage_second_opinion: (inp, schema) => ({ needs_professional_care: true, category: schema.properties.category.enum.at(-1), reason: "Mock reason." }),
  dermasynth_category_selection: (inp) => ({ include_hydration: true, evidence_ids: [inp.evidence?.[0]?.id].filter(Boolean), rationale_tags: ["eligible_evidence"] }),
  ingredient_selection: (inp) => ({ selections: (inp.categories || []).map((c) => ({ category: c.category, ingredientId: c.options[0].id })) }),
  routine_context: (inp) => ({
    steps: (inp.steps || []).map((s) => ({ key: s.key, text: `${s.step} is part of your ${s.phase} routine today because ${s.rule}` })),
    ingredients: (inp.ingredients || []).map((i) => ({ key: i.key, why_step: `${i.step} is in your ${i.phase} routine today.`, what_it_is: `${i.ingredient} is ${i.what_it_is_plain || "an approved ingredient"}.`, why_today: `${i.step} suits you today because ${i.step_rule}` })),
  }),
  cue_verdicts: (inp) => ({ verdicts: (inp.statements || []).map((s) => ({ index: s.index, supported: true, reason: "Stated in the context." })) }),
  cue_batch_verdicts: (inp) => ({ items: (inp.items || []).map((it) => ({ id: it.id, verdicts: it.statements.map((s) => ({ index: s.index, supported: true, reason: "Stated in the context." })) })) }),
  label_transcription: () => ({ legible: true, product_name: "Mock Gentle Cleanser", brand: "Mock", product_type: "cleanser", ingredients_text: "Aqua, Glycerin, Panthenol" }),
  ingredient_rationales: (inp) => ({ rationales: (inp.candidates || []).map((c) => ({ id: c.id, text: `${c.ingredient} is listed with a published safety conclusion from its source.` })) }),
};
function malformed(valid, schema, kind) {
  if (kind === "not_json") return "{ this is not json";
  const key = schema.required[0];
  const copy = { ...valid };
  if (kind === "missing_field") delete copy[key];
  if (kind === "wrong_type") copy[key] = schema.properties[key].type === "string" ? 42 : "not the right type";
  if (kind === "extra_field") copy.unexpected_field = "x";
  return JSON.stringify(copy);
}
const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const request = JSON.parse(body || "{}");
  const format = request?.text?.format;
  const name = format?.name;
  res.setHeader("content-type", "application/json");
  if (!name) { res.end(JSON.stringify({ status: "completed", output_text: "A short grounded paragraph." })); return; }
  if (!captured.has(name)) captured.set(name, format.schema);
  const valid = builders[name] ? builders[name](input(request), format.schema) : {};
  // The CUE judge used inside other calls always answers correctly, so only
  // the call under test receives the malformed reply.
  const target = mode.split(":")[0];
  const kind = mode.split(":")[1];
  const text = kind && name === target ? malformed(valid, format.schema, kind) : JSON.stringify(valid);
  res.end(JSON.stringify({ status: "completed", output_text: text }));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const config = {
  liveServicesEnabled: true,
  cueThreshold: 0.8,
  cue: { method: "llm_judge", maxRetries: 0 },
  triage: { llmEnabled: true },
  openai: { apiKey: "mock", model: "mock-model", fallbackModels: [], timeoutMs: 5000, reasoningEffort: "low", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, errorLogPath: "tmp/gpt-schemas-test-errors.jsonl" },
};

// One call per schema. `used` says whether the model's reply was used.
const pool = [{ categoryId: "comfort-hydration", categoryTitle: "Comfort hydration", candidates: [{ ingredientId: "glycerin", displayName: "Glycerin" }, { ingredientId: "sodium-hyaluronate", displayName: "Sodium Hyaluronate" }] }];
const environment = { readings: { uvi: 6, humidity: 55, pm25: 20, temperature: 30 } };
const calls = {
  triage_second_opinion: async () => { const r = await llmTriageSecondOpinion({ config, symptoms: "a lump on my arm" }); return r.status === "completed" && r.escalate === true; },
  dermasynth_category_selection: async () => { const r = await synthesizeRoutine({ config, profile: "combination", concern: "acne", environment, evidence: [{ id: "ev-1", title: "Evidence one", source: "CIR", excerpt: "Glycerin is safe as used." }] }); return (r.generation?.selectionEvidenceIds || []).includes("ev-1"); },
  ingredient_selection: async () => { const r = await synthesizeIngredientSelection({ config, concern: "dryness", environment, pool }); return r.map["comfort-hydration"] === "glycerin"; },
  routine_context: async () => {
    const r = await composeRoutineContext({ config, concernLabel: "Dryness", profile: "dry", environment, steps: [{ key: "am:low-irritation-cleansing", phase: "am", title: "Gentle cleanse", purpose: "A gentle start.", rule: "the morning routine starts with a gentle cleanser." }], entries: [{ key: "am:comfort-hydration", name: "Glycerin", phase: "am", stepTitle: "Hydrating layer", stepRule: "humidity is low.", facts: { what_it_is_plain: "a humectant, an ingredient that attracts water" } }] });
    return Boolean(r.steps["am:low-irritation-cleansing"] || r.ingredients["am:comfort-hydration"]);
  },
  cue_verdicts: async () => (await evaluateCue({ config, text: "Glycerin attracts water. It is used in the morning.", facts: { note: "Glycerin attracts water. It is used in the morning." } })).method === "llm_judge",
  cue_batch_verdicts: async () => (await evaluateCueBatch({ config, items: [{ id: "a", text: "Glycerin attracts water.", facts: { note: "Glycerin attracts water." } }] })).get("a").method === "llm_judge",
  label_transcription: async () => { const r = await scanProductLabel({ config, image: "data:image/png;base64,iVBORw0KGgo=" }); return r.legible === true && r.ingredientsText.includes("Glycerin") && r.type === "cleanser"; },
  ingredient_rationales: async () => (await composeIngredientRationales({ config, concern: "dryness", environment, candidates: [{ id: "glycerin", name: "Glycerin", category: "Comfort hydration", note: { text: "Glycerin is listed with a published safety conclusion from its source.", source: "CIR" } }] })).length === 1,
};
const run = async (name, m) => { mode = m; try { return { used: await calls[name](), threw: null }; } catch (error) { return { used: false, threw: error?.code || error?.message || "error" }; } };

const results = [];
const test = (id, title, pass, detail = "") => results.push({ id, title, status: pass ? "passed" : "failed", ...(pass ? {} : { detail }) });

// 5. Coverage: every json_schema call in lib/ has a test here.
const libNames = new Set();
for (const file of await readdir(new URL("../lib/", import.meta.url))) {
  if (!file.endsWith(".mjs")) continue;
  const text = await readFile(new URL(`../lib/${file}`, import.meta.url), "utf8");
  for (const match of text.matchAll(/type:\s*"json_schema"[\s\S]{0,120}?name:\s*"([a-z_]+)"/g)) libNames.add(match[1]);
}
const missing = [...libNames].filter((n) => !calls[n]);
test("schema-00", `Every structured-output call in lib/ is covered (${libNames.size} found)`, !missing.length, `Not covered: ${missing.join(", ")}`);

const snapshot = update ? {} : JSON.parse(await readFile(snapshotUrl, "utf8").catch(() => "{}"));
let n = 0;
for (const name of Object.keys(calls)) {
  n += 1;
  const id = `schema-${String(n).padStart(2, "0")}`;
  const valid = await run(name, "valid");
  const schema = captured.get(name);
  if (!schema) { test(`${id}a`, `${name}: the call is made`, false, "No request reached the mock."); continue; }
  const problems = strictSchemaProblems(schema);
  test(`${id}a`, `${name}: schema is valid for OpenAI strict mode`, !problems.length, problems.slice(0, 4).join("; "));
  const shape = schemaShape(schema);
  if (update) snapshot[name] = shape;
  else test(`${id}b`, `${name}: schema matches the committed snapshot`, JSON.stringify(snapshot[name]) === JSON.stringify(shape), snapshot[name] ? "Schema changed. If intended, update the parser, then run npm run eval:gpt-schemas -- --update." : "Not in the snapshot yet.");
  const example = builders[name]({}, schema);
  test(`${id}c`, `${name}: a reply matching the schema is read and used`, valid.used && !validateAgainstSchema(example, schema).length, valid.threw ? `Threw ${valid.threw}` : "Valid reply was not used.");
  for (const kind of ["missing_field", "wrong_type", "extra_field", "not_json"]) {
    const bad = await run(name, `${name}:${kind}`);
    test(`${id}-${kind}`, `${name}: a reply with ${kind.replace("_", " ")} is rejected and the rule-based path is used`, !bad.used, "The malformed reply was used.");
  }
}
server.close();

if (update) {
  await writeFile(snapshotUrl, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Snapshot updated: ${Object.keys(snapshot).length} schemas.`);
}
const passed = results.filter((r) => r.status === "passed").length;
const md = ["# GPT output schema contract (C2)", "", `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run eval:gpt-schemas\` against a local mock of the Responses API. Result: **${passed}/${results.length} passed**.`, "", "| ID | Check | Result |", "| --- | --- | --- |", ...results.map((r) => `| ${r.id} | ${r.title} | ${r.status}${r.detail ? `: ${r.detail}` : ""} |`), ""];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("gpt-schemas.latest.md", out), `${md.join("\n")}\n`);
console.log(JSON.stringify({ suite: "gpt-schemas", total: results.length, passed, failures: results.filter((r) => r.status !== "passed") }, null, 2));
if (passed !== results.length) process.exitCode = 1;
