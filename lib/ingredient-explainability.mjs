import { evidenceGrade } from "./ingredient-evidence-notes.mjs";
import { getEwgReference } from "./kb-reference.mjs";

/**
 * Ingredient-level scoring and explanation.
 *
 * Every candidate in a slot's retrieved pool gets a transparent additive score
 *
 *   score(c) = BASELINE + Σ_f  w_f × (x_f(c) − b_f)
 *
 * over four factors:
 *   - environmental_driver  how strongly today's reading triggered the slot
 *                           (identical for every candidate in the slot)
 *   - retrieval_relevance   the candidate's fused BM25 + dense retrieval
 *                           relevance for the slot query (differs per candidate)
 *   - evidence_strength     verified regulator/panel conclusion (1), status-only
 *                           card (0.5) or none (0)
 *   - ewg_reference         EWG Skin Deep hazard score mapped to (10 − s) / 9;
 *                           0.5 (neutral) when the ingredient is not listed
 *
 * Because the model is additive, the exact Shapley value of factor f is
 * w_f × (x_f − b_f) against the fixed reference point b, and
 * w_f × (x_f(selected) − x_f(runner-up)) against the runner-up candidate. The
 * second form answers "why this ingredient rather than the next best one".
 *
 * The rule-based selector picks the highest score, so for rule-based picks the
 * explanation is exactly the model that made the decision. When the language
 * model makes the pick, the explanation reports whether it agreed with this
 * score and, if not, where its pick ranked.
 *
 * Weights are configured research parameters, not learned or clinically
 * validated values.
 */

export const CANDIDATE_MODEL = Object.freeze({
  id: "dermasynth-candidate-score",
  version: "2.0",
  baseline: 0.4,
  weights: Object.freeze({ environmental_driver: 0.4, retrieval_relevance: 0.3, evidence_strength: 0.2, ewg_reference: 0.1 }),
  references: Object.freeze({ environmental_driver: 0.3, retrieval_relevance: 0.5, evidence_strength: 0.5, ewg_reference: 0.5 }),
  weightStatus: "configured_transparent_research_parameters",
});

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const num = (v) => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n; };

// How strongly the live environment drove this slot to appear, plus which
// signal is responsible (for the narrative).
export function environmentalDriver(categoryId, readings = {}) {
  const uvi = num(readings.uvi);
  const humidity = num(readings.humidity);
  const pm25 = num(readings.pm25);
  const id = String(categoryId || "");
  if (id === "daytime-photoprotection") return { value: uvi === null ? 0.3 : clamp(uvi / 11), signal: "UV index", reading: uvi, unit: "" };
  if (id === "antioxidant-context") return { value: pm25 === null ? 0.3 : clamp(pm25 / 75), signal: "PM2.5", reading: pm25, unit: "µg/m³" };
  if (id === "comfort-hydration" || id === "barrier-support-moisturising") return { value: humidity === null ? 0.35 : clamp((60 - humidity) / 40), signal: "low humidity", reading: humidity, unit: "%" };
  if (id === "light-hydration" || id === "lightweight-moisturising") return { value: humidity === null ? 0.35 : clamp((humidity - 60) / 40), signal: "high humidity", reading: humidity, unit: "%" };
  if (id === "supportive-hydration" || id === "supportive-moisturising") return { value: 0.4, signal: "balanced conditions", reading: humidity, unit: "%" };
  if (id === "texture-renewal" || id === "overnight-comfort") return { value: 0.2, signal: "routine context", reading: null, unit: "" };
  return { value: 0.3, signal: "environmental context", reading: null, unit: "" };
}

function ewgFactor(ingredientId) {
  const entry = getEwgReference(ingredientId);
  if (!entry || entry.status !== "listed" || !Number.isFinite(Number(entry.hazardScore))) {
    return { value: 0.5, label: "EWG reference (not listed, neutral)", entry };
  }
  return { value: clamp((10 - Number(entry.hazardScore)) / 9), label: `EWG reference (score ${entry.hazardScore})`, entry };
}

/**
 * Features and score for one candidate. `retrieval` is the fused retrieval
 * record for this ingredient in this slot (or null).
 */
export function scoreCandidate({ ingredientId, categoryId, environment, retrieval = null }) {
  const driver = environmentalDriver(categoryId, environment?.readings || {});
  const evidence = evidenceGrade(ingredientId);
  const ewg = ewgFactor(ingredientId);
  const relevance = clamp(Number(retrieval?.relevance) || 0);
  const features = [
    { id: "environmental_driver", label: `Environmental driver (${driver.signal})`, x: driver.value },
    { id: "retrieval_relevance", label: retrieval ? `Retrieval relevance (rank ${retrieval.rank})` : "Retrieval relevance (not retrieved)", x: relevance },
    { id: "evidence_strength", label: `Evidence strength (${evidence.label})`, x: evidence.value },
    { id: "ewg_reference", label: ewg.label, x: ewg.value },
  ].map((feature) => {
    const weight = CANDIDATE_MODEL.weights[feature.id];
    const shap = weight * (feature.x - CANDIDATE_MODEL.references[feature.id]);
    return { ...feature, x: round(feature.x), weight, shapValue: round(shap) };
  });
  const score = round(clamp(CANDIDATE_MODEL.baseline + features.reduce((sum, feature) => sum + feature.shapValue, 0)));
  return { ingredientId, score, features, driver, evidence, ewg: ewg.entry || null, retrieval };
}

/** Deterministic ordering used by the rule-based selector. */
export function rankScoredCandidates(scored) {
  return [...scored].sort((left, right) => right.score - left.score
    || (Number(right.retrieval?.relevance) || 0) - (Number(left.retrieval?.relevance) || 0)
    || String(left.ingredientId).localeCompare(String(right.ingredientId)));
}

function withInfluence(features) {
  const maxMag = Math.max(0.001, ...features.map((f) => Math.abs(f.shapValue)));
  return features.map((f) => ({
    id: f.id,
    label: f.label,
    value: f.x,
    weight: f.weight,
    shapValue: f.shapValue,
    influencePercent: Math.round((Math.abs(f.shapValue) / maxMag) * 100),
    direction: f.shapValue > 0 ? "increases" : f.shapValue < 0 ? "decreases" : "neutral",
  }));
}

/**
 * Explanation for the selected candidate, including the contrast with the
 * runner-up in the same pool (exact Shapley values with the runner-up as the
 * reference point).
 */
export function buildIngredientAttribution({ selected, ranked, displayNames = new Map(), selectedBy = "deterministic" }) {
  const features = withInfluence(selected.features);
  const dominant = [...features].sort((a, b) => Math.abs(b.shapValue) - Math.abs(a.shapValue))[0] || null;
  const surrogateTop = ranked[0] || null;
  const poolRank = ranked.findIndex((item) => item.ingredientId === selected.ingredientId) + 1;
  const runnerUp = ranked.find((item) => item.ingredientId !== selected.ingredientId) || null;
  let contrast = null;
  if (runnerUp) {
    const deltas = selected.features.map((feature) => {
      const other = runnerUp.features.find((item) => item.id === feature.id);
      const shap = round(feature.weight * (feature.x - (other?.x ?? feature.x)));
      return { id: feature.id, label: feature.label.replace(/\s*\(.*\)$/, ""), selectedValue: feature.x, runnerUpValue: other?.x ?? null, shapValue: shap };
    });
    const decisive = [...deltas].sort((a, b) => Math.abs(b.shapValue) - Math.abs(a.shapValue))[0];
    contrast = {
      runnerUp: { ingredientId: runnerUp.ingredientId, displayName: displayNames.get(runnerUp.ingredientId) || runnerUp.ingredientId, score: runnerUp.score },
      margin: round(selected.score - runnerUp.score),
      features: deltas,
      decisive: decisive && Math.abs(decisive.shapValue) > 0 ? decisive : null,
    };
  }
  return {
    schemaVersion: "2.0",
    method: "exact_shapley_values_for_additive_candidate_score",
    model: { id: CANDIDATE_MODEL.id, version: CANDIDATE_MODEL.version, baseline: CANDIDATE_MODEL.baseline, weights: CANDIDATE_MODEL.weights, references: CANDIDATE_MODEL.references },
    weightStatus: CANDIDATE_MODEL.weightStatus,
    selectionScore: selected.score,
    baseline: CANDIDATE_MODEL.baseline,
    features,
    dominant: dominant ? { id: dominant.id, label: dominant.label, shapValue: dominant.shapValue, influencePercent: dominant.influencePercent } : null,
    contrast,
    poolRank,
    poolSize: ranked.length,
    surrogateTopPick: surrogateTop ? { ingredientId: surrogateTop.ingredientId, displayName: displayNames.get(surrogateTop.ingredientId) || surrogateTop.ingredientId, score: surrogateTop.score } : null,
    agreesWithSurrogate: surrogateTop ? surrogateTop.ingredientId === selected.ingredientId : true,
    selectedBy,
    ranking: ranked.map((item, index) => ({ rank: index + 1, ingredientId: item.ingredientId, displayName: displayNames.get(item.ingredientId) || item.ingredientId, score: item.score })),
  };
}
