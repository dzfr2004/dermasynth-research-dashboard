import { getRuntimePolicy } from "./policy-store.mjs";
import { buildIngredientAttribution } from "./ingredient-explainability.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonical(value) {
  return String(value || "").trim().toLowerCase();
}

function structuredRoutineSteps(routine) {
  return [
    ...(Array.isArray(routine?.am) ? routine.am.map((step) => ({ ...step, phase: "am" })) : []),
    ...(Array.isArray(routine?.pm) ? routine.pm.map((step) => ({ ...step, phase: "pm" })) : []),
  ];
}

const SELECTABLE_STATES = new Set(["approved", "published"]);

function sourceLinks(ingredient, sourceById) {
  return ingredient.source_ids.map((id) => sourceById.get(id)).filter(Boolean).map((source) => ({
    id: source.source_id,
    title: source.title,
    source: source.publisher,
    sourceUrl: source.source_url,
  }));
}

function candidateReason(categoryId, environment, policy) {
  if (categoryId === "daytime-photoprotection" && Number(environment?.readings?.uvi) >= policy.environment.highUvThreshold) {
    return "The deterministic routine included this category for the received high-UV context.";
  }
  if (categoryId === "antioxidant-context" && Number(environment?.readings?.pm25) >= policy.environment.highPm25Threshold) {
    return "The deterministic routine included this category for the received high-PM2.5 context.";
  }
  return "The deterministic routine included this approved broad category for the selected research context.";
}

function hasCompatibilityConflict(candidate, selected) {
  const candidateId = canonical(candidate.ingredient_id);
  const candidateName = canonical(candidate.display_name);
  const candidateBlocks = new Set((candidate.incompatibilities || []).map(canonical));
  return selected.some((entry) => {
    const selectedId = canonical(entry.ingredient_id);
    const selectedName = canonical(entry.display_name);
    const selectedBlocks = new Set((entry.incompatibilities || []).map(canonical));
    return candidateBlocks.has(selectedId)
      || candidateBlocks.has(selectedName)
      || selectedBlocks.has(candidateId)
      || selectedBlocks.has(candidateName);
  });
}

function compatibilityTrace(candidate, selected) {
  return {
    status: hasCompatibilityConflict(candidate, selected) ? "blocked" : "passed",
    checkedAgainst: selected.map((entry) => ({ ingredientId: entry.ingredient_id, displayName: entry.display_name })),
    candidateIncompatibilities: [...(candidate.incompatibilities || [])],
  };
}

/**
 * Selects a small, auditable set of approved research candidates beneath an
 * already-safe category. It does not alter routine steps, make a product/dose
 * claim, or accept retrieval/LLM output as an input.
 */
export function selectApprovedIngredientCandidates({
  enabled = false,
  repository = null,
  routine = null,
  concern = "",
  environment = null,
  reactivityLevel = "low",
  selectionMap = null,
} = {}) {
  if (!enabled) {
    return {
      status: "disabled",
      registryVersion: getRuntimePolicy().policyVersion,
      entries: [],
      pool: [],
      notices: ["Approved ingredient candidate selection is disabled by server configuration."],
      boundary: "Routine steps remain broad categories. No named ingredient candidate is shown.",
    };
  }

  if (!repository || typeof repository.listIngredients !== "function" || typeof repository.listSources !== "function") {
    return {
      status: "knowledge_base_unavailable",
      registryVersion: getRuntimePolicy().policyVersion,
      entries: [],
      pool: [],
      notices: ["No dynamic approved knowledge base is available for candidate selection."],
      boundary: "Routine steps remain broad categories. No named ingredient candidate is shown.",
    };
  }
  // Normalise the optional LLM selection map (category id/title -> ingredient id).
  const wantByCategory = new Map();
  if (selectionMap && typeof selectionMap === "object") {
    for (const [key, value] of Object.entries(selectionMap)) {
      const id = canonical(value);
      if (id) wantByCategory.set(canonical(key), id);
    }
  }

  // Concern determines the safe category routine upstream. Candidate selection
  // then resolves each resulting category against the complete approved
  // database, rather than accidentally excluding a valid category record that
  // is tagged to a broader research context.
  const policy = getRuntimePolicy();
  const eligibleCategories = new Set(policy.ingredientSelection.eligibleCategories);
  const highReactivityAllowedCategories = new Set(policy.ingredientSelection.highReactivityAllowedCategories);
  const highReactivity = ["moderate", "high"].includes(canonical(reactivityLevel));
  const sourceById = new Map(
    repository.listSources()
      .filter((source) => SELECTABLE_STATES.has(source.approval_state))
      .map((source) => [source.source_id, source]),
  );
  const ingredients = repository.listIngredients()
    .filter((ingredient) => (
      SELECTABLE_STATES.has(ingredient.approval_state)
      && ingredient.routine_selection_allowed === true
      && (ingredient.source_ids || []).length > 0
      && (ingredient.source_ids || []).every((sourceId) => sourceById.has(sourceId))
    ));
  const seen = new Set();
  const selectedRecords = [];
  const entries = [];
  const pool = [];
  let usedLlmPick = false;

  for (const step of structuredRoutineSteps(routine)) {
    const categoryId = canonical(step.id);
    if (!eligibleCategories.has(categoryId)) continue;
    if (highReactivity && !highReactivityAllowedCategories.has(categoryId)) continue;

    // The RAG-approved candidate pool for this category: every approved,
    // unused, compatible ingredient tagged to it. This is the LLM's choice set.
    const eligible = ingredients.filter((record) => (
      !seen.has(record.ingredient_id)
      && (record.categories || []).map(canonical).includes(categoryId)
      && !hasCompatibilityConflict(record, selectedRecords)
    ));
    pool.push({
      categoryId,
      categoryTitle: step.title,
      phase: step.phase,
      candidates: eligible.map((record) => ({ ingredientId: record.ingredient_id, displayName: record.display_name })),
    });
    if (!eligible.length) continue;

    // Prefer the LLM's grounded pick when it is a valid member of this pool;
    // otherwise fall back to the deterministic first eligible candidate.
    let ingredient = null;
    let selectedBy = "deterministic";
    const wanted = wantByCategory.get(categoryId) || wantByCategory.get(canonical(step.title));
    if (wanted) {
      const match = eligible.find((record) => canonical(record.ingredient_id) === wanted);
      if (match) { ingredient = match; selectedBy = "llm_from_rag_pool"; usedLlmPick = true; }
    }
    if (!ingredient) ingredient = eligible[0];

    seen.add(ingredient.ingredient_id);
    const compatibility = compatibilityTrace(ingredient, selectedRecords);
    selectedRecords.push(ingredient);
    const entry = {
      ingredientId: ingredient.ingredient_id,
      displayName: ingredient.display_name,
      inciNames: [...ingredient.inci_names],
      categoryId,
      categoryTitle: step.title,
      phase: step.phase,
      selectedBy,
      sourceRecords: sourceLinks(ingredient, sourceById),
      approval: {
        status: ingredient.approval_state,
        recordVersion: ingredient.version,
        registryVersion: policy.policyVersion,
        selectionAuthority: selectedBy === "llm_from_rag_pool"
          ? "LLM selection constrained to the approved RAG candidate pool, then deterministically re-validated"
          : "approved/published database record matched to an existing safe category",
      },
      rationale: candidateReason(categoryId, environment, policy),
      selectionTrace: {
        category: { id: categoryId, title: step.title, phase: step.phase },
        databaseQuery: {
          approvalStates: [...SELECTABLE_STATES],
          routineSelectionAllowed: true,
          requiredCategoryId: categoryId,
          concernInput: canonical(concern) || null,
        },
        poolSize: eligible.length,
        selectedBy,
        selectedRecord: {
          ingredientId: ingredient.ingredient_id,
          version: ingredient.version,
          approvalState: ingredient.approval_state,
        },
        sourceLinks: sourceLinks(ingredient, sourceById),
        compatibility,
      },
      limitations: [
        "Named recommendation selected from the approved, published knowledge base for this safety-cleared category.",
        "The recommendation uses no product, dose, or frequency instruction and remains subject to the deterministic compatibility checks.",
      ],
    };
    // Ingredient-level SHAP attribution (why this ingredient for this category).
    entry.attribution = buildIngredientAttribution({ environment, entry });
    entries.push(entry);
    if (entries.length >= policy.ingredientSelection.maxCandidatesPerRun) break;
  }

  return {
    status: entries.length ? "available" : "no_eligible_candidate",
    registryVersion: policy.policyVersion,
    selectionMode: usedLlmPick ? "llm_from_rag_pool" : "deterministic_first_match",
    entries: clone(entries),
    pool,
    notices: entries.length
      ? [usedLlmPick
        ? "LLM selected ingredients from the approved RAG candidate pool; every pick was deterministically re-validated against the incompatibility matrix."
        : "Approved database ingredients were matched to the safety-cleared AM/PM categories."]
      : ["No approved database candidate matched the already-safe categories and selected research context."],
    boundary: "Every named recommendation is linked to an approved database record and its source evidence.",
  };
}

