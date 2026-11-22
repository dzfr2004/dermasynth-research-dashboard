import { getRuntimePolicy } from "./policy-store.mjs";
import { buildIngredientAttribution, rankScoredCandidates, scoreCandidate } from "./ingredient-explainability.mjs";
import { selectionExclusion } from "./kb-reference.mjs";
import { textureVotes, userFit } from "./personalisation.mjs";
import { rotateWithinBand } from "./rotation.mjs";

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
    sourceFamily: source.source_family,
    sourceType: source.source_type,
    year: source.published_year ?? null,
    identifiers: source.doi_or_pmid || null,
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

function unavailable(status, notice) {
  return {
    status,
    registryVersion: getRuntimePolicy().policyVersion,
    entries: [],
    pool: [],
    notices: [notice],
    boundary: "Routine steps remain broad categories. No named ingredient candidate is shown.",
  };
}

/**
 * Selects one approved ingredient per safety-cleared category.
 *
 * For each routine step:
 *   1. approved, selectable ingredients tagged to the category form the slot's
 *      membership (excluded, already-used and incompatible ones are removed);
 *   2. the slot's RETRIEVED pool is the members that the hybrid retriever
 *      surfaced for the slot query (if it surfaced none, every member is used
 *      and the pool is marked as a fallback);
 *   3. every pool candidate is scored with the additive candidate score;
 *   4. the language model's pick is used when it is a member of the pool,
 *      otherwise the top-scored candidate is used.
 *
 * `slotRetrieval` maps categoryId → retrieval result from
 * lib/candidate-retrieval.mjs. `selectionMap` maps categoryId → the model's
 * chosen ingredient id.
 */
export function selectApprovedIngredientCandidates({
  enabled = false,
  repository = null,
  routine = null,
  concern = "",
  concerns = [],
  environment = null,
  reactivityLevel = "low",
  profile = null,
  finishPreference = null,
  selectionMap = null,
  slotRetrieval = null,
  llmRequested = false,
  llmFailed = false,
  llmRejected = [],
  // Score-band rotation (lib/rotation.mjs). With no seed the top-scored
  // candidate is used, exactly as before.
  rotationSeed = null,
  recentPicks = null,
} = {}) {
  if (!enabled) return unavailable("disabled", "Approved ingredient candidate selection is disabled by server configuration.");
  if (!repository || typeof repository.listIngredients !== "function" || typeof repository.listSources !== "function") {
    return unavailable("knowledge_base_unavailable", "No dynamic approved knowledge base is available for candidate selection.");
  }

  const wantByCategory = new Map();
  if (selectionMap && typeof selectionMap === "object") {
    for (const [key, value] of Object.entries(selectionMap)) {
      const id = canonical(value);
      if (id) wantByCategory.set(canonical(key), id);
    }
  }

  const policy = getRuntimePolicy();
  const eligibleCategories = new Set(policy.ingredientSelection.eligibleCategories);
  const highReactivityAllowedCategories = new Set(policy.ingredientSelection.highReactivityAllowedCategories);
  const highReactivity = ["moderate", "high"].includes(canonical(reactivityLevel)) || ["moderate", "high"].includes(canonical(routine?.generation?.reactivityLevel));
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
      && !selectionExclusion(ingredient.ingredient_id)
    ));
  const byId = new Map(ingredients.map((record) => [record.ingredient_id, record]));
  const displayNames = new Map(ingredients.map((record) => [record.ingredient_id, record.display_name]));
  // The routine records the texture vote it was built with; recompute only for
  // callers that pass a routine without one.
  const texture = routine?.generation?.textureVote
    || textureVotes({ profile, finishPreference, concern: canonical(concern), readings: environment?.readings || {} });
  const fitReactivity = routine?.generation?.reactivityLevel || canonical(reactivityLevel) || "low";
  const seen = new Set();
  const selectedRecords = [];
  const entries = [];
  const pool = [];
  let usedLlmPick = false;

  for (const step of structuredRoutineSteps(routine)) {
    const categoryId = canonical(step.id);
    if (!eligibleCategories.has(categoryId)) continue;
    if (highReactivity && !highReactivityAllowedCategories.has(categoryId)) continue;
    if (entries.length >= policy.ingredientSelection.maxCandidatesPerRun) break;

    const members = ingredients.filter((record) => (
      !seen.has(record.ingredient_id)
      && (record.categories || []).map(canonical).includes(categoryId)
      && !hasCompatibilityConflict(record, selectedRecords)
    ));
    const retrieval = slotRetrieval instanceof Map ? slotRetrieval.get(categoryId) : null;
    const retrievedById = new Map((retrieval?.ranked || []).map((item) => [item.ingredientId, item]));
    const retrievedMembers = members.filter((record) => retrievedById.has(record.ingredient_id));
    const poolSource = !retrieval ? "approved_slot_no_retrieval" : retrievedMembers.length ? "retrieval" : "approved_slot_fallback";
    const poolRecords = retrievedMembers.length ? retrievedMembers : members;
    const ranked = rankScoredCandidates(poolRecords.map((record) => scoreCandidate({
      ingredientId: record.ingredient_id,
      categoryId,
      environment,
      retrieval: retrievedById.get(record.ingredient_id) || null,
      fit: userFit({ ingredientId: record.ingredient_id, concern: canonical(concern), concerns: (Array.isArray(concerns) ? concerns : []).map(canonical).filter(Boolean), concernContexts: record.concern_contexts, texture, reactivityLevel: fitReactivity }),
    })));

    const wanted = wantByCategory.get(categoryId) || wantByCategory.get(canonical(step.title)) || null;
    const rejectedPick = (Array.isArray(llmRejected) ? llmRejected : []).find((item) => canonical(item?.category) === categoryId);
    // "rejected_invalid_id": the model returned an id that is in no pool (an
    // invented ingredient). "rejected_not_in_pool": a real candidate, but from
    // another slot's pool or no longer eligible here.
    let llmPickStatus = !llmRequested
      ? "not_requested"
      : llmFailed
        ? "llm_call_failed"
        : wanted
        ? "rejected_not_in_pool"
        : rejectedPick
          ? (rejectedPick.reason === "not_in_any_pool" ? "rejected_invalid_id" : "rejected_not_in_pool")
          : "missing";
    let chosen = null;
    let selectedBy = "deterministic_top_score";
    if (wanted) {
      const match = ranked.find((item) => item.ingredientId === wanted);
      if (match) { chosen = match; selectedBy = "llm_from_rag_pool"; usedLlmPick = true; llmPickStatus = "accepted"; }
    }
    let rotation = null;
    if (!chosen && ranked.length) {
      const slotKey = `${step.phase}:${categoryId}`;
      const recent = typeof recentPicks?.get === "function" ? recentPicks.get(slotKey) : (recentPicks?.[slotKey] || []);
      const rotated = rotateWithinBand({ ranked, seed: rotationSeed, slotKey, recent });
      if (rotated) {
        rotation = rotated.trace;
        chosen = rotated.chosen;
        if (rotation.rotated) selectedBy = "rotation_within_score_band";
      }
    }
    if (!chosen) chosen = ranked[0] || null;

    const slot = {
      categoryId,
      categoryTitle: step.title,
      phase: step.phase,
      poolSource,
      retrieval: retrieval ? { mode: retrieval.mode, query: retrieval.query, notices: retrieval.notices || [] } : null,
      membersNotRetrieved: members.filter((record) => !retrievedById.has(record.ingredient_id)).map((record) => record.ingredient_id),
      candidates: ranked.map((item) => ({
        ingredientId: item.ingredientId,
        displayName: displayNames.get(item.ingredientId) || item.ingredientId,
        score: item.score,
        retrievalRank: item.retrieval?.rank ?? null,
        relevance: item.retrieval?.relevance ?? 0,
        userFit: item.fit?.value ?? null,
        fitReasons: (item.fit?.components || []).map((c) => c.reason),
      })),
      llmPick: wanted || (rejectedPick ? canonical(rejectedPick.ingredientId) : null),
      llmPickStatus,
      rotation,
    };
    pool.push(slot);
    if (!chosen) continue;

    const ingredient = byId.get(chosen.ingredientId);
    seen.add(ingredient.ingredient_id);
    const compatibility = compatibilityTrace(ingredient, selectedRecords);
    selectedRecords.push(ingredient);
    const attribution = buildIngredientAttribution({ selected: chosen, ranked, displayNames, selectedBy });
    entries.push({
      ingredientId: ingredient.ingredient_id,
      displayName: ingredient.display_name,
      inciNames: [...ingredient.inci_names],
      aliases: [...(ingredient.aliases || [])],
      incompatibilities: [...(ingredient.incompatibilities || [])],
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
          ? "LLM selection constrained to the retrieved, approved candidate pool, then deterministically re-validated"
          : selectedBy === "rotation_within_score_band"
            ? "seeded rotation among candidates within the score band of the top candidate in the retrieved, approved pool"
            : "highest candidate score in the retrieved, approved candidate pool",
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
        retrieval: slot.retrieval,
        poolSource,
        poolSize: ranked.length,
        selectedBy,
        llmPickStatus,
        rotation,
        selectedRecord: {
          ingredientId: ingredient.ingredient_id,
          version: ingredient.version,
          approvalState: ingredient.approval_state,
        },
        sourceLinks: sourceLinks(ingredient, sourceById),
        compatibility,
      },
      attribution: rotation ? { ...attribution, rotation } : attribution,
      userFit: chosen.fit || null,
      limitations: [
        "Named recommendation selected from the retrieved, approved knowledge-base pool for this safety-cleared category.",
        "The recommendation uses no product, dose, or frequency instruction and remains subject to the deterministic compatibility checks.",
      ],
    });
  }

  return {
    status: entries.length ? "available" : "no_eligible_candidate",
    registryVersion: policy.policyVersion,
    selectionMode: usedLlmPick ? "llm_from_rag_pool" : entries.some((entry) => entry.selectedBy === "rotation_within_score_band") ? "rotation_within_score_band" : "deterministic_top_score",
    entries: clone(entries),
    pool,
    notices: entries.length
      ? [usedLlmPick
        ? "The language model chose ingredients from each slot's retrieved, approved pool; every pick was re-validated and passed the post-selection safety pass."
        : rotationSeed !== null && rotationSeed !== undefined && rotationSeed !== ""
          ? "Each slot's ingredient was drawn from the candidates within 0.05 of the top score in its retrieved, approved pool, favouring higher scores and ingredients not shown recently."
          : "The highest-scoring ingredient in each slot's retrieved, approved pool was selected."]
      : ["No approved database candidate matched the already-safe categories and selected research context."],
    boundary: "Every named recommendation is linked to an approved database record and its source evidence.",
  };
}
