import { readFileSync } from "node:fs";
import { getIngredientEvidenceCards } from "./ingredient-evidence-notes.mjs";

// Read-only reference data shared by candidate scoring, retrieval and the
// post-selection safety pass. Both files are versioned in data/ingredients/.

function readJson(relative) {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));
}

let ewgCache = null;
let flagsCache = null;
let matrixCache = null;

function ewg() {
  if (!ewgCache) {
    const value = readJson("../data/ingredients/ewg-hazard-reference.v1.json");
    ewgCache = { meta: { referenceVersion: value.referenceVersion, checkedAt: value.checkedAt, source: value.source, interpretation: value.interpretation }, byId: new Map(value.entries.map((entry) => [entry.ingredientId, entry])) };
  }
  return ewgCache;
}

export function getEwgReference(ingredientId) {
  return ewg().byId.get(String(ingredientId || "").trim().toLowerCase()) || null;
}

export function ewgReferenceMeta() {
  return ewg().meta;
}

export function safetyFlagConfig() {
  if (!flagsCache) flagsCache = readJson("../data/ingredients/safety-flags.v1.json");
  return flagsCache;
}

export function incompatibilityMatrix() {
  if (!matrixCache) {
    const value = readJson("../data/ingredients/incompatibility-matrix.v1.json");
    const pairs = new Set();
    for (const [left, right] of value.pairs || []) {
      pairs.add(`${left}|${right}`);
      pairs.add(`${right}|${left}`);
    }
    matrixCache = { version: value.matrixVersion, pairs };
  }
  return matrixCache;
}

/** Ingredient ids that must never be output, with the reason and source. */
export function selectionExclusion(ingredientId) {
  const id = String(ingredientId || "").trim().toLowerCase();
  const listed = (safetyFlagConfig().excludedFromSelection || []).find((entry) => entry.ingredientId === id);
  if (listed) return listed;
  const cardFlag = getIngredientEvidenceCards(id).find((card) => card.safetyFlags.length);
  if (cardFlag) return { ingredientId: id, reason: `Evidence card ${cardFlag.documentId} records safety flag(s): ${cardFlag.safetyFlags.join(", ")}.`, evidenceDocumentId: cardFlag.documentId };
  return null;
}
