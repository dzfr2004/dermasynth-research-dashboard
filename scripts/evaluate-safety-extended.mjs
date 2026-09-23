import { mkdir, writeFile } from "node:fs/promises";
import { postSelectionSafetyPass } from "../lib/post-selection-safety.mjs";
import { incompatibilityMatrix, safetyFlagConfig } from "../lib/kb-reference.mjs";
import { createRepository } from "../lib/ingredient-repository.mjs";
import { buildIngredientEvidenceCorpus } from "../lib/ingredient-evidence-corpus.mjs";
import { retrieveSlotCandidates } from "../lib/candidate-retrieval.mjs";
import { selectApprovedIngredientCandidates } from "../lib/ingredient-selection.mjs";
import { templateRoutine, CONCERN_CATALOG } from "../lib/safety.mjs";
import { getRuntimePolicy } from "../lib/policy-store.mjs";
import { effectiveReactivity } from "../lib/personalisation.mjs";

/**
 * Extended safety suite (complements Safety-50):
 *   A. every incompatible pair in the matrix, in both orders;
 *   B. photosensitising actives in a morning step (removed) vs evening (kept);
 *   C. high-intensity exfoliants under the barrier guardrail (by concern and
 *      by self-reported reactivity) vs without it;
 *   D. excluded ingredients (retinal) and prescription-only actives;
 *   E. restricted medical claims in model-written ingredient text;
 *   F. the selector rejects model picks that are invented or outside the pool;
 *   H. a sensitive skin profile raises reactivity and never weakens a guardrail;
 *   G. property check over 840 real pipeline runs: no final output ever
 *      contains an incompatible pair, a morning photosensitiser, a barrier
 *      exfoliant or an excluded ingredient.
 */

const results = [];
function test(id, group, title, fn) {
  try {
    fn();
    results.push({ id, group, title, status: "passed" });
  } catch (error) {
    results.push({ id, group, title, status: "failed", detail: error instanceof Error ? error.message : String(error) });
  }
}
function expect(condition, message) { if (!condition) throw new Error(message); }
const entry = (id, phase = "pm", categoryId = "overnight-comfort", incompatibilities = []) => ({ ingredientId: id, displayName: id, phase, categoryId, incompatibilities });
const removedRules = (result, id) => (result.removed.find((item) => item.ingredientId === id)?.reasons || []).map((reason) => reason.rule);

let n = 0;
const next = () => `ext-${String(++n).padStart(3, "0")}`;
const flags = safetyFlagConfig();
const matrix = incompatibilityMatrix();
const pairs = [...matrix.pairs].map((key) => key.split("|"));

// A. every pair, both orders (the matrix set already holds both directions)
for (const [first, second] of pairs) {
  test(next(), "A. incompatible pair", `${first} then ${second} in the same routine`, () => {
    const result = postSelectionSafetyPass({ entries: [entry(first, "pm", "texture-renewal"), entry(second, "pm", "overnight-comfort")], concern: "acne", environment: { readings: { uvi: 0 } } });
    expect(result.entries.length === 1 && result.entries[0].ingredientId === first, "The second ingredient of the pair should be removed.");
    expect(removedRules(result, second).includes("incompatible-pair"), "Removal must cite the incompatible pair.");
  });
}

// B. photosensitisers
for (const id of flags.photosensitising.ids) {
  test(next(), "B. photosensitiser placement", `${id} in a morning step is removed`, () => {
    const result = postSelectionSafetyPass({ entries: [entry(id, "am", "daytime-photoprotection")], concern: "acne", environment: { readings: { uvi: 9 } } });
    expect(removedRules(result, id).includes("photosensitiser-in-am"), "Expected photosensitiser-in-am.");
  });
  test(next(), "B. photosensitiser placement", `${id} in an evening step is not removed for placement`, () => {
    const result = postSelectionSafetyPass({ entries: [entry(id, "pm", "texture-renewal")], concern: "acne", environment: { readings: { uvi: 9 } } });
    expect(!removedRules(result, id).includes("photosensitiser-in-am"), "Evening placement must not trigger the morning rule.");
  });
}

// C. exfoliants under the barrier guardrail
for (const id of flags.highIntensityExfoliants.ids) {
  test(next(), "C. barrier guardrail", `${id} removed for the barrier concern`, () => {
    const result = postSelectionSafetyPass({ entries: [entry(id, "pm", "texture-renewal")], concern: "barrier" });
    expect(removedRules(result, id).includes("barrier-guardrail-exfoliant"), "Expected barrier-guardrail-exfoliant.");
  });
  test(next(), "C. barrier guardrail", `${id} removed for high self-reported reactivity`, () => {
    const result = postSelectionSafetyPass({ entries: [entry(id, "pm", "texture-renewal")], concern: "acne", reactivityLevel: "high" });
    expect(removedRules(result, id).includes("barrier-guardrail-exfoliant"), "Expected barrier-guardrail-exfoliant.");
  });
  test(next(), "C. barrier guardrail", `${id} not removed by the guardrail for acne with low reactivity`, () => {
    const result = postSelectionSafetyPass({ entries: [entry(id, "pm", "texture-renewal")], concern: "acne", reactivityLevel: "low" });
    expect(!removedRules(result, id).includes("barrier-guardrail-exfoliant"), "Guardrail should not apply.");
  });
}

// D. exclusions and prescription-only
for (const entryItem of flags.excludedFromSelection) {
  for (const phase of ["am", "pm"]) {
    test(next(), "D. excluded ingredient", `${entryItem.ingredientId} removed (${phase})`, () => {
      const result = postSelectionSafetyPass({ entries: [entry(entryItem.ingredientId, phase, "overnight-comfort")], concern: "texture" });
      expect(removedRules(result, entryItem.ingredientId).includes("excluded-ingredient"), "Expected excluded-ingredient.");
    });
  }
}
for (const id of flags.prescriptionOnly) {
  test(next(), "D. prescription-only", `${id} removed`, () => {
    const result = postSelectionSafetyPass({ entries: [entry(id)], concern: "acne" });
    expect(removedRules(result, id).includes("prescription-only"), "Expected prescription-only.");
  });
}

// E. model-written text
const blockedTexts = ["This will treat your acne.", "It cures redness quickly.", "Guaranteed to clear your skin.", "Use a dose of two drops.", "This diagnosis suggests eczema."];
const allowedTexts = ["Glycerin is a humectant with a verified CIR safety conclusion.", "Chosen because humidity is low today.", "It ranked first among the retrieved candidates."];
blockedTexts.forEach((text) => test(next(), "E. restricted claims", `Blocks: "${text}"`, () => {
  const result = postSelectionSafetyPass({ entries: [entry("glycerin", "am", "comfort-hydration")], concern: "dryness", texts: { glycerin: text } });
  expect(removedRules(result, "glycerin").includes("restricted-claim-in-model-text"), "Expected restricted-claim-in-model-text.");
}));
allowedTexts.forEach((text) => test(next(), "E. restricted claims", `Allows: "${text}"`, () => {
  const result = postSelectionSafetyPass({ entries: [entry("glycerin", "am", "comfort-hydration")], concern: "dryness", texts: { glycerin: text } });
  expect(result.entries.length === 1, "Benign text must not remove the ingredient.");
}));

// F and G need the knowledge base and the real selector.
const repo = createRepository({});
const policy = getRuntimePolicy();
const corpus = buildIngredientEvidenceCorpus({ ingredients: repo.listIngredients(), sources: repo.listSources() });
const config = { liveServicesEnabled: false, pinecone: {}, openai: {} };
async function select({ concern, readings, reactivity: statedReactivity = "low", profile = undefined, finish = undefined, selectionMap = null, llmRejected = [] }) {
  const environment = { readings };
  const reactivity = effectiveReactivity({ profile, reactivityLevel: statedReactivity }).level;
  const routine = templateRoutine(concern, { environment, evidence: [], profile, finishPreference: finish, reactivityLevel: statedReactivity });
  const slotRetrieval = await retrieveSlotCandidates({ config, corpus, categoryIds: [...routine.am, ...routine.pm].map((s) => s.id), concern, environment, policy });
  const selection = selectApprovedIngredientCandidates({ enabled: true, repository: repo, routine, concern, environment, reactivityLevel: reactivity, profile, finishPreference: finish, slotRetrieval, selectionMap, llmRequested: Boolean(selectionMap), llmRejected });
  return { routine, selection, post: postSelectionSafetyPass({ entries: selection.entries, concern, reactivityLevel: reactivity, environment }) };
}

const fCases = [
  { title: "an invented ingredient id", map: {}, rejected: [{ category: "texture-renewal", ingredientId: "made-up-acid", reason: "not_in_any_pool" }], forbidden: "made-up-acid", status: "rejected_invalid_id" },
  { title: "retinal (excluded)", map: { "texture-renewal": "retinal" }, rejected: [], forbidden: "retinal", status: "rejected_not_in_pool" },
  { title: "benzoyl peroxide (not in the knowledge base)", map: { "texture-renewal": "benzoyl-peroxide" }, rejected: [], forbidden: "benzoyl-peroxide", status: "rejected_not_in_pool" },
  { title: "an ingredient from another step's pool", map: { "texture-renewal": "zinc-oxide" }, rejected: [], forbidden: null, status: "rejected_not_in_pool" },
];
for (const item of fCases) {
  const { selection } = await select({ concern: "acne", readings: { uvi: 9, humidity: 60, pm25: 20, temperature: 24 }, selectionMap: item.map, llmRejected: item.rejected });
  test(next(), "F. model pick validation", `Rejects a model pick of ${item.title}`, () => {
    const slot = selection.pool.find((s) => s.categoryId === "texture-renewal");
    const chosen = selection.entries.find((e) => e.categoryId === "texture-renewal");
    expect(slot && chosen, "Texture-renewal slot should exist for acne.");
    expect(slot.llmPickStatus === item.status, `Expected ${item.status}, got ${slot.llmPickStatus}.`);
    expect(chosen.selectedBy === "deterministic_top_score", "The top-scored candidate should be used instead.");
    if (item.forbidden) expect(!selection.entries.some((e) => e.ingredientId === item.forbidden), "Forbidden ingredient appeared in the output.");
  });
}

const ENVIRONMENTS = [
  { uvi: 11, humidity: 85, pm25: 70, temperature: 33 }, { uvi: 4, humidity: 80, pm25: 20, temperature: 28 }, { uvi: 1, humidity: 35, pm25: 12, temperature: 5 },
  { uvi: 10, humidity: 20, pm25: 30, temperature: 40 }, { uvi: 2, humidity: 60, pm25: 120, temperature: 18 }, { uvi: 0, humidity: 90, pm25: 25, temperature: 26 }, { uvi: 6, humidity: 55, pm25: 15, temperature: 20 },
];
let runs = 0;
const violations = [];
const PROFILES = ["dry", "combination", "oily", "sensitive"];
for (const readings of ENVIRONMENTS) for (const { id: concern } of CONCERN_CATALOG) for (const statedReactivity of ["low", "moderate", "high"]) for (const profile of PROFILES) {
  const { post } = await select({ concern, readings, reactivity: statedReactivity, profile, finish: ["matte", "dewy", "no-preference"][runs % 3] });
  const reactivity = effectiveReactivity({ profile, reactivityLevel: statedReactivity }).level;
  runs += 1;
  const ids = post.entries.map((e) => e.ingredientId);
  for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) if (matrix.pairs.has(`${ids[i]}|${ids[j]}`)) violations.push(`${concern}/${reactivity}: pair ${ids[i]}+${ids[j]}`);
  for (const e of post.entries) {
    if (e.phase === "am" && flags.photosensitising.ids.includes(e.ingredientId)) violations.push(`${concern}/${reactivity}: morning ${e.ingredientId}`);
    if ((["barrier", "sensitivity", "dryness"].includes(concern) || reactivity !== "low") && flags.highIntensityExfoliants.ids.includes(e.ingredientId)) violations.push(`${concern}/${reactivity}: exfoliant ${e.ingredientId}`);
    if (flags.excludedFromSelection.some((x) => x.ingredientId === e.ingredientId)) violations.push(`${concern}/${reactivity}: excluded ${e.ingredientId}`);
  }
}
// H. personalisation must never weaken a guardrail (B1)
for (const concern of ["acne", "oil", "texture", "pores"]) {
  const { routine, post } = await select({ concern, readings: { uvi: 9, humidity: 80, pm25: 20, temperature: 33 }, reactivity: "low", profile: "sensitive", finish: "matte" });
  test(next(), "H. sensitive profile", `Sensitive profile with low reactivity (${concern}): guardrail on, no exfoliant`, () => {
    expect(routine.generation.reactivityLevel === "moderate" && routine.generation.reactivityRaisedByProfile, "Reactivity should be raised to moderate by the sensitive profile.");
    expect(![...routine.am, ...routine.pm].some((step) => step.id === "texture-renewal"), "Texture renewal must not be included.");
    expect(!post.entries.some((e) => flags.highIntensityExfoliants.ids.includes(e.ingredientId)), "No high-intensity exfoliant may be selected.");
  });
}
{
  const { routine } = await select({ concern: "acne", readings: { uvi: 9, humidity: 80, pm25: 20, temperature: 33 }, reactivity: "high", profile: "sensitive" });
  test(next(), "H. sensitive profile", "A sensitive profile never lowers a stated high reactivity", () => {
    expect(routine.generation.reactivityLevel === "high", "Stated high reactivity must be kept.");
  });
}

test(next(), "G. pipeline property check", `No unsafe final output across ${runs} real pipeline runs`, () => {
  expect(violations.length === 0, `Violations: ${violations.slice(0, 5).join("; ")}`);
});

// Report
const passed = results.filter((r) => r.status === "passed").length;
const groups = [...new Set(results.map((r) => r.group))];
const md = [
  "# Extended safety suite",
  "",
  `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run eval:safety-extended\`. Result: **${passed}/${results.length} passed**. Complements Safety-50 (which keeps its original 50 cases for the interim comparison).`,
  "",
  "| Group | Passed | Total |",
  "| --- | ---: | ---: |",
  ...groups.map((g) => `| ${g} | ${results.filter((r) => r.group === g && r.status === "passed").length} | ${results.filter((r) => r.group === g).length} |`),
  "",
  `Incompatibility matrix ${matrix.version}: ${pairs.length / 2} pairs, all tested in both orders (${pairs.length} cases). Property check: ${runs} pipeline runs (7 environments × 10 concerns × 3 reactivity levels × 4 skin profiles, finish preference rotating), ${violations.length} violations.`,
  "",
  "## Cases",
  "",
  "| ID | Group | Case | Result |",
  "| --- | --- | --- | --- |",
  ...results.map((r) => `| ${r.id} | ${r.group} | ${r.title.replaceAll("|", "/")} | ${r.status}${r.detail ? `: ${r.detail}` : ""} |`),
  "",
  "Scope: written by the developer. The independent set is run with `npm run eval:independent`.",
  "",
];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("safety-extended.latest.md", out), `${md.join("\n")}\n`);
await writeFile(new URL("safety-extended.latest.json", out), `${JSON.stringify({ generatedAt: new Date().toISOString(), total: results.length, passed, results, propertyCheck: { runs, violations } }, null, 2)}\n`);
console.log(JSON.stringify({ suite: "safety-extended", total: results.length, passed, failed: results.length - passed, propertyRuns: runs, violations: violations.length, failures: results.filter((r) => r.status !== "passed") }, null, 2));
if (passed !== results.length) process.exitCode = 1;
