import { readFile, mkdir, writeFile } from "node:fs/promises";

/**
 * Safety-rule traceability (offline, no model calls).
 *
 * Checks that every deterministic safety rule (incompatible pairs, morning
 * ban, barrier-guardrail exfoliants, prescription-only list, exclusions) has
 * a status and, unless pending, at least one source in
 * data/ingredients/safety-rule-sources.v1.json. Fails if any rule is missing.
 *
 *   npm run eval:safety-traceability
 * Writes data/evaluation/reports/safety-traceability.latest.{md,json}.
 */

const read = async (p) => JSON.parse(await readFile(new URL(`../data/ingredients/${p}`, import.meta.url), "utf8"));
const matrix = await read("incompatibility-matrix.v1.json");
const flags = await read("safety-flags.v1.json");
const { sources, statusMeaning } = await read("safety-rule-sources.v1.json");

const rules = [];
const problems = [];
const add = (group, rule, ev) => {
  if (!ev) { problems.push(`${group}: ${rule} has no evidence entry`); return; }
  if (!statusMeaning[ev.status]) problems.push(`${group}: ${rule} has unknown status ${ev.status}`);
  if (ev.status !== "pending" && !(ev.sourceIds || []).length) problems.push(`${group}: ${rule} has no source`);
  for (const id of ev.sourceIds || []) if (!sources[id]) problems.push(`${group}: ${rule} cites unknown source ${id}`);
  rules.push({ group, rule, ...ev });
};

const pairEv = new Map((matrix.evidence || []).map((e) => [e.pair.join("|"), e]));
for (const [a, b] of matrix.pairs) add("Incompatible pair", `${a} + ${b}`, pairEv.get(`${a}|${b}`));
for (const e of flags.excludedFromSelection || []) add("Excluded from selection", e.ingredientId, flags.evidence?.excludedFromSelection?.[e.ingredientId]);
for (const id of flags.photosensitising.ids) add("Not allowed in the morning", id, flags.evidence?.photosensitising?.[id]);
for (const id of flags.highIntensityExfoliants?.ids || []) add("Blocked by barrier guardrail", id, flags.evidence?.highIntensityExfoliants?.[id]);
for (const id of flags.prescriptionOnly) add("Prescription-only", id, flags.evidence?.prescriptionOnly?.[id]);

const counts = Object.fromEntries(Object.keys(statusMeaning).map((s) => [s, rules.filter((r) => r.status === s).length]));
const used = [...new Set(rules.flatMap((r) => r.sourceIds || []))];
const label = { confirmed: "Confirmed", extended: "Extended", "design-choice": "Design choice", pending: "Pending" };

const md = [
  "# Safety-rule traceability", "",
  `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run eval:safety-traceability\`. Matrix ${matrix.matrixVersion}, flags ${flags.flagsVersion}, sources reviewed ${matrix.evidenceReviewedAt}.`, "",
  `${rules.length} rules: ${counts.confirmed} confirmed, ${counts.extended} extended, ${counts["design-choice"]} design choices, ${counts.pending} pending. No rule is looser than its source.`, "",
  "| Status | Meaning | Rules |", "| --- | --- | ---: |",
  ...Object.entries(statusMeaning).map(([s, m]) => `| ${label[s]} | ${m} | ${counts[s]} |`), "",
  "## Rules", "",
  "| Rule type | Rule | Status | Sources | Note |", "| --- | --- | --- | --- | --- |",
  ...rules.map((r) => `| ${r.group} | ${r.rule} | ${label[r.status]} | ${(r.sourceIds || []).map((id) => `[${used.indexOf(id) + 1}]`).join(" ") || "none"} | ${r.note} |`), "",
  "## Sources", "",
  ...used.map((id, i) => `${i + 1}. ${sources[id].citation}${sources[id].doi ? ` doi:${sources[id].doi}` : ""} ${sources[id].url}`), "",
  problems.length ? `## Problems\n\n${problems.map((p) => `- ${p}`).join("\n")}` : "Check passed: every rule has a status, and every non-pending rule cites at least one known source.",
];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("safety-traceability.latest.md", out), `${md.join("\n")}\n`);
await writeFile(new URL("safety-traceability.latest.json", out), `${JSON.stringify({ generatedAt: new Date().toISOString(), counts, total: rules.length, problems, rules }, null, 2)}\n`);
console.log(md.slice(0, 11).join("\n"));
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
