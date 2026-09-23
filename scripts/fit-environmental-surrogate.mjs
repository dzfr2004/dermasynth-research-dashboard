import { readFile, writeFile } from "node:fs/promises";

const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/fit-environmental-surrogate.mjs <labelled-context.csv>");
const rows = (await readFile(input, "utf8")).trim().split(/\r?\n/);
const headers = rows.shift().split(",").map((value) => value.trim());
const required = ["concern", "uvi", "humidity", "pm25", "temperature", "target_context_score"];
if (required.some((key) => !headers.includes(key))) throw new Error(`CSV needs: ${required.join(", ")}`);
const records = rows.map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value.trim()]))).map((row) => ({ ...row, uvi: Number(row.uvi), humidity: Number(row.humidity), pm25: Number(row.pm25), temperature: Number(row.temperature), target: Number(row.target_context_score) })).filter((row) => required.slice(1).every((key) => Number.isFinite(key === "target_context_score" ? row.target : row[key])));
if (records.length < 30) throw new Error("At least 30 labelled, reviewed rows are required before fitting the surrogate.");
const normalise = (row) => ({ uvi: Math.min(1, row.uvi / 11), humidity: Math.min(1, Math.max(0, (100 - row.humidity) / 100)), pm25: Math.min(1, row.pm25 / 75), temperature: Math.min(1, Math.abs(row.temperature - 24) / 16) });
const byConcern = Object.groupBy(records, (row) => row.concern);
const concernWeights = {};
for (const [concern, samples] of Object.entries(byConcern)) {
  const meanTarget = samples.reduce((sum, row) => sum + row.target, 0) / samples.length;
  const raw = Object.fromEntries(["uvi", "humidity", "pm25", "temperature"].map((feature) => [feature, Math.abs(samples.reduce((sum, row) => sum + ((normalise(row)[feature] - 0.5) * (row.target - meanTarget)), 0))]));
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0) || 1;
  concernWeights[concern] = Object.fromEntries(Object.entries(raw).map(([feature, value]) => [feature, Number((value / total).toFixed(4))]));
}
const output = { schemaVersion: "1.1", modelId: "dermasynth-environmental-surrogate", modelVersion: `fitted-${new Date().toISOString().slice(0, 10)}`, method: "exact_shapley_values_for_additive_environmental_surrogate", weightStatus: "fitted_to_documented_labelled_context_dataset", training: { input, rows: records.length, fitMethod: "normalised covariance weighting", target: "target_context_score" }, baselineScore: 0.5, features: { uvi: { label: "UV index", unit: "UVI", baseline: 0.36 }, humidity: { label: "Humidity context", unit: "%", baseline: 0.5 }, pm25: { label: "PM2.5 context", unit: "µg/m³", baseline: 0.2 }, temperature: { label: "Temperature context", unit: "°C", baseline: 0.25 } }, concernWeights, scope: "Fitted environmental context explanation; not a clinical score or treatment decision." };
await writeFile(new URL("../data/models/environmental-surrogate.fitted.v1.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ output: "data/models/environmental-surrogate.fitted.v1.json", rows: records.length, concerns: Object.keys(concernWeights) }, null, 2));
