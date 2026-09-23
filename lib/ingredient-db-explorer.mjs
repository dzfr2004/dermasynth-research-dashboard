// Builds the /api/knowledge-explorer and /api/ingredient-knowledge payloads
// from the versioned database instead of the static JSON files. The output
// shape intentionally matches lib/ingredient-knowledge.mjs so the existing
// frontend Atlas, relationship graph, counts, and filters keep working while
// the data becomes fully API-/DB-driven.

const VALID_CONCERNS = ["acne", "barrier", "pigment", "sensitivity", "dryness", "oil", "texture"];
const SOURCE_FAMILIES = ["CIR", "EWG", "medical_journal"];

// Which approval states count as "live" knowledge for public read surfaces.
// Archived/superseded/rejected records are hidden from the explorer by default.
const VISIBLE_STATES = new Set(["in_review", "approved", "published"]);

function sourceDocument(record) {
  return {
    id: record.source_id,
    title: record.title,
    source: record.publisher,
    sourceUrl: record.source_url,
    sourceLocator: record.doi_or_pmid || "Source metadata record",
    sourceFamily: record.source_family,
    evidenceRole: record.evidence_role,
    evidenceType: record.evidence_type,
    useMode: record.use_mode,
    corpusEligibility: record.corpus_eligibility,
    rightsStatus: record.rights_status,
    clinicalReviewStatus: record.clinical_review_status,
    approvalState: record.approval_state,
    version: record.version,
    caveats: [record.claim_boundary, record.reuse_note].filter(Boolean),
  };
}

function sourceFamilySummary(records) {
  return Object.fromEntries(
    SOURCE_FAMILIES.map((family) => [family, records.filter((r) => r.sourceFamily === family).length]),
  );
}

function explorerIngredientCard(ingredient, sourcesById) {
  const sources = (ingredient.source_ids || [])
    .map((id) => sourcesById.get(id))
    .filter(Boolean)
    .map(sourceDocument);
  return {
    id: ingredient.ingredient_id,
    displayName: ingredient.display_name,
    inciNames: [...(ingredient.inci_names || [])],
    aliases: [...(ingredient.aliases || [])],
    categories: [...(ingredient.categories || [])],
    normalizationStatus: ingredient.normalization_status,
    concernContexts: [...(ingredient.concern_contexts || [])],
    evidenceStates: [...(ingredient.evidence_states || [])],
    sourceRecordIds: [...(ingredient.source_ids || [])],
    sourceFamilySummary: sourceFamilySummary(sources),
    sources,
    approvalState: ingredient.approval_state,
    version: ingredient.version,
    reactivityClass: ingredient.reactivity_class || null,
    researchUseStatus: "mapped_for_final_demo",
    limitations: [...(ingredient.activation_blockers || [])],
  };
}

function summary(repo, visibleSources, visibleIngredients) {
  const c = repo.counts();
  return {
    schemaVersion: "1.0",
    knowledgeBaseVersion: "db-dynamic-v1",
    deploymentScope: "research_only_noncommercial",
    corpusStatus: "db_backed_workflow",
    routineSelectionAllowed: false,
    pineconeUploadAllowed: false,
    ingredientCount: visibleIngredients.length,
    sourceCount: visibleSources.length,
    sourceFamilies: sourceFamilySummary(visibleSources.map(sourceDocument)),
    dataSource: "database",
    approvalStateCounts: { ingredients: c.ingredients.byState, sources: c.sources.byState },
    researchUseStatus: "source_attributed_nonclinical_demo",
  };
}

export function buildExplorerFromDb(repo, { concern = "" } = {}) {
  const canonicalConcern = String(concern || "").trim().toLowerCase();
  const allSources = repo.listSources().filter((s) => VISIBLE_STATES.has(s.approval_state));
  const sourcesById = new Map(allSources.map((s) => [s.source_id, s]));
  const allIngredients = repo
    .listIngredients()
    .filter((i) => VISIBLE_STATES.has(i.approval_state))
    .map((i) => explorerIngredientCard(i, sourcesById));

  const filteredIngredients = VALID_CONCERNS.includes(canonicalConcern)
    ? allIngredients.filter((i) => i.concernContexts.includes(canonicalConcern))
    : allIngredients;
  const sources = allSources.map(sourceDocument);

  return {
    ...summary(repo, allSources, allIngredients),
    concern: VALID_CONCERNS.includes(canonicalConcern) ? canonicalConcern : "all",
    overview: {
      ingredientCount: allIngredients.length,
      sourceCount: sources.length,
      sourceFamilies: sourceFamilySummary(sources),
      sourceAttributionMode: "links_and_metadata_only_for_restricted_sources",
    },
    ingredients: filteredIngredients,
    allConcernCodes: [...VALID_CONCERNS].sort(),
    sourceRecords: sources,
    scope:
      "DB-backed research explorer. Ingredient cards map sources and limitations for technology demonstration; they are not selections, instructions, clinical assessments, or product matches.",
  };
}
