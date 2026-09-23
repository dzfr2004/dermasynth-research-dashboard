import { readdir, readFile, writeFile } from "node:fs/promises";

/**
 * Imports expert label files from data/models/labelling/responses/*.csv (one
 * per rater, downloaded from /labelling.html), checks them against the
 * scenario sheet, reports inter-rater agreement, and writes the training file
 * for the environmental surrogate:
 *
 *   data/models/environmental-context-training.expert.v1.csv
 *   data/models/labelling/label-import-report.md
 *
 * Agreement: quadratic-weighted Cohen's kappa for every pair of raters (the
 * 1-5 scale is ordinal), plus the mean over pairs. The training target is the
 * mean rating across raters mapped to [0, 1]: (rating - 1) / 4.
 *
 * Then fit with: npm run fit:environmental-expert
 */

const SHEET = new URL("../data/models/labelling/scenario-sheet.v1.csv", import.meta.url);
const RESPONSES = new URL("../data/models/labelling/responses/", import.meta.url);
const TRAINING = new URL("../data/models/environmental-context-training.expert.v1.csv", import.meta.url);
const REPORT = new URL("../data/models/labelling/label-import-report.md", import.meta.url);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key.trim(), (values[index] ?? "").trim()])));
}

function quadraticKappa(a, b, categories = 5) {
  const n = a.length;
  const observed = Array.from({ length: categories }, () => Array(categories).fill(0));
  a.forEach((value, i) => { observed[value - 1][b[i] - 1] += 1; });
  const rowTotals = observed.map((row) => row.reduce((sum, v) => sum + v, 0));
  const colTotals = observed[0].map((_, j) => observed.reduce((sum, row) => sum + row[j], 0));
  let num = 0;
  let den = 0;
  for (let i = 0; i < categories; i += 1) {
    for (let j = 0; j < categories; j += 1) {
      const w = ((i - j) ** 2) / ((categories - 1) ** 2);
      num += w * observed[i][j];
      den += w * (rowTotals[i] * colTotals[j]) / n;
    }
  }
  return den === 0 ? 1 : 1 - num / den;
}

function interpretKappa(k) {
  if (k < 0) return "poor (below chance)";
  if (k < 0.2) return "slight";
  if (k < 0.4) return "fair";
  if (k < 0.6) return "moderate";
  if (k < 0.8) return "substantial";
  return "almost perfect";
}

const sheet = parseCsv(await readFile(SHEET, "utf8"));
const sheetById = new Map(sheet.map((row) => [row.scenario_id, row]));
let files = [];
try { files = (await readdir(RESPONSES)).filter((file) => file.endsWith(".csv")).sort(); } catch { files = []; }
if (!files.length) throw new Error("No label files found in data/models/labelling/responses/. Ask raters to download their CSV from /labelling.html.");

const raters = new Map();
const problems = [];
for (const file of files) {
  const rows = parseCsv(await readFile(new URL(file, RESPONSES), "utf8"));
  for (const row of rows) {
    const scenario = sheetById.get(row.scenario_id);
    const rating = Number(row.rating_1_to_5);
    const rater = row.rater_id;
    if (!scenario) { problems.push(`${file}: unknown scenario ${row.scenario_id}`); continue; }
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(rater || "")) { problems.push(`${file}: invalid rater id on ${row.scenario_id}`); continue; }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) { problems.push(`${file}: invalid rating on ${row.scenario_id}`); continue; }
    if (["concern", "uvi", "humidity", "pm25", "temperature"].some((key) => String(scenario[key]) !== String(row[key]))) {
      problems.push(`${file}: ${row.scenario_id} readings do not match the sheet (was the sheet regenerated?)`);
      continue;
    }
    if (!raters.has(rater)) raters.set(rater, new Map());
    raters.get(rater).set(row.scenario_id, rating);
  }
}
if (problems.length) throw new Error(`Label files failed validation:\n- ${problems.slice(0, 20).join("\n- ")}`);

const raterIds = [...raters.keys()].sort();
const complete = raterIds.filter((id) => raters.get(id).size === sheet.length);
const pairs = [];
for (let i = 0; i < raterIds.length; i += 1) {
  for (let j = i + 1; j < raterIds.length; j += 1) {
    const shared = sheet.map((row) => row.scenario_id).filter((id) => raters.get(raterIds[i]).has(id) && raters.get(raterIds[j]).has(id));
    if (shared.length < 10) continue;
    const kappa = quadraticKappa(shared.map((id) => raters.get(raterIds[i]).get(id)), shared.map((id) => raters.get(raterIds[j]).get(id)));
    pairs.push({ a: raterIds[i], b: raterIds[j], n: shared.length, kappa: Number(kappa.toFixed(3)) });
  }
}
const meanKappa = pairs.length ? Number((pairs.reduce((sum, p) => sum + p.kappa, 0) / pairs.length).toFixed(3)) : null;

const training = ["concern,uvi,humidity,pm25,temperature,target_context_score,raters"];
for (const scenario of sheet) {
  const ratings = raterIds.map((id) => raters.get(id).get(scenario.scenario_id)).filter(Number.isFinite);
  if (!ratings.length) continue;
  const mean = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
  training.push([scenario.concern, scenario.uvi, scenario.humidity, scenario.pm25, scenario.temperature, ((mean - 1) / 4).toFixed(3), ratings.length].join(","));
}
await writeFile(TRAINING, `${training.join("\n")}\n`);

const report = [
  "# Expert label import report",
  "",
  `Imported ${new Date().toISOString().slice(0, 10)} from ${files.length} file(s): ${files.join(", ")}`,
  `Raters: ${raterIds.join(", ")} (${complete.length} of ${raterIds.length} labelled all ${sheet.length} scenarios)`,
  `Training rows written: ${training.length - 1}`,
  "",
  "## Inter-rater agreement (quadratic-weighted Cohen's kappa)",
  "",
  pairs.length ? "| Rater A | Rater B | Shared scenarios | Kappa | Interpretation |\n| --- | --- | ---: | ---: | --- |\n" + pairs.map((p) => `| ${p.a} | ${p.b} | ${p.n} | ${p.kappa.toFixed(3)} | ${interpretKappa(p.kappa)} |`).join("\n") : "Only one rater so far: agreement needs at least two raters.",
  "",
  meanKappa === null ? "" : `Mean kappa over rater pairs: **${meanKappa.toFixed(3)}** (${interpretKappa(meanKappa)}, Landis & Koch bands).`,
  "",
  "Next: `npm run fit:environmental-expert` refits the environmental surrogate on these labels.",
  "",
];
await writeFile(REPORT, `${report.join("\n")}\n`);
console.log(JSON.stringify({ raters: raterIds.length, pairs, meanKappa, trainingRows: training.length - 1, training: "data/models/environmental-context-training.expert.v1.csv", report: "data/models/labelling/label-import-report.md" }, null, 2));
