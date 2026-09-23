import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { postSelectionSafetyPass } from "../lib/post-selection-safety.mjs";
import { incompatibilityMatrix, safetyFlagConfig } from "../lib/kb-reference.mjs";
import { createRepository } from "../lib/ingredient-repository.mjs";
import { buildIngredientEvidenceCorpus } from "../lib/ingredient-evidence-corpus.mjs";
import { retrieveSlotCandidates } from "../lib/candidate-retrieval.mjs";
import { selectApprovedIngredientCandidates } from "../lib/ingredient-selection.mjs";
import { ALLOWED_CONCERNS, templateRoutine, triageRoutineRequest } from "../lib/safety.mjs";
import { getRuntimePolicy } from "../lib/policy-store.mjs";

/**
 * Independent safety set (A5).
 *
 * The cases in data/evaluation/independent/cases.json are written by someone
 * other than the developer (supervisor, pharmacist or dermatologist) and are
 * run as-is. The developer must not edit them. The report records the file's
 * SHA-256 so the examiner can confirm the cases were not changed after they
 * were handed over, and it is reported separately from the developer-written
 * suites.
 *
 * Usage: npm run eval:independent [-- path/to/cases.json]
 * Case types and fields: see data/evaluation/independent/README.md.
 */

const argPath = process.argv.slice(2).find((a) => !a.startsWith("--"));
const casesUrl = argPath ? new URL(argPath, `file://${process.cwd()}/`) : new URL("../data/evaluation/independent/cases.json", import.meta.url);
if (!existsSync(casesUrl)) {
  console.log([
    "No independent case file found at data/evaluation/independent/cases.json.",
    "Give data/evaluation/independent/cases.template.json and README.md to your supervisor or a dermatologist,",
    "ask them to write the cases, save their file as cases.json (unchanged) and run this command again.",
  ].join("\n"));
  process.exit(0);
}

const raw = await readFile(casesUrl, "utf8");
const sha256 = createHash("sha256").update(raw).digest("hex");
const file = JSON.parse(raw);
const cases = Array.isArray(file.cases) ? file.cases : [];

const flags = safetyFlagConfig();
const matrix = incompatibilityMatrix();
const repo = createRepository({});
const policy = getRuntimePolicy();
const corpus = buildIngredientEvidenceCorpus({ ingredients: repo.listIngredients(), sources: repo.listSources() });
const offlineConfig = { liveServicesEnabled: false, pinecone: {}, openai: {} };

async function runRoutine({ concern, reactivity, readings }) {
  const environment = { readings };
  const routine = templateRoutine(concern, { environment, evidence: [], reactivityLevel: reactivity });
  const slotRetrieval = await retrieveSlotCandidates({ config: offlineConfig, corpus, categoryIds: [...routine.am, ...routine.pm].map((s) => s.id), concern, environment, policy });
  const selection = selectApprovedIngredientCandidates({ enabled: true, repository: repo, routine, concern, environment, reactivityLevel: reactivity, slotRetrieval, selectionMap: null, llmRequested: false, llmRejected: [] });
  return postSelectionSafetyPass({ entries: selection.entries, concern, reactivityLevel: reactivity, environment }).entries;
}

// The same invariants the extended suite checks, applied to every routine case.
function invariantViolations(entries, concern, reactivity) {
  const out = [];
  const ids = entries.map((e) => e.ingredientId);
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) if (matrix.pairs.has(`${ids[i]}|${ids[j]}`)) out.push(`incompatible pair ${ids[i]} + ${ids[j]}`);
  for (const e of entries) {
    if (e.phase === "am" && flags.photosensitising.ids.includes(e.ingredientId)) out.push(`${e.ingredientId} in a morning step`);
    if ((["barrier", "sensitivity", "dryness"].includes(concern) || reactivity !== "low") && flags.highIntensityExfoliants.ids.includes(e.ingredientId)) out.push(`exfoliant ${e.ingredientId} despite barrier or reactivity`);
    if (flags.excludedFromSelection.some((x) => x.ingredientId === e.ingredientId)) out.push(`excluded ingredient ${e.ingredientId}`);
    if (flags.prescriptionOnly.includes(e.ingredientId)) out.push(`prescription-only ${e.ingredientId}`);
  }
  return out;
}

const DEFAULT_READINGS = { uvi: 6, humidity: 60, pm25: 20, temperature: 28 };
const results = [];
for (const [index, item] of cases.entries()) {
  const id = item.id || `ind-${String(index + 1).padStart(3, "0")}`;
  const record = { id, type: item.type, description: item.description || "", expected: item.expected, got: null, passed: false, detail: "" };
  try {
    if (item.type === "triage") {
      record.got = triageRoutineRequest({ symptoms: item.text }).status === "medical_redirect" ? "redirect" : "clear";
      record.passed = record.got === item.expected;
    } else if (item.type === "pair") {
      const entries = [
        { ingredientId: item.first, displayName: item.first, phase: "pm", categoryId: "texture-renewal", incompatibilities: [] },
        { ingredientId: item.second, displayName: item.second, phase: "pm", categoryId: "overnight-comfort", incompatibilities: [] },
      ];
      const result = postSelectionSafetyPass({ entries, concern: "acne", environment: { readings: { uvi: 0 } } });
      const blocked = result.removed.some((r) => (r.reasons || []).some((reason) => reason.rule === "incompatible-pair"));
      record.got = blocked ? "blocked" : "allowed";
      record.passed = record.got === item.expected;
    } else if (item.type === "routine") {
      const concern = String(item.concern || "").toLowerCase();
      if (!ALLOWED_CONCERNS.has(concern)) throw new Error(`Unknown concern "${item.concern}". Use one of: ${[...ALLOWED_CONCERNS].join(", ")}.`);
      const reactivity = item.reactivity || "low";
      if (item.symptoms && triageRoutineRequest({ symptoms: item.symptoms }).status === "medical_redirect") {
        record.got = "redirect";
        record.passed = item.expected === "redirect";
      } else {
        const entries = await runRoutine({ concern, reactivity, readings: { ...DEFAULT_READINGS, ...(item.readings || {}) } });
        record.got = "routine";
        const problems = invariantViolations(entries, concern, reactivity);
        for (const bad of item.mustNotInclude || []) if (entries.some((e) => e.ingredientId === bad)) problems.push(`contains ${bad}`);
        for (const bad of item.mustNotIncludeInAm || []) if (entries.some((e) => e.ingredientId === bad && e.phase === "am")) problems.push(`${bad} in a morning step`);
        record.ingredients = entries.map((e) => `${e.phase}:${e.ingredientId}`);
        record.detail = problems.join("; ");
        record.passed = item.expected === "routine" && problems.length === 0;
      }
    } else {
      throw new Error(`Unknown case type "${item.type}". Use triage, pair or routine.`);
    }
  } catch (error) {
    record.detail = error instanceof Error ? error.message : String(error);
    record.passed = false;
  }
  if (!record.passed && !record.detail) record.detail = `expected ${record.expected}, got ${record.got}`;
  results.push(record);
}

const passed = results.filter((r) => r.passed).length;
const triage = results.filter((r) => r.type === "triage");
const tp = triage.filter((r) => r.expected === "redirect" && r.got === "redirect").length;
const fn = triage.filter((r) => r.expected === "redirect" && r.got !== "redirect").length;
const tn = triage.filter((r) => r.expected === "clear" && r.got === "clear").length;
const fp = triage.filter((r) => r.expected === "clear" && r.got !== "clear").length;
const ratio = (a, b) => (b ? `${a}/${b} (${((100 * a) / b).toFixed(1)}%)` : "n/a");
const types = [...new Set(results.map((r) => r.type))];
const md = [
  "# Independent safety set",
  "",
  `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run eval:independent\`. Cases written by: **${file.author || "not stated"}**${file.role ? ` (${file.role})` : ""}${file.written ? `, ${file.written}` : ""}.`,
  "",
  `Case file SHA-256: \`${sha256}\`. The developer did not edit these cases; this report is kept separate from the developer-written suites.`,
  "",
  `Result: **${passed}/${results.length} passed**.`,
  "",
  "| Case type | Passed | Total |",
  "| --- | ---: | ---: |",
  ...types.map((t) => `| ${t} | ${results.filter((r) => r.type === t && r.passed).length} | ${results.filter((r) => r.type === t).length} |`),
  "",
  ...(triage.length ? [`Triage sensitivity ${ratio(tp, tp + fn)}, specificity ${ratio(tn, tn + fp)} (rules only, no model second opinion).`, ""] : []),
  "## Cases",
  "",
  "| ID | Type | Description | Expected | Got | Result |",
  "| --- | --- | --- | --- | --- | --- |",
  ...results.map((r) => `| ${r.id} | ${r.type} | ${String(r.description).replaceAll("|", "/")} | ${r.expected} | ${r.got ?? "error"} | ${r.passed ? "passed" : `failed: ${r.detail.replaceAll("|", "/")}`} |`),
  "",
];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("independent-safety.latest.md", out), `${md.join("\n")}\n`);
await writeFile(new URL("independent-safety.latest.json", out), `${JSON.stringify({ generatedAt: new Date().toISOString(), author: file.author || null, sha256, total: results.length, passed, triage: { tp, fn, tn, fp }, results }, null, 2)}\n`);
console.log(JSON.stringify({ suite: "independent-safety", author: file.author || null, total: results.length, passed, failed: results.length - passed, sha256 }, null, 2));
// A failing independent case is a finding to report, not a build break.
