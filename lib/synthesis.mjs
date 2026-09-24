import { callResponses } from "./openai.mjs";
import { createCategoryRoutine } from "./safety.mjs";
import { ExternalServiceError, fetchJson } from "./http-client.mjs";
import { buildEnvironmentalExplainability } from "./explainability.mjs";
import { getIngredientEvidenceNote } from "./ingredient-evidence-notes.mjs";
import { functionalClass } from "./ingredient-evidence-corpus.mjs";
import { evaluateCue, evaluateCueBatch, generateWithCue } from "./cue.mjs";

// A composed rationale is plain language, but it must never introduce clinical
// claims, named actives, products, doses, or percentages. If the model output
// trips this scan it is discarded in favour of the local allowlisted text.
const RATIONALE_BLOCK = /\b(diagnos|treat(?:s|ment|ing)?|cure|prescri|dosage|dose|frequenc|guarantee|isotretinoin|tretinoin|adapalene|retinol|retinoid|benzoyl peroxide|niacinamide|ceramide|salicylic|glycolic|lactic acid|hyaluronic|azelaic|tranexamic|kojic|vitamin\s*[ce]|ascorbic|hydroquinone|spf\s*\d+|mg\b|%)/i;

// The per-ingredient rationale MAY name the approved candidate ingredient it
// describes, so it uses a narrower block that still forbids doses, strengths,
// and clinical claims (the "no other ingredient/product" rule is instructed).
const INGREDIENT_RATIONALE_BLOCK = /(\b(?:diagnos|treat|cure|prescrib|dosage|dose|frequenc|guarantee|isotretinoin|tretinoin|adapalene|hydroquinone)\w*)|(\bspf\s*\d+)|(\bmg\b)|(\bml\b)|(per\s*cent|percent)|%/i;

/**
 * The provider never supplies user-facing skincare prose. It can only select
 * the optional hydration category and cite IDs already admitted by retrieval.
 * The visible AM/PM routine is then assembled from the local allowlist.
 */
const ROUTINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    include_hydration: { type: "boolean" },
    // OpenAI strict structured output rejects uniqueItems (and older models
    // reject minItems/maxItems); limits and de-duplication are enforced in
    // normaliseSelection() instead.
    evidence_ids: {
      type: "array",
      items: { type: "string" },
    },
    rationale_tags: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "environment_context",
          "eligible_evidence",
          "fixed_category_structure",
          "conservative_hydration",
        ],
      },
    },
  },
  required: ["include_hydration", "evidence_ids", "rationale_tags"],
};

const ALLOWED_RATIONALE_TAGS = new Set([
  "environment_context",
  "eligible_evidence",
  "fixed_category_structure",
  "conservative_hydration",
]);

const QUOTA_COOLDOWN_MS = 10 * 60 * 1_000;
let quotaCooldownUntil = 0;

function quotaUnavailableError() {
  return new ExternalServiceError("OpenAI synthesis is temporarily unavailable because the API account has no available quota.", {
    status: 429,
    code: "insufficient_quota",
  });
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;

  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
      if (content?.type === "refusal") {
        throw new ExternalServiceError("OpenAI declined the synthesis request.", { code: "model_refusal" });
      }
    }
  }
  throw new ExternalServiceError("OpenAI did not return text output.", { code: "missing_model_output" });
}

function validEvidenceId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9._:#/-]{1,160}$/.test(id) ? id : "";
}

function normaliseSelection(payload, evidence) {
  if (!payload || typeof payload.include_hydration !== "boolean" || !Array.isArray(payload.evidence_ids) || !Array.isArray(payload.rationale_tags)) {
    throw new ExternalServiceError("OpenAI returned an invalid category selection.", { code: "invalid_model_output" });
  }

  const allowedEvidenceIds = new Set((Array.isArray(evidence) ? evidence : []).map((item) => validEvidenceId(item?.id)).filter(Boolean));
  const evidenceIds = [];
  const seen = new Set();
  for (const value of payload.evidence_ids) {
    const id = validEvidenceId(value);
    if (!id || !allowedEvidenceIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    evidenceIds.push(id);
    if (evidenceIds.length >= 4) break;
  }

  const rationaleTags = [];
  for (const tag of payload.rationale_tags) {
    if (!ALLOWED_RATIONALE_TAGS.has(tag) || rationaleTags.includes(tag)) continue;
    rationaleTags.push(tag);
    if (rationaleTags.length >= 4) break;
  }
  if (!rationaleTags.length) {
    throw new ExternalServiceError("OpenAI did not return an allowed rationale tag.", { code: "invalid_model_output" });
  }

  return { includeHydration: payload.include_hydration, evidenceIds, rationaleTags };
}

/**
 * User-facing wording remains local and allowlisted. The model can only emit
 * the constrained tags above; it never supplies free-text skincare advice.
 */
function buildAiCategoryRationale({ rationaleTags, includeHydration, evidenceIds }) {
  const factors = [];
  if (rationaleTags.includes("environment_context")) {
    factors.push("available environmental context was considered within the research-preview pipeline");
  }
  if (rationaleTags.includes("eligible_evidence")) {
    factors.push(evidenceIds.length
      ? "only already-eligible evidence identifiers were considered"
      : "no additional evidence identifier was selected beyond the permitted category template");
  }
  if (rationaleTags.includes("fixed_category_structure")) {
    factors.push("the AM/PM category structure remained fixed and locally allowlisted");
  }
  if (rationaleTags.includes("conservative_hydration")) {
    factors.push(includeHydration
      ? "the optional broad hydration category was selected as a conservative preview element"
      : "the optional broad hydration category was not selected");
  }

  return {
    status: "available",
    label: "AI category rationale",
    mode: "openai_structured_tags_with_local_allowlisted_copy",
    tags: rationaleTags,
    factors,
    text: `${factors.join("; ")}. Deterministic safety checks and the local category contract remain the final authority. This is not an ingredient, product, treatment, or suitability explanation.`,
  };
}

/**
 * Genuine LLM-composed rationale, tightly grounded and guardrailed. The model
 * receives only the already-decided fixed category names, the environmental
 * context, the dominant environmental Shapley signal, and the constraint tags,
 * then writes a short plain-language justification. It may not add ingredients,
 * products, doses, or clinical claims. Any violation raises and the caller
 * falls back to the local allowlisted text; deterministic safety (which also
 * scans this text) remains the final authority.
 */
function evidencePassages(evidence) {
  return (Array.isArray(evidence) ? evidence : []).slice(0, 4).map((item) => ({
    title: String(item?.title || "").slice(0, 180),
    text: String(item?.excerpt || "").slice(0, 600),
  })).filter((item) => item.title || item.text);
}

function routineRationaleFacts({ concern, environment, routine, rationaleTags }) {
  let dominant = null;
  try {
    const explain = buildEnvironmentalExplainability({ concern, environment });
    dominant = explain.dominantFeature
      ? { label: explain.dominantFeature.label, direction: explain.features.find((f) => f.id === explain.dominantFeature.id)?.direction || "at_baseline" }
      : null;
  } catch { dominant = null; }
  const categories = [...(Array.isArray(routine?.am) ? routine.am : []), ...(Array.isArray(routine?.pm) ? routine.pm : [])].map((step) => step.title);
  return {
    research_context: concern,
    fixed_am_pm_categories: [...new Set(categories)],
    environmental_context: environment?.readings || {},
    dominant_environmental_signal: dominant,
    constraint_tags: rationaleTags,
  };
}

async function composeRoutineRationale({ config, facts, passages, feedback = null }) {
  const response = await callResponses(config, {
      store: false,
      reasoning: { effort: config.openai.reasoningEffort },
      max_output_tokens: 200,
      instructions: [
        "You explain a research-only skincare category preview.",
        "Write ONE short plain-language paragraph (40-80 words) explaining why the supplied broad AM/PM category choices are reasonable given the environmental context and research context.",
        "Refer to categories only by the exact names supplied. Do NOT name any ingredient, active, product, brand, percentage, dose, or frequency.",
        "Do NOT diagnose, treat, cure, prescribe, or claim efficacy, safety, or individual suitability. Describe context and category intent only.",
        "Use ONLY the supplied facts and retrieved_evidence. Every statement must be traceable to them; do not add background knowledge, mechanisms, or numbers that are not supplied.",
        "End by noting that deterministic safety checks remain the final authority.",
        ...(Array.isArray(feedback) && feedback.length ? [`A previous draft contained statements that were not supported by the supplied facts: ${JSON.stringify(feedback.slice(0, 5))}. Remove or rewrite them so that every statement is supported.`] : []),
      ].join(" "),
      input: JSON.stringify({ ...facts, retrieved_evidence: passages }),
    }, { service: "OpenAI rationale composition" });

  const text = extractOutputText(response).replace(/\s+/g, " ").trim();
  if (text.length < 40 || text.length > 800 || RATIONALE_BLOCK.test(text)) {
    throw new ExternalServiceError("OpenAI returned an unsuitable composed rationale.", { code: "invalid_model_output" });
  }
  return text;
}

/**
 * Grounded, per-ingredient LLM rationale. For each already-selected, safety-
 * approved candidate, the model writes a short justification grounded ONLY in
 * that ingredient's supplied verified safety conclusion (its CIR/regulatory
 * note) and the environmental context. It may name the candidate itself but no
 * other ingredient/product, and it cannot state a dose, strength, or clinical
 * claim. One batched call returns all rationales; invalid items are dropped and
 * the caller falls back to the deterministic per-ingredient reason.
 */
export async function composeIngredientRationales({ config, concern, environment, candidates } = {}) {
  if (!config?.liveServicesEnabled || !config?.openai?.apiKey) {
    throw new ExternalServiceError("OpenAI ingredient rationale is not enabled.", { code: "not_enabled" });
  }
  const list = (Array.isArray(candidates) ? candidates : []).filter((c) => c && c.id && c.name).slice(0, 6);
  if (!list.length) return [];

  let dominant = null;
  try {
    const ex = buildEnvironmentalExplainability({ concern, environment });
    dominant = ex.dominantFeature
      ? { label: ex.dominantFeature.label, direction: ex.features.find((f) => f.id === ex.dominantFeature.id)?.direction || "at_baseline" }
      : null;
  } catch { dominant = null; }

  const itemFor = (c) => ({
    id: c.id,
    ingredient: c.name,
    category: c.category || null,
    safety_conclusion: c.note?.text || null,
    source: c.note?.source || null,
  });
  const schema = {
    type: "object", additionalProperties: false,
    properties: { rationales: { type: "array", items: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"] } } },
    required: ["rationales"],
  };

  const request = async (subset, feedback = null) => {
    const facts = { research_context: concern, environmental_context: environment?.readings || {}, dominant_environmental_signal: dominant, candidates: subset.map(itemFor) };
    const response = await callResponses(config, {
        store: false,
        reasoning: { effort: config.openai.reasoningEffort },
        max_output_tokens: 90 * subset.length + 150,
        instructions: [
          "You explain, for a research-only skincare preview, why each already-selected, safety-approved ingredient is a reasonable choice.",
          "For each candidate, write one to two sentences (at most ~45 words) grounded ONLY in the supplied safety_conclusion, category and environmental context. Do not add background knowledge, mechanisms or numbers that are not supplied.",
          "You may name the candidate ingredient itself, but do NOT name any other ingredient, product, or brand.",
          "Do NOT state or imply a concentration, percentage, dose, strength, frequency, diagnosis, treatment, cure, or guarantee.",
          "Where relevant, attribute the safety basis to the supplied source (for example, 'per its CIR safety assessment').",
          "Return exactly one entry per candidate id.",
          ...(feedback ? [`Previous drafts contained statements not supported by the supplied facts: ${JSON.stringify(feedback)}. Rewrite them so that every statement is supported.`] : []),
        ].join(" "),
        input: JSON.stringify(facts),
        text: { format: { type: "json_schema", name: "ingredient_rationales", strict: true, schema } },
      }, { service: "OpenAI ingredient rationale" });
    let parsed;
    try { parsed = JSON.parse(extractOutputText(response)); }
    catch (error) { throw new ExternalServiceError("OpenAI returned invalid ingredient rationales.", { code: "invalid_model_output", cause: error }); }
    return Array.isArray(parsed?.rationales) ? parsed.rationales : [];
  };

  const byId = new Map(list.map((c) => [c.id, c]));
  const accepted = new Map();
  const failed = new Map();
  const judge = async (rows, attempt) => {
    for (const r of rows) {
      const id = String(r?.id || "").trim();
      const text = String(r?.text || "").replace(/\s+/g, " ").trim();
      const candidate = byId.get(id);
      if (!candidate || accepted.has(id)) continue;
      if (text.length < 20 || text.length > 420 || INGREDIENT_RATIONALE_BLOCK.test(text)) continue;
      // CUE: the rationale may only use this ingredient's own facts.
      const cue = await evaluateCue({
        config,
        text,
        facts: { ingredient: candidate.name, category: candidate.category || null, research_context: concern, environmental_context: environment?.readings || {}, dominant_environmental_signal: dominant },
        passages: [{ title: candidate.note?.source || "", text: candidate.note?.text || "" }],
      });
      if (cue.passed) accepted.set(id, { ingredientId: id, text, source: candidate.note?.source || null, mode: "openai_grounded_ingredient_rationale", cue: { score: cue.score, method: cue.method, attempt, evaluatedClaims: cue.evaluatedClaims } });
      else failed.set(id, { unsupported: cue.unsupported, score: cue.score, method: cue.method });
    }
  };

  await judge(await request(list), 1);
  const retry = list.filter((c) => !accepted.has(c.id));
  if (retry.length && (config?.cue?.maxRetries ?? 1) > 0) {
    const feedback = retry.flatMap((c) => failed.get(c.id)?.unsupported || []).slice(0, 6);
    failed.clear();
    await judge(await request(retry, feedback.length ? feedback : null), 2);
  }
  const out = [...accepted.values()];
  out.withheld = [...failed.entries()].map(([ingredientId, detail]) => ({ ingredientId, ...detail }));
  return out;
}

/**
 * LLM-driven ingredient synthesis, constrained to the retrieved, approved
 * pool. For each safety-cleared category the model receives ONLY that slot's
 * pool (each option with its retrieval rank and verified safety note) plus the
 * environmental context, and picks one ingredient per category. It never sees
 * the rule-based candidate score, so agreement between the two can be
 * measured. Every pick is re-validated by the server.
 *
 * Returns { map: {categoryId: ingredientId}, raw: [...], rejected: [...] }.
 */
export async function synthesizeIngredientSelection({ config, concern, environment, pool, userContext = null } = {}) {
  if (!config?.liveServicesEnabled || !config?.openai?.apiKey) {
    throw new ExternalServiceError("OpenAI ingredient selection is not enabled.", { code: "not_enabled" });
  }
  const categories = (Array.isArray(pool) ? pool : [])
    .filter((c) => c && c.categoryId && Array.isArray(c.candidates) && c.candidates.length)
    .slice(0, 8);
  if (!categories.length) return { map: {}, raw: [], rejected: [] };

  let dominant = null;
  try {
    const ex = buildEnvironmentalExplainability({ concern, environment });
    dominant = ex.dominantFeature ? { label: ex.dominantFeature.label } : null;
  } catch { dominant = null; }

  const facts = {
    research_context: concern,
    environmental_context: environment?.readings || {},
    dominant_environmental_signal: dominant,
    user_context: userContext,
    categories: categories.map((c) => ({
      category: c.categoryId,
      category_title: c.categoryTitle,
      // C2: the model never sees the candidate score or any of its inputs
      // (retrieval rank, fit, EWG), and options are listed alphabetically, so
      // agreement with the score is an independent result, not an echo.
      options: [...c.candidates.slice(0, 8)].sort((a, b) => String(a.ingredientId).localeCompare(String(b.ingredientId))).map((cand) => {
        const note = getIngredientEvidenceNote(cand.ingredientId);
        return { id: cand.ingredientId, name: cand.displayName, function: functionalClass(cand.ingredientId) || null, safety_basis: note?.text || null, source: note?.source || null };
      }),
    })),
  };
  const schema = {
    type: "object", additionalProperties: false,
    properties: { selections: { type: "array", items: { type: "object", additionalProperties: false, properties: { category: { type: "string" }, ingredientId: { type: "string" } }, required: ["category", "ingredientId"] } } },
    required: ["selections"],
  };

  const response = await callResponses(config, {
      store: false,
      reasoning: { effort: config.openai.reasoningEffort },
      max_output_tokens: 60 * categories.length + 200,
      instructions: [
        "You select skincare ingredients for a research-only preview, grounded in a retrieved candidate pool.",
        "For each category, choose exactly one ingredientId FROM THAT CATEGORY'S PROVIDED OPTIONS ONLY. Never invent an id or reuse an id from another category's options.",
        "Choose the option best suited to the environmental_context, the research_context and the user_context (skin profile, finish preference, reactivity, and whether the routine should lean richer or lighter). Options are listed alphabetically; the order carries no meaning.",
        "Base your choice on each option's function and safety_basis and on those contexts only; do not add doses, percentages, or clinical claims.",
        "Return exactly one selection per provided category.",
      ].join(" "),
      input: JSON.stringify(facts),
      text: { format: { type: "json_schema", name: "ingredient_selection", strict: true, schema } },
    }, { service: "OpenAI ingredient selection" });

  let parsed;
  try { parsed = JSON.parse(extractOutputText(response)); }
  catch (error) { throw new ExternalServiceError("OpenAI returned an invalid ingredient selection.", { code: "invalid_model_output", cause: error }); }

  // Validate every pick against its own slot's pool; record rejects for the log.
  const optionByCategory = new Map(categories.map((c) => [c.categoryId, new Set(c.candidates.map((x) => x.ingredientId))]));
  const map = {};
  const raw = [];
  const rejected = [];
  for (const sel of Array.isArray(parsed?.selections) ? parsed.selections : []) {
    const cat = String(sel?.category || "").trim();
    const id = String(sel?.ingredientId || "").trim();
    raw.push({ category: cat, ingredientId: id });
    if (optionByCategory.has(cat) && optionByCategory.get(cat).has(id) && !map[cat]) map[cat] = id;
    else {
      const inAnotherPool = [...optionByCategory.values()].some((ids) => ids.has(id));
      rejected.push({ category: cat, ingredientId: id, reason: !optionByCategory.has(cat) ? "unknown_category" : inAnotherPool ? "in_another_category_pool" : "not_in_any_pool" });
    }
  }
  return { map, raw, rejected };
}

function synthesisInput({ profile, concern, environment, evidence }) {
  return {
    profile,
    concern,
    environment: environment?.readings || {},
    evidence: (Array.isArray(evidence) ? evidence : []).slice(0, 6).map((item) => ({
      id: validEvidenceId(item?.id),
      title: String(item?.title || "").slice(0, 180),
      source: String(item?.source || "").slice(0, 180),
      excerpt: String(item?.excerpt || "").slice(0, 900),
      claimCategory: String(item?.claimCategory || "").slice(0, 120),
      evidenceTier: String(item?.evidenceTier || "").slice(0, 120),
      jurisdiction: String(item?.jurisdiction || "").slice(0, 120),
    })).filter((item) => item.id),
  };
}

export async function synthesizeRoutine({
  config,
  profile,
  concern,
  environment,
  evidence,
  finishPreference,
  reactivityLevel,
  exposureContext,
}) {
  if (!config.liveServicesEnabled || !config.openai.apiKey) {
    throw new ExternalServiceError("OpenAI synthesis is not enabled.", { code: "not_enabled" });
  }
  if (Date.now() < quotaCooldownUntil) {
    throw quotaUnavailableError();
  }

  const input = synthesisInput({ profile, concern, environment, evidence });
  if (!input.evidence.length) {
    throw new ExternalServiceError("No eligible evidence was available for category selection.", { code: "insufficient_evidence" });
  }

  let response;
  try {
    response = await callResponses(config, {
        store: false,
        // This selection-only task does not need extended reasoning and keeps a
        // predictable upper bound on provider usage.
        reasoning: { effort: config.openai.reasoningEffort },
        max_output_tokens: 160,
        instructions: [
          "You are a constrained category-selection component in a research-only skincare prototype.",
          "Return only the requested JSON object. Do not write recommendations, sentences, ingredients, products, percentages, quantities, diagnoses, prescriptions, treatment claims, cures, or guarantees.",
          "Set include_hydration to true only when an extra broad hydration category is a conservative research-preview choice; otherwise false.",
          "Select zero to four evidence_ids only from the supplied IDs. Do not invent an ID. The application will generate all visible wording from a local category allowlist.",
          "Choose one to four rationale_tags only from the schema enum. Tags describe selection constraints, not efficacy, suitability, or advice.",
        ].join(" "),
        input: JSON.stringify(input),
        text: {
          format: {
            type: "json_schema",
            name: "dermasynth_category_selection",
            strict: true,
            schema: ROUTINE_SCHEMA,
          },
        },
      }, { service: "OpenAI synthesis" });
  } catch (error) {
    if (error instanceof ExternalServiceError && error.code === "insufficient_quota") {
      quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
    }
    throw error;
  }

  if (response?.status === "incomplete") {
    throw new ExternalServiceError("OpenAI did not complete the category selection.", { code: "incomplete_model_output" });
  }

  let parsed;
  try {
    parsed = JSON.parse(extractOutputText(response));
  } catch (error) {
    if (error instanceof ExternalServiceError) throw error;
    throw new ExternalServiceError("OpenAI returned invalid structured output.", { code: "invalid_model_output", cause: error });
  }

  const selection = normaliseSelection(parsed, evidence);
  const selectedEvidence = selection.evidenceIds.length
    ? evidence.filter((item) => selection.evidenceIds.includes(validEvidenceId(item?.id)))
    : evidence;
  const routine = createCategoryRoutine({
    concern,
    environment,
    evidence: selectedEvidence,
    includeHydration: selection.includeHydration,
    // These are locally validated, deterministic presentation modifiers. They
    // are intentionally not included in synthesisInput(), so the model cannot
    // see or influence them.
    profile,
    finishPreference,
    reactivityLevel,
    exposureContext,
    generation: "openai-allowlisted-selection",
  });
  routine.generation.selectionEvidenceIds = selection.evidenceIds;
  const localRationale = buildAiCategoryRationale({
    rationaleTags: selection.rationaleTags,
    includeHydration: selection.includeHydration,
    evidenceIds: selection.evidenceIds,
  });
  // Upgrade the local rationale to a genuinely LLM-composed, grounded paragraph
  // when possible. On any failure keep the deterministic local text.
  // The composed paragraph must pass the CUE gate: regenerated once with
  // feedback if too many of its statements are unsupported, then withheld.
  try {
    const facts = routineRationaleFacts({ concern, environment, routine, rationaleTags: selection.rationaleTags });
    const passages = evidencePassages(selectedEvidence);
    const { text: composedText, cue } = await generateWithCue({
      config,
      facts,
      passages,
      generate: (feedback) => composeRoutineRationale({ config, facts, passages, feedback }),
    });
    routine.generation.aiRationale = composedText
      ? {
        ...localRationale,
        text: composedText,
        mode: "openai_composed_grounded_rationale",
        compositionStatus: cue.status === "passed" ? "composed" : "composed_after_regeneration",
        localFallbackText: localRationale.text,
        cue,
      }
      : { ...localRationale, compositionStatus: "withheld_below_cue_threshold", cue };
  } catch {
    routine.generation.aiRationale = { ...localRationale, compositionStatus: "fallback_local", cue: { status: "not_evaluated_generation_failed" } };
  }
  return routine;
}

/**
 * Optional plain-language layer for the Atlas. It receives only approved
 * database metadata and source titles/locators—not user profiles, symptoms,
 * environmental readings, or copied source passages.
 */
export async function summarizeKnowledgeContext({ config, subject, sources = [] }) {
  if (!config.liveServicesEnabled || !config.openai.apiKey) {
    throw new ExternalServiceError("OpenAI research summaries are not enabled.", { code: "not_enabled" });
  }
  const response = await callResponses(config, {
      store: false,
      reasoning: { effort: config.openai.reasoningEffort },
      max_output_tokens: 180,
      instructions: "Write one short, neutral research-context summary (60-100 words) using only the supplied metadata. Do not diagnose, predict an outcome, claim efficacy or safety, give a product, dose, frequency, treatment, prescription, or personalised advice. Do not invent findings or sources. Say what the source set maps or covers, not what it proves.",
      input: JSON.stringify({ subject, sources: sources.slice(0, 6) }),
    }, { service: "OpenAI research summary" });
  const text = extractOutputText(response).replace(/\s+/g, " ").trim();
  if (text.length < 30 || text.length > 900 || /\b(diagnos|treat|cure|prescri|guarantee|mg\b|%\b)/i.test(text)) {
    throw new ExternalServiceError("OpenAI returned an unsuitable research summary.", { code: "invalid_model_output" });
  }
  return { status: "available", text, sourceCount: sources.length, mode: "openai_grounded_metadata_summary" };
}

// Step context may not name any ingredient; ingredient context may name only
// its own ingredient (checked against the other names in the run).
const STEP_CONTEXT_BLOCK = /\b(isotretinoin|tretinoin|adapalene|retinol|retinal|retinoid|benzoyl peroxide|niacinamide|ceramide|salicylic|glycolic|lactic acid|mandelic|hyaluron\w*|azelaic|tranexamic|kojic|vitamin\s*[ce]|ascorbic|tocopherol|resveratrol|zinc oxide|titanium dioxide|glycerin|squalane|dimethicone|hydroquinone)\b/i;
const CONTEXT_CLAIM_BLOCK = /\b(diagnos\w*|treat(?:s|ment|ing)?|cures?|prescri\w*|guarantee\w*|dosage|doses?|frequenc\w*|spf\s*\d+|mg|ml)\b/i;

// A percentage is only allowed when the same percentage appears in the facts
// the model was given (the humidity reading or a humidity threshold in a rule);
// anything else could read as a concentration.
function percentsIn(text) {
  return [...String(text || "").matchAll(/(\d+(?:\.\d+)?)\s*(?:%|per\s*cent|percent)/gi)].map((match) => Number(match[1]));
}

function hasDisallowedPercent(text, readings, factTexts = []) {
  const allowed = [Number(readings?.humidity), ...factTexts.flatMap(percentsIn)].filter(Number.isFinite);
  const found = percentsIn(text);
  if (/(?:%|per\s*cent|percent)/i.test(String(text)) && !found.length) return true;
  return found.some((value) => !allowed.some((ok) => Math.abs(ok - value) < 0.51));
}

/**
 * Plain-language context for every routine step and every named ingredient,
 * written by the model from the run's own facts (readings, the rule that added
 * each step, the retrieved pool and score comparison, the verified safety card,
 * the EWG reference) and checked with CUE. Items below the CUE threshold are
 * regenerated once with feedback; any still below it are withheld and the
 * template text stays.
 *
 * @param steps   [{ key, phase, title, purpose, rule }]
 * @param entries [{ key, name, phase, stepTitle, stepRule, facts: {...} }]
 */
export async function composeRoutineContext({ config, concernLabel, profile, environment, steps = [], entries = [] } = {}) {
  if (!config?.liveServicesEnabled || !config?.openai?.apiKey) {
    throw new ExternalServiceError("OpenAI routine context is not enabled.", { code: "not_enabled" });
  }
  const readings = environment?.readings || {};
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      steps: { type: "array", items: { type: "object", additionalProperties: false, properties: { key: { type: "string" }, text: { type: "string" } }, required: ["key", "text"] } },
      ingredients: { type: "array", items: { type: "object", additionalProperties: false, properties: { key: { type: "string" }, why_step: { type: "string" }, what_it_is: { type: "string" }, why_today: { type: "string" } }, required: ["key", "why_step", "what_it_is", "why_today"] } },
    },
    required: ["steps", "ingredients"],
  };

  const request = async (stepSubset, entrySubset, feedback = null) => {
    const response = await callResponses(config, {
      store: false,
      reasoning: { effort: config.openai.reasoningEffort },
      max_output_tokens: 110 * stepSubset.length + 220 * entrySubset.length + 300,
      instructions: [
        "You write short, plain-language context for a research-only skincare routine preview, for a lay reader.",
        "For each STEP write one or two sentences (at most 40 words) in warm, everyday English, speaking to the reader as \"you\", on what the step is for in their situation today, using plain_reason, its purpose, the rule that added it and the environmental readings. Do NOT name any ingredient, product or brand in step text, and avoid system words such as category, context, rule or threshold.",
        "For each INGREDIENT write three short fields for a lay reader, in warm, plain English, speaking to the reader as \"you\":",
        "why_step: one sentence (at most 30 words) on why this step is in today's routine.",
        "what_it_is: one sentence (at most 25 words) saying what kind of ingredient it is, based only on what_it_is_plain and functional_class. Describe what it is, never what it will do for the reader's skin.",
        "why_today: one or two sentences (at most 40 words) on why it suits the reader today, based only on why_today_plain, step_rule, fit_to_user, user_concern, skin_profile and the environmental readings.",
        "You may name that ingredient, but no other ingredient, product or brand. Avoid jargon (no scores, ranks, retrieval, CUE or database terms).",
        "Use ONLY the supplied facts. Do not add mechanisms, benefits, study results or numbers that are not supplied. Refer to readings with the exact numbers given.",
        "Do NOT state a concentration, percentage, dose, frequency, diagnosis, treatment, cure or guarantee, and do not claim the ingredient is suitable for this individual.",
        "Return exactly one entry per supplied key.",
        ...(feedback ? [`Previous drafts contained statements not supported by the facts: ${JSON.stringify(feedback.slice(0, 8))}. Rewrite so every statement is supported by the facts.`] : []),
      ].join(" "),
      input: JSON.stringify({
        research_context: concernLabel,
        skin_profile: profile,
        environmental_readings: readings,
        steps: stepSubset.map((step) => ({ key: step.key, phase: step.phase === "am" ? "morning" : "evening", step: step.title, purpose: step.purpose, rule: step.rule, plain_reason: step.plain || "" })),
        ingredients: entrySubset.map((entry) => ({ key: entry.key, ingredient: entry.name, phase: entry.phase === "am" ? "morning" : "evening", step: entry.stepTitle, step_rule: entry.stepRule, ...entry.facts })),
      }),
      text: { format: { type: "json_schema", name: "routine_context", strict: true, schema } },
    }, { service: "OpenAI routine context" });
    let parsed;
    try { parsed = JSON.parse(extractOutputText(response)); }
    catch (error) { throw new ExternalServiceError("OpenAI returned invalid routine context.", { code: "invalid_model_output", cause: error }); }
    return { parsed, model: response._model || config.openai.model };
  };

  const stepByKey = new Map(steps.map((step) => [step.key, step]));
  const entryByKey = new Map(entries.map((entry) => [entry.key, entry]));
  const otherNames = (entry) => entries.filter((other) => other.key !== entry.key).map((other) => other.name.toLowerCase());
  const accepted = { steps: new Map(), ingredients: new Map() };
  const failed = { steps: new Map(), ingredients: new Map() };
  // C1/C3: every draft the model returned, with its facts and CUE verdict, so
  // live runs can be reported and CUE can be compared with human ratings.
  const audit = [];
  let model = null;
  let retry = "not_needed";

  const judgeRound = async (parsed, attempt) => {
    const candidates = [];
    for (const row of Array.isArray(parsed?.steps) ? parsed.steps : []) {
      const step = stepByKey.get(String(row?.key || ""));
      const text = String(row?.text || "").replace(/\s+/g, " ").trim();
      if (!step || accepted.steps.has(step.key)) continue;
      if (text.length < 20 || text.length > 400 || STEP_CONTEXT_BLOCK.test(text) || CONTEXT_CLAIM_BLOCK.test(text) || hasDisallowedPercent(text, readings, [step.rule, step.purpose])) { failed.steps.set(step.key, { unsupported: [text], reason: "guardrail" }); audit.push({ id: `step:${step.key}`, kind: "step", key: step.key, attempt, text, verdict: "blocked_by_guardrail", cue: null }); continue; }
      candidates.push({ id: `step:${step.key}`, kind: "steps", key: step.key, text, value: text, facts: { research_context: concernLabel, skin_profile: profile, environmental_readings: readings, phase: step.phase === "am" ? "morning" : "evening", step: step.title, purpose: step.purpose, rule: step.rule, plain_reason: step.plain || "" } });
    }
    for (const row of Array.isArray(parsed?.ingredients) ? parsed.ingredients : []) {
      const entry = entryByKey.get(String(row?.key || ""));
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const whyStep = clean(row?.why_step);
      const whatItIs = clean(row?.what_it_is);
      const whyToday = clean(row?.why_today);
      const whyIngredient = `${whatItIs} ${whyToday}`.trim();
      if (!entry || accepted.ingredients.has(entry.key)) continue;
      const combined = `${whyStep} ${whatItIs} ${whyToday}`;
      const namesOther = otherNames(entry).some((name) => combined.toLowerCase().includes(name));
      if (whyStep.length < 15 || whatItIs.length < 10 || whyToday.length < 15 || combined.length > 800 || CONTEXT_CLAIM_BLOCK.test(combined) || hasDisallowedPercent(combined, readings, [entry.stepRule]) || namesOther) { failed.ingredients.set(entry.key, { unsupported: [combined], reason: "guardrail" }); audit.push({ id: `ing:${entry.key}`, kind: "ingredient", key: entry.key, attempt, text: combined, verdict: "blocked_by_guardrail", cue: null }); continue; }
      candidates.push({ id: `ing:${entry.key}`, kind: "ingredients", key: entry.key, text: combined, value: { whyThisStep: whyStep, whyThisIngredient: whyIngredient, whatItIs, whyToday }, facts: { research_context: concernLabel, skin_profile: profile, environmental_readings: readings, ingredient: entry.name, step: entry.stepTitle, step_rule: entry.stepRule, ...entry.facts }, passages: entry.passages || [] });
    }
    if (!candidates.length) return;
    const cues = await evaluateCueBatch({ config, items: candidates.map((item) => ({ id: item.id, text: item.text, facts: item.facts, passages: item.passages })) });
    for (const item of candidates) {
      const cue = cues.get(item.id);
      const record = { cue: { score: cue.score, method: cue.method, attempt, evaluatedClaims: cue.evaluatedClaims, supportedClaims: cue.supportedClaims } };
      audit.push({ id: item.id, kind: item.kind === "steps" ? "step" : "ingredient", key: item.key, attempt, text: item.text, facts: item.facts, passages: item.passages || [], verdict: cue.passed ? "passed" : "below_threshold", cue: { score: cue.score, method: cue.method, unsupported: cue.unsupported || [] } });
      if (cue.passed) {
        accepted[item.kind].set(item.key, item.kind === "steps" ? { text: item.value, ...record } : { ...item.value, ...record });
        failed[item.kind].delete(item.key);
      } else {
        failed[item.kind].set(item.key, { unsupported: cue.unsupported, score: cue.score, method: cue.method });
      }
    }
  };

  const first = await request(steps, entries);
  model = first.model;
  await judgeRound(first.parsed, 1);
  const retrySteps = steps.filter((step) => !accepted.steps.has(step.key));
  const retryEntries = entries.filter((entry) => !accepted.ingredients.has(entry.key));
  if ((retrySteps.length || retryEntries.length) && (config?.cue?.maxRetries ?? 1) > 0) {
    const feedback = [...failed.steps.values(), ...failed.ingredients.values()].flatMap((item) => item.unsupported || []).slice(0, 8);
    // A failed or out-of-budget retry must not discard what already passed.
    try {
      const second = await request(retrySteps, retryEntries, feedback);
      model = second.model;
      await judgeRound(second.parsed, 2);
      retry = "completed";
    } catch (error) {
      retry = error?.code === "budget_exhausted" ? "skipped_budget" : "failed";
    }
  }
  return {
    model,
    retry,
    audit,
    steps: Object.fromEntries(accepted.steps),
    ingredients: Object.fromEntries(accepted.ingredients),
    withheld: [
      ...steps.filter((step) => !accepted.steps.has(step.key)).map((step) => {
        const detail = failed.steps.get(step.key);
        return { kind: "step", key: step.key, score: detail?.score ?? null, reason: detail ? (detail.reason || "below_cue_threshold") : "not_returned" };
      }),
      ...entries.filter((entry) => !accepted.ingredients.has(entry.key)).map((entry) => {
        const detail = failed.ingredients.get(entry.key);
        return { kind: "ingredient", key: entry.key, score: detail?.score ?? null, reason: detail ? (detail.reason || "below_cue_threshold") : "not_returned" };
      }),
    ],
  };
}
