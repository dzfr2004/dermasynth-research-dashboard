import http from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { createGptBudget, runWithGptBudget, callResponses } from "../lib/openai.mjs";
import { synthesizeIngredientSelection, composeRoutineContext, synthesizeRoutine } from "../lib/synthesis.mjs";
import { retrieveEvidence } from "../lib/retrieval.mjs";
import { secondSafetyPass } from "../lib/safety.mjs";
import { buildTwoLevelExplanation } from "../lib/peg.mjs";
import { buildEnvironmentalExplainability } from "../lib/explainability.mjs";
import { templateRoutine } from "../lib/safety.mjs";

/**
 * Offline contract tests for the GPT layer (C2, C4, C5). A local mock stands
 * in for the OpenAI Responses API, so no key or network is needed.
 *
 *   C2  the ingredient picker never receives scores or ranks, and options are
 *       alphabetical;
 *   C4  the shared time budget caps and skips calls, and a failed explanation
 *       rewrite keeps the drafts that already passed;
 *   C5  every routine step has a rule-based reason without GPT;
 *   the consumer "Why?" panel fields come back separately and the model is
 *   given the plain-language facts it must stay within.
 */

const seen = [];
let behaviour = {};
const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const request = JSON.parse(body || "{}");
  const name = request?.text?.format?.name;
  const input = (() => { try { return JSON.parse(request.input); } catch { return {}; } })();
  seen.push({ name, input });
  const rule = behaviour[name] || {};
  await new Promise((r) => setTimeout(r, rule.delayMs ?? 5));
  if (rule.fail) { res.statusCode = 500; res.end(JSON.stringify({ error: { message: "mock failure", code: "server_error" } })); return; }
  if (!name && behaviour.rationaleText) {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ status: "completed", output_text: behaviour.rationaleText }));
    return;
  }
  let out = {};
  if (name === "dermasynth_category_selection") out = { include_hydration: true, evidence_ids: (input.evidence || []).slice(0, 2).map((e) => e.id), rationale_tags: ["environment_context", "eligible_evidence"] };
  if (name === "cue_verdicts") out = { verdicts: (input.statements || []).map((st) => ({ index: st.index, supported: true, reason: "mock" })) };
  if (name === "ingredient_selection") out = { selections: input.categories.map((c) => ({ category: c.category, ingredientId: c.options[0].id })) };
  if (name === "routine_context") {
    const retry = seen.filter((s) => s.name === "routine_context").length > 1;
    out = {
      steps: (input.steps || []).map((s) => ({ key: s.key, text: `${s.step} is part of the ${s.phase} routine today because ${s.rule}` })),
      ingredients: (input.ingredients || []).map((i) => ({ key: i.key, why_step: `${i.step} is in the ${i.phase} routine today.`, what_it_is: retry ? "x" : `${i.ingredient} is ${i.what_it_is_plain || "an approved ingredient"}.`, why_today: `${i.step} suits you today because ${i.step_rule}` })),
    };
  }
  if (name === "cue_batch_verdicts") out = { items: input.items.map((it) => ({ id: it.id, verdicts: it.statements.map((s) => ({ index: s.index, supported: !String(it.id).startsWith("ing:") || !behaviour.rejectIngredients, reason: "mock" })) })) };
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ status: "completed", output_text: JSON.stringify(out) }));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const config = {
  liveServicesEnabled: true,
  cueThreshold: 0.8,
  cue: { method: "llm_judge", maxRetries: 1 },
  openai: { apiKey: "mock", model: "mock-model", fallbackModels: [], timeoutMs: 5000, baseUrl: `http://127.0.0.1:${port}/v1`, errorLogPath: "tmp/gpt-layer-test-errors.jsonl" },
};

const results = [];
async function test(id, title, fn) {
  try { await fn(); results.push({ id, title, status: "passed" }); }
  catch (error) { results.push({ id, title, status: "failed", detail: error instanceof Error ? error.message : String(error) }); }
}
const expect = (cond, message) => { if (!cond) throw new Error(message); };

// C2
await test("gpt-01", "Ingredient picker input has no score, rank or fit fields and options are alphabetical", async () => {
  behaviour = {};
  const pool = [{ categoryId: "comfort-hydration", categoryTitle: "Comfort hydration", candidates: [
    { ingredientId: "sodium-hyaluronate", displayName: "Sodium Hyaluronate", score: 0.9, retrievalRank: 1, userFit: 0.8, fitReasons: ["x"] },
    { ingredientId: "beta-glucan", displayName: "Beta-Glucan", score: 0.7, retrievalRank: 2, userFit: 0.4, fitReasons: ["y"] },
  ] }];
  await synthesizeIngredientSelection({ config, concern: "dryness", environment: { readings: { uvi: 5, humidity: 40 } }, pool, userContext: { skin_profile: "dry" } });
  const sent = seen.filter((s) => s.name === "ingredient_selection").at(-1).input;
  const text = JSON.stringify(sent.categories);
  expect(!/score|rank|fit/i.test(Object.keys(sent.categories[0].options[0]).join(",")), `Option fields leak scoring: ${Object.keys(sent.categories[0].options[0]).join(", ")}`);
  expect(!text.includes("0.9") && !text.includes("retrieval_rank"), "Score values reached the model.");
  expect(sent.categories[0].options.map((o) => o.id).join(",") === "beta-glucan,sodium-hyaluronate", "Options are not alphabetical.");
  expect(sent.user_context?.skin_profile === "dry", "User context missing.");
});

// C4
await test("gpt-02", "A call is skipped once the budget is used up, and the budget records it", async () => {
  behaviour = {};
  const budget = createGptBudget(1000);
  await new Promise((r) => setTimeout(r, 200));
  let code = null;
  try { await runWithGptBudget(budget, () => callResponses(config, { input: "{}", text: { format: { type: "json_schema", name: "noop", strict: true, schema: { type: "object" } } } }, { service: "test" })); }
  catch (error) { code = error.code; }
  expect(code === "budget_exhausted", `Expected budget_exhausted, got ${code}.`);
  expect(budget.exhausted && budget.skipped.includes("test"), "Budget did not record the skip.");
});
await test("gpt-03", "A slow call is cut off at the remaining budget, not the full timeout", async () => {
  behaviour = { slow: { delayMs: 3000 } };
  const budget = createGptBudget(2500);
  const started = Date.now();
  let code = null;
  try { await runWithGptBudget(budget, () => callResponses(config, { input: "{}", text: { format: { type: "json_schema", name: "slow", strict: true, schema: { type: "object" } } } }, { service: "slow test" })); }
  catch (error) { code = error.code; }
  const took = Date.now() - started;
  expect(code === "budget_exhausted", `Expected budget_exhausted, got ${code}.`);
  expect(took < 2900, `Call ran ${took} ms, past the 2500 ms budget.`);
});
await test("gpt-04", "When the explanation rewrite fails, drafts that already passed are kept", async () => {
  behaviour = { rejectIngredients: true };
  seen.length = 0;
  const steps = [{ key: "am:low-irritation-cleansing", phase: "am", title: "Low-irritation cleansing", purpose: "A gentle start.", rule: "The morning routine starts with low-irritation cleansing." }];
  const entries = [{ key: "am:comfort-hydration", name: "Glycerin", phase: "am", stepTitle: "Comfort hydration", stepRule: "Humidity is low.", facts: { functional_class: "Humectant" } }];
  // the second routine_context call (the rewrite) fails
  let calls = 0;
  const original = behaviour;
  behaviour = new Proxy(original, { get: (target, key) => (key === "routine_context" ? (calls++ >= 1 ? { fail: true } : {}) : target[key]) });
  const result = await composeRoutineContext({ config, concernLabel: "Dryness", profile: "dry", environment: { readings: { humidity: 40 } }, steps, entries });
  expect(result.steps["am:low-irritation-cleansing"], "The step draft that passed was lost.");
  expect(result.withheld.some((w) => w.key === "am:comfort-hydration"), "The rejected ingredient should be withheld.");
  expect(result.retry === "failed", `Expected retry=failed, got ${result.retry}.`);
  expect(result.audit.length >= 2, "Audit trail missing drafts.");
});

// C5
await test("gpt-05", "Every routine step has a rule-based reason without GPT", async () => {
  for (const concern of ["acne", "dryness", "pigment", "barrier"]) {
    const environment = { readings: { uvi: 9, humidity: 80, pm25: 70, temperature: 33 } };
    const routine = templateRoutine(concern, { environment, evidence: [], profile: "combination" });
    const explanation = buildTwoLevelExplanation({ explainability: buildEnvironmentalExplainability({ concern, environment }), routine, entries: [], environment, concern });
    const all = [...routine.am.map((s) => `am:${s.id}`), ...routine.pm.map((s) => `pm:${s.id}`)];
    for (const key of all) {
      const [phase, id] = key.split(":");
      const reason = explanation.steps.find((s) => s.phase === phase && s.categoryId === id)?.text || "";
      expect(reason.length > 30 && !/^(Comfort-focused|Lightweight|Balanced) .* context\.$/.test(reason), `${concern} ${key} has no rule-based reason.`);
    }
  }
});

await test("gpt-06", "Ingredient explanations come back as what it is / why today, grounded in the plain facts", async () => {
  behaviour = {};
  seen.length = 0;
  const entries = [{ key: "am:comfort-hydration", name: "Glycerin", phase: "am", stepTitle: "Comfort hydration", stepRule: "Humidity is low.", facts: { functional_class: "Humectant", what_it_is_plain: "A humectant: an ingredient that attracts water.", why_today_plain: "A richer texture today because of dry air.", safety_plain: "An independent US expert panel concluded it is safe as used in cosmetics." } }];
  const result = await composeRoutineContext({ config, concernLabel: "Dryness", profile: "dry", environment: { readings: { humidity: 40 } }, steps: [], entries });
  const item = result.ingredients["am:comfort-hydration"];
  expect(item && item.whatItIs && item.whyToday && !("safety" in item), "Expected what it is and why today only.");
  const sent = seen.find((s) => s.name === "routine_context").input.ingredients[0];
  expect(sent.what_it_is_plain && sent.why_today_plain, "Plain facts were not sent to the model.");
});

await test("gpt-07", "A GPT routine paragraph that names an ingredient is dropped; the GPT routine itself is kept and passes the safety pass", async () => {
  // Reproduces live run 10 (Cairo, dry skin): the paragraph named an ingredient,
  // the final safety pass flagged the whole routine and the GPT result was discarded.
  behaviour = { rationaleText: "Dry air today makes the comfort hydration and barrier support categories reasonable, and glycerin can help the skin hold water. Deterministic safety checks remain the final authority." };
  const environment = { readings: { uvi: 9, humidity: 22, temperature: 33, pm25: 40 } };
  const retrieval = await retrieveEvidence({ config: { ...config, ingredientDb: { enabled: true } }, profile: "dry", concern: "dryness", environment });
  const routine = await synthesizeRoutine({ config, profile: "dry", concern: "dryness", environment, evidence: retrieval.eligibleEvidence, finishPreference: "dewy", reactivityLevel: "low", exposureContext: "indoors" });
  const pass = secondSafetyPass(routine, { concern: "dryness", environment, reactivityLevel: "low", allowedEvidenceIds: retrieval.eligibleEvidence });
  expect(pass.status === "cleared", `Second safety pass was ${pass.status}: ${(pass.flags || []).join(" ")}`);
  expect(!/glycerin/i.test(routine.generation?.aiRationale?.text || ""), "The paragraph naming an ingredient was still shown.");
  behaviour = {};
});

server.close();
const passed = results.filter((r) => r.status === "passed").length;
const md = ["# GPT layer contract tests", "", `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run eval:gpt-layer\` against a local mock of the Responses API. Result: **${passed}/${results.length} passed**.`, "", "| ID | Test | Result |", "| --- | --- | --- |", ...results.map((r) => `| ${r.id} | ${r.title} | ${r.status}${r.detail ? `: ${r.detail}` : ""} |`), ""];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("gpt-layer.latest.md", out), `${md.join("\n")}\n`);
console.log(JSON.stringify({ suite: "gpt-layer", total: results.length, passed, failures: results.filter((r) => r.status !== "passed") }, null, 2));
if (passed !== results.length) process.exitCode = 1;
