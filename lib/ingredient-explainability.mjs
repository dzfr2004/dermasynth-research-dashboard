import { getIngredientEvidenceNote } from "./ingredient-evidence-notes.mjs";

/**
 * Ingredient-level explainability. Produces EXACT Shapley values for a small
 * additive surrogate that decomposes WHY a given ingredient was chosen for its
 * category into three transparent factors:
 *
 *   score = baseline + Σ weight_f × (x_f − baseline_f)
 *
 *   - environmental_driver : how strongly the live environment triggered this
 *                            ingredient's category (e.g. high UV → photoprotection).
 *   - category_fit         : the ingredient is an approved member of the category.
 *   - evidence_strength    : verified CIR/regulatory grounding vs status-only.
 *
 * As with the environmental surrogate, the weights are transparent, configured
 * research parameters — not learned or clinically validated. For an additive
 * model each feature's Shapley value is exactly its additive term.
 */

const BASELINE = 0.4;
const WEIGHTS = { environmental_driver: 0.45, category_fit: 0.30, evidence_strength: 0.25 };
const FEATURE_BASELINE = { environmental_driver: 0.3, category_fit: 0.5, evidence_strength: 0.5 };

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// How strongly the live environment drove this ingredient's category to appear,
// plus which environmental signal is responsible (for the narrative).
function environmentalDriver(categoryId, readings = {}) {
  const uvi = num(readings.uvi);
  const humidity = num(readings.humidity);
  const pm25 = num(readings.pm25);
  const id = String(categoryId || "");
  if (id === "daytime-photoprotection") return { value: uvi === null ? 0.3 : clamp(uvi / 11), signal: "UV index" };
  if (id === "antioxidant-context") return { value: pm25 === null ? 0.3 : clamp(pm25 / 75), signal: "PM2.5" };
  if (id === "comfort-hydration" || id === "barrier-support-moisturising") return { value: humidity === null ? 0.35 : clamp((60 - humidity) / 40), signal: "low humidity" };
  if (id === "light-hydration" || id === "lightweight-moisturising") return { value: humidity === null ? 0.35 : clamp((humidity - 60) / 40), signal: "high humidity" };
  if (id === "supportive-hydration" || id === "supportive-moisturising") return { value: 0.4, signal: "balanced conditions" };
  if (id === "texture-renewal" || id === "overnight-comfort") return { value: 0.2, signal: "routine context" };
  return { value: 0.3, signal: "environmental context" };
}

function evidenceStrength(ingredientId) {
  const note = getIngredientEvidenceNote(ingredientId);
  if (!note) return { value: 0.0, label: "no grounding note" };
  if (/no dedicated|no_dedicated|regulatory status/i.test(`${note.sourceFamily} ${note.text}`) && !/CIR/i.test(note.sourceFamily)) {
    return { value: 0.5, label: `${note.sourceFamily || "regulatory"} status` };
  }
  return { value: 1.0, label: `${note.sourceFamily || "verified"} conclusion` };
}

export function buildIngredientAttribution({ environment, entry } = {}) {
  const readings = environment?.readings || {};
  const categoryId = entry?.categoryId || entry?.selectionTrace?.category?.id || "";
  const driver = environmentalDriver(categoryId, readings);
  const evidence = evidenceStrength(entry?.ingredientId);

  const rawFeatures = [
    { id: "environmental_driver", label: `Environmental driver (${driver.signal})`, x: driver.value },
    { id: "category_fit", label: "Category fit", x: 1 },
    { id: "evidence_strength", label: `Evidence strength (${evidence.label})`, x: evidence.value },
  ];
  const features = rawFeatures.map((f) => {
    const shap = WEIGHTS[f.id] * (f.x - FEATURE_BASELINE[f.id]);
    return { id: f.id, label: f.label, value: round(f.x), shapValue: round(shap), direction: shap > 0 ? "increases" : shap < 0 ? "decreases" : "neutral" };
  });
  const maxMag = Math.max(0.001, ...features.map((f) => Math.abs(f.shapValue)));
  const completed = features.map((f) => ({ ...f, influencePercent: Math.round((Math.abs(f.shapValue) / maxMag) * 100) }));
  const total = completed.reduce((s, f) => s + f.shapValue, 0);
  const selectionScore = round(clamp(BASELINE + total));
  const dominant = [...completed].sort((a, b) => Math.abs(b.shapValue) - Math.abs(a.shapValue))[0] || null;

  return {
    schemaVersion: "1.0",
    method: "exact_shapley_values_for_additive_ingredient_selection_surrogate",
    weightStatus: "configured_transparent_research_parameters",
    selectionScore,
    baseline: BASELINE,
    features: completed,
    dominant: dominant ? { id: dominant.id, label: dominant.label, shapValue: dominant.shapValue, influencePercent: dominant.influencePercent } : null,
    peg: {
      headline: dominant ? `${dominant.label} is the main reason this ingredient was chosen for its category.` : "No dominant selection factor.",
      rationale: dominant
        ? `The selection is traceable to the ${dominant.label.toLowerCase()} (${dominant.influencePercent}% relative influence) under the current context. This is a transparent research attribution, not a clinical judgement.`
        : "Attribution is unavailable for this ingredient.",
    },
  };
}
