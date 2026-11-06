import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { triageRoutineRequest } from "../lib/safety.mjs";

/**
 * Second blind triage set (data/evaluation/fixtures/triage-cases.blind2.v1.json).
 *
 * Written from NHS and DermNet red-flag guidance by someone other than the
 * rule author, after the rules were frozen. Reports rules alone and, with
 * --llm, rules plus the escalate-only GPT second opinion. The first run of
 * each method is recorded in the fixture (blindRuns) together with the
 * sha256 of the triage files, and is never overwritten, so later rule edits
 * cannot rewrite the blind result.
 *
 *   npm run eval:triage-blind               # rules only, offline
 *   npm run eval:triage-blind -- --llm      # needs OpenAI access
 */

const useLlm = process.argv.includes("--llm");
const fixtureUrl = new URL("../data/evaluation/fixtures/triage-cases.blind2.v1.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const hash = async (p) => createHash("sha256").update(await readFile(new URL(p, import.meta.url))).digest("hex").slice(0, 16);
const ruleHash = { triage: await hash("../lib/triage.mjs"), safety: await hash("../lib/safety.mjs"), triageLlm: await hash("../lib/triage-llm.mjs") };

const methods = { rules_only: async (text) => (triageRoutineRequest({ symptoms: text }).status === "medical_redirect" ? "redirect" : "clear") };
if (useLlm) {
  loadDotEnv(process.cwd());
  const config = createConfig();
  if (!config.liveServicesEnabled || !config.openai.apiKey) throw new Error("--llm needs LIVE_SERVICES_ENABLED=true and OPENAI_API_KEY in .env.");
  const { llmTriageSecondOpinion } = await import("../lib/triage-llm.mjs");
  // Blind combined result: the GPT second opinion runs on exactly the cases the
  // FROZEN rules cleared at their first run (clearedIds), so later rule edits
  // cannot hide what the model adds on its own.
  const frozenCleared = new Set(fixture.blindRuns?.rules_only?.clearedIds || []);
  const idOf = new Map(fixture.cases.map((c) => [c.text, c.id]));
  methods.rules_plus_gpt = async (text) => {
    if (frozenCleared.size ? !frozenCleared.has(idOf.get(text)) : (await methods.rules_only(text)) === "redirect") return "redirect";
    try { return (await llmTriageSecondOpinion({ config, symptoms: text })).escalate ? "redirect" : "clear"; }
    catch { return "error_cleared"; }
  };
}

const results = {};
for (const [name, run] of Object.entries(methods)) {
  const c = { tp: 0, fn: 0, tn: 0, fp: 0, errors: 0 };
  const misses = [];
  const byCategory = {};
  for (const [index, item] of fixture.cases.entries()) {
    if (name !== "rules_only") process.stdout.write(`  ${name}: ${index + 1}/${fixture.cases.length}\r`);
    let got = await run(item.text);
    if (got === "error_cleared") { c.errors += 1; got = "clear"; }
    const ok = got === item.expected;
    c[item.expected === "redirect" ? (ok ? "tp" : "fn") : (ok ? "tn" : "fp")] += 1;
    const b = (byCategory[item.category] ||= { total: 0, correct: 0 }); b.total += 1; b.correct += ok ? 1 : 0;
    if (!ok) misses.push({ id: item.id, expected: item.expected, got, text: item.text, category: item.category });
  }
  results[name] = { ...c, sensitivity: c.tp / (c.tp + c.fn), specificity: c.tn / (c.tn + c.fp), byCategory, misses };
}

fixture.blindRuns ||= {};
for (const [name, r] of Object.entries(results)) {
  if (!fixture.blindRuns[name]) {
    fixture.blindRuns[name] = { date: new Date().toISOString().slice(0, 10), ruleHash, tp: r.tp, fn: r.fn, tn: r.tn, fp: r.fp, errors: r.errors, misses: r.misses.map((m) => m.id), ...(name === "rules_only" ? { clearedIds: fixture.cases.filter((c) => (c.expected === "redirect") === r.misses.some((m) => m.id === c.id) ).map((c) => c.id) } : {}) };
  }
}
await writeFile(fixtureUrl, `${JSON.stringify(fixture, null, 2)}\n`);

const pct = (v) => `${(100 * v).toFixed(1)}%`;
const label = { rules_only: "Rules alone", rules_plus_gpt: "Rules + GPT second opinion" };
const first = fixture.blindRuns;
const md = [
  "# Triage: second blind set", "",
  `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run eval:triage-blind${useLlm ? " -- --llm" : ""}\`. ${fixture.cases.length} cases (${fixture.cases.filter((c) => c.expected === "redirect").length} need professional care, ${fixture.cases.filter((c) => c.expected === "clear").length} should clear), written from NHS and DermNet red-flag guidance by someone other than the rule author, after the rules were frozen.`, "",
  "## First blind run (recorded once, never overwritten)", "",
  "| Method | Date | Sensitivity | Specificity | Missed | False alarms | Model errors |", "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ...Object.entries(first).map(([n, r]) => `| ${label[n] || n} | ${r.date} | ${r.tp}/${r.tp + r.fn} (${pct(r.tp / (r.tp + r.fn))}) | ${r.tn}/${r.tn + r.fp} (${pct(r.tn / (r.tn + r.fp))}) | ${r.fn} | ${r.fp} | ${r.errors} |`), "",
  "## By case type (this run)", "",
  `| Case type | ${Object.keys(results).map((n) => label[n]).join(" | ")} |`, `| --- | ${Object.keys(results).map(() => "---:").join(" | ")} |`,
  ...[...new Set(fixture.cases.map((c) => c.category))].map((cat) => `| ${cat} | ${Object.values(results).map((r) => `${r.byCategory[cat]?.correct}/${r.byCategory[cat]?.total}`).join(" | ")} |`), "",
  "## Errors (this run)", "",
  ...Object.entries(results).flatMap(([n, r]) => [`**${label[n]}**`, "", ...(r.misses.length ? r.misses.map((m) => `- ${m.id} (${m.category}, expected ${m.expected}, got ${m.got}): "${m.text}"`) : ["- none"]), ""]),
  `Rule files at first run: triage ${Object.values(first)[0]?.ruleHash?.triage}, safety ${Object.values(first)[0]?.ruleHash?.safety}. Current: triage ${ruleHash.triage}, safety ${ruleHash.safety}.`,
  "Limits: 40 cases written by an AI assistant from public guidance, not by a clinician; Malay and mixed-language cases test a language the rules were not designed for.",
];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("triage-blind2.latest.md", out), `${md.join("\n")}\n`);
await writeFile(new URL("triage-blind2.latest.json", out), `${JSON.stringify({ generatedAt: new Date().toISOString(), ruleHash, results, blindRuns: first }, null, 2)}\n`);
console.log(md.slice(4, 8 + Object.keys(first).length).join("\n"));
