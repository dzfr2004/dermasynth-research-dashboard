import { mkdir, writeFile } from "node:fs/promises";
import { createRepository } from "../lib/ingredient-repository.mjs";
import { buildIngredientEvidenceCorpus } from "../lib/ingredient-evidence-corpus.mjs";
import { retrieveSlotCandidates } from "../lib/candidate-retrieval.mjs";
import { selectApprovedIngredientCandidates } from "../lib/ingredient-selection.mjs";
import { postSelectionSafetyPass } from "../lib/post-selection-safety.mjs";
import { buildEnvironmentalExplainability } from "../lib/explainability.mjs";
import { buildTwoLevelExplanation } from "../lib/peg.mjs";
import { firstSafetyPass, secondSafetyPass, templateRoutine, CONCERN_CATALOG } from "../lib/safety.mjs";
import { getRuntimePolicy } from "../lib/policy-store.mjs";
import { tokenise } from "../lib/bm25.mjs";
import { effectiveReactivity } from "../lib/personalisation.mjs";

/**
 * Input-sensitivity evaluation: does the output change when the input changes,
 * and by how much?
 *
 * Runs the deterministic pipeline (routine structure, safety passes, retrieved
 * candidate pools, rule-based ingredient selection, post-selection safety,
 * two-level explanation) over a full-factorial grid of inputs, then measures
 * how different the outputs are:
 *
 *   1. one-factor-at-a-time: change one input, hold the rest, compare outputs;
 *   2. threshold sweeps: move one reading across its range from a mid baseline;
 *   3. input distance vs output distance over random pairs (Spearman rho);
 *   4. how often each ingredient is picked per step (does the pick ever move?).
 *
 * GPT is not called, so this measures the deterministic pipeline that the
 * model is constrained by. Model output variation needs live runs (see the
 * selection log report).
 *
 * Output: data/evaluation/reports/input-sensitivity.latest.{md,json,csv}
 *
 * B5 targets (checked in both modes, exit code 1 on failure):
 *   - changing the skin profile changes the ingredients in >= 30% of pairs;
 *   - changing the finish preference changes the ingredients in >= 30% of pairs;
 *   - changing the skin profile changes the routine steps in some pairs;
 *   - moving temperature from cold to hot changes the routine steps;
 *   - changing any one input leaves the output identical in <= 30% of pairs;
 *   - stratified check: pairs that differ in more inputs differ more in output
 *     (mean output distance rises with every extra changed input, and the
 *     Spearman correlation between changed-input count and output distance is
 *     >= 0.30).
 *
 * `--quick` runs a reduced grid (3 environments × 10 concerns × 4 profiles ×
 * 2 reactivity levels × 3 finishes, 720 runs, about 15 s), checks the targets
 * and writes no report. `npm test` uses it.
 */

const QUICK = process.argv.includes("--quick");

const ENVIRONMENTS = [
  { id: "E1", label: "Tropical noon, haze", readings: { uvi: 11, humidity: 85, pm25: 70, temperature: 33 } },
  { id: "E2", label: "Tropical morning, clear", readings: { uvi: 4, humidity: 80, pm25: 20, temperature: 28 } },
  { id: "E3", label: "Temperate dry winter", readings: { uvi: 1, humidity: 35, pm25: 12, temperature: 5 } },
  { id: "E4", label: "Desert summer", readings: { uvi: 10, humidity: 20, pm25: 30, temperature: 40 } },
  { id: "E5", label: "Urban smog, overcast", readings: { uvi: 2, humidity: 60, pm25: 120, temperature: 18 } },
  { id: "E6", label: "Humid night", readings: { uvi: 0, humidity: 90, pm25: 25, temperature: 26 } },
  { id: "E7", label: "Mild spring day", readings: { uvi: 6, humidity: 55, pm25: 15, temperature: 20 } },
];
const CONCERNS = CONCERN_CATALOG.map((item) => item.id);
const PROFILES = ["dry", "combination", "oily", "sensitive"];
const REACTIVITY = QUICK ? ["low", "high"] : ["low", "moderate", "high"];
const FINISH = ["no-preference", "matte", "dewy"];
const EXPOSURE = QUICK ? ["mixed"] : ["indoors", "mixed", "outdoors"];
const GRID_ENVIRONMENTS = QUICK ? ENVIRONMENTS.filter((e) => ["E1", "E3", "E7"].includes(e.id)) : ENVIRONMENTS;
const FACTORS = { environment: GRID_ENVIRONMENTS.map((e) => e.id), concern: CONCERNS, profile: PROFILES, reactivity: REACTIVITY, finish: FINISH, exposure: EXPOSURE };

const repo = createRepository({});
const policy = getRuntimePolicy();
const corpus = buildIngredientEvidenceCorpus({ ingredients: repo.listIngredients(), sources: repo.listSources() });
const config = { liveServicesEnabled: false, pinecone: {}, openai: {} };

async function runPipeline({ readings, concern, profile, reactivity: statedReactivity, finish, exposure }) {
  const environment = { mode: "evaluation", readings };
  // Same rule as server.mjs: a sensitive profile raises low reactivity to moderate.
  const reactivity = effectiveReactivity({ profile, reactivityLevel: statedReactivity }).level;
  const routine = templateRoutine(concern, { environment, evidence: [], profile, finishPreference: finish, reactivityLevel: statedReactivity, exposureContext: exposure });
  const first = firstSafetyPass({ concern, environment, reactivityLevel: reactivity });
  const second = secondSafetyPass(routine, { concern, environment, reactivityLevel: reactivity, allowedEvidenceIds: [] });
  const categoryIds = [...routine.am, ...routine.pm].map((step) => step.id);
  const slotRetrieval = await retrieveSlotCandidates({ config, corpus, categoryIds, concern, environment, policy });
  const selection = selectApprovedIngredientCandidates({ enabled: true, repository: repo, routine, profile, finishPreference: finish, concern, environment, reactivityLevel: reactivity, slotRetrieval });
  const post = postSelectionSafetyPass({ entries: selection.entries, concern, reactivityLevel: reactivity, environment });
  const explainability = buildEnvironmentalExplainability({ concern, environment });
  const explanation = buildTwoLevelExplanation({ explainability, routine, entries: post.entries, environment, concern });
  return {
    steps: [...routine.am.map((s) => `am:${s.id}`), ...routine.pm.map((s) => `pm:${s.id}`)],
    ingredients: post.entries.map((e) => `${e.phase}:${e.categoryId}=${e.ingredientId}`),
    picks: post.entries.map((e) => ({ slot: `${e.phase}:${e.categoryId}`, id: e.ingredientId, rank: e.attribution?.poolRank, pool: e.attribution?.poolSize, margin: e.attribution?.contrast?.margin ?? null })),
    removed: post.removed.map((r) => r.ingredientId),
    safetyStatus: second.status === "cleared" && first.status === "cleared" ? "cleared" : "review_required",
    dominantDriver: explainability.dominantFeature?.id || "none",
    shap: Object.fromEntries(explainability.features.map((f) => [f.id, f.shapValue])),
    contextScore: explainability.model.contextScore,
    text: [explanation.level1.text, ...explanation.level2.map((l) => `${l.whyThisStep} ${l.whyThisIngredient}`)].join(" "),
  };
}

const jaccardDistance = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  const union = new Set([...A, ...B]);
  if (!union.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return 1 - inter / union.size;
};
const textDistance = (a, b) => jaccardDistance(tokenise(a), tokenise(b));
const shapDistance = (a, b) => Math.sqrt(Object.keys(a).reduce((sum, k) => sum + (a[k] - b[k]) ** 2, 0));

function outputDistance(a, b) {
  return {
    steps: jaccardDistance(a.steps, b.steps),
    ingredients: jaccardDistance(a.ingredients, b.ingredients),
    text: textDistance(a.text, b.text),
    driverChanged: a.dominantDriver !== b.dominantDriver ? 1 : 0,
    shap: shapDistance(a.shap, b.shap),
  };
}

// Input distance: mean over the six factors; environment uses the mean of the
// four normalised reading differences, categorical factors are 0/1.
const RANGES = { uvi: 11, humidity: 100, pm25: 150, temperature: 45 };
const envById = new Map(ENVIRONMENTS.map((e) => [e.id, e]));
function inputDistance(a, b) {
  const ea = envById.get(a.environment).readings;
  const eb = envById.get(b.environment).readings;
  const env = Object.keys(RANGES).reduce((sum, k) => sum + Math.abs(ea[k] - eb[k]) / RANGES[k], 0) / 4;
  const cats = ["concern", "profile", "reactivity", "finish", "exposure"].reduce((sum, k) => sum + (a[k] === b[k] ? 0 : 1), 0);
  return (env + cats) / 6;
}

function spearman(xs, ys) {
  const rank = (v) => {
    const sorted = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const r = Array(v.length);
    for (let i = 0; i < sorted.length;) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1][0] === sorted[i][0]) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) r[sorted[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i += 1) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

// ---- 1. Full factorial grid --------------------------------------------------
const started = Date.now();
const runs = [];
for (const env of GRID_ENVIRONMENTS) for (const concern of CONCERNS) for (const profile of PROFILES) for (const reactivity of REACTIVITY) for (const finish of FINISH) for (const exposure of EXPOSURE) {
  const input = { environment: env.id, concern, profile, reactivity, finish, exposure };
  runs.push({ input, output: await runPipeline({ readings: env.readings, concern, profile, reactivity, finish, exposure }) });
}
const key = (input, skip) => Object.keys(FACTORS).filter((f) => f !== skip).map((f) => input[f]).join("|");

// ---- 2. One factor at a time ---------------------------------------------------
const ofat = {};
for (const factor of Object.keys(FACTORS)) {
  const groups = new Map();
  for (const run of runs) {
    const k = key(run.input, factor);
    groups.set(k, [...(groups.get(k) || []), run]);
  }
  if (FACTORS[factor].length < 2) continue;
  const acc = { pairs: 0, stepsChanged: 0, ingredientsChanged: 0, driverChanged: 0, steps: 0, ingredients: 0, text: 0, shap: 0 };
  for (const members of groups.values()) {
    for (let i = 0; i < members.length; i += 1) for (let j = i + 1; j < members.length; j += 1) {
      const d = outputDistance(members[i].output, members[j].output);
      acc.pairs += 1;
      acc.stepsChanged += d.steps > 0 ? 1 : 0;
      acc.ingredientsChanged += d.ingredients > 0 ? 1 : 0;
      acc.driverChanged += d.driverChanged;
      acc.steps += d.steps;
      acc.ingredients += d.ingredients;
      acc.text += d.text;
      acc.shap += d.shap;
    }
  }
  ofat[factor] = {
    levels: FACTORS[factor].length,
    pairs: acc.pairs,
    routineChangedShare: acc.stepsChanged / acc.pairs,
    ingredientsChangedShare: acc.ingredientsChanged / acc.pairs,
    driverChangedShare: acc.driverChanged / acc.pairs,
    meanRoutineDistance: acc.steps / acc.pairs,
    meanIngredientDistance: acc.ingredients / acc.pairs,
    meanTextDistance: acc.text / acc.pairs,
    meanShapDistance: acc.shap / acc.pairs,
  };
}

// ---- 3. Input distance vs output distance ---------------------------------------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20260923);
const pairSample = [];
for (let n = 0; n < 5000; n += 1) {
  const a = runs[Math.floor(rand() * runs.length)];
  const b = runs[Math.floor(rand() * runs.length)];
  if (a === b) continue;
  const d = outputDistance(a.output, b.output);
  pairSample.push({ input: inputDistance(a.input, b.input), output: (d.steps + d.ingredients + d.text) / 3, ...d });
}
const correlation = {
  pairs: pairSample.length,
  combined: spearman(pairSample.map((p) => p.input), pairSample.map((p) => p.output)),
  routine: spearman(pairSample.map((p) => p.input), pairSample.map((p) => p.steps)),
  ingredients: spearman(pairSample.map((p) => p.input), pairSample.map((p) => p.ingredients)),
  text: spearman(pairSample.map((p) => p.input), pairSample.map((p) => p.text)),
};
const bands = [[0, 0.1], [0.1, 0.2], [0.2, 0.3], [0.3, 0.45], [0.45, 1.01]].map(([lo, hi]) => {
  const inBand = pairSample.filter((p) => p.input >= lo && p.input < hi);
  const mean = (k) => (inBand.length ? inBand.reduce((s, p) => s + p[k], 0) / inBand.length : null);
  return { band: `${lo.toFixed(2)}–${Math.min(hi, 1).toFixed(2)}`, pairs: inBand.length, routine: mean("steps"), ingredients: mean("ingredients"), text: mean("text") };
});

// ---- 3b. Stratified: pairs that differ in exactly k inputs ----------------------
const runByKey = new Map(runs.map((run) => [Object.keys(FACTORS).map((f) => run.input[f]).join("|"), run]));
const varying = Object.keys(FACTORS).filter((f) => FACTORS[f].length > 1);
const stratRand = rng(20260924);
const stratified = [];
for (let k = 1; k <= varying.length; k += 1) {
  for (let n = 0; n < 600; n += 1) {
    const a = runs[Math.floor(stratRand() * runs.length)];
    const pool = [...varying];
    const changed = [];
    while (changed.length < k) changed.push(pool.splice(Math.floor(stratRand() * pool.length), 1)[0]);
    const input = { ...a.input };
    for (const factor of changed) {
      const others = FACTORS[factor].filter((level) => level !== a.input[factor]);
      input[factor] = others[Math.floor(stratRand() * others.length)];
    }
    const b = runByKey.get(Object.keys(FACTORS).map((f) => input[f]).join("|"));
    const d = outputDistance(a.output, b.output);
    stratified.push({ k, output: (d.steps + d.ingredients + d.text) / 3, ...d });
  }
}
const strata = varying.map((_, i) => {
  const rows = stratified.filter((row) => row.k === i + 1);
  const mean = (key) => rows.reduce((s, row) => s + row[key], 0) / rows.length;
  return { k: i + 1, pairs: rows.length, output: mean("output"), routine: mean("steps"), ingredients: mean("ingredients"), text: mean("text"), identical: rows.filter((row) => row.output === 0).length / rows.length };
});
const stratifiedSpearman = spearman(stratified.map((row) => row.k), stratified.map((row) => row.output));

// ---- 4. Threshold sweeps ---------------------------------------------------------
const BASE = { uvi: 5, humidity: 60, pm25: 20, temperature: 24 };
const SWEEPS = { uvi: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], humidity: [20, 30, 40, 50, 51, 60, 70, 74, 75, 85, 95], pm25: [5, 15, 30, 45, 54, 55, 70, 100, 150], temperature: [0, 10, 18, 24, 30, 36, 42] };
const sweeps = {};
for (const [reading, values] of Object.entries(SWEEPS)) {
  const rows = [];
  let previous = null;
  for (const value of values) {
    const out = await runPipeline({ readings: { ...BASE, [reading]: value }, concern: "acne", profile: "combination", reactivity: "low", finish: "no-preference", exposure: "mixed" });
    const changed = previous ? { steps: jaccardDistance(previous.steps, out.steps) > 0, ingredients: jaccardDistance(previous.ingredients, out.ingredients) > 0 } : null;
    rows.push({ value, steps: out.steps.map((s) => s.split(":")[1]).join(", "), ingredients: out.picks.map((p) => p.id).join(", "), driver: out.dominantDriver, contextScore: out.contextScore, changed });
    previous = out;
  }
  sweeps[reading] = rows;
}

// ---- 5. Pick frequency per slot ---------------------------------------------------
const slotPicks = new Map();
for (const run of runs) for (const pick of run.output.picks) {
  const counts = slotPicks.get(pick.slot) || new Map();
  counts.set(pick.id, (counts.get(pick.id) || 0) + 1);
  slotPicks.set(pick.slot, counts);
}
const distinct = (f) => new Set(runs.map((r) => f(r.output))).size;
const diversity = {
  runs: runs.length,
  distinctRoutines: distinct((o) => o.steps.join(",")),
  distinctIngredientSets: distinct((o) => o.ingredients.join(",")),
  distinctExplanations: distinct((o) => o.text),
  runsWithRemovals: runs.filter((r) => r.output.removed.length).length,
  safetyReviewRequired: runs.filter((r) => r.output.safetyStatus !== "cleared").length,
};

// ---- B5 targets -------------------------------------------------------------------
const tempRows = sweeps.temperature;
const increasing = strata.every((row, i) => i === 0 || row.output > strata[i - 1].output);
const targets = [
  { id: "profile-changes-ingredients", label: "Skin profile changes the ingredients in at least 30% of pairs", value: ofat.profile.ingredientsChangedShare, passed: ofat.profile.ingredientsChangedShare >= 0.3 },
  { id: "finish-changes-ingredients", label: "Finish preference changes the ingredients in at least 30% of pairs", value: ofat.finish.ingredientsChangedShare, passed: ofat.finish.ingredientsChangedShare >= 0.3 },
  { id: "profile-changes-routine", label: "Skin profile changes the routine steps in some pairs", value: ofat.profile.routineChangedShare, passed: ofat.profile.routineChangedShare > 0 },
  { id: "temperature-changes-routine", label: "Moving from cold to hot changes the routine steps", value: tempRows.filter((row) => row.changed?.steps).length, passed: tempRows.some((row) => row.changed?.steps) },
  { id: "more-inputs-more-change", label: "Mean output distance rises with every extra changed input", value: strata.map((row) => Number(row.output.toFixed(3))).join(" < "), passed: increasing },
  { id: "single-change-responds", label: "Changing one input leaves the output identical in at most 30% of pairs", value: strata[0].identical, passed: strata[0].identical <= 0.3 },
  { id: "stratified-spearman", label: "Spearman(changed inputs, output distance) is at least 0.30", value: stratifiedSpearman, passed: stratifiedSpearman >= 0.3 },
];
const failedTargets = targets.filter((item) => !item.passed);
if (QUICK) {
  console.log(JSON.stringify({ mode: "quick", runs: runs.length, seconds: (Date.now() - started) / 1000, targets: targets.map((item) => ({ id: item.id, value: typeof item.value === "number" ? Number(item.value.toFixed(3)) : item.value, passed: item.passed })) }, null, 2));
  if (failedTargets.length) { console.error(`Input-sensitivity targets failed: ${failedTargets.map((item) => item.id).join(", ")}`); process.exitCode = 1; }
  process.exit();
}

// ---- Report -----------------------------------------------------------------------
const pct = (v) => `${(100 * v).toFixed(1)}%`;
const f2 = (v) => (v === null || v === undefined ? "n/a" : Number(v).toFixed(2));
const FACTOR_LABELS = { environment: "Environment (7 weather scenarios)", concern: "Concern (10)", profile: "Skin profile (4)", reactivity: "Reactivity (3)", finish: "Finish preference (3)", exposure: "Exposure context (3)" };
const md = [
  "# Input-sensitivity evaluation",
  "",
  `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by \`npm run eval:input-sensitivity\` in ${((Date.now() - started) / 1000).toFixed(1)} s.`,
  "",
  `Full-factorial grid: 7 environments × 10 concerns × 4 profiles × 3 reactivity levels × 3 finish preferences × 3 exposure contexts = **${runs.length} runs** of the deterministic pipeline (routine, safety passes, retrieved candidate pools, rule-based ingredient choice, post-selection safety, two-level explanation). GPT is not called.`,
  "",
  "Output distance measures (0 = identical, 1 = nothing in common): routine = Jaccard distance between the sets of AM/PM steps; ingredients = Jaccard distance between the sets of step→ingredient picks; text = Jaccard distance between the word sets of the explanations.",
  "",
  "## 1. Change one input, keep the rest",
  "",
  "| Input changed | Pairs | Routine changed | Ingredients changed | Main driver changed | Mean routine distance | Mean ingredient distance | Mean explanation-text distance |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...Object.entries(ofat).map(([f, r]) => `| ${FACTOR_LABELS[f]} | ${r.pairs} | ${pct(r.routineChangedShare)} | ${pct(r.ingredientsChangedShare)} | ${pct(r.driverChangedShare)} | ${f2(r.meanRoutineDistance)} | ${f2(r.meanIngredientDistance)} | ${f2(r.meanTextDistance)} |`),
  "",
  "## 2. Bigger input difference → bigger output difference?",
  "",
  `Spearman rank correlation between input distance and output distance over ${correlation.pairs} random pairs: combined **${f2(correlation.combined)}**, routine ${f2(correlation.routine)}, ingredients ${f2(correlation.ingredients)}, explanation text ${f2(correlation.text)}.`,
  "",
  "| Input distance | Pairs | Mean routine distance | Mean ingredient distance | Mean text distance |",
  "| --- | ---: | ---: | ---: | ---: |",
  ...bands.map((b) => `| ${b.band} | ${b.pairs} | ${f2(b.routine)} | ${f2(b.ingredients)} | ${f2(b.text)} |`),
  "",
  "### Stratified by how many inputs differ",
  "",
  "Random pairs dominate the far end of the input range (most random pairs differ in almost every input), so the check above says little about small changes. This check samples 600 pairs for each number of changed inputs.",
  "",
  "| Inputs changed | Pairs | Identical output | Mean routine distance | Mean ingredient distance | Mean text distance | Mean combined |",
  "| ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...strata.map((row) => `| ${row.k} | ${row.pairs} | ${pct(row.identical)} | ${f2(row.routine)} | ${f2(row.ingredients)} | ${f2(row.text)} | ${f2(row.output)} |`),
  "",
  `Spearman rank correlation between the number of changed inputs and the combined output distance: **${f2(stratifiedSpearman)}**.`,
  "",
  "## 3. Output diversity",
  "",
  `Distinct routines: ${diversity.distinctRoutines}; distinct ingredient sets: ${diversity.distinctIngredientSets}; distinct explanations: ${diversity.distinctExplanations} (out of ${diversity.runs} runs). Runs where the final safety rescan removed an ingredient: ${diversity.runsWithRemovals}. Runs flagged for review by the safety passes: ${diversity.safetyReviewRequired}.`,
  "",
  "| Step | How often each ingredient was picked |",
  "| --- | --- |",
  ...[...slotPicks].sort().map(([slot, counts]) => {
    const total = [...counts.values()].reduce((s, v) => s + v, 0);
    return `| ${slot} | ${[...counts].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${pct(n / total)}`).join(", ")} |`;
  }),
  "",
  "## 4. Threshold sweeps (acne context, other readings at UV 5, humidity 60%, PM2.5 20, 24 °C)",
  "",
  ...Object.entries(sweeps).flatMap(([reading, rows]) => [
    `**${reading}**`,
    "",
    "| Value | Steps | Ingredients | Main driver | Context score | Changed vs previous |",
    "| ---: | --- | --- | --- | ---: | --- |",
    ...rows.map((r) => `| ${r.value} | ${r.steps} | ${r.ingredients} | ${r.driver} | ${f2(r.contextScore)} | ${r.changed ? [r.changed.steps ? "steps" : "", r.changed.ingredients ? "ingredients" : ""].filter(Boolean).join(" + ") || "no" : "—"} |`),
    "",
  ]),
  "## B5 regression targets",
  "",
  "`npm test` checks these on a reduced grid (`npm run eval:input-sensitivity -- --quick`).",
  "",
  "| Target | Value | Result |",
  "| --- | --- | --- |",
  ...targets.map((item) => `| ${item.label} | ${typeof item.value === "number" ? (item.value <= 1 && !Number.isInteger(item.value) ? f2(item.value) : item.value) : item.value} | ${item.passed ? "passed" : "failed"} |`),
  "",
  "## Scope",
  "",
  "This measures the deterministic pipeline that bounds the language model. It shows which inputs the system responds to and where it does not; it does not measure clinical appropriateness.",
  "",
];

const outDir = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(outDir, { recursive: true });
await writeFile(new URL("input-sensitivity.latest.md", outDir), `${md.join("\n")}\n`);
await writeFile(new URL("input-sensitivity.latest.json", outDir), `${JSON.stringify({ generatedAt: new Date().toISOString(), runs: runs.length, ofat, correlation, bands, strata, stratifiedSpearman, targets, diversity, slotPicks: Object.fromEntries([...slotPicks].map(([k, v]) => [k, Object.fromEntries(v)])), sweeps }, null, 2)}\n`);
const csv = ["environment,concern,profile,reactivity,finish,exposure,steps,ingredients,dominant_driver,context_score,removed"]
  .concat(runs.map((r) => [r.input.environment, r.input.concern, r.input.profile, r.input.reactivity, r.input.finish, r.input.exposure, r.output.steps.join(" "), r.output.ingredients.join(" "), r.output.dominantDriver, r.output.contextScore, r.output.removed.join(" ")].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")));
await writeFile(new URL("input-sensitivity.latest.csv", outDir), `${csv.join("\n")}\n`);
console.log(JSON.stringify({ runs: runs.length, seconds: (Date.now() - started) / 1000, ofat, correlation, diversity }, null, 2));
if (failedTargets.length) { console.error(`Input-sensitivity targets failed: ${failedTargets.map((item) => item.id).join(", ")}`); process.exitCode = 1; }
