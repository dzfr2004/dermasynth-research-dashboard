import { existsSync, readFileSync } from "node:fs";

const fittedModelUrl = new URL("../data/models/environmental-surrogate.fitted.v1.json", import.meta.url);
const modelUrl = existsSync(fittedModelUrl) ? fittedModelUrl : new URL("../data/models/environmental-surrogate.v1.json", import.meta.url);

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function loadModelArtifact() {
  const value = JSON.parse(readFileSync(modelUrl, "utf8"));
  const featureIds = ["uvi", "humidity", "pm25", "temperature"];
  if (!value || !["1.0", "1.1"].includes(value.schemaVersion) || !value.modelId || !value.modelVersion || !finiteNumber(value.baselineScore)) {
    throw new Error("Invalid environmental surrogate model artifact.");
  }
  if (!value.features || !value.concernWeights || typeof value.features !== "object" || typeof value.concernWeights !== "object") {
    throw new Error("Environmental surrogate model artifact requires features and concernWeights.");
  }
  for (const featureId of featureIds) {
    const feature = value.features[featureId];
    if (!feature || typeof feature.label !== "string" || typeof feature.unit !== "string" || !finiteNumber(feature.baseline)) {
      throw new Error(`Environmental surrogate feature ${featureId} is invalid.`);
    }
  }
  for (const [concern, weights] of Object.entries(value.concernWeights)) {
    if (!concern || !weights || featureIds.some((featureId) => !finiteNumber(weights[featureId]))) {
      throw new Error(`Environmental surrogate concern weights are invalid for ${concern || "unknown"}.`);
    }
  }
  return Object.freeze(value);
}

const MODEL_ARTIFACT = loadModelArtifact();
const CONCERN_WEIGHTS = Object.freeze(Object.fromEntries(Object.entries(MODEL_ARTIFACT.concernWeights)
  .map(([concern, weights]) => [concern, Object.freeze({ ...weights })])));
const FEATURE_META = Object.freeze(Object.fromEntries(Object.entries(MODEL_ARTIFACT.features)
  .map(([id, feature]) => [id, Object.freeze({ id, ...feature })])));

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clamp(value, lower = 0, upper = 1) {
  return Math.min(upper, Math.max(lower, value));
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function canonicalConcern(value) {
  const concern = String(value || "").trim().toLowerCase();
  return CONCERN_WEIGHTS[concern] ? concern : "acne";
}

function normalizeFeature(id, rawValue) {
  if (rawValue === null) return null;
  if (id === "uvi") return clamp(rawValue / 11);
  // The model encodes lower humidity as stronger dry-comfort context. It is a
  // transparent transformation for the research demonstrator, not a skin
  // assessment or a clinical threshold.
  if (id === "humidity") return clamp((100 - rawValue) / 100);
  if (id === "pm25") return clamp(rawValue / 75);
  if (id === "temperature") return clamp(Math.abs(rawValue - 24) / 16);
  return null;
}

function featureSummary(feature) {
  if (!feature.available) return `${feature.label} was unavailable, so it contributed no value to this run.`;
  if (feature.id === "humidity") return `${feature.label} is represented as a lower-humidity context signal in the transparent surrogate.`;
  return `${feature.label} was normalised against the study-demo baseline before the contribution was calculated.`;
}

/**
 * Produces exact Shapley values for a deliberately small additive surrogate:
 * f(x) = baseline + Σ(weight_i * (x_i - baseline_i)). For this class of
 * model, a feature's Shapley value is exactly the additive term shown here.
 * Its concern weights are configured study-demo parameters, not learned,
 * clinically validated, or causal estimates. It is explainability for a
 * research demonstration, never a clinical score.
 */
export function buildEnvironmentalExplainability({ concern, environment } = {}) {
  const resolvedConcern = canonicalConcern(concern);
  const weights = CONCERN_WEIGHTS[resolvedConcern];
  const readings = environment?.readings || {};
  const baselineScore = MODEL_ARTIFACT.baselineScore;
  const features = Object.values(FEATURE_META).map((meta) => {
    const rawValue = numberOrNull(readings[meta.id]);
    const normalizedValue = normalizeFeature(meta.id, rawValue);
    const weight = weights[meta.id] || 0;
    const shapValue = normalizedValue === null ? 0 : weight * (normalizedValue - meta.baseline);
    return {
      ...meta,
      rawValue,
      normalizedValue: normalizedValue === null ? null : round(normalizedValue),
      weight,
      shapValue: round(shapValue),
      available: normalizedValue !== null,
      summary: "",
    };
  });
  const totalContribution = features.reduce((sum, feature) => sum + feature.shapValue, 0);
  const contextScore = clamp(baselineScore + totalContribution);
  const maximumMagnitude = Math.max(0.001, ...features.map((feature) => Math.abs(feature.shapValue)));
  const completedFeatures = features.map((feature) => ({
    ...feature,
    influencePercent: feature.available ? Math.round((Math.abs(feature.shapValue) / maximumMagnitude) * 100) : 0,
    direction: feature.shapValue > 0 ? "above_baseline" : feature.shapValue < 0 ? "below_baseline" : "at_baseline",
    summary: featureSummary(feature),
  }));
  const dominantFeature = [...completedFeatures]
    .filter((feature) => feature.available)
    .sort((left, right) => Math.abs(right.shapValue) - Math.abs(left.shapValue))[0] || null;
  const unavailableCount = completedFeatures.filter((feature) => !feature.available).length;

  const headline = dominantFeature
    ? `${dominantFeature.label} is the largest environmental contribution in this research run.`
    : "No environmental reading was available for a contribution breakdown.";

  return {
    schemaVersion: "1.0",
    method: MODEL_ARTIFACT.method,
    concern: resolvedConcern,
    model: {
      name: MODEL_ARTIFACT.modelId,
      version: MODEL_ARTIFACT.modelVersion,
      baselineScore,
      contextScore: round(contextScore),
      formula: "baseline + sum(weight × (normalised feature - feature baseline))",
      weightStatus: MODEL_ARTIFACT.weightStatus,
      scope: MODEL_ARTIFACT.scope,
    },
    features: completedFeatures,
    dominantFeature: dominantFeature ? {
      id: dominantFeature.id,
      label: dominantFeature.label,
      rawValue: dominantFeature.rawValue,
      shapValue: dominantFeature.shapValue,
      influencePercent: dominantFeature.influencePercent,
    } : null,
    peg: {
      headline,
      rationale: dominantFeature
        ? `The explanation is traceable to the received ${dominantFeature.label.toLowerCase()} reading and the configured study-demo weight for the selected research context.`
        : "The explanation remains unavailable until at least one environmental reading is supplied.",
      limitations: unavailableCount
        ? `${unavailableCount} environmental signal${unavailableCount === 1 ? " was" : "s were"} unavailable and contributed zero in this run.`
        : "All four environmental signals were available for this run.",
    },
  };
}
