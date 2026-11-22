import { mkdir, writeFile } from "node:fs/promises";

/**
 * Repeatability check (live).
 *
 * Sends the SAME request several times to a running DermaSynth server and
 * compares the results. Deterministic parts (triage, routine steps, safety
 * status) must be identical every time; the LLM's ingredient picks may vary,
 * but only within each step's approved pool. Weather is cached by the server,
 * so the readings should not change between runs; the report flags it if they
 * do, because a reading change can legitimately change the routine.
 *
 * Usage (two terminals):
 *   npm start
 *   npm run eval:repeatability                    # 3 profiles x 5 runs
 *   npm run eval:repeatability -- --runs=5 --profiles=1
 * Writes data/evaluation/reports/repeatability.latest.{json,md}.
 * Cost: one routine call per run (no explanation calls), about 15 GPT requests in total.
 */

const args = process.argv.slice(2);
const option = (name, fallback) => (args.find((a) => a.startsWith(`--${name}=`)) || "").split("=")[1] || fallback;
const BASE = option("base", process.env.DERMASYNTH_URL || "http://127.0.0.1:4173");
const RUNS = Number(option("runs", "5"));
const NPROFILES = Number(option("profiles", "3"));
const location = { name: "Kuala Lumpur, MY", lat: 3.14, lon: 101.69 };
const PROFILES = [
  { profile: "combination", concern: "acne", finishPreference: "matte", reactivityLevel: "low", exposureContext: "outdoors" },
  { profile: "sensitive", concern: "redness", finishPreference: "no-preference", reactivityLevel: "high", exposureContext: "mixed" },
  { profile: "dry", concern: "dryness", finishPreference: "dewy", reactivityLevel: "moderate", exposureContext: "indoors" },
].slice(0, NPROFILES);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(path, body) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const started = Date.now();
    let response;
    try {
      response = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(150000) });
    } catch (error) {
      return { status: 0, payload: { error: String(error?.message || error) }, ms: Date.now() - started };
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

let live = false;
try {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  live = health?.mode === "live-enabled";
  if (!live) console.warn("Warning: the server does not report live services, so GPT will not run and every pick is rule-based.");
} catch {
  console.error(`No DermaSynth server at ${BASE}. Start it with npm start first.`);
  process.exit(1);
}

const signature = (r) => {
  const steps = ["am", "pm"].flatMap((phase) => (r.routine?.[phase] || []).map((s) => `${phase}:${s.id}`));
  const entries = r.ingredientCandidates?.entries || [];
  const picks = Object.fromEntries(entries.map((e) => [`${e.phase}:${e.categoryId}`, e.ingredientId]));
  const pools = Object.fromEntries((r.ingredientCandidates?.pool || []).map((s) => [`${s.phase}:${s.categoryId}`, (s.candidates || s.pool || []).map((c) => c.id || c.ingredientId)]));
  const outOfPool = entries.filter((e) => pools[`${e.phase}:${e.categoryId}`]?.length && !pools[`${e.phase}:${e.categoryId}`].includes(e.ingredientId)).length;
  return {
    status: r.status, safety: r.safety?.status || null, steps, picks, outOfPool,
    selectedBy: [...new Set(entries.map((e) => e.selectedBy))],
    readings: r.environment?.readings || null, degraded: r.degraded?.status || null,
  };
};

const results = [];
for (const input of PROFILES) {
  process.stdout.write(`\n${input.profile} · ${input.concern} · ${input.reactivityLevel} reactivity\n`);
  const runs = [];
  for (let i = 0; i < RUNS; i += 1) {
    const res = await post("/api/routine", { ...input, location });
    if (res.status !== 200 || res.payload?.status === "needs_conditions") {
      process.stdout.write(`  run ${i + 1}: failed (${res.payload?.error || res.payload?.status || res.status})\n`);
      runs.push({ error: true });
      continue;
    }
    const sig = signature(res.payload);
    process.stdout.write(`  run ${i + 1}: ${sig.status}, safety ${sig.safety}, ${sig.steps.length} steps, picks ${Object.values(sig.picks).join(", ")} (${(res.ms / 1000).toFixed(1)} s)\n`);
    runs.push({ ...sig, ms: res.ms });
  }
  const ok = runs.filter((r) => !r.error);
  const same = (f) => ok.length > 0 && ok.every((r) => JSON.stringify(f(r)) === JSON.stringify(f(ok[0])));
  const slots = [...new Set(ok.flatMap((r) => Object.keys(r.picks)))];
  const perSlot = Object.fromEntries(slots.map((slot) => {
    const counts = {};
    for (const r of ok) { const v = r.picks[slot] || "(none)"; counts[v] = (counts[v] || 0) + 1; }
    return [slot, counts];
  }));
  const stableSlots = slots.filter((slot) => Object.keys(perSlot[slot]).length === 1).length;
  results.push({
    input, runs: runs.length, completed: ok.length,
    identical: { triageStatus: same((r) => r.status), safetyStatus: same((r) => r.safety), routineSteps: same((r) => r.steps), readings: same((r) => r.readings), fullPickSet: same((r) => r.picks) },
    pickStability: { slots: slots.length, stableSlots, perSlot },
    outOfPoolPicks: ok.reduce((a, r) => a + r.outOfPool, 0),
    unsafeRuns: ok.filter((r) => r.safety !== "cleared").length,
    selectedBy: [...new Set(ok.flatMap((r) => r.selectedBy))],
  });
}

const yes = (b) => (b ? "yes" : "**no**");
const md = [
  "# Repeatability check", "",
  `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by \`npm run eval:repeatability\` against ${BASE} (${live ? "live services, GPT on" : "offline, GPT off"}). Each profile was sent ${RUNS} times unchanged, for Kuala Lumpur.`, "",
  "| Profile | Runs | Same triage | Same safety status | Same steps | Same readings | Steps with the same pick every run | Picks outside the pool | Unsafe runs |",
  "| --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: |",
  ...results.map((r) => `| ${r.input.profile}, ${r.input.concern}, ${r.input.reactivityLevel} | ${r.completed}/${r.runs} | ${yes(r.identical.triageStatus)} | ${yes(r.identical.safetyStatus)} | ${yes(r.identical.routineSteps)} | ${yes(r.identical.readings)} | ${r.pickStability.stableSlots} of ${r.pickStability.slots} | ${r.outOfPoolPicks} | ${r.unsafeRuns} |`),
  "",
  "## Ingredient picks per step", "",
  ...results.flatMap((r) => [`**${r.input.profile}, ${r.input.concern}**`, "", ...Object.entries(r.pickStability.perSlot).map(([slot, counts]) => `- ${slot}: ${Object.entries(counts).map(([id, n]) => `${id} (${n})`).join(", ")}`), ""]),
  "Deterministic stages (triage, routine steps, safety status) are expected to be identical in every run. Variation in picks is expected only where the LLM chooses among approved candidates; any pick outside the pool or any unsafe run would be a failure.",
];
const outDir = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(outDir, { recursive: true });
await writeFile(new URL("repeatability.latest.json", outDir), `${JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, live, runsPerProfile: RUNS, results }, null, 2)}\n`);
await writeFile(new URL("repeatability.latest.md", outDir), `${md.join("\n")}\n`);
console.log(`\n${md.slice(4, 6 + results.length).join("\n")}\nReport: data/evaluation/reports/repeatability.latest.md`);
