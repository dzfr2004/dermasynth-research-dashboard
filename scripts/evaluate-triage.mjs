import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { LEGACY_MEDICAL_REDIRECT_PATTERN, triageRoutineRequest } from "../lib/safety.mjs";

/**
 * Symptom-triage evaluation on the labelled case set
 * (data/evaluation/fixtures/triage-cases.v1.json).
 *
 *   sensitivity = redirect cases correctly redirected / all redirect cases
 *   specificity = clear cases correctly cleared / all clear cases
 *
 * Compares three methods: the v1 keyword pattern (baseline), the v2 rules
 * (stems, typos, negation), and, with --llm on a machine with OpenAI access,
 * v2 rules plus the escalate-only model second opinion.
 *
 * Fails (exit code 1) if the v2 rules fall below 95% sensitivity or 90%
 * specificity, so a regression breaks `npm test`.
 */

const useLlm = process.argv.includes("--llm");
const fixture = JSON.parse(await readFile(new URL("../data/evaluation/fixtures/triage-cases.v1.json", import.meta.url), "utf8"));
const heldOut = JSON.parse(await readFile(new URL("../data/evaluation/fixtures/triage-cases.heldout.v1.json", import.meta.url), "utf8"));
const cases = [...fixture.cases, ...heldOut.cases];

const methods = {
  v1_keyword_baseline: async (text) => (text && LEGACY_MEDICAL_REDIRECT_PATTERN.test(text) ? "redirect" : "clear"),
  v2_rules: async (text) => (triageRoutineRequest({ symptoms: text }).status === "medical_redirect" ? "redirect" : "clear"),
};

if (useLlm) {
  loadDotEnv(process.cwd());
  const config = createConfig();
  if (!config.liveServicesEnabled || !config.openai.apiKey) throw new Error("--llm needs LIVE_SERVICES_ENABLED=true and OPENAI_API_KEY in .env.");
  const { llmTriageSecondOpinion } = await import("../lib/triage-llm.mjs");
  methods.v2_rules_plus_llm = async (text) => {
    if (triageRoutineRequest({ symptoms: text }).status === "medical_redirect") return "redirect";
    if (!text) return "clear";
    try {
      return (await llmTriageSecondOpinion({ config, symptoms: text })).escalate ? "redirect" : "clear";
    } catch {
      return "clear";
    }
  };
}

const summary = {};
const rows = [];
for (const [name, run] of Object.entries(methods)) {
  const counts = { tp: 0, fn: 0, tn: 0, fp: 0 };
  const byCategory = {};
  const misses = [];
  for (const item of cases) {
    const got = await run(item.text);
    const ok = got === item.expected;
    if (item.expected === "redirect") counts[ok ? "tp" : "fn"] += 1;
    else counts[ok ? "tn" : "fp"] += 1;
    byCategory[item.category] = byCategory[item.category] || { total: 0, correct: 0 };
    byCategory[item.category].total += 1;
    byCategory[item.category].correct += ok ? 1 : 0;
    if (!ok) misses.push({ id: item.id, category: item.category, expected: item.expected, got, text: item.text });
    rows.push({ method: name, id: item.id, category: item.category, expected: item.expected, got });
  }
  summary[name] = {
    ...counts,
    sensitivity: counts.tp / (counts.tp + counts.fn),
    specificity: counts.tn / (counts.tn + counts.fp),
    accuracy: (counts.tp + counts.tn) / cases.length,
    byCategory,
    misses,
  };
}

const pct = (v) => `${(100 * v).toFixed(1)}%`;
const categories = [...new Set(cases.map((c) => c.category))];
const md = [
  "# Symptom-triage evaluation",
  "",
  `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run eval:triage\`${useLlm ? " -- --llm" : ""}. Case set: ${cases.length} labelled cases (${cases.filter((c) => c.expected === "redirect").length} need professional care, ${cases.filter((c) => c.expected === "clear").length} should clear).`,
  "",
  "| Method | Sensitivity | Specificity | Accuracy | Missed redirects | False redirects |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...Object.entries(summary).map(([name, r]) => `| ${name} | ${pct(r.sensitivity)} | ${pct(r.specificity)} | ${pct(r.accuracy)} | ${r.fn} | ${r.fp} |`),
  "",
  "## Accuracy by case type",
  "",
  `| Case type | ${Object.keys(summary).join(" | ")} |`,
  `| --- | ${Object.keys(summary).map(() => "---:").join(" | ")} |`,
  ...categories.map((category) => `| ${category} | ${Object.values(summary).map((r) => `${r.byCategory[category].correct}/${r.byCategory[category].total}`).join(" | ")} |`),
  "",
  "## Errors",
  "",
  ...Object.entries(summary).flatMap(([name, r]) => [
    `**${name}**: ${r.misses.length ? "" : "none"}`,
    "",
    ...r.misses.map((m) => `- ${m.id} (${m.category}, expected ${m.expected}, got ${m.got}): "${m.text}"`),
    "",
  ]),
  "## Held-out set: first blind run",
  "",
  `The ${heldOut.cases.length} held-out cases (type "held-out" above) were written after the rules were tuned and run once blind on ${heldOut.firstBlindRun.date}: v2 rules sensitivity ${heldOut.firstBlindRun.v2_rules.sensitivity}, specificity ${heldOut.firstBlindRun.v2_rules.specificity}; v1 baseline sensitivity ${heldOut.firstBlindRun.v1_keyword_baseline.sensitivity}. The missed concepts were then added (${heldOut.firstBlindRun.missedConcepts.join("; ")}), so today's held-out score is optimistic. The 68% blind figure is the honest estimate of how the rules alone generalise, which is why the model second opinion exists.`,
  "",
  "Scope: both sets were written by the developer. An independent set written by someone else is run with `npm run eval:independent`.",
  "",
];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("triage-evaluation.latest.md", out), `${md.join("\n")}\n`);
await writeFile(new URL("triage-evaluation.latest.json", out), `${JSON.stringify({ generatedAt: new Date().toISOString(), cases: cases.length, summary }, null, 2)}\n`);

const v2 = summary.v2_rules;
console.log(JSON.stringify(Object.fromEntries(Object.entries(summary).map(([k, r]) => [k, { sensitivity: Number(r.sensitivity.toFixed(3)), specificity: Number(r.specificity.toFixed(3)), missed: r.fn, falseRedirects: r.fp }])), null, 2));
if (v2.sensitivity < 0.95 || v2.specificity < 0.9) {
  console.error("Triage rules fell below 95% sensitivity or 90% specificity.");
  process.exitCode = 1;
}
