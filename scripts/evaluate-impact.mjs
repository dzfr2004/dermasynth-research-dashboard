import { mkdir, writeFile } from "node:fs/promises";
import { createRepository } from "../lib/ingredient-repository.mjs";
import { checkProduct, parseIngredientList } from "../lib/product-check.mjs";
import { planningUvi } from "../lib/uv.mjs";
import { readingChanges, tomorrowChanges } from "../lib/outlook.mjs";
import { templateRoutine } from "../lib/safety.mjs";
import { isPrivateAddress, networkLocation } from "../lib/network-location.mjs";
import { prefetchSlotSearches, retrieveSlotCandidates } from "../lib/candidate-retrieval.mjs";
import { cachedSearch, clearSearchCache } from "../lib/search-cache.mjs";
import { createConfig } from "../lib/config.mjs";

/**
 * Offline tests for the result-impact features:
 *   - "Check my product" (parsing, matching, step fit, clashes, cautions,
 *     unknown ingredients never guessed);
 *   - sunscreen planned on today's peak UV, not the reading at build time;
 *   - "changed since last time" wording (steps and readings).
 * Usage: npm run eval:impact
 */

const repository = createRepository({});
const results = [];
async function test(id, title, fn) {
  try { await fn(); results.push({ id, title, status: "passed" }); }
  catch (error) { results.push({ id, title, status: "failed", detail: error instanceof Error ? error.message : String(error) }); }
}
const expect = (cond, message) => { if (!cond) throw new Error(message); };

const routine = {
  entries: [
    { ingredientId: "glycerin", displayName: "Glycerin", phase: "am", categoryId: "comfort-hydration" },
    { ingredientId: "retinol", displayName: "Retinol", phase: "pm", categoryId: "texture-renewal" },
  ],
  steps: ["am:low-irritation-cleansing", "am:comfort-hydration", "am:daytime-photoprotection", "pm:texture-renewal"],
  concern: "acne",
  reactivityLevel: "low",
};

await test("imp-01", "Ingredient lists split on commas, new lines and bullets; bracketed names and percentages are handled", async () => {
  const items = parseIngredientList("Ingredients: Aqua (Water), Glycerin; Niacinamide 5%\n• Sodium Hyaluronate");
  const names = items.map((i) => i.name);
  for (const expected of ["aqua", "water", "glycerin", "niacinamide", "sodium hyaluronate"]) expect(names.includes(expected), `Missing ${expected}: ${names.join(", ")}`);
});

await test("imp-02", "A product with the chosen ingredient fits that step exactly", async () => {
  const r = checkProduct({ text: "Aqua, Glycerin, Panthenol", repository, routine });
  const fit = r.fits.find((f) => f.categoryId === "comfort-hydration");
  expect(fit?.exact, "Glycerin should fit the morning hydrating layer exactly.");
  expect(!r.conflicts.length && !r.cautions.some((c) => c.level === "stop"), "No clash or stop expected.");
});

await test("imp-03", "A clash with today's routine is reported from the incompatibility matrix", async () => {
  const r = checkProduct({ text: "Aqua, Salicylic Acid", repository, routine });
  expect(r.conflicts.some((c) => c.routineIngredient === "retinol"), "Salicylic acid with retinol should be reported.");
  expect(/not in the same routine|pharmacist/i.test(r.verdict), `Unexpected verdict: ${r.verdict}`);
});

await test("imp-04", "Prescription-only ingredients get a stop caution", async () => {
  const r = checkProduct({ text: "Tretinoin, Glycerin", repository, routine });
  expect(r.cautions.some((c) => c.level === "stop"), "Tretinoin should trigger a stop caution.");
  expect(/pharmacist/i.test(r.verdict), "Verdict should point to a pharmacist.");
});

await test("imp-05", "Strong exfoliants are flagged for reactive skin only", async () => {
  const reactive = checkProduct({ text: "Glycolic Acid", repository, routine: { ...routine, concern: "sensitivity" } });
  const calm = checkProduct({ text: "Glycolic Acid", repository, routine: { ...routine, concern: "acne", reactivityLevel: "low" } });
  const hasWarn = (r) => r.cautions.some((c) => c.level === "warn");
  expect(hasWarn(reactive), "Reactive skin should get the exfoliant warning.");
  expect(!hasWarn(calm), "Non-reactive skin should not get the exfoliant warning.");
});

await test("imp-06", "Unknown ingredients are counted as not checked, never guessed", async () => {
  const r = checkProduct({ text: "Aqua, Glycerin, Madeupium Extract, Zorblax Oil", repository, routine });
  expect(r.unrecognised.length === 2, `Expected 2 unrecognised, got ${r.unrecognised.length}.`);
  expect(/2 of 3/.test(r.note || ""), `Note should say 2 of 3: ${r.note}`);
  const none = checkProduct({ text: "Madeupium Extract", repository, routine });
  expect(/didn't recognise/.test(none.verdict), "An all-unknown list must say nothing was recognised.");
});

await test("imp-06b", "Spaces, hyphens and underscores match the same ingredient (Round 1: 'Alpha Arbutin')", async () => {
  for (const text of ["Aqua, Alpha Arbutin", "Aqua, Alpha-Arbutin", "Aqua, alpha_arbutin"]) {
    const r = checkProduct({ text, repository, routine });
    expect(r.unrecognised.length === 0, `${text}: not recognised (${r.unrecognised.join(", ")})`);
  }
});

await test("imp-07", "Sunscreen is planned on today's peak UV, not the reading at build time", async () => {
  expect(planningUvi({ uvi: 1, uviMaxToday: 9 }) === 9, "Peak should win when higher.");
  expect(planningUvi({ uvi: 4 }) === 4, "Without a forecast the current reading is used.");
  expect(planningUvi({ uvi: null, uviMaxToday: null }) === null, "No readings gives null.");
  const early = templateRoutine("acne", { environment: { readings: { uvi: 1, uviMaxToday: 9, humidity: 70, pm25: 10, temperature: 29 } }, evidence: [], profile: "combination" });
  expect(early.am.some((s) => s.id === "daytime-photoprotection"), "A 7 am run on a UV 9 day must include sunscreen.");
});

await test("imp-08", "Changes since last time: steps and readings are described in plain words", async () => {
  const lines = readingChanges({ uvi: 3, humidity: 80, pm25: 12, temperature: 30 }, { uvi: 9, humidity: 55, pm25: 14, temperature: 31 });
  expect(lines.includes("UV rose from 3 to 9"), `UV line missing: ${lines.join(" | ")}`);
  expect(lines.includes("Humidity fell from 80% to 55%"), `Humidity line missing: ${lines.join(" | ")}`);
  expect(!lines.some((l) => /Haze|Temperature/.test(l)), "Small changes should not be reported.");
  const today = templateRoutine("acne", { environment: { readings: { uvi: 9, humidity: 55, pm25: 14, temperature: 31 } }, evidence: [], profile: "combination" });
  const diff = tomorrowChanges({ todaySteps: ["am:low-irritation-cleansing"], tomorrowRoutine: today, readings: { uvi: 9, humidity: 55, pm25: 14, temperature: 31 }, when: "today" });
  expect(diff.changes.some((c) => c.change === "added" && /sunscreen/i.test(c.text)), "Sunscreen should be reported as added.");
  expect(!diff.changes.some((c) => /forecast/.test(c.text)), "Today's comparison must not talk about a forecast.");
});

await test("imp-09", "Network location: only for the same private network, never in demo mode, never sends a visitor's address", async () => {
  expect(isPrivateAddress("192.168.1.5") && isPrivateAddress("::ffff:10.0.0.2") && isPrivateAddress("127.0.0.1") && isPrivateAddress("::1") && isPrivateAddress("172.20.1.1"), "private ranges");
  expect(!isPrivateAddress("8.8.8.8") && !isPrivateAddress("172.32.0.1") && !isPrivateAddress("::ffff:203.0.113.9"), "public ranges");
  const realFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(String(url)); return new Response(JSON.stringify({ success: true, city: "Seri Iskandar", region: "Perak", country_code: "MY", latitude: 4.3616, longitude: 100.9796 }), { status: 200 }); };
  try {
    const cfg = { liveServicesEnabled: true, requestTimeoutMs: 2000 };
    expect((await networkLocation({ ...cfg, liveServicesEnabled: false }, "192.168.1.5")).available === false, "should be off in demo mode");
    expect((await networkLocation(cfg, "203.0.113.9")).reason === "remote" && urls.length === 0, "remote visitors must not trigger a lookup");
    const r = await networkLocation(cfg, "::ffff:192.168.1.23");
    expect(r.available && r.approximate && r.name === "Seri Iskandar, MY" && r.lat === 4.36 && r.lon === 100.98, JSON.stringify(r));
    expect(urls.every((u) => !u.includes("192.168")), "the visitor's address must never be sent");
  } finally { globalThis.fetch = realFetch; }
});

await test("imp-10", "Search cache: a repeated or prefetched search is reused, cleared on re-sync, off at 0, failures not kept", async () => {
  const realFetch = globalThis.fetch;
  let searches = 0;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("api.pinecone.io/indexes/")) return new Response(JSON.stringify({ host: "idx.test", embed: { field_map: { text: "chunk_text" } } }), { status: 200 });
    searches += 1;
    await new Promise((r) => setTimeout(r, 30));
    return new Response(JSON.stringify({ result: { hits: [{ _score: 0.9, fields: { ingredient_ids: ["glycerin"] } }] } }), { status: 200 });
  };
  const base = { liveServicesEnabled: true, requestTimeoutMs: 2000, pinecone: { apiKey: "k", index: "imp10", evidenceNamespace: "ev", textField: "chunk_text" } };
  const env = { readings: { uvi: 9, humidity: 80, pm25: 10 } };
  const ask = (cfg) => retrieveSlotCandidates({ config: cfg, corpus: [], categoryIds: ["comfort-hydration"], concern: "acne", environment: env });
  try {
    clearSearchCache();
    const cfg = { ...base, searchCacheMs: 60_000 };
    const first = await ask(cfg);
    await ask(cfg);
    expect(searches === 1, `repeat should reuse the search, ran ${searches}`);
    expect(first.get("comfort-hydration").mode === "hybrid-bm25-dense-rrf", "dense result used");
    // Prefetch while "GPT" is working, then the real call picks up the running search.
    clearSearchCache(); searches = 0;
    expect(prefetchSlotSearches({ config: cfg, categoryIds: ["comfort-hydration", "daytime-photoprotection"], concern: "acne", environment: env }) === 2, "two prefetched");
    const later = await ask(cfg);
    expect(searches === 2 && later.get("comfort-hydration").ranked[0].ingredientId === "glycerin", `prefetched search reused, ran ${searches}`);
    clearSearchCache(); await ask(cfg);
    expect(searches === 3, "cleared cache searches again");
    searches = 0; const off = { ...base, searchCacheMs: 0 };
    await ask(off); await ask(off);
    expect(searches === 2 && prefetchSlotSearches({ config: off, categoryIds: ["comfort-hydration"], concern: "acne", environment: env }) === 0, "0 turns the cache and prefetch off");
    let calls = 0;
    const failing = () => { calls += 1; return Promise.reject(new Error("down")); };
    await cachedSearch(60_000, "imp10-fail", failing).catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    await cachedSearch(60_000, "imp10-fail", failing).catch(() => {});
    expect(calls === 2, "a failed search must not be cached");
  } finally { globalThis.fetch = realFetch; clearSearchCache(); }
});

await test("imp-11", "GPT time limits are on by default (25 s per routine, 20 s per explanation set)", async () => {
  const keys = ["GPT_ROUTINE_BUDGET_MS", "GPT_CONTEXT_BUDGET_MS"];
  const saved = keys.map((k) => process.env[k]);
  try {
    keys.forEach((k) => delete process.env[k]);
    const cfg = createConfig();
    expect(cfg.openai.routineBudgetMs === 25_000 && cfg.openai.contextBudgetMs === 20_000, JSON.stringify([cfg.openai.routineBudgetMs, cfg.openai.contextBudgetMs]));
    process.env.GPT_ROUTINE_BUDGET_MS = "0";
    expect(createConfig().openai.routineBudgetMs === 0, "0 still turns the limit off");
  } finally { keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }); }
});

const passed = results.filter((r) => r.status === "passed").length;
const md = ["# Result-impact feature tests", "", `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run eval:impact\`. Result: **${passed}/${results.length} passed**.`, "", "| ID | Test | Result |", "| --- | --- | --- |", ...results.map((r) => `| ${r.id} | ${r.title} | ${r.status}${r.detail ? `: ${r.detail}` : ""} |`), ""];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("impact.latest.md", out), `${md.join("\n")}\n`);
console.log(JSON.stringify({ suite: "impact", total: results.length, passed, failures: results.filter((r) => r.status !== "passed") }, null, 2));
if (passed !== results.length) process.exitCode = 1;
