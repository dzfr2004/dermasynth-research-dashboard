const CONCERN_WEIGHTS = Object.freeze({
  acne: Object.freeze({ uvi: 0.18, humidity: 0.26, pm25: 0.34, temperature: 0.22 }),
  barrier: Object.freeze({ uvi: 0.22, humidity: 0.34, pm25: 0.26, temperature: 0.18 }),
  pigment: Object.freeze({ uvi: 0.42, humidity: 0.12, pm25: 0.29, temperature: 0.17 }),
  dryness: Object.freeze({ uvi: 0.18, humidity: 0.42, pm25: 0.18, temperature: 0.22 }),
  oil: Object.freeze({ uvi: 0.17, humidity: 0.30, pm25: 0.22, temperature: 0.31 }),
  sensitivity: Object.freeze({ uvi: 0.24, humidity: 0.34, pm25: 0.27, temperature: 0.15 }),
  texture: Object.freeze({ uvi: 0.31, humidity: 0.18, pm25: 0.31, temperature: 0.20 }),
});

const FEATURE_META = Object.freeze({
  uvi: Object.freeze({ id: "uvi", label: "UV index", unit: "UVI", baseline: 0.36 }),
  humidity: Object.freeze({ id: "humidity", label: "Humidity context", unit: "%", baseline: 0.5 }),
  pm25: Object.freeze({ id: "pm25", label: "PM2.5 context", unit: "µg/m³", baseline: 0.2 }),
  temperature: Object.freeze({ id: "temperature", label: "Temperature context", unit: "°C", baseline: 0.25 }),
});

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
  const baselineScore = 0.5;
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
    method: "exact_shapley_values_for_additive_environmental_surrogate",
    concern: resolvedConcern,
    model: {
      name: "DermaSynth transparent environmental surrogate",
      baselineScore,
      contextScore: round(contextScore),
      formula: "baseline + sum(weight × (normalised feature - feature baseline))",
      weightStatus: "configured_study_demo_parameters",
      scope: "Environmental-context explanation for the non-clinical final-review demonstrator; not a skin assessment, efficacy score, or treatment decision.",
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

export const ENVIRONMENTAL_SURROGATE_CONCERNS = Object.freeze(Object.keys(CONCERN_WEIGHTS));
