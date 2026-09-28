import { mkdir, writeFile } from "node:fs/promises";

/**
 * Live GPT evaluation (C1).
 *
 * Sends a fixed set of routine requests to a RUNNING DermaSynth server with
 * live services on (npm start, with the keys in .env), then asks for the GPT
 * step and ingredient explanations of each run. It records, per run:
 *   - whether GPT made the category selection and the ingredient picks, and
 *     how many picks were accepted, rejected or fell back;
 *   - the "degraded" flag and the GPT time used;
 *   - how many explanations were shown from GPT, how many were withheld by CUE,
 *     and their CUE scores;
 *   - latency of the routine and of the explanations.
 *
 * Usage (two terminals):
 *   npm start
 *   npm run eval:live                 # 20 scenarios, about 5 minutes
 *   npm run eval:live -- --limit=6    # a quick sample
 * Then `npm run report:selection-log` summarises everything logged.
 *
 * The server allows 6 routine requests per minute per client; this script
 * waits when it is told to. It costs GPT usage (roughly 4 to 8 calls per run).
 */

const args = process.argv.slice(2);
const option = (name, fallback) => (args.find((a) => a.startsWith(`--${name}=`)) || "").split("=")[1] || fallback;
const BASE = option("base", process.env.DERMASYNTH_URL || "http://127.0.0.1:4173");
const LIMIT = Number(option("limit", "20"));
const TIMEOUT_MS = Number(option("timeout", "150")) * 1000;

const CITIES = [
  { name: "Kuala Lumpur, MY", lat: 3.14, lon: 101.69 },
  { name: "Ipoh, MY", lat: 4.6, lon: 101.08 },
  { name: "Singapore, SG", lat: 1.35, lon: 103.82 },
  { name: "New Delhi, IN", lat: 28.61, lon: 77.21 },
  { name: "Dubai, AE", lat: 25.2, lon: 55.27 },
  { name: "London, GB", lat: 51.51, lon: -0.13 },
  { name: "Seoul, KR", lat: 37.57, lon: 126.98 },
  { name: "Sydney, AU", lat: -33.87, lon: 151.21 },
  { name: "Oslo, NO", lat: 59.91, lon: 10.75 },
  { name: "Cairo, EG", lat: 30.04, lon: 31.24 },
];
const PROFILES = [
  { profile: "oily", concern: "acne", finishPreference: "matte", reactivityLevel: "low", exposureContext: "outdoors" },
  { profile: "dry", concern: "dryness", finishPreference: "dewy", reactivityLevel: "low", exposureContext: "indoors" },
  { profile: "sensitive", concern: "redness", finishPreference: "no-preference", reactivityLevel: "moderate", exposureContext: "mixed" },
  { profile: "combination", concern: "pigment", finishPreference: "no-preference", reactivityLevel: "low", exposureContext: "mixed" },
];
const scenarios = [];
for (let i = 0; i < CITIES.length * 2; i += 1) scenarios.push({ location: CITIES[i % CITIES.length], ...PROFILES[i % PROFILES.length] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(path, body) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const started = Date.now();
    let response;
    try {
      response = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      process.stdout.write(`  ${path}: ${timedOut ? `no answer after ${TIMEOUT_MS / 1000} s` : `request failed (${error?.message || error})`}\n`);
      return { status: 0, payload: { error: timedOut ? "timeout" : "network_error" }, ms: Date.now() - started };
    }
    const payload = await response.json().catch(() => ({}));
    if (response.status === 429 || response.status === 503) {
      const wait = Number(response.headers.get("retry-after") || 10) * 1000;
      process.stdout.write(`  waiting ${Math.round(wait / 1000)} s (server rate limit)\n`);
      await sleep(wait);
      continue;
    }
    return { status: response.status, payload, ms: Date.now() - started };
  }
  return { status: 429, payload: { error: "rate limited" }, ms: 0 };
}

try {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  if (health?.mode !== "live-enabled") {
    console.warn("Warning: the server does not report live services. GPT will not run; set LIVE_SERVICES_ENABLED=true and restart.");
  }
} catch {
  console.error(`No DermaSynth server at ${BASE}. Start it with npm start first.`);
  process.exit(1);
}

const rows = [];
for (const [index, scenario] of scenarios.slice(0, LIMIT).entries()) {
  process.stdout.write(`${index + 1}/${Math.min(LIMIT, scenarios.length)} ${scenario.location.name} · ${scenario.profile} · ${scenario.concern}\n`);
  const { location, ...input } = scenario;
  const routine = await post("/api/routine", { ...input, location });
  const r = routine.payload || {};
  process.stdout.write(`  routine: HTTP ${routine.status} in ${(routine.ms / 1000).toFixed(1)} s${r.degraded?.status === "degraded" ? " (reduced mode)" : ""}\n`);
  if (routine.status !== 200) {
    rows.push({ scenario, error: `routine request failed (${routine.payload?.error || routine.status})` });
    continue;
  }
  if (r.status === "needs_conditions") {
    rows.push({ scenario, error: "live weather unavailable (needs_conditions)" });
    continue;
  }
  const pool = r.ingredientCandidates?.pool || [];
  const stages = r.trace?.stages || [];
  const stageOf = (id) => stages.find((s) => s.id === id) || {};
  const row = {
    scenario: { city: location.name, ...input },
    httpStatus: routine.status,
    routineMs: routine.ms,
    mode: r.mode,
    status: r.status,
    synthesisStatus: r.synthesisStatus,
    environmentMode: r.environment?.mode || null,
    categorySelection: stageOf("synthesis").status || null,
    categorySelectionError: stageOf("synthesis").providerCode || null,
    pickCall: stageOf("ingredient_selection").llm?.status || null,
    picks: {
      slots: pool.length,
      accepted: pool.filter((s) => s.llmPickStatus === "accepted").length,
      invalidId: pool.filter((s) => s.llmPickStatus === "rejected_invalid_id").length,
      notInPool: pool.filter((s) => s.llmPickStatus === "rejected_not_in_pool").length,
      missing: pool.filter((s) => s.llmPickStatus === "missing").length,
      callFailed: pool.filter((s) => s.llmPickStatus === "llm_call_failed").length,
      agreeWithScore: (r.ingredientCandidates?.entries || []).filter((e) => e.selectedBy === "llm_from_rag_pool" && e.attribution?.agreesWithSurrogate).length,
    },
    gptMs: r.gpt?.budget?.usedMs ?? null,
    budgetExhausted: Boolean(r.gpt?.budget?.exhausted),
    degraded: r.degraded?.status || null,
    degradedReasons: (r.degraded?.reasons || []).map((x) => x.id),
    context: null,
  };
  const runId = r.routineContext?.runId;
  if (runId && r.routineContext?.available) {
    const context = await post("/api/ai/routine-context", { runId });
    const c = context.payload || {};
    process.stdout.write(`  explanations: HTTP ${context.status} in ${(context.ms / 1000).toFixed(1)} s\n`);
    const items = [...Object.values(c.steps || {}), ...Object.values(c.ingredients || {})];
    row.context = {
      httpStatus: context.status,
      ms: context.ms,
      shown: items.length,
      withheld: (c.withheld || []).length,
      withheldReasons: (c.withheld || []).map((w) => w.reason),
      cueScores: items.map((item) => item.cue?.score).filter(Number.isFinite),
      regenerated: items.filter((item) => item.cue?.attempt === 2).length,
      retry: c.retry || null,
      error: context.status === 200 ? null : c.error || "unavailable",
    };
  } else {
    row.context = { httpStatus: null, error: r.routineContext?.reason || "not available for this run" };
  }
  rows.push(row);
}

// Summary
const ok = rows.filter((row) => !row.error);
const sum = (f) => ok.reduce((s, row) => s + (f(row) || 0), 0);
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
const median = (values) => { const v = values.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const slots = sum((row) => row.picks.slots);
const accepted = sum((row) => row.picks.accepted);
const cue = ok.flatMap((row) => row.context?.cueScores || []);
const shown = sum((row) => row.context?.shown);
const withheld = sum((row) => row.context?.withheld);
const summary = {
  generatedAt: new Date().toISOString(),
  server: BASE,
  runs: rows.length,
  completed: ok.length,
  gptCategorySelectionCompleted: ok.filter((row) => row.categorySelection === "completed").length,
  gptPickCallCompleted: ok.filter((row) => row.pickCall === "completed").length,
  pickSlots: slots,
  picksAccepted: accepted,
  picksInvalidId: sum((row) => row.picks.invalidId),
  picksNotInPool: sum((row) => row.picks.notInPool),
  picksMissing: sum((row) => row.picks.missing),
  picksAgreeingWithScore: sum((row) => row.picks.agreeWithScore),
  degradedRuns: ok.filter((row) => row.degraded === "degraded").length,
  budgetExhaustedRuns: ok.filter((row) => row.budgetExhausted).length,
  explanationsShown: shown,
  explanationsWithheld: withheld,
  meanCue: cue.length ? cue.reduce((a, b) => a + b, 0) / cue.length : null,
  minCue: cue.length ? Math.min(...cue) : null,
  medianRoutineMs: median(ok.map((row) => row.routineMs)),
  medianGptMs: median(ok.map((row) => row.gptMs)),
  medianExplanationMs: median(ok.map((row) => row.context?.ms)),
};
const md = [
  "# Live GPT evaluation",
  "",
  `Generated ${summary.generatedAt.slice(0, 16).replace("T", " ")} UTC by \`npm run eval:live\` against ${BASE}. ${rows.length} routine requests over ${new Set(rows.map((r) => r.scenario.city || r.scenario.location?.name)).size} cities and 4 user profiles, with live weather, air quality and GPT.`,
  "",
  "| Metric | Value |",
  "| --- | ---: |",
  `| Runs completed | ${summary.completed} of ${summary.runs} |`,
  `| GPT category selection completed | ${summary.gptCategorySelectionCompleted} (${pct(summary.gptCategorySelectionCompleted, summary.completed)}) |`,
  `| GPT ingredient-pick call completed | ${summary.gptPickCallCompleted} (${pct(summary.gptPickCallCompleted, summary.completed)}) |`,
  `| GPT picks accepted | ${accepted} of ${slots} slots (${pct(accepted, slots)}) |`,
  `| Invented ingredient ids (rejected) | ${summary.picksInvalidId} (${pct(summary.picksInvalidId, slots)}) |`,
  `| Real ingredient but outside the step's pool (rejected) | ${summary.picksNotInPool} |`,
  `| No pick returned | ${summary.picksMissing} |`,
  `| Accepted picks that match the top candidate score | ${summary.picksAgreeingWithScore} of ${accepted} (${pct(summary.picksAgreeingWithScore, accepted)}) |`,
  `| Runs flagged degraded | ${summary.degradedRuns} (${pct(summary.degradedRuns, summary.completed)}) |`,
  `| Runs that used up the GPT time budget | ${summary.budgetExhaustedRuns} |`,
  `| Explanations shown from GPT (passed CUE) | ${shown} of ${shown + withheld} (${pct(shown, shown + withheld)}) |`,
  `| Mean / lowest CUE of shown explanations | ${summary.meanCue === null ? "n/a" : summary.meanCue.toFixed(3)} / ${summary.minCue === null ? "n/a" : summary.minCue.toFixed(3)} |`,
  `| Median routine latency / GPT time within it | ${summary.medianRoutineMs ?? "n/a"} ms / ${summary.medianGptMs ?? "n/a"} ms |`,
  `| Median explanation latency | ${summary.medianExplanationMs ?? "n/a"} ms |`,
  "",
  "## Runs",
  "",
  "| # | City | Profile / concern | Env | GPT routine | GPT picks | Degraded | Explanations shown / withheld | Routine ms |",
  "| ---: | --- | --- | --- | --- | --- | --- | --- | ---: |",
  ...rows.map((row, i) => row.error
    ? `| ${i + 1} | ${row.scenario.location?.name || row.scenario.city} | ${row.scenario.profile} / ${row.scenario.concern} | — | — | — | — | ${row.error} | — |`
    : `| ${i + 1} | ${row.scenario.city} | ${row.scenario.profile} / ${row.scenario.concern} | ${row.environmentMode} | ${row.categorySelection}${row.categorySelectionError ? ` (${row.categorySelectionError})` : ""} | ${row.picks.accepted}/${row.picks.slots} accepted | ${row.degraded}${row.degradedReasons.length ? ` (${row.degradedReasons.join(", ")})` : ""} | ${row.context?.error ? `n/a: ${row.context.error}` : `${row.context.shown} / ${row.context.withheld}`} | ${row.routineMs} |`),
  "",
  "Scope: live behaviour of the GPT layer on this date, models and account. Every pick and explanation shown here also passed the deterministic safety passes. This is not a clinical evaluation.",
  "",
];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("live-gpt-evaluation.latest.md", out), `${md.join("\n")}\n`);
await writeFile(new URL("live-gpt-evaluation.latest.json", out), `${JSON.stringify({ summary, rows }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log("Report: data/evaluation/reports/live-gpt-evaluation.latest.md");
