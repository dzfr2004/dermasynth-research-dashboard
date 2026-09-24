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
 *   - (C2) agreement against what random picking would give, as kappa;
 *   - (C1) GPT explanation drafts from the context log: first-pass and
 *     after-regeneration CUE pass rates, withheld items, budget use.
 *
 * Usage: node scripts/report-selection-log.mjs [path/to/log.jsonl] [--context=path] [--since=2026-09-24]
 * --since keeps only runs logged on or after that date (use it to exclude
 * runs from before the model stopped seeing the scores).
 */

loadDotEnv(process.cwd());
const config = createConfig();
const args = process.argv.slice(2);
const since = (args.find((a) => a.startsWith("--since=")) || "").slice(8) || null;
const path = resolve(process.cwd(), args.find((a) => !a.startsWith("--")) || config.selectionLog.path);
let text = "";
try { text = await readFile(path, "utf8"); } catch { throw new Error(`No selection log at ${path}. Run some routines with SELECTION_LOG_ENABLED=true first.`); }
const readJsonl = (body) => body.split(/\r?\n/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean).filter((row) => !since || String(row.at || "") >= since);
const runs = readJsonl(text);
let contextRuns = [];
const contextPath = (args.find((a) => a.startsWith("--context=")) || "").slice(10) || config.selectionLog.contextPath;
try { contextRuns = readJsonl(await readFile(resolve(process.cwd(), contextPath), "utf8")); } catch { contextRuns = []; }
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
// Chance agreement: a random pick from a pool of n agrees with the top score 1/n of the time.
const chanceAgreement = multiCandidate.length ? multiCandidate.reduce((sum, slot) => sum + 1 / slot.pool.length, 0) / multiCandidate.length : null;
const observedAgreement = multiCandidate.length ? multiCandidate.filter((slot) => slot.agreesWithSurrogate).length / multiCandidate.length : null;
const agreementKappa = chanceAgreement !== null && chanceAgreement < 1 ? (observedAgreement - chanceAgreement) / (1 - chanceAgreement) : null;

// C1: explanation drafts
const drafts = contextRuns.flatMap((run) => run.drafts || []);
const firstDrafts = drafts.filter((d) => d.attempt === 1);
const secondDrafts = drafts.filter((d) => d.attempt === 2);
const contextLatencies = contextRuns.map((run) => run.latencyMs).filter(Number.isFinite);
const withheldItems = contextRuns.flatMap((run) => run.withheld || []);
const acceptedItems = contextRuns.reduce((sum, run) => sum + (run.accepted?.steps || 0) + (run.accepted?.ingredients || 0), 0);
const cueScores = drafts.map((d) => d.cue?.score).filter(Number.isFinite);

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
    callFailed: status("llm_call_failed"),
    fallbackToTopScore: llmSlots.filter((slot) => slot.selectedBy !== "llm_from_rag_pool").length,
    agreementWithCandidateScore: accepted.length ? agreeing.length / accepted.length : null,
    agreementWhenPoolHasChoice: multiCandidate.length ? multiCandidate.filter((slot) => slot.agreesWithSurrogate).length / multiCandidate.length : null,
    chanceAgreementWhenPoolHasChoice: chanceAgreement,
    agreementKappa,
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
  degraded: {
    runsWithStatus: runs.filter((run) => run.degraded).length,
    degraded: runs.filter((run) => run.degraded?.status === "degraded").length,
    reasons: runs.reduce((acc, run) => { for (const reason of run.degraded?.reasons || []) acc[reason] = (acc[reason] || 0) + 1; return acc; }, {}),
  },
  gptBudget: {
    runsWithBudget: runs.filter((run) => run.gptBudget).length,
    exhausted: runs.filter((run) => run.gptBudget?.exhausted).length,
    medianUsedMs: quantile(runs.map((run) => run.gptBudget?.usedMs).filter(Number.isFinite), 0.5),
  },
  explanations: {
    requests: contextRuns.length,
    items: acceptedItems + withheldItems.length,
    shownFromGpt: acceptedItems,
    withheld: withheldItems.length,
    firstDrafts: firstDrafts.length,
    firstDraftPassed: firstDrafts.filter((d) => d.verdict === "passed").length,
    firstDraftBlockedByGuardrail: firstDrafts.filter((d) => d.verdict === "blocked_by_guardrail").length,
    regenerated: secondDrafts.length,
    regeneratedPassed: secondDrafts.filter((d) => d.verdict === "passed").length,
    retrySkippedByBudget: contextRuns.filter((run) => run.retry === "skipped_budget").length,
    retryFailed: contextRuns.filter((run) => run.retry === "failed").length,
    meanCue: cueScores.length ? cueScores.reduce((a, b) => a + b, 0) / cueScores.length : null,
    cueMethods: Object.fromEntries([...new Set(drafts.map((d) => d.cue?.method).filter(Boolean))].map((m) => [m, drafts.filter((d) => d.cue?.method === m).length])),
    latencyMs: { median: quantile(contextLatencies, 0.5), p90: quantile(contextLatencies, 0.9) },
  },
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
  `| Slots where the GPT call failed or ran out of time | ${summary.llm.callFailed} (${pct(summary.llm.callFailed, llmSlots.length)}) |`,
  `| Slots that fell back to the top-scored candidate | ${summary.llm.fallbackToTopScore} (${pct(summary.llm.fallbackToTopScore, llmSlots.length)}) |`,
  `| Agreement with the candidate score (accepted picks) | ${summary.llm.agreementWithCandidateScore === null ? "n/a" : pct(agreeing.length, accepted.length)} |`,
  `| Agreement when the pool had more than one candidate | ${summary.llm.agreementWhenPoolHasChoice === null ? "n/a" : `${(100 * summary.llm.agreementWhenPoolHasChoice).toFixed(1)}%`} |`,
  `| Agreement expected by chance (random pick from the same pools) | ${chanceAgreement === null ? "n/a" : `${(100 * chanceAgreement).toFixed(1)}%`} |`,
  `| Agreement beyond chance (kappa) | ${f3(agreementKappa)} |`,
  `| Mean pool rank of accepted picks (1 = top score) | ${f3(summary.llm.meanPoolRankOfAcceptedPick)} |`,
  "",
  "The model is not shown the candidate score, the retrieval rank, the fit factor or the EWG reference, and options are listed alphabetically, so agreement is an independent check of the score (runs logged from the C2 change onward; use --since to exclude older runs).",
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
  `Latency (whole routine request): median ${summary.latencyMs.median ?? "n/a"} ms, 90th percentile ${summary.latencyMs.p90 ?? "n/a"} ms. GPT time budget used up in ${summary.gptBudget.exhausted} of ${summary.gptBudget.runsWithBudget} runs (median GPT time ${summary.gptBudget.medianUsedMs ?? "n/a"} ms).`,
  "",
  "## Reduced (degraded) runs",
  "",
  `${summary.degraded.degraded} of ${summary.degraded.runsWithStatus} runs with a recorded status were reduced (${pct(summary.degraded.degraded, summary.degraded.runsWithStatus)}). Reasons: ${Object.entries(summary.degraded.reasons).map(([k, v]) => `${k.replaceAll("_", " ")} ${v}`).join(", ") || "none"}. These runs still returned a safe, rule-based routine (HTTP 200) and carried the x-dermasynth-degraded header.`,
  "",
  "## GPT explanations for steps and ingredients (context log)",
  "",
  `| Metric | Value |`,
  `| --- | ---: |`,
  `| Explanation requests | ${summary.explanations.requests} |`,
  `| Items shown with GPT text | ${summary.explanations.shownFromGpt} of ${summary.explanations.items} (${pct(summary.explanations.shownFromGpt, summary.explanations.items)}) |`,
  `| Items withheld (rule-based text shown) | ${summary.explanations.withheld} |`,
  `| First drafts passing CUE | ${summary.explanations.firstDraftPassed} of ${summary.explanations.firstDrafts} (${pct(summary.explanations.firstDraftPassed, summary.explanations.firstDrafts)}) |`,
  `| First drafts blocked by the claim guardrail | ${summary.explanations.firstDraftBlockedByGuardrail} |`,
  `| Regenerated drafts passing CUE | ${summary.explanations.regeneratedPassed} of ${summary.explanations.regenerated} |`,
  `| Regeneration skipped by the time budget / failed | ${summary.explanations.retrySkippedByBudget} / ${summary.explanations.retryFailed} |`,
  `| Mean CUE score (all drafts) | ${f3(summary.explanations.meanCue)} |`,
  `| CUE methods | ${Object.entries(summary.explanations.cueMethods).map(([k, v]) => `${k} ${v}`).join(", ") || "n/a"} |`,
  `| Explanation latency, median / 90th percentile | ${summary.explanations.latencyMs.median ?? "n/a"} / ${summary.explanations.latencyMs.p90 ?? "n/a"} ms |`,
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
