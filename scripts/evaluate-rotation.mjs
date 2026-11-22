import { mkdir, writeFile } from "node:fs/promises";
import { createRepository } from "../lib/ingredient-repository.mjs";
import { buildIngredientEvidenceCorpus } from "../lib/ingredient-evidence-corpus.mjs";
import { retrieveSlotCandidates } from "../lib/candidate-retrieval.mjs";
import { selectApprovedIngredientCandidates } from "../lib/ingredient-selection.mjs";
import { postSelectionSafetyPass } from "../lib/post-selection-safety.mjs";
import { templateRoutine, CONCERN_CATALOG } from "../lib/safety.mjs";
import { getRuntimePolicy } from "../lib/policy-store.mjs";
import { effectiveReactivity } from "../lib/personalisation.mjs";
import { ROTATION, createRecentPicks } from "../lib/rotation.mjs";

/**
 * Score-band rotation evaluation (lib/rotation.mjs).
 *
 * For every input combination in the grid the deterministic pipeline is run
 * RUNS times in a row with a fresh seed each time and a shared recent-picks
 * memory, exactly as the server does for successive visitors. It checks:
 *
 *   R1  every shown ingredient scored within the band (0.05) of its slot's top
 *       candidate, so rotation never shows a clearly weaker option;
 *   R2  the post-selection safety pass removed nothing, and every pick is a
 *       member of its own retrieved, approved pool;
 *   R3  the same seed and the same recent memory give the same output (the
 *       draw can be replayed from the run report);
 *   R4  without a seed the output is identical to the plain top-score pick;
 *   R5  slots with a near-tied pool no longer show one ingredient every time
 *       (no near-tied slot has a single ingredient above 80% of picks).
 *
 * Output: data/evaluation/reports/rotation.latest.md (and .json). `--quick`
 * runs a smaller grid and writes no report.
 */

const QUICK = process.argv.includes("--quick");
const RUNS = QUICK ? 6 : 10;
const ENVIRONMENTS = [
  { id: "E1", readings: { uvi: 11, humidity: 85, pm25: 70, temperature: 33 } },
  { id: "E3", readings: { uvi: 1, humidity: 35, pm25: 12, temperature: 5 } },
  { id: "E4", readings: { uvi: 10, humidity: 20, pm25: 30, temperature: 40 } },
  { id: "E7", readings: { uvi: 6, humidity: 55, pm25: 15, temperature: 20 } },
];
const CONCERNS = CONCERN_CATALOG.map((item) => item.id);
const PROFILES = QUICK ? ["dry", "oily"] : ["dry", "combination", "oily", "sensitive"];
const FINISH = QUICK ? ["no-preference"] : ["no-preference", "matte", "dewy"];
const REACTIVITY = ["low"];

const repo = createRepository({});
const policy = getRuntimePolicy();
const corpus = buildIngredientEvidenceCorpus({ ingredients: repo.listIngredients(), sources: repo.listSources() });
const config = { liveServicesEnabled: false, pinecone: {}, openai: {} };

async function prepare({ readings, concern, profile, reactivity: stated, finish }) {
  const environment = { mode: "evaluation", readings };
  const reactivity = effectiveReactivity({ profile, reactivityLevel: stated }).level;
  const routine = templateRoutine(concern, { environment, evidence: [], profile, finishPreference: finish, reactivityLevel: stated, exposureContext: "mixed" });
  const categoryIds = [...routine.am, ...routine.pm].map((step) => step.id);
  const slotRetrieval = await retrieveSlotCandidates({ config, corpus, categoryIds, concern, environment, policy });
  const base = { enabled: true, repository: repo, routine, profile, finishPreference: finish, concern, environment, reactivityLevel: reactivity, slotRetrieval };
  const run = (extra = {}) => {
    const selection = selectApprovedIngredientCandidates({ ...base, ...extra });
    const post = postSelectionSafetyPass({ entries: selection.entries, concern, reactivityLevel: reactivity, environment });
    return { selection, post };
  };
  return { run };
}

const failures = [];
const fail = (id, message) => { if (failures.length < 40) failures.push(`${id}: ${message}`); };
const before = new Map();
const after = new Map();
const tally = (map, slot, id) => { const m = map.get(slot) || new Map(); m.set(id, (m.get(id) || 0) + 1); map.set(slot, m); };
const nearTiedSlots = new Set();
let combos = 0;
let picks = 0;
let rotatedPicks = 0;
let differsFromTop = 0;
let removed = 0;

const started = Date.now();
for (const env of ENVIRONMENTS) for (const concern of CONCERNS) for (const profile of PROFILES) for (const finish of FINISH) for (const reactivity of REACTIVITY) {
  combos += 1;
  const label = `${env.id}/${concern}/${profile}/${finish}`;
  const { run } = await prepare({ readings: env.readings, concern, profile, reactivity, finish });

  // R4: no seed = top score.
  const plain = run();
  for (const entry of plain.post.entries) {
    const slot = plain.selection.pool.find((s) => s.categoryId === entry.categoryId && s.phase === entry.phase);
    if (slot?.candidates[0]?.ingredientId !== entry.ingredientId) fail("R4", `${label} ${entry.categoryId} without a seed did not use the top score`);
  }

  const recent = createRecentPicks();
  for (let i = 0; i < RUNS; i += 1) {
    const seed = `eval-${label}-${i}`;
    const snapshot = recent.snapshot();
    const { selection, post } = run({ rotationSeed: seed, recentPicks: recent });
    // R3: replay with the same seed and the same memory.
    const replay = run({ rotationSeed: seed, recentPicks: snapshot });
    const ids = (r) => r.post.entries.map((e) => `${e.phase}:${e.categoryId}=${e.ingredientId}`).join(",");
    if (ids(replay) !== ids({ post })) fail("R3", `${label} run ${i} did not replay`);
    removed += post.removed.length;
    if (post.removed.length) fail("R2", `${label} safety removed ${post.removed.map((r) => r.ingredientId).join(",")}`);
    for (const slot of selection.pool) {
      const key = `${slot.phase}:${slot.categoryId}`;
      const top = slot.candidates[0];
      if (!top) continue;
      if (i === 0) tally(before, key, top.ingredientId);
      if (slot.candidates.filter((c) => top.score - c.score <= ROTATION.band + 1e-9).length > 1) nearTiedSlots.add(key);
    }
    for (const entry of post.entries) {
      picks += 1;
      const key = `${entry.phase}:${entry.categoryId}`;
      tally(after, key, entry.ingredientId);
      const slot = selection.pool.find((s) => s.categoryId === entry.categoryId && s.phase === entry.phase);
      const member = slot?.candidates.find((c) => c.ingredientId === entry.ingredientId);
      if (!member) { fail("R2", `${label} ${key} pick ${entry.ingredientId} is not in its pool`); continue; }
      if (slot.candidates[0].score - member.score > ROTATION.band + 1e-9) fail("R1", `${label} ${key} pick ${entry.ingredientId} is ${(slot.candidates[0].score - member.score).toFixed(3)} below the top`);
      if (entry.selectedBy === "rotation_within_score_band") rotatedPicks += 1;
      if (entry.ingredientId !== slot.candidates[0].ingredientId) differsFromTop += 1;
    }
    recent.record(post.entries);
  }
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "—");
const share = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]);
const rows = [...new Set([...before.keys(), ...after.keys()])].sort().map((slot) => {
  const b = before.get(slot) || new Map();
  const a = after.get(slot) || new Map();
  const bt = [...b.values()].reduce((x, y) => x + y, 0);
  const at = [...a.values()].reduce((x, y) => x + y, 0);
  const maxShare = at ? Math.max(...a.values()) / at : 0;
  if (nearTiedSlots.has(slot) && maxShare > 0.8) fail("R5", `${slot} still shows one ingredient in ${(100 * maxShare).toFixed(0)}% of picks`);
  return {
    slot,
    nearTied: nearTiedSlots.has(slot),
    before: share(b).map(([id, n]) => `${id} ${pct(n, bt)}`).join(", "),
    after: share(a).map(([id, n]) => `${id} ${pct(n, at)}`).join(", "),
    distinctBefore: b.size,
    distinctAfter: a.size,
    maxShareAfter: Number(maxShare.toFixed(3)),
  };
});

const summary = { combos, runsPerCombo: RUNS, picks, rotatedPicks, differsFromTop, removedBySafety: removed, band: ROTATION.band, tau: ROTATION.tau, recentWindow: ROTATION.recentWindow, recentPenalty: ROTATION.recentPenalty, seconds: Number(((Date.now() - started) / 1000).toFixed(1)) };
console.log(`Rotation evaluation: ${combos} input combinations × ${RUNS} runs, ${picks} picks, ${pct(differsFromTop, picks)} differ from the top score, ${removed} safety removals.`);
for (const row of rows) console.log(`  ${row.slot.padEnd(36)} ${row.distinctBefore} → ${row.distinctAfter} distinct   ${row.after}`);

if (!QUICK) {
  await mkdir("data/evaluation/reports", { recursive: true });
  const md = [
    "# Score-band rotation evaluation",
    "",
    `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by \`npm run eval:rotation\` in ${summary.seconds} s.`,
    "",
    `Grid: ${ENVIRONMENTS.length} environments × ${CONCERNS.length} concerns × ${PROFILES.length} profiles × ${FINISH.length} finish preferences = **${combos} input combinations**, each run **${RUNS} times in a row** with a fresh seed and a shared recent-picks memory (as successive visitors to the server). GPT is not called.`,
    "",
    `Rule (\`lib/rotation.mjs\` v${ROTATION.version}): candidates within **${ROTATION.band}** of the slot's top score are treated as equally supported (smaller than one evidence-grade step, 0.075). One is drawn with weight exp((score − top)/${ROTATION.tau}), × ${ROTATION.recentPenalty} if it was shown for that slot in the last ${ROTATION.recentWindow} runs.`,
    "",
    "## Checks",
    "",
    "| Check | Result |",
    "| --- | --- |",
    `| R1 every pick within ${ROTATION.band} of its slot's top score | ${failures.some((f) => f.startsWith("R1")) ? "FAIL" : "pass"} |`,
    `| R2 every pick in its own approved pool; post-selection safety removed nothing (${removed} removals) | ${failures.some((f) => f.startsWith("R2")) ? "FAIL" : "pass"} |`,
    `| R3 same seed + same memory replays the same output | ${failures.some((f) => f.startsWith("R3")) ? "FAIL" : "pass"} |`,
    `| R4 no seed gives the plain top-score pick | ${failures.some((f) => f.startsWith("R4")) ? "FAIL" : "pass"} |`,
    `| R5 no near-tied slot shows one ingredient in more than 80% of picks | ${failures.some((f) => f.startsWith("R5")) ? "FAIL" : "pass"} |`,
    "",
    `${picks} picks; ${pct(rotatedPicks, picks)} came from a band with more than one member; ${pct(differsFromTop, picks)} differ from the top-scored candidate.`,
    "",
    "## Picks per step, before (top score) and after (rotation)",
    "",
    "| Step | Near-tied pool | Before | After |",
    "| --- | :---: | --- | --- |",
    ...rows.map((r) => `| ${r.slot} | ${r.nearTied ? "yes" : "no"} | ${r.before} | ${r.after} |`),
    "",
    "Steps whose pool has a clear leader (a gap above the band) keep that leader, for example salicylic acid for evening texture renewal in the breakout context. Rotation only moves picks between candidates the score cannot tell apart.",
    "",
  ].join("\n");
  await writeFile("data/evaluation/reports/rotation.latest.md", md);
  await writeFile("data/evaluation/reports/rotation.latest.json", JSON.stringify({ summary, rows, failures }, null, 2));
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("All rotation checks passed.");
