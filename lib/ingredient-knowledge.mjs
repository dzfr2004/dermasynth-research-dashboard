import { readFileSync } from "node:fs";

const knowledgeBaseUrl = new URL("../data/ingredients/knowledge-base.v1.json", import.meta.url);
const demoExtensionUrl = new URL("../data/ingredients/demo-extension.v1.json", import.meta.url);
const atlasExtensionUrl = new URL("../data/ingredients/atlas-extension-50.v1.json", import.meta.url);

const VALID_CONCERNS = new Set(["acne", "barrier", "pigment", "sensitivity", "dryness", "oil", "texture"]);
const VALID_SOURCE_FAMILIES = new Set(["CIR", "EWG", "medical_journal"]);
const VALID_DEPLOYMENT_SCOPE = "research_only_noncommercial";

function failKnowledgeBase(message) {
  throw new Error(`Invalid ingredient knowledge base: ${message}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyStringList(value, { allowEmpty = false } = {}) {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.every(nonEmptyText)
    && new Set(value).size === value.length;
}

function httpsUrl(value) {
  if (!nonEmptyText(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validateSourceRecord(record, ids) {
  if (!record || Array.isArray(record) || typeof record !== "object") {
    failKnowledgeBase("every source record must be an object.");
  }
  if (!nonEmptyText(record.id) || ids.has(record.id)) failKnowledgeBase("source record IDs must be unique non-empty strings.");
  ids.add(record.id);
  if (!VALID_SOURCE_FAMILIES.has(record.sourceFamily)) failKnowledgeBase(`source ${record.id} has an unsupported source family.`);
  for (const field of ["sourceType", "title", "publisher", "evidenceRole", "useMode", "corpusEligibility", "rightsStatus", "clinicalReviewStatus", "reuseNote", "claimBoundary"]) {
    if (!nonEmptyText(record[field])) failKnowledgeBase(`source ${record.id} requires ${field}.`);
  }
  if (!httpsUrl(record.sourceUrl)) failKnowledgeBase(`source ${record.id} must use an https sourceUrl.`);
  if (record.publishedYear !== undefined && (!Number.isInteger(record.publishedYear) || record.publishedYear < 1800 || record.publishedYear > 2100)) {
    failKnowledgeBase(`source ${record.id} has an invalid publishedYear.`);
  }
  if (record.ingredientIds !== undefined && !nonEmptyStringList(record.ingredientIds)) {
    failKnowledgeBase(`source ${record.id} has invalid ingredientIds.`);
  }
  for (const field of ["commercialRestriction", "attributionRequired"]) {
    if (record[field] !== undefined && typeof record[field] !== "boolean") failKnowledgeBase(`source ${record.id} has invalid ${field}.`);
  }

  if (record.sourceFamily === "CIR") {
    if (record.useMode !== "citation_link_only" || record.corpusEligibility !== "rights_hold") {
      failKnowledgeBase(`CIR source ${record.id} must remain a rights-hold citation/link record.`);
    }
  }
  if (record.sourceFamily === "EWG") {
    if (record.useMode !== "external_link_only" || record.corpusEligibility !== "not_eligible_without_permission") {
      failKnowledgeBase(`EWG source ${record.id} must remain an external-link-only record.`);
    }
  }
  if (record.sourceFamily === "medical_journal" && !/^pending_|^already_in_review_queue$/.test(record.clinicalReviewStatus)) {
    failKnowledgeBase(`medical-journal source ${record.id} must remain pending qualified review.`);
  }
}

function validateIngredientRecord(ingredient, sourceIds, ingredientIds) {
  if (!ingredient || Array.isArray(ingredient) || typeof ingredient !== "object") {
    failKnowledgeBase("every ingredient record must be an object.");
  }
  if (!nonEmptyText(ingredient.id) || ingredientIds.has(ingredient.id)) failKnowledgeBase("ingredient IDs must be unique non-empty strings.");
  ingredientIds.add(ingredient.id);
  if (!nonEmptyText(ingredient.displayName) || !nonEmptyText(ingredient.normalizationStatus)) {
    failKnowledgeBase(`ingredient ${ingredient.id} needs displayName and normalizationStatus.`);
  }
  if (!nonEmptyStringList(ingredient.inciNames, { allowEmpty: true })) failKnowledgeBase(`ingredient ${ingredient.id} has invalid inciNames.`);
  if (ingredient.aliases !== undefined && !nonEmptyStringList(ingredient.aliases)) failKnowledgeBase(`ingredient ${ingredient.id} has invalid aliases.`);
  if (ingredient.status !== "held_research_only" || ingredient.routineSelectionAllowed !== false) {
    failKnowledgeBase(`ingredient ${ingredient.id} must remain held for research only.`);
  }
  if (!nonEmptyStringList(ingredient.concernContexts) || ingredient.concernContexts.some((context) => !VALID_CONCERNS.has(context))) {
    failKnowledgeBase(`ingredient ${ingredient.id} has an invalid concern context.`);
  }
  if (!nonEmptyStringList(ingredient.sourceIds) || ingredient.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
    failKnowledgeBase(`ingredient ${ingredient.id} references an unknown source.`);
  }
  if (!nonEmptyStringList(ingredient.evidenceStates) || !nonEmptyStringList(ingredient.activationBlockers)) {
    failKnowledgeBase(`ingredient ${ingredient.id} requires evidence states and activation blockers.`);
  }
}

function validateKnowledgeBase(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") failKnowledgeBase("root must be an object.");
  if (value.schemaVersion !== "1.0") failKnowledgeBase("schemaVersion must be 1.0.");
  if (!nonEmptyText(value.knowledgeBaseVersion) || value.deploymentScope !== VALID_DEPLOYMENT_SCOPE) {
    failKnowledgeBase("knowledgeBaseVersion and research-only deploymentScope are required.");
  }
  if (value.corpusStatus !== "review_pending" || value.routineSelectionAllowed !== false || value.pineconeUploadAllowed !== false) {
    failKnowledgeBase("the knowledge base must remain review-pending and blocked from routines and Pinecone.");
  }
  if (!nonEmptyText(value.purpose) || !nonEmptyStringList(value.governance)) failKnowledgeBase("purpose and governance are required.");
  if (!Array.isArray(value.sourceRecords) || value.sourceRecords.length < 3) failKnowledgeBase("at least three source records are required.");
  if (!Array.isArray(value.ingredients) || value.ingredients.length < 1) failKnowledgeBase("at least one ingredient record is required.");

  const sourceIds = new Set();
  for (const record of value.sourceRecords) validateSourceRecord(record, sourceIds);
  if (!["CIR", "EWG", "medical_journal"].every((family) => value.sourceRecords.some((record) => record.sourceFamily === family))) {
    failKnowledgeBase("CIR, EWG, and medical-journal source records are all required.");
  }

  const ingredientIds = new Set();
  for (const ingredient of value.ingredients) validateIngredientRecord(ingredient, sourceIds, ingredientIds);
  for (const source of value.sourceRecords) {
    if (source.ingredientIds && source.ingredientIds.some((ingredientId) => !ingredientIds.has(ingredientId))) {
      failKnowledgeBase(`source ${source.id} references an unknown ingredient.`);
    }
  }
  return value;
}

function validateDemoExtension(value, base) {
  if (!value || Array.isArray(value) || typeof value !== "object") failKnowledgeBase("demo extension must be an object.");
  if (value.schemaVersion !== "1.0" || !nonEmptyText(value.extensionVersion)) failKnowledgeBase("demo extension requires schemaVersion 1.0 and extensionVersion.");
  if (value.baseKnowledgeBaseVersion !== base.knowledgeBaseVersion) failKnowledgeBase("demo extension targets a different base knowledge-base version.");
  if (value.deploymentScope !== VALID_DEPLOYMENT_SCOPE || !/^demo-[a-z0-9][a-z0-9._-]{1,120}$/i.test(value.demoPineconeNamespace || "")) {
    failKnowledgeBase("demo extension requires research-only scope and an isolated demo namespace.");
  }
  if (!Number.isInteger(value.demoEvidenceCardCount) || value.demoEvidenceCardCount < 1) {
    failKnowledgeBase("demo extension requires a positive demoEvidenceCardCount.");
  }
  if (!nonEmptyText(value.purpose) || !Array.isArray(value.sourceRecords) || !Array.isArray(value.ingredients)) {
    failKnowledgeBase("demo extension requires purpose, sourceRecords, and ingredients.");
  }
  return value;
}

function validateAtlasExtension(value, base) {
  if (!value || Array.isArray(value) || typeof value !== "object") failKnowledgeBase("Atlas extension must be an object.");
  if (value.schemaVersion !== "1.0" || !nonEmptyText(value.extensionVersion)) {
    failKnowledgeBase("Atlas extension requires schemaVersion 1.0 and extensionVersion.");
  }
  if (value.baseKnowledgeBaseVersion !== base.knowledgeBaseVersion) {
    failKnowledgeBase("Atlas extension targets a different base knowledge-base version.");
  }
  if (value.deploymentScope !== VALID_DEPLOYMENT_SCOPE || !nonEmptyText(value.purpose)) {
    failKnowledgeBase("Atlas extension requires research-only scope and a purpose.");
  }
  if (!Array.isArray(value.sourceRecords) || !Array.isArray(value.ingredients) || !value.sourceRecords.length || !value.ingredients.length) {
    failKnowledgeBase("Atlas extension requires non-empty sourceRecords and ingredients.");
  }
  return value;
}

const baseKnowledgeBase = JSON.parse(readFileSync(knowledgeBaseUrl, "utf8"));
const demoExtension = validateDemoExtension(JSON.parse(readFileSync(demoExtensionUrl, "utf8")), baseKnowledgeBase);
const atlasExtension = validateAtlasExtension(JSON.parse(readFileSync(atlasExtensionUrl, "utf8")), baseKnowledgeBase);
const knowledgeBase = Object.freeze(validateKnowledgeBase({
  ...baseKnowledgeBase,
  knowledgeBaseVersion: atlasExtension.extensionVersion,
  demoPineconeNamespace: demoExtension.demoPineconeNamespace,
  demoEvidenceCardCount: demoExtension.demoEvidenceCardCount,
  demoPineconeUploadAllowed: true,
  purpose: `${baseKnowledgeBase.purpose} ${demoExtension.purpose} ${atlasExtension.purpose}`,
  sourceRecords: [...baseKnowledgeBase.sourceRecords, ...demoExtension.sourceRecords, ...atlasExtension.sourceRecords],
  ingredients: [...baseKnowledgeBase.ingredients, ...demoExtension.ingredients, ...atlasExtension.ingredients],
}));

function sourceDocument(record) {
  return {
    id: record.id,
    title: record.title,
    source: record.publisher,
    sourceUrl: record.sourceUrl,
    sourceLocator: record.doiOrPmid || "Source metadata record",
    sourceFamily: record.sourceFamily,
    evidenceRole: record.evidenceRole,
    useMode: record.useMode,
    corpusEligibility: record.corpusEligibility,
    clinicalReviewStatus: record.clinicalReviewStatus,
    caveats: [record.claimBoundary, record.reuseNote],
  };
}

function sourceFamilySummary(records) {
  return Object.fromEntries(
    [...VALID_SOURCE_FAMILIES].map((family) => [family, records.filter((record) => record.sourceFamily === family).length]),
  );
}

function explorerIngredientCard(ingredient) {
  const sourcesById = new Map(knowledgeBase.sourceRecords.map((source) => [source.id, source]));
  const sources = ingredient.sourceIds
    .map((sourceId) => sourcesById.get(sourceId))
    .filter(Boolean)
    .map(sourceDocument);

  return {
    id: ingredient.id,
    displayName: ingredient.displayName,
    inciNames: [...ingredient.inciNames],
    aliases: ingredient.aliases ? [...ingredient.aliases] : [],
    normalizationStatus: ingredient.normalizationStatus,
    concernContexts: [...ingredient.concernContexts],
    evidenceStates: [...ingredient.evidenceStates],
    sourceRecordIds: [...ingredient.sourceIds],
    sourceFamilySummary: sourceFamilySummary(sources),
    sources,
    // This label is deliberately about the final-review demonstrator. It is
    // not an efficacy, regulatory, or individual-suitability decision.
    researchUseStatus: "mapped_for_final_demo",
    limitations: [...ingredient.activationBlockers],
  };
}

export function getIngredientKnowledgeBase() {
  return clone(knowledgeBase);
}

export function ingredientKnowledgeSummary() {
  const bySourceFamily = sourceFamilySummary(knowledgeBase.sourceRecords);
  return {
    schemaVersion: knowledgeBase.schemaVersion,
    knowledgeBaseVersion: knowledgeBase.knowledgeBaseVersion,
    deploymentScope: knowledgeBase.deploymentScope,
    corpusStatus: knowledgeBase.corpusStatus,
    routineSelectionAllowed: false,
    pineconeUploadAllowed: false,
    demoPineconeUploadAllowed: knowledgeBase.demoPineconeUploadAllowed === true,
    demoPineconeNamespace: knowledgeBase.demoPineconeNamespace || "",
    demoEvidenceCardCount: knowledgeBase.demoEvidenceCardCount || 0,
    stagedAtlasIngredientCount: atlasExtension.ingredients.length,
    stagedAtlasSourceCount: atlasExtension.sourceRecords.length,
    ingredientCount: knowledgeBase.ingredients.length,
    sourceCount: knowledgeBase.sourceRecords.length,
    sourceFamilies: bySourceFamily,
    finalReviewReadiness: "complete_research_demo",
    researchUseStatus: "source_attributed_nonclinical_demo",
    purpose: knowledgeBase.purpose,
  };
}

/**
 * A complete, non-clinical research-explorer payload for the final-review
 * dashboard. It intentionally exposes source links, normalisation state, and
 * limitations but makes no individual-use, product, dose, or outcome claim.
 */
export function ingredientResearchExplorer({ concern = "" } = {}) {
  const canonicalConcern = String(concern || "").trim().toLowerCase();
  const allIngredients = knowledgeBase.ingredients.map(explorerIngredientCard);
  const filteredIngredients = VALID_CONCERNS.has(canonicalConcern)
    ? allIngredients.filter((ingredient) => ingredient.concernContexts.includes(canonicalConcern))
    : allIngredients;
  const sources = knowledgeBase.sourceRecords.map(sourceDocument);

  return {
    ...ingredientKnowledgeSummary(),
    concern: VALID_CONCERNS.has(canonicalConcern) ? canonicalConcern : "all",
    overview: {
      ingredientCount: allIngredients.length,
      sourceCount: sources.length,
      sourceFamilies: sourceFamilySummary(knowledgeBase.sourceRecords),
      demoNamespace: knowledgeBase.demoPineconeNamespace || "",
      demoEvidenceCards: knowledgeBase.demoEvidenceCardCount || allIngredients.length,
      stagedAtlasIngredientCount: atlasExtension.ingredients.length,
      stagedAtlasSourceCount: atlasExtension.sourceRecords.length,
      sourceAttributionMode: "links_and_metadata_only_for_restricted_sources",
    },
    ingredients: filteredIngredients,
    allConcernCodes: [...VALID_CONCERNS].sort(),
    sourceRecords: sources,
    scope: "Final-review research explorer only. Ingredient cards map sources and limitations for technology demonstration; they are not selections, instructions, clinical assessments, or product matches.",
  };
}

/**
 * Returns research candidates only. The fields deliberately preserve why each
 * ingredient is held and do not expose any selector, score, dose, or routine
 * instruction.
 */
export function ingredientKnowledgeForConcern(concern) {
  const canonicalConcern = String(concern || "").trim().toLowerCase();
  const candidates = knowledgeBase.ingredients
    .filter((ingredient) => ingredient.concernContexts.includes(canonicalConcern))
    .map((ingredient) => ({
      ...clone(ingredient),
      sourceRecordIds: [...ingredient.sourceIds],
      researchContext: "Research-only knowledge-base candidate; it is held outside the routine and pending qualified review.",
      selectionBlockedReasons: [...ingredient.activationBlockers],
    }));
  const sourceIds = new Set(candidates.flatMap((candidate) => candidate.sourceIds));
  const sourceDocuments = knowledgeBase.sourceRecords
    .filter((record) => sourceIds.has(record.id))
    .map(sourceDocument);

  return {
    ...ingredientKnowledgeSummary(),
    concern: VALID_CONCERNS.has(canonicalConcern) ? canonicalConcern : "unknown",
    candidates,
    sourceDocuments,
    rationale: candidates.length
      ? "These are held research records for the selected concern. They are not eligible for a routine, product match, dose, frequency, compatibility decision, or treatment claim."
      : "No ingredient knowledge-base record is mapped to this concern yet. The routine remains category-only.",
    governance: clone(knowledgeBase.governance),
  };
}
