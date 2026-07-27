import { readFileSync } from "node:fs";
import { ingredientKnowledgeForConcern, ingredientKnowledgeSummary } from "./ingredient-knowledge.mjs";

const catalogUrl = new URL("../data/ingredients/catalog.v1.json", import.meta.url);

function failCatalog(message) {
  throw new Error(`Invalid ingredient catalog: ${message}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function stringList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyText);
}

function validateCatalog(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") failCatalog("root must be an object.");
  if (value.schemaVersion !== "1.0") failCatalog("schemaVersion must be 1.0.");
  if (!nonEmptyText(value.catalogVersion)) failCatalog("catalogVersion is required.");
  if (value.catalogStatus !== "audit_only") failCatalog("catalogStatus must be audit_only.");
  if (value.outputMode !== "category_only") failCatalog("outputMode must be category_only.");
  if (value.routineSelectionAllowed !== false) failCatalog("routine selection must remain blocked.");
  if (!nonEmptyText(value.scope) || !stringList(value.limitations)) failCatalog("scope and limitations are required.");
  if (!value.selectionPolicy || value.selectionPolicy.status !== "blocked" || !nonEmptyText(value.selectionPolicy.rationale)) {
    failCatalog("selectionPolicy must explicitly block routine selection.");
  }
  if (!Array.isArray(value.evidenceRecords) || value.evidenceRecords.length !== 1) {
    failCatalog("exactly one linked evidence record is required for this Phase 1 catalog.");
  }

  const [record] = value.evidenceRecords;
  if (!nonEmptyText(record?.id) || record.productSpecific !== true || record.industrySponsored !== true || !stringList(record.limitations)) {
    failCatalog("the linked evidence record must retain product-specific, sponsor, and limitation metadata.");
  }
  if (!Array.isArray(value.ingredients) || value.ingredients.length !== 4) {
    failCatalog("exactly four audit-only ingredients are expected in this Phase 1 catalog.");
  }

  const ids = new Set();
  for (const ingredient of value.ingredients) {
    if (!nonEmptyText(ingredient?.id) || ids.has(ingredient.id)) failCatalog("ingredient IDs must be unique.");
    ids.add(ingredient.id);
    if (!nonEmptyText(ingredient.displayName) || ingredient.status !== "held_audit_only" || ingredient.routineSelectionAllowed !== false) {
      failCatalog(`ingredient ${ingredient.id} must remain audit-only.`);
    }
    if (!Array.isArray(ingredient.concernContexts) || !ingredient.concernContexts.includes("barrier")) {
      failCatalog(`ingredient ${ingredient.id} must be scoped to barrier research.`);
    }
    if (!Array.isArray(ingredient.evidenceRecordIds) || !ingredient.evidenceRecordIds.includes(record.id)) {
      failCatalog(`ingredient ${ingredient.id} must cite the linked RCT.`);
    }
    if (!stringList(ingredient.selectionBlockedReasons)) failCatalog(`ingredient ${ingredient.id} must have blocked-selection reasons.`);
  }

  return value;
}

const catalog = Object.freeze(validateCatalog(JSON.parse(readFileSync(catalogUrl, "utf8"))));

function catalogLimitations() {
  return [...catalog.limitations];
}

/**
 * Static, category-level reference examples for the general Ingredient Atlas
 * surface. This deliberately lives outside routine generation: it accepts a
 * category identifier only, has no access to profile, concern, environment,
 * retrieval, or synthesis data, and always returns the same list for a given
 * category identifier.
 *
 * The named examples are descriptive class examples, not a selection,
 * product match, amount, frequency, or recommendation. Atlas-backed examples
 * are used where that research inventory contains a matching entry.
 */
const CATEGORY_REFERENCE_EXAMPLE_MAP = Object.freeze({
  "low-irritation-cleansing": Object.freeze([
    "humectants (e.g. glycerin)",
    "colloidal-oat support materials (e.g. colloidal oatmeal)",
  ]),
  "comfort-hydration": Object.freeze([
    "humectants (e.g. glycerin)",
    "hyaluronate humectants (e.g. sodium hyaluronate)",
    "urea humectants (e.g. urea)",
  ]),
  "light-hydration": Object.freeze([
    "humectants (e.g. glycerin)",
    "hyaluronate humectants (e.g. sodium hyaluronate)",
    "beta-glucan humectants (e.g. beta-glucan)",
  ]),
  "supportive-hydration": Object.freeze([
    "humectants (e.g. glycerin)",
    "hyaluronate humectants (e.g. sodium hyaluronate)",
    "beta-glucan humectants (e.g. beta-glucan)",
  ]),
  "barrier-support-moisturising": Object.freeze([
    "barrier-lipid classes (e.g. ceramide NP)",
    "emollients (e.g. squalane)",
    "occlusive agents (e.g. petrolatum)",
  ]),
  "lightweight-moisturising": Object.freeze([
    "silicone emollients (e.g. dimethicone)",
    "light emollients (e.g. squalane)",
    "humectants (e.g. glycerin)",
  ]),
  "supportive-moisturising": Object.freeze([
    "emollients (e.g. squalane)",
    "occlusive agents (e.g. petrolatum)",
    "barrier-lipid classes (e.g. ceramide AP)",
  ]),
  "daytime-photoprotection": Object.freeze([
    "mineral filters (e.g. zinc oxide)",
    "chemical filters (e.g. avobenzone)",
  ]),
  // The following three IDs correspond to the static category additions in
  // safety.mjs. Keeping their examples here preserves the same hard boundary:
  // this mapping remains independent from every individual routine input.
  "antioxidant-context": Object.freeze([
    "antioxidant vitamins (e.g. ascorbic acid)",
    "tocopherol antioxidants (e.g. tocopherol)",
    "polyphenol antioxidants (e.g. resveratrol)",
  ]),
  "texture-renewal": Object.freeze([
    "hydroxy-acid classes (e.g. glycolic acid)",
    "polyhydroxy-acid classes (e.g. gluconolactone)",
    "retinoid classes (e.g. retinol)",
  ]),
  "overnight-comfort": Object.freeze([
    "barrier-lipid classes (e.g. ceramide NP)",
    "emollients (e.g. squalane)",
    "occlusive agents (e.g. petrolatum)",
  ]),
});

/**
 * Return static general-reference examples for a routine category ID.
 *
 * This function intentionally takes only `categoryId`; do not add profile,
 * concern, environment, evidence, or retrieval parameters. A defensive copy
 * prevents one caller from altering the reference content seen by another.
 */
export function categoryReferenceExamples(categoryId) {
  const examples = CATEGORY_REFERENCE_EXAMPLE_MAP[String(categoryId || "").trim()];
  return examples ? [...examples] : [];
}

/**
 * Public audit metadata. It deliberately does not offer a selector or a
 * recommendation path; callers can only render provenance and limitations.
 */
export function getIngredientCatalog() {
  return {
    ...clone(catalog),
    knowledgeBase: ingredientKnowledgeSummary(),
  };
}

/**
 * A routine-side research appendix. Candidate names are exposed only for the
 * barrier research context and are never copied into the routine step contract.
 */
export function ingredientResearchForConcern(concern, { exposeCandidates = true } = {}) {
  const canonicalConcern = String(concern || "").trim().toLowerCase();
  const candidates = exposeCandidates && canonicalConcern === "barrier"
    ? catalog.ingredients.filter((ingredient) => ingredient.concernContexts.includes("barrier"))
    : [];
  const hasCandidates = candidates.length > 0;
  const withheldAfterTriage = !exposeCandidates;
  const knowledgeBase = exposeCandidates
    ? ingredientKnowledgeForConcern(canonicalConcern)
    : {
      ...ingredientKnowledgeSummary(),
      concern: canonicalConcern || "unknown",
      candidates: [],
      sourceDocuments: [],
      rationale: "Symptom triage redirected this request before knowledge-base candidate names or source documents were shown.",
      governance: [],
    };

  return {
    schemaVersion: catalog.schemaVersion,
    catalogVersion: catalog.catalogVersion,
    outputMode: "category_only",
    catalogStatus: catalog.catalogStatus,
    concern: canonicalConcern || "unknown",
    status: withheldAfterTriage ? "withheld_after_triage" : hasCandidates ? "held_audit_only" : "no_candidates_for_concern",
    routineSelectionAllowed: false,
    candidates: clone(candidates),
    evidenceRecords: clone(catalog.evidenceRecords),
    knowledgeBase,
    rationale: withheldAfterTriage
      ? "Symptom triage redirected this request before any ingredient research candidates were shown."
      : hasCandidates
      ? "Four names are retained only as audit candidates because they were recorded in one product-specific, multi-ingredient barrier-regimen trial. They are not selected for this routine."
      : "No named ingredient candidate is available for this concern in the current audit-only catalog. The routine remains a broad category-only research preview.",
    limitations: catalogLimitations(),
    selectionPolicy: clone(catalog.selectionPolicy),
  };
}

export const INGREDIENT_OUTPUT_MODE = "category_only";
