import { mkdir, readFile, writeFile } from "node:fs/promises";
import { postSelectionSafetyPass } from "../lib/post-selection-safety.mjs";
import { incompatibilityMatrix, safetyFlagConfig } from "../lib/kb-reference.mjs";
import { createRepository } from "../lib/ingredient-repository.mjs";
import { buildIngredientEvidenceCorpus } from "../lib/ingredient-evidence-corpus.mjs";
import { retrieveSlotCandidates } from "../lib/candidate-retrieval.mjs";
import { selectApprovedIngredientCandidates } from "../lib/ingredient-selection.mjs";
import { templateRoutine } from "../lib/safety.mjs";
import { getRuntimePolicy } from "../lib/policy-store.mjs";
import { plainFunction, CONCERN_WORDS } from "../lib/plain-language.mjs";

/**
 * Builds the material for two human evaluations that need no model calls:
 *
 *   1. LLM ablation (data/evaluation/ablation/): every logged step in which the
 *      LLM chose a different ingredient from the rule-based top-scored
 *      candidate, up to the end of the study (30 September 2026). Each unique
 *      situation becomes one blinded pair; which option is A or B is random,
 *      and the key is kept in a separate file.
 *   2. Expert review (data/evaluation/expert-review/): the incompatibility
 *      matrix, the photosensitiser list and five routines produced offline by
 *      the rule-based pipeline for fixed profiles, for a pharmacist or
 *      dermatologist to judge.
 *
 * Usage: node scripts/build-review-materials.mjs [--until=2026-10-01] [--max=40]
 * Then:  python3 scripts/rater-workbooks.py ablation-sheet | review-sheet
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.find((a) => a.startsWith(`--${name}=`)) || "").slice(name.length + 3) || fallback;
const until = opt("until", "2026-10-01");
const max = Number(opt("max", "40"));

const repo = createRepository({});
const names = new Map(repo.listIngredients().map((i) => [i.ingredient_id || i.ingredientId, i.display_name || i.displayName]));
const nameOf = (id) => names.get(id) || id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const describe = (id) => { const f = plainFunction(id); return f ? f[0].toUpperCase() + f.slice(1) + "." : "An approved cosmetic ingredient."; };
const STEP = { "light-hydration": "Light hydrating layer", "supportive-hydration": "Hydrating layer", "comfort-hydration": "Comfort hydrating layer",
  "lightweight-moisturising": "Lightweight moisturiser", "supportive-moisturising": "Moisturiser", "barrier-support-moisturising": "Barrier-support moisturiser",
  "overnight-comfort": "Overnight comfort step", "daytime-photoprotection": "Sun protection", "antioxidant-context": "Antioxidant", "texture-renewal": "Texture renewal (exfoliant)",
  "low-irritation-cleansing": "Gentle cleanse" };
const stepName = (id) => STEP[id] || id;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20261105);
const shuffle = (list) => { const out = [...list]; for (let i = out.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };

// ---------------------------------------------------------------- 1. ablation pairs
const log = (await readFile(new URL("../data/logs/selection-log.jsonl", import.meta.url), "utf8")).split(/\r?\n/).filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.at < until);
const seen = new Map();
let disagreements = 0, llmSteps = 0;
for (const run of log) {
  for (const slot of run.slots || []) {
    if (!slot.llmPick || slot.selectedBy !== "llm_from_rag_pool") continue;
    llmSteps += 1;
    if (!slot.surrogateTopPick || slot.llmPick === slot.surrogateTopPick) continue;
    disagreements += 1;
    const key = [run.input?.concern, run.input?.profile, run.input?.reactivityLevel, slot.phase, slot.categoryId, slot.llmPick, slot.surrogateTopPick].join("|");
    if (!seen.has(key)) seen.set(key, { run, slot });
  }
}
const chosen = shuffle([...seen.values()]).slice(0, max);
const items = [], key = {};
chosen.forEach(({ run, slot }, index) => {
  const id = `AB${String(index + 1).padStart(3, "0")}`;
  const llmIsA = rand() < 0.5;
  const a = llmIsA ? slot.llmPick : slot.surrogateTopPick;
  const b = llmIsA ? slot.surrogateTopPick : slot.llmPick;
  const r = run.environment?.readings || {};
  items.push({
    item_id: id,
    skin: `${run.input?.profile || "unknown"} skin, ${CONCERN_WORDS[run.input?.concern] || run.input?.concern}, ${run.input?.reactivityLevel || "unstated"} reactivity`,
    weather: `UV ${r.uvi ?? "n/a"}, humidity ${r.humidity ?? "n/a"}%, ${r.temperature ?? "n/a"} °C, PM2.5 ${r.pm25 ?? "n/a"} µg/m³`,
    step: `${slot.phase === "am" ? "Morning" : "Evening"}: ${stepName(slot.categoryId)}`,
    option_a: `${nameOf(a)}: ${describe(a)}`,
    option_b: `${nameOf(b)}: ${describe(b)}`,
  });
  key[id] = { llm: llmIsA ? "A" : "B", llmPick: slot.llmPick, rulePick: slot.surrogateTopPick, runId: run.runId, at: run.at };
});
const abDir = new URL("../data/evaluation/ablation/", import.meta.url);
await mkdir(abDir, { recursive: true });
await writeFile(new URL("ablation-items.json", abDir), `${JSON.stringify({ generatedAt: new Date().toISOString(), until, items }, null, 2)}\n`);
await writeFile(new URL("ablation-key.json", abDir), `${JSON.stringify({ generatedAt: new Date().toISOString(), until, runs: log.length, llmSteps, disagreements, uniqueSituations: seen.size, items: key }, null, 2)}\n`);

// ---------------------------------------------------------------- 2. expert review
const matrix = (JSON.parse(await readFile(new URL("../data/ingredients/incompatibility-matrix.v1.json", import.meta.url), "utf8")));
const flags = safetyFlagConfig();
const policy = getRuntimePolicy();
const corpus = buildIngredientEvidenceCorpus({ ingredients: repo.listIngredients(), sources: repo.listSources() });
const offlineConfig = { liveServicesEnabled: false, pinecone: {}, openai: {} };
async function runRoutine({ concern, profile, reactivity, readings }) {
  const environment = { readings };
  const routine = templateRoutine(concern, { environment, evidence: [], profile, reactivityLevel: reactivity });
  const slotRetrieval = await retrieveSlotCandidates({ config: offlineConfig, corpus, categoryIds: [...routine.am, ...routine.pm].map((s) => s.id), concern, environment, policy });
  const selection = selectApprovedIngredientCandidates({ enabled: true, repository: repo, routine, concern, environment, profile, reactivityLevel: reactivity, slotRetrieval, selectionMap: null, llmRequested: false, llmRejected: [] });
  return postSelectionSafetyPass({ entries: selection.entries, concern, reactivityLevel: reactivity, environment }).entries;
}
const profiles = [
  { id: "R1", label: "Oily skin, breakouts, low reactivity; hot, humid and hazy day", concern: "acne", profile: "oily", reactivity: "low", readings: { uvi: 10, humidity: 82, temperature: 33, pm25: 68 } },
  { id: "R2", label: "Dry skin, dryness, moderate reactivity; cool, dry and clear day", concern: "dryness", profile: "dry", reactivity: "moderate", readings: { uvi: 4, humidity: 38, temperature: 14, pm25: 9 } },
  { id: "R3", label: "Combination skin, uneven tone, low reactivity; very high UV", concern: "pigment", profile: "combination", reactivity: "low", readings: { uvi: 11, humidity: 70, temperature: 31, pm25: 20 } },
  { id: "R4", label: "Sensitive skin, redness, high reactivity; hot and humid day", concern: "sensitivity", profile: "sensitive", reactivity: "high", readings: { uvi: 9, humidity: 85, temperature: 32, pm25: 25 } },
  { id: "R5", label: "Combination skin, sensitive barrier, moderate reactivity; hazy day", concern: "barrier", profile: "combination", reactivity: "moderate", readings: { uvi: 6, humidity: 75, temperature: 30, pm25: 90 } },
];
const routines = [];
for (const pr of profiles) {
  const entries = await runRoutine(pr);
  const line = (phase) => entries.filter((e) => e.phase === phase).map((e) => `${stepName(e.categoryId)}: ${e.displayName || nameOf(e.ingredientId)}`);
  routines.push({ id: pr.id, profile: pr.label, morning: line("am"), evening: line("pm") });
}
const revDir = new URL("../data/evaluation/expert-review/", import.meta.url);
await mkdir(revDir, { recursive: true });
await writeFile(new URL("review-items.json", revDir), `${JSON.stringify({
  generatedAt: new Date().toISOString(), matrixVersion: matrix.matrixVersion, flagsVersion: flags.flagsVersion,
  pairs: matrix.pairs.map(([l, r]) => ({ first: nameOf(l), second: nameOf(r), ids: [l, r] })),
  photosensitising: flags.photosensitising.ids.map(nameOf), highIntensityExfoliants: (flags.highIntensityExfoliants?.ids || []).map(nameOf),
  prescriptionOnly: flags.prescriptionOnly.map(nameOf), routines,
}, null, 2)}\n`);
console.log(JSON.stringify({ ablation: { runs: log.length, llmSteps, disagreements, uniqueSituations: seen.size, items: items.length }, review: { pairs: matrix.pairs.length, routines: routines.length } }, null, 2));
