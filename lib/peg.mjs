import { CONCERN_CATALOG } from "./safety.mjs";
import { getRuntimePolicy } from "./policy-store.mjs";

/**
 * Personalised Explanation Generation (PEG), two levels.
 *
 * Level 1 (environment): which live reading contributed most to the research
 * context score, from the environmental SHAP surrogate.
 * Level 2 (ingredient): why each routine step exists (the deterministic rule
 * that added it, tied back to the reading) and why the named ingredient was
 * chosen from its retrieved pool (candidate-score Shapley values, including
 * the contrast with the runner-up).
 *
 * All text is assembled from templates and the numbers in the run. No language
 * model writes it, so it can only state what the pipeline actually computed.
 */

const CONCERN_LABELS = new Map(CONCERN_CATALOG.map((item) => [item.id, item.label.toLowerCase().replace(/\s+context$/, "")]));
const FACTOR_PHRASES = {
  environmental_driver: "the environmental driver",
  retrieval_relevance: "retrieval relevance to this step",
  evidence_strength: "evidence strength",
  ewg_reference: "the EWG reference score",
  user_fit: "fit to this user",
};

function fmt(value, digits = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "unavailable";
}

function signed(value) {
  const n = Number(value) || 0;
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(3)}`;
}

export function environmentLevelText(explainability, concern) {
  const dominant = explainability?.dominantFeature;
  const context = CONCERN_LABELS.get(concern) || "selected research";
  if (!dominant) return "No environmental reading was available, so no environmental driver can be named for this run.";
  const feature = (explainability.features || []).find((item) => item.id === dominant.id);
  const unit = feature?.unit && feature.unit !== "%" ? ` ${feature.unit}` : feature?.unit === "%" ? "%" : "";
  const direction = Number(dominant.shapValue) >= 0 ? "raised" : "lowered";
  return `${dominant.label} (${fmt(dominant.rawValue, dominant.id === "uvi" ? 1 : 0)}${unit}) made the largest contribution to the ${context} context score: it ${direction} the score by ${Math.abs(Number(dominant.shapValue) || 0).toFixed(3)} against the model baseline.`;
}

export function slotReasonText({ step, environment, routine, concern }) {
  const policy = getRuntimePolicy();
  const readings = environment?.readings || {};
  const rules = new Set(step?.ruleIds || []);
  const id = step?.id;
  if (id === "daytime-photoprotection") {
    if (rules.has("high-uv-photoprotection-rule")) return `The UV index of ${fmt(readings.uvi, 1)} is at or above the high-UV threshold of ${policy.environment.highUvThreshold}, so a daytime photoprotection step is required.`;
    if (Number.isFinite(Number(readings.uvi))) return `A UV index of ${fmt(readings.uvi, 1)} was received for daytime, so a daytime photoprotection step is included.`;
    return "No UV reading was available, so the conservative default keeps a daytime photoprotection step.";
  }
  if (id === "antioxidant-context") return `PM2.5 of ${fmt(readings.pm25, 1)} µg/m³ is at or above the ${policy.environment.highPm25Threshold} µg/m³ threshold, so an antioxidant step is added to the morning.`;
  if (rules.has("low-irritation-barrier-guardrail") && /hydration|moisturising/.test(id || "")) {
    const why = routine?.generation?.reactivityRaisedByProfile ? "your sensitive skin profile" : `this ${CONCERN_LABELS.get(concern) || "research"} context or your reported reactivity`;
    return `The barrier guardrail is active because of ${why}, so the conservative comfort and barrier-support variant is used.`;
  }
  const vote = routine?.generation?.textureVote;
  if (/hydration|moisturising/.test(id || "") && vote) {
    const richer = vote.votes.filter((v) => v.vote > 0).map((v) => v.reason);
    const lighter = vote.votes.filter((v) => v.vote < 0).map((v) => v.reason);
    const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0]);
    const tally = [richer.length ? `richer: ${list(richer)}` : "", lighter.length ? `lighter: ${list(lighter)}` : ""].filter(Boolean).join("; ");
    if (vote.direction === "richer") return `The texture vote leans richer (${tally}), so the comfort hydration and barrier-support moisturising variants are used.`;
    if (vote.direction === "lighter") return `The texture vote leans lighter (${tally}), so the lightweight hydration and moisturising variants are used.`;
    return tally ? `The texture vote is balanced (${tally}), so the supportive hydration and moisturising variants are used.` : "No profile, finish or weather signal leaned richer or lighter, so the supportive hydration and moisturising variants are used.";
  }
  if (id === "texture-renewal") return `The ${CONCERN_LABELS.get(concern) || "selected"} context includes an evening texture-renewal step; it is kept out of the morning because hydroxy acids raise sun sensitivity.`;
  if (id === "overnight-comfort") return "Every evening routine ends with an overnight comfort step.";
  if (id === "low-irritation-cleansing") return `${step?.phase === "pm" ? "The evening" : "The morning"} routine starts with low-irritation cleansing${rules.has("low-irritation-barrier-guardrail") ? ", kept especially gentle because the barrier guardrail is active" : ""}.`;
  return "This step is part of the fixed category structure for the research context.";
}

export function ingredientLevelText({ entry }) {
  const attr = entry?.attribution;
  if (!attr) return `${entry?.displayName || "This ingredient"} was matched from the approved knowledge base.`;
  const name = entry.displayName;
  const parts = [];
  parts.push(`${name} ranked ${attr.poolRank} of ${attr.poolSize} approved candidate${attr.poolSize === 1 ? "" : "s"} retrieved for this step (score ${fmt(attr.selectionScore, 3)}).`);
  if (attr.contrast?.decisive) {
    const decisive = attr.contrast.decisive;
    parts.push(`Compared with ${attr.contrast.runnerUp.displayName}, the deciding factor was ${FACTOR_PHRASES[decisive.id] || decisive.label.toLowerCase()} (${signed(decisive.shapValue)}); the total margin was ${signed(attr.contrast.margin)}.`);
  } else if (attr.contrast) {
    parts.push(`${attr.contrast.runnerUp.displayName} scored the same on every factor; the tie was broken by retrieval rank and then alphabetically.`);
  } else {
    parts.push("It was the only approved candidate retrieved for this step.");
  }
  // Only the components that count in its favour are named as reasons.
  const fitReasons = (entry.userFit?.components || []).filter((c) => c.x >= 0.6).map((c) => c.reason);
  if (fitReasons.length) parts.push(`Fit to you: ${fitReasons.join("; ")}.`);
  const evidence = attr.features.find((feature) => feature.id === "evidence_strength");
  if (evidence) parts.push(`Evidence: ${evidence.label.replace(/^Evidence strength \((.*)\)$/, "$1")}.`);
  if (attr.selectedBy === "llm_from_rag_pool" && !attr.agreesWithSurrogate) {
    parts.push(`The language model chose it over the top-scored ${attr.surrogateTopPick.displayName}; it was accepted because it is in the approved retrieved pool and passed every safety check.`);
  } else if (attr.selectedBy === "llm_from_rag_pool") {
    parts.push("The language model's pick matched the top-scored candidate.");
  }
  return parts.join(" ");
}

export function buildTwoLevelExplanation({ explainability, routine, entries = [], environment, concern }) {
  const steps = [
    ...(Array.isArray(routine?.am) ? routine.am.map((step) => ({ ...step, phase: "am" })) : []),
    ...(Array.isArray(routine?.pm) ? routine.pm.map((step) => ({ ...step, phase: "pm" })) : []),
  ];
  const level1 = environmentLevelText(explainability, concern);
  const level2 = entries.map((entry) => {
    const step = steps.find((item) => item.id === entry.categoryId && item.phase === entry.phase) || { id: entry.categoryId };
    return {
      ingredientId: entry.ingredientId,
      displayName: entry.displayName,
      phase: entry.phase,
      categoryId: entry.categoryId,
      whyThisStep: slotReasonText({ step, environment, routine, concern }),
      whyThisIngredient: ingredientLevelText({ entry }),
    };
  });
  return {
    schemaVersion: "1.0",
    method: "template_peg_over_computed_attributions",
    level1: { label: "Environment", text: level1 },
    level2,
    summary: level2.length
      ? `${level1} ${level2.map((item) => `${item.whyThisStep} ${item.displayName} was chosen for it.`).join(" ")}`
      : level1,
    boundary: "Generated from the run's computed values only; it is a research explanation, not clinical advice.",
  };
}
