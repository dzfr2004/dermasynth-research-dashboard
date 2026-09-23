import { getRuntimePolicy } from "./policy-store.mjs";
import { incompatibilityMatrix, safetyFlagConfig, selectionExclusion } from "./kb-reference.mjs";

/**
 * Safety pass over the FINAL output, run after ingredient selection (whether
 * the language model or the rule-based selector made the pick).
 *
 * The earlier two passes check the category routine and the model's routine
 * text. This pass checks the named ingredients that are actually shown:
 *   1. excluded ingredients (for example retinal after the 2026 AICIS finding)
 *   2. prescription-only actives
 *   3. every pair of selected ingredients against the incompatibility matrix
 *      and each record's own incompatibility list
 *   4. photosensitising actives placed in a morning slot
 *   5. high-intensity exfoliants while the barrier guardrail is active
 *   6. restricted medical claims in any model-written ingredient text
 * An ingredient that fails is removed from the output (its step stays as a
 * category) and the removal is reported. Nothing is ever added.
 */

const BARRIER_GUARDRAIL_CONCERNS = new Set(["barrier", "sensitivity", "dryness"]);
const RESTRICTED_CLAIM = /\b(diagnos\w*|treat(?:s|ment|ing)?|cure[sd]?|prescri\w*|guarantee\w*|dosage|dose)\b/i;

function rule(id, label, status, detail) {
  return { id, label, status, ...(detail ? { detail } : {}) };
}

export function postSelectionSafetyPass({ entries = [], concern = "", reactivityLevel = "low", environment = null, texts = {} } = {}) {
  const flagsConfig = safetyFlagConfig();
  const matrix = incompatibilityMatrix();
  const prescriptionOnly = new Set(flagsConfig.prescriptionOnly || []);
  const photosensitising = new Set(flagsConfig.photosensitising?.ids || []);
  const exfoliants = new Set(flagsConfig.highIntensityExfoliants?.ids || []);
  const barrierGuardrail = BARRIER_GUARDRAIL_CONCERNS.has(concern) || ["moderate", "high"].includes(String(reactivityLevel || "").toLowerCase());
  const policy = getRuntimePolicy();
  const highUv = Number(environment?.readings?.uvi) >= policy.environment.highUvThreshold;

  const removed = [];
  const kept = [];
  const reasonsFor = (entry) => {
    const reasons = [];
    const id = entry.ingredientId;
    const exclusion = selectionExclusion(id);
    if (exclusion) reasons.push({ rule: "excluded-ingredient", detail: exclusion.reason });
    if (prescriptionOnly.has(id)) reasons.push({ rule: "prescription-only", detail: `${entry.displayName} is prescription-only.` });
    if (entry.phase === "am" && photosensitising.has(id)) reasons.push({ rule: "photosensitiser-in-am", detail: `${entry.displayName} raises sun sensitivity and cannot be placed in a morning step${highUv ? " (UV is high today)" : ""}.` });
    if (barrierGuardrail && exfoliants.has(id)) reasons.push({ rule: "barrier-guardrail-exfoliant", detail: `${entry.displayName} is a high-intensity exfoliant and the barrier guardrail is active.` });
    const text = texts[id];
    if (typeof text === "string" && RESTRICTED_CLAIM.test(text)) reasons.push({ rule: "restricted-claim-in-model-text", detail: `Model-written text for ${entry.displayName} contained a restricted medical claim.` });
    for (const other of kept) {
      const pairKey = `${id}|${other.ingredientId}`;
      const listed = (entry.incompatibilities || []).includes(other.ingredientId) || (other.incompatibilities || []).includes(id);
      if (matrix.pairs.has(pairKey) || listed) {
        reasons.push({ rule: "incompatible-pair", detail: `${entry.displayName} and ${other.displayName} are an incompatible pair (matrix ${matrix.version}).` });
      }
    }
    return reasons;
  };

  for (const entry of entries) {
    const reasons = reasonsFor(entry);
    if (reasons.length) removed.push({ ingredientId: entry.ingredientId, displayName: entry.displayName, categoryId: entry.categoryId, phase: entry.phase, reasons });
    else kept.push(entry);
  }

  const flags = removed.map((item) => `${item.displayName} was removed from the ${item.phase.toUpperCase()} ${item.categoryId} step: ${item.reasons.map((reason) => reason.detail).join(" ")}`);
  const failedRules = new Set(removed.flatMap((item) => item.reasons.map((reason) => reason.rule)));
  const rules = [
    rule("excluded-ingredient", "No excluded ingredient in the final output", failedRules.has("excluded-ingredient") ? "removed" : "passed"),
    rule("prescription-only", "No prescription-only active in the final output", failedRules.has("prescription-only") ? "removed" : "passed"),
    rule("incompatible-pair", `No incompatible pair among selected ingredients (matrix ${matrix.version})`, failedRules.has("incompatible-pair") ? "removed" : "passed"),
    rule("photosensitiser-in-am", "No photosensitising active in a morning step", failedRules.has("photosensitiser-in-am") ? "removed" : "passed"),
    rule("barrier-guardrail-exfoliant", "No high-intensity exfoliant while the barrier guardrail is active", failedRules.has("barrier-guardrail-exfoliant") ? "removed" : "passed"),
    rule("restricted-claim-in-model-text", "No restricted medical claim in model-written ingredient text", failedRules.has("restricted-claim-in-model-text") ? "removed" : "passed"),
  ];
  return {
    id: "post_selection_safety",
    // Removing an item makes the displayed output safe again, so the pass is
    // "cleared" once removals are applied; the flags keep them auditable.
    status: removed.length ? "cleared_after_removal" : "cleared",
    checks: rules.map((item) => item.label),
    rules,
    flags,
    removed,
    entries: kept,
  };
}
