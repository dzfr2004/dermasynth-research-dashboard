import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createConfig, loadDotEnv } from "../lib/config.mjs";

/**
 * Summarises the selection log (data/logs/selection-log.jsonl) into the
 * metrics the dissertation needs for the LLM-driven selection layer:
 *   - how often the model's pick was accepted, rejected (invalid id or not in
 *     the slot's pool) or missing, and how often selection fell back to the
 *     top-scored candidate;
 *   - agreement between the model's pick and the transparent candidate score;
 *   - whether picks change with the environment (per category, per bucket);
 *   - post-selection safety removals by rule;
 *   - CUE outcomes (first-pass, after regeneration, withheld) and latency.
 *
 * Usage: node scripts/report-selection-log.mjs [path/to/log.jsonl]
 */

loadDotEnv(process.cwd());
const config = createConfig();
const path = resolve(process.cwd(), process.argv[2] || config.selectionLog.path);
let text = "";
try { text = await readFile(path, "utf8"); } catch { throw new Error(`No selection log at ${path}. Run some routines with SELECTION_LOG_ENABLED=true first.`); }
const runs = text.split(/\r?\n/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
if (!runs.length) throw new Error("The selection log is empty.");

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
const quantile = (values, q) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};
const bucket = (readings) => {
  const uvi = Number(readings?.uvi);
  const humidity = Number(readings?.humidity);
  const pm25 = Number(readings?.pm25);
  return [
    Number.isFinite(uvi) ? (uvi >= 8 ? "UV high" : uvi >= 3 ? "UV moderate" : "UV low") : "UV n/a",
    Number.isFinite(humidity) ? (humidity <= 50 ? "RH low" : humidity >= 75 ? "RH high" : "RH mid") : "RH n/a",
    Number.isFinite(pm25) ? (pm25 >= 55 ? "PM high" : "PM normal") : "PM n/a",
  ].join(" · ");
};

const slots = runs.flatMap((run) => (run.slots || []).map((slot) => ({ ...slot, run })));
const llmRuns = runs.filter((run) => run.llm?.requested);
const llmSlots = slots.filter((slot) => slot.run.llm?.requested);
const status = (s) => llmSlots.filter((slot) => slot.llmPickStatus === s).length;
const accepted = llmSlots.filter((slot) => slot.llmPickStatus === "accepted");
const agreeing = accepted.filter((slot) => slot.agreesWithSurrogate);
const acceptedRanks = accepted.map((slot) => slot.selectedPoolRank).filter(Number.isFinite);
const multiCandidate = accepted.filter((slot) => (slot.pool || []).length > 1);

const byCategory = new Map();
for (const slot of slots.filter((item) => item.selected)) {
  const entry = byCategory.get(slot.categoryId) || new Map();
  const key = bucket(slot.run.environment?.readings);
  const counts = entry.get(key) || new Map();
  counts.set(slot.selected, (counts.get(slot.selected) || 0) + 1);
  entry.set(key, counts);
  byCategory.set(slot.categoryId, entry);
}

const removals = new Map();
for (const run of runs) for (const item of run.postSafety?.removed || []) for (const rule of item.rules || []) removals.set(rule, (removals.get(rule) || 0) + 1);
const cueRuns = runs.filter((run) => run.cue && run.cue.score !== null && run.cue.score !== undefined);
const cueStatus = (s) => cueRuns.filter((run) => run.cue.status === s).length;
const latencies = runs.map((run) => run.latencyMs).filter(Number.isFinite);

const summary = {
  generatedAt: new Date().toISOString(),
  log: path,
  runs: runs.length,
  llm: {
    runsRequested: llmRuns.length,
    runsFailed: llmRuns.filter((run) => run.llm.status !== "completed").length,
    slots: llmSlots.length,
    accepted: status("accepted"),
    rejectedInvalidId: status("rejected_invalid_id"),
    rejectedNotInPool: status("rejected_not_in_pool"),
    missing: status("missing"),
    fallbackToTopScore: llmSlots.filter((slot) => slot.selectedBy !== "llm_from_rag_pool").length,
    agreementWithCandidateScore: accepted.length ? agreeing.length / accepted.length : null,
    agreementWhenPoolHasChoice: multiCandidate.length ? multiCandidate.filter((slot) => slot.agreesWithSurrogate).length / multiCandidate.length : null,
    meanPoolRankOfAcceptedPick: acceptedRanks.length ? acceptedRanks.reduce((a, b) => a + b, 0) / acceptedRanks.length : null,
  },
  poolSources: Object.fromEntries([...new Set(slots.map((slot) => slot.poolSource))].map((source) => [source, slots.filter((slot) => slot.poolSource === source).length])),
  retrievalModes: Object.fromEntries([...new Set(slots.map((slot) => slot.retrievalMode))].map((mode) => [mode, slots.filter((slot) => slot.retrievalMode === mode).length])),
  postSafetyRemovals: Object.fromEntries(removals),
  cue: {
    runsWithCue: cueRuns.length,
    passedFirstTime: cueStatus("passed"),
    passedAfterRegeneration: cueStatus("passed_after_regeneration"),
    withheld: cueStatus("withheld_below_threshold"),
    meanScore: cueRuns.length ? cueRuns.reduce((sum, run) => sum + run.cue.score, 0) / cueRuns.length : null,
    methods: Object.fromEntries([...new Set(cueRuns.map((run) => run.cue.method))].map((m) => [m, cueRuns.filter((run) => run.cue.method === m).length])),
  },
  latencyMs: { median: quantile(latencies, 0.5), p90: quantile(latencies, 0.9) },
  environmentSensitivity: Object.fromEntries([...byCategory].map(([category, buckets]) => [category, Object.fromEntries([...buckets].map(([key, counts]) => [key, Object.fromEntries(counts)]))])),
};

const f3 = (v) => (v === null || v === undefined ? "n/a" : Number(v).toFixed(3));
const md = [
  "# Selection log report",
  "",
  `Generated ${summary.generatedAt.slice(0, 16).replace("T", " ")} UTC from ${runs.length} logged run(s).`,
  "",
  "## Language-model selection",
  "",
  `| Metric | Value |`,
  `| --- | ---: |`,
  `| Runs where the model was asked to select | ${llmRuns.length} |`,
  `| Model calls that failed (fell back to top score) | ${summary.llm.runsFailed} |`,
  `| Slots offered to the model | ${llmSlots.length} |`,
  `| Picks accepted (in the slot's retrieved pool) | ${summary.llm.accepted} (${pct(summary.llm.accepted, llmSlots.length)}) |`,
  `| Picks rejected: invented or unknown id | ${summary.llm.rejectedInvalidId} (${pct(summary.llm.rejectedInvalidId, llmSlots.length)}) |`,
  `| Picks rejected: valid id but not in this slot's pool | ${summary.llm.rejectedNotInPool} (${pct(summary.llm.rejectedNotInPool, llmSlots.length)}) |`,
  `| Slots with no pick returned | ${summary.llm.missing} (${pct(summary.llm.missing, llmSlots.length)}) |`,
  `| Slots that fell back to the top-scored candidate | ${summary.llm.fallbackToTopScore} (${pct(summary.llm.fallbackToTopScore, llmSlots.length)}) |`,
  `| Agreement with the candidate score (accepted picks) | ${summary.llm.agreementWithCandidateScore === null ? "n/a" : pct(agreeing.length, accepted.length)} |`,
  `| Agreement when the pool had more than one candidate | ${summary.llm.agreementWhenPoolHasChoice === null ? "n/a" : `${(100 * summary.llm.agreementWhenPoolHasChoice).toFixed(1)}%`} |`,
  `| Mean pool rank of accepted picks (1 = top score) | ${f3(summary.llm.meanPoolRankOfAcceptedPick)} |`,
  "",
  "## Retrieval and safety",
  "",
  `Pool sources: ${Object.entries(summary.poolSources).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.`,
  `Retrieval modes: ${Object.entries(summary.retrievalModes).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.`,
  `Post-selection safety removals: ${Object.entries(summary.postSafetyRemovals).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.`,
  "",
  "## CUE (model-written rationale)",
  "",
  `Runs with a CUE score: ${cueRuns.length}. Passed first time: ${summary.cue.passedFirstTime}; passed after one regeneration: ${summary.cue.passedAfterRegeneration}; withheld: ${summary.cue.withheld}. Mean CUE: ${f3(summary.cue.meanScore)}. Methods: ${Object.entries(summary.cue.methods).map(([k, v]) => `${k} ${v}`).join(", ") || "n/a"}.`,
  "",
  `Latency (whole routine request): median ${summary.latencyMs.median ?? "n/a"} ms, 90th percentile ${summary.latencyMs.p90 ?? "n/a"} ms.`,
  "",
  "## Does the pick change with the environment?",
  "",
  ...[...byCategory].flatMap(([category, buckets]) => [
    `**${category}**`,
    "",
    "| Environment bucket | Selected ingredients (count) |",
    "| --- | --- |",
    ...[...buckets].map(([key, counts]) => `| ${key} | ${[...counts].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} (${n})`).join(", ")} |`),
    "",
  ]),
];

const outDir = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(outDir, { recursive: true });
await writeFile(new URL("selection-log.latest.json", outDir), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(new URL("selection-log.latest.md", outDir), `${md.join("\n")}\n`);
console.log(JSON.stringify({ runs: runs.length, llm: summary.llm, cue: summary.cue, report: "data/evaluation/reports/selection-log.latest.md" }, null, 2));
