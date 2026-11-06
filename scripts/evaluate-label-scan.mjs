import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { createRepository } from "../lib/ingredient-repository.mjs";
import { checkProduct, parseIngredientList } from "../lib/product-check.mjs";

/**
 * Label scan: the job only the language model does (reading a photo).
 *
 * 16 synthetic label photos (data/evaluation/label-scan/) with known printed
 * ingredient lists; 2 are blurred on purpose, so the correct answer is "not
 * legible". The vision model transcribes each label; the deterministic
 * product check then runs on (a) the true list and (b) the transcription
 * against a fixed routine (retinol at night, niacinamide in the morning,
 * moderate reactivity). Reports transcription recall and precision, whether
 * the check reached the same verdict, clashes and cautions, and whether the
 * blurred labels were refused rather than guessed.
 *
 *   npm run eval:label-scan            # offline: check the ground truth only
 *   npm run eval:label-scan -- --live  # needs OpenAI access (vision)
 */

const live = process.argv.includes("--live");
const base = new URL("../data/evaluation/label-scan/", import.meta.url);
const { labels } = JSON.parse(await readFile(new URL("labels.json", base), "utf8"));
const repository = createRepository({});
const routine = {
  concern: "acne", reactivityLevel: "moderate",
  entries: [
    { ingredientId: "retinol", displayName: "Retinol", phase: "pm", categoryId: "texture-renewal" },
    { ingredientId: "niacinamide", displayName: "Niacinamide", phase: "am", categoryId: "antioxidant-context" },
  ],
};
const summarise = (text) => {
  const r = checkProduct({ text, repository, routine });
  return { ids: [...new Set(r.recognised.map((x) => x.ingredientId))].sort(), conflicts: r.conflicts.map((c) => `${c.productIngredient}|${c.routineIngredient}`).sort(), cautions: r.cautions.map((c) => c.level).sort(), verdict: r.verdict };
};
const names = (text) => new Set(parseIngredientList(text).filter((x) => !x.inner).map((x) => x.name));
const truth = labels.map((l) => ({ ...l, check: summarise(l.ingredients) }));
console.log(`Ground truth: ${truth.length} labels, ${truth.filter((t) => t.expectLegible).length} legible; ${truth.filter((t) => t.check.conflicts.length).length} clash with the routine; ${truth.filter((t) => t.check.cautions.includes("stop")).length} need a pharmacist.`);
if (!live) process.exit(0);

loadDotEnv(process.cwd());
const config = createConfig();
if (!config.liveServicesEnabled || !config.openai.apiKey) throw new Error("--live needs LIVE_SERVICES_ENABLED=true and OPENAI_API_KEY in .env.");
const { scanProductLabel } = await import("../lib/label-scan.mjs");
const rows = [];
for (const t of truth) {
  const image = `data:image/jpeg;base64,${(await readFile(new URL(`images/${t.file}`, base))).toString("base64")}`;
  let scan; const started = Date.now();
  try { scan = await scanProductLabel({ config, image }); } catch (error) { scan = { error: error?.code || "error" }; }
  const ms = Date.now() - started;
  if (!t.expectLegible) { rows.push({ id: t.id, blurred: true, refused: !scan.legible || !scan.ingredientsText, invented: scan.ingredientsText || "", ms }); continue; }
  const got = scan.ingredientsText || "";
  const want = names(t.ingredients); const have = names(got);
  const hit = [...want].filter((n) => have.has(n)).length;
  const check = summarise(got);
  rows.push({ id: t.id, blurred: false, legible: Boolean(scan.legible), recall: hit / want.size, precision: have.size ? hit / have.size : 0, sameIds: JSON.stringify(check.ids) === JSON.stringify(t.check.ids), sameConflicts: JSON.stringify(check.conflicts) === JSON.stringify(t.check.conflicts), sameCautions: JSON.stringify(check.cautions) === JSON.stringify(t.check.cautions), sameVerdict: check.verdict === t.check.verdict, expectedConflicts: t.check.conflicts.length, expectedStop: t.check.cautions.includes("stop"), ms });
  process.stdout.write(`  ${t.id}\r`);
}
const leg = rows.filter((r) => !r.blurred); const blur = rows.filter((r) => r.blurred);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const n = (f) => leg.filter(f).length;
const pct = (a, b) => `${a}/${b} (${(100 * a / b).toFixed(0)}%)`;
const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
const md = [
  "# Label scan: reading a product photo (the language model's own job)", "",
  `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run eval:label-scan -- --live\`, model ${config.openai.model}. 16 synthetic labels with fictional names and known printed ingredient lists (rotated, tinted, lightly blurred or compressed); 2 heavily blurred on purpose. The product check that follows is deterministic; this measures whether the model reads the label well enough for that check to reach the same answer as on the true list.`, "",
  "| Measure | Result |", "| --- | ---: |",
  `| Legible labels read | ${pct(n((r) => r.legible), leg.length)} |`,
  `| Mean ingredient recall | ${(100 * mean(leg.map((r) => r.recall))).toFixed(1)}% |`,
  `| Mean ingredient precision (nothing invented) | ${(100 * mean(leg.map((r) => r.precision))).toFixed(1)}% |`,
  `| Same recognised ingredients as the true list | ${pct(n((r) => r.sameIds), leg.length)} |`,
  `| Same clashes with the routine | ${pct(n((r) => r.sameConflicts), leg.length)} (labels with a clash: ${n((r) => r.expectedConflicts > 0)}) |`,
  `| Same safety cautions | ${pct(n((r) => r.sameCautions), leg.length)} (labels needing a pharmacist: ${n((r) => r.expectedStop)}) |`,
  `| Same overall verdict | ${pct(n((r) => r.sameVerdict), leg.length)} |`,
  `| Blurred labels refused instead of guessed | ${pct(blur.filter((r) => r.refused).length, blur.length)} |`,
  `| Median time per label | ${(ms[Math.floor(ms.length / 2)] / 1000).toFixed(1)} s |`, "",
  "## Per label", "", "| Label | Recall | Precision | Same verdict | Notes |", "| --- | ---: | ---: | --- | --- |",
  ...rows.map((r) => r.blurred ? `| ${r.id} (blurred) | | | | ${r.refused ? "refused (correct)" : `guessed: ${r.invented.slice(0, 60)}`} |` : `| ${r.id} | ${(100 * r.recall).toFixed(0)}% | ${(100 * r.precision).toFixed(0)}% | ${r.sameVerdict ? "yes" : "**no**"} | ${r.sameConflicts ? "" : "clash differs; "}${r.sameCautions ? "" : "caution differs"} |`), "",
  "Limits: synthetic, printed-text labels are easier than real curved, glossy packaging. A real-photo set would be the next step.",
];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("label-scan.latest.md", out), `${md.join("\n")}\n`);
await writeFile(new URL("label-scan.latest.json", out), `${JSON.stringify({ generatedAt: new Date().toISOString(), model: config.openai.model, rows }, null, 2)}\n`);
console.log(md.slice(4, 15).join("\n"));
