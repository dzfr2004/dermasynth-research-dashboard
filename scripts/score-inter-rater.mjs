import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

/**
 * Computes Cohen's kappa (and linear-weighted kappa) for a blinded two-rater
 * review of prototype outputs. Reads a ratings CSV and writes a report.
 *
 * Expected CSV columns: item_id, rater_a, rater_b
 * Ratings are categorical/ordinal codes (e.g., 1-4 acceptability, or labels).
 *
 * This is the measurement INSTRUMENT. It reports agreement between two human
 * reviewers; it does not itself constitute a completed clinical validation.
 */

const inputArg = process.argv[2] || "data/evaluation/review/inter-rater-responses.csv";
const inputUrl = new URL(`../${inputArg}`, import.meta.url);
if (!existsSync(inputUrl)) {
  console.error(`No ratings file at ${inputArg}. Copy inter-rater-responses.template.csv to inter-rater-responses.csv and fill it in.`);
  process.exit(1);
}

const lines = readFileSync(inputUrl, "utf8").trim().split(/\r?\n/);
const header = lines.shift().split(",").map((h) => h.trim());
const need = ["item_id", "rater_a", "rater_b"];
if (need.some((c) => !header.includes(c))) throw new Error(`Ratings CSV must include: ${need.join(", ")}`);
const iId = header.indexOf("item_id"), iA = header.indexOf("rater_a"), iB = header.indexOf("rater_b");

const pairs = [];
for (const line of lines) {
  const cells = line.split(",").map((c) => c.trim());
  if (!cells[iId]) continue;
  const a = cells[iA], b = cells[iB];
  if (a === "" || b === "") continue;
  pairs.push([a, b]);
}
if (pairs.length < 2) throw new Error("Need at least two complete rating pairs.");

const categories = [...new Set(pairs.flat())].sort();
const asNumbers = categories.every((c) => Number.isFinite(Number(c)));
const catIndex = Object.fromEntries(categories.map((c, i) => [c, i]));
const k = categories.length;
const matrix = Array.from({ length: k }, () => Array(k).fill(0));
for (const [a, b] of pairs) matrix[catIndex[a]][catIndex[b]] += 1;

const n = pairs.length;
const rowTot = matrix.map((r) => r.reduce((s, v) => s + v, 0));
const colTot = categories.map((_, j) => matrix.reduce((s, r) => s + r[j], 0));

// Observed and expected agreement (unweighted Cohen's kappa).
let po = 0, pe = 0;
for (let i = 0; i < k; i += 1) {
  po += matrix[i][i] / n;
  pe += (rowTot[i] / n) * (colTot[i] / n);
}
const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);

// Linear-weighted kappa (meaningful when categories are ordinal/numeric).
let weightedKappa = null;
if (asNumbers && k > 2) {
  const maxDist = k - 1;
  const w = (i, j) => 1 - Math.abs(i - j) / maxDist;
  let woSum = 0, weSum = 0;
  for (let i = 0; i < k; i += 1) for (let j = 0; j < k; j += 1) {
    woSum += w(i, j) * (matrix[i][j] / n);
    weSum += w(i, j) * ((rowTot[i] / n) * (colTot[j] / n));
  }
  weightedKappa = weSum === 1 ? 1 : (woSum - weSum) / (1 - weSum);
}

const round = (v) => (v === null ? null : Number(v.toFixed(4)));
function interpret(k0) {
  if (k0 === null) return "n/a";
  if (k0 < 0) return "Poor (worse than chance)";
  if (k0 <= 0.20) return "Slight";
  if (k0 <= 0.40) return "Fair";
  if (k0 <= 0.60) return "Moderate";
  if (k0 <= 0.80) return "Substantial";
  return "Almost perfect";
}

const report = {
  instrument: "Blinded two-rater agreement (Cohen's kappa)",
  generatedAt: new Date().toISOString(),
  items: n,
  categories,
  percentAgreement: round(po),
  cohensKappa: round(kappa),
  cohensKappaInterpretation: interpret(kappa),
  linearWeightedKappa: round(weightedKappa),
  confusionMatrix: { rows: "rater_a", cols: "rater_b", categories, matrix },
  scope: "Reports agreement between two blinded reviewers on prototype outputs. It is the measurement instrument, not a completed clinical validation.",
};

const reportsDir = new URL("../data/evaluation/reports/", import.meta.url);
mkdirSync(reportsDir, { recursive: true });
writeFileSync(new URL("inter-rater.latest.json", reportsDir), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ items: n, cohensKappa: report.cohensKappa, interpretation: report.cohensKappaInterpretation, linearWeightedKappa: report.linearWeightedKappa }, null, 2));
