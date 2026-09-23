import { readFile, writeFile } from "node:fs/promises";

/**
 * Fits the additive environmental surrogate used by the SHAP explainer:
 *
 *   f(x) = b0 + Σ_f w_f × x_f      (x_f = normalised reading, as in lib/explainability.mjs)
 *
 * per research context by non-negative least squares (every subset of the four
 * features is solved by ordinary least squares with an intercept, and the
 * lowest-error solution with all weights ≥ 0 is kept). The explainer then
 * computes exact Shapley values w_f × (x_f − baseline_f), and the per-concern
 * baseline score is f evaluated at the feature baselines, so the explanation
 * describes exactly the fitted model.
 *
 * Replaces the earlier "normalised covariance weighting", which did not recover
 * the weights that generated the data (see the fit report).
 *
 * Usage:
 *   node scripts/fit-environmental-surrogate.mjs <labelled.csv> [--source constructed|expert]
 */

const FEATURES = ["uvi", "humidity", "pm25", "temperature"];
const FEATURE_BASELINE = { uvi: 0.36, humidity: 0.5, pm25: 0.2, temperature: 0.25 };

const args = process.argv.slice(2);
const input = args.find((arg) => !arg.startsWith("--"));
if (!input) throw new Error("Usage: node scripts/fit-environmental-surrogate.mjs <labelled-context.csv> [--source constructed|expert]");
const sourceIndex = args.indexOf("--source");
const source = sourceIndex >= 0 ? args[sourceIndex + 1] : (/expert/i.test(input) ? "expert" : "constructed");
if (!["constructed", "expert"].includes(source)) throw new Error("--source must be constructed or expert");

const rows = (await readFile(input, "utf8")).trim().split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
const headers = rows.shift().split(",").map((value) => value.trim());
const required = ["concern", ...FEATURES, "target_context_score"];
if (required.some((key) => !headers.includes(key))) throw new Error(`CSV needs: ${required.join(", ")}`);
const records = rows
  .map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value.trim()])))
  .map((row) => ({ concern: row.concern, uvi: Number(row.uvi), humidity: Number(row.humidity), pm25: Number(row.pm25), temperature: Number(row.temperature), target: Number(row.target_context_score) }))
  .filter((row) => row.concern && [...FEATURES, "target"].every((key) => Number.isFinite(row[key])));
if (records.length < 30) throw new Error("At least 30 labelled, reviewed rows are required before fitting the surrogate.");

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
function normalise(row) {
  return {
    uvi: clamp(row.uvi / 11),
    humidity: clamp((100 - row.humidity) / 100),
    pm25: clamp(row.pm25 / 75),
    temperature: clamp(Math.abs(row.temperature - 24) / 16),
  };
}

// Solves (XᵀX) β = Xᵀy by Gaussian elimination with partial pivoting.
function solve(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = a[r][col] / a[col][col];
      for (let c = col; c <= n; c += 1) a[r][c] -= factor * a[col][c];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

function ols(samples, features) {
  const X = samples.map((row) => [1, ...features.map((f) => row.x[f])]);
  const y = samples.map((row) => row.target);
  const k = features.length + 1;
  const xtx = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((sum, row) => sum + row[i] * row[j], 0)));
  const xty = Array.from({ length: k }, (_, i) => X.reduce((sum, row, r) => sum + row[i] * y[r], 0));
  const beta = solve(xtx, xty);
  if (!beta) return null;
  const sse = X.reduce((sum, row, r) => sum + (row.reduce((acc, value, i) => acc + value * beta[i], 0) - y[r]) ** 2, 0);
  return { intercept: beta[0], weights: Object.fromEntries(features.map((f, i) => [f, beta[i + 1]])), sse };
}

function nnls(samples) {
  let best = null;
  for (let mask = 0; mask < 1 << FEATURES.length; mask += 1) {
    const subset = FEATURES.filter((_, i) => mask & (1 << i));
    const fit = ols(samples, subset);
    if (!fit || Object.values(fit.weights).some((w) => w < 0)) continue;
    if (!best || fit.sse < best.sse - 1e-12) best = fit;
  }
  const weights = Object.fromEntries(FEATURES.map((f) => [f, Number((best.weights[f] || 0).toFixed(4))]));
  return { intercept: best.intercept, weights, sse: best.sse };
}

const byConcern = Object.groupBy(records.map((row) => ({ ...row, x: normalise(row) })), (row) => row.concern);
const concernWeights = {};
const concernBaselines = {};
const fitQuality = {};
for (const [concern, samples] of Object.entries(byConcern)) {
  if (samples.length < 6) throw new Error(`Concern ${concern} has ${samples.length} rows; at least 6 are needed.`);
  const fit = nnls(samples);
  const mean = samples.reduce((sum, row) => sum + row.target, 0) / samples.length;
  const sst = samples.reduce((sum, row) => sum + (row.target - mean) ** 2, 0) || 1;
  concernWeights[concern] = fit.weights;
  concernBaselines[concern] = Number(clamp(fit.intercept + FEATURES.reduce((sum, f) => sum + fit.weights[f] * FEATURE_BASELINE[f], 0)).toFixed(4));
  fitQuality[concern] = { rows: samples.length, r2: Number((1 - fit.sse / sst).toFixed(4)), rmse: Number(Math.sqrt(fit.sse / samples.length).toFixed(4)), intercept: Number(fit.intercept.toFixed(4)) };
}

const weightStatus = source === "expert" ? "fitted_to_expert_labelled_scenarios" : "fitted_to_constructed_labelled_dataset";
const output = {
  schemaVersion: "1.2",
  modelId: "dermasynth-environmental-surrogate",
  modelVersion: `fitted-${new Date().toISOString().slice(0, 10)}`,
  method: "exact_shapley_values_for_additive_environmental_surrogate",
  weightStatus,
  training: { input, source, rows: records.length, fitMethod: "non-negative least squares with intercept (best all-subsets OLS)", target: "target_context_score", fitQuality },
  baselineScore: 0.5,
  concernBaselines,
  features: {
    uvi: { label: "UV index", unit: "UVI", baseline: FEATURE_BASELINE.uvi },
    humidity: { label: "Humidity context", unit: "%", baseline: FEATURE_BASELINE.humidity },
    pm25: { label: "PM2.5 context", unit: "µg/m³", baseline: FEATURE_BASELINE.pm25 },
    temperature: { label: "Temperature context", unit: "°C", baseline: FEATURE_BASELINE.temperature },
  },
  concernWeights,
  scope: source === "expert"
    ? "Environmental context explanation fitted to expert-labelled scenarios; not a clinical score or treatment decision."
    : "Environmental context explanation fitted to a constructed, domain-reasoned dataset; not clinical-outcome data, a clinical score or a treatment decision.",
};

await writeFile(new URL("../data/models/environmental-surrogate.fitted.v1.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);

// Fit report. For the constructed dataset the generating priors are known, so
// the report shows how closely the fit recovers them.
let priors = null;
if (source === "constructed") {
  try {
    const generator = await readFile(new URL("./generate-environmental-training.mjs", import.meta.url), "utf8");
    const block = generator.slice(generator.indexOf("const PRIORS = {"), generator.indexOf("};", generator.indexOf("const PRIORS = {")) + 2);
    priors = Function(`${block.replace("const PRIORS =", "return")}`)();
  } catch {
    priors = null;
  }
}
const lines = [
  "# Environmental surrogate fit report",
  "",
  `Input: \`${input}\` (${records.length} rows, source: ${source})`,
  `Method: ${output.training.fitMethod}`,
  `Weight status: \`${weightStatus}\``,
  "",
  "| Context | Rows | R² | RMSE | w UV | w humidity | w PM2.5 | w temperature |" + (priors ? " Max abs. error vs generating prior |" : ""),
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |" + (priors ? " ---: |" : ""),
  ...Object.entries(concernWeights).map(([concern, w]) => {
    const q = fitQuality[concern];
    const err = priors?.[concern] ? Math.max(...FEATURES.map((f) => Math.abs(w[f] - priors[concern][f]))).toFixed(3) : null;
    return `| ${concern} | ${q.rows} | ${q.r2.toFixed(3)} | ${q.rmse.toFixed(3)} | ${w.uvi.toFixed(3)} | ${w.humidity.toFixed(3)} | ${w.pm25.toFixed(3)} | ${w.temperature.toFixed(3)} |${err === null ? "" : ` ${err} |`}`;
  }),
  "",
  source === "constructed"
    ? "The constructed dataset is generated from known prior weights plus bounded noise, so a correct fitting method should recover those priors. This checks the method; it is not clinical evidence."
    : "Weights fitted to expert-labelled scenarios. Inter-rater agreement for the labels is in the label import report.",
  "",
];
await writeFile(new URL("../data/models/environmental-surrogate.fit-report.md", import.meta.url), `${lines.join("\n")}\n`);
console.log(JSON.stringify({ output: "data/models/environmental-surrogate.fitted.v1.json", report: "data/models/environmental-surrogate.fit-report.md", rows: records.length, source, fitQuality }, null, 2));
