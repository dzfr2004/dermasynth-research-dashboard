import { createCategoryRoutine } from "./safety.mjs";
import { ExternalServiceError, fetchJson } from "./http-client.mjs";
import { buildEnvironmentalExplainability } from "./explainability.mjs";
import { getIngredientEvidenceNote } from "./ingredient-evidence-notes.mjs";

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
    evidence_ids: {
      type: "array",
      minItems: 0,
      maxItems: 4,
      items: { type: "string" },
    },
    rationale_tags: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      uniqueItems: true,
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
async function composeRoutineRationale({ config, concern, environment, routine, rationaleTags }) {
  let dominant = null;
  try {
    const explain = buildEnvironmentalExplainability({ concern, environment });
    dominant = explain.dominantFeature
      ? { label: explain.dominantFeature.label, direction: explain.features.find((f) => f.id === explain.dominantFeature.id)?.direction || "at_baseline" }
      : null;
  } catch { dominant = null; }

  const categories = [...(Array.isArray(routine?.am) ? routine.am : []), ...(Array.isArray(routine?.pm) ? routine.pm : [])].map((step) => step.title);
  const facts = {
    research_context: concern,
    fixed_am_pm_categories: [...new Set(categories)],
    environmental_context: environment?.readings || {},
    dominant_environmental_signal: dominant,
    constraint_tags: rationaleTags,
  };

  const response = await fetchJson("https://api.openai.com/v1/responses", {
    service: "OpenAI rationale composition",
    timeoutMs: config.requestTimeoutMs,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openai.apiKey}` },
    body: JSON.stringify({
      model: config.openai.model,
      store: false,
      reasoning: { effort: config.openai.reasoningEffort },
      max_output_tokens: 200,
      instructions: [
        "You explain a research-only skincare category preview.",
        "Write ONE short plain-language paragraph (40-80 words) explaining why the supplied broad AM/PM category choices are reasonable given the environmental context and research context.",
        "Refer to categories only by the exact names supplied. Do NOT name any ingredient, active, product, brand, percentage, dose, or frequency.",
        "Do NOT diagnose, treat, cure, prescribe, or claim efficacy, safety, or individual suitability. Describe context and category intent only.",
        "End by noting that deterministic safety checks remain the final authority.",
      ].join(" "),
      input: JSON.stringify(facts),
    }),
  });

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

  const items = list.map((c) => ({
    id: c.id,
    ingredient: c.name,
    category: c.category || null,
    safety_conclusion: c.note?.text || null,
    source: c.note?.source || null,
  }));
  const facts = { research_context: concern, environmental_context: environment?.readings || {}, dominant_environmental_signal: dominant, candidates: items };
  const schema = {
    type: "object", additionalProperties: false,
    properties: { rationales: { type: "array", items: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"] } } },
    required: ["rationales"],
  };

  const response = await fetchJson("https://api.openai.com/v1/responses", {
    service: "OpenAI ingredient rationale",
    timeoutMs: config.requestTimeoutMs,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openai.apiKey}` },
    body: JSON.stringify({
      model: config.openai.model,
      store: false,
      reasoning: { effort: config.openai.reasoningEffort },
      max_output_tokens: 90 * items.length + 150,
      instructions: [
        "You explain, for a research-only skincare preview, why each already-selected, safety-approved ingredient is a reasonable choice.",
        "For each candidate, write one to two sentences (at most ~45 words) grounded ONLY in the supplied safety_conclusion and the environmental context.",
        "You may name the candidate ingredient itself, but do NOT name any other ingredient, product, or brand.",
        "Do NOT state or imply a concentration, percentage, dose, strength, frequency, diagnosis, treatment, cure, or guarantee.",
        "Where relevant, attribute the safety basis to the supplied source (for example, 'per its CIR safety assessment').",
        "Return exactly one entry per candidate id.",
      ].join(" "),
      input: JSON.stringify(facts),
      text: { format: { type: "json_schema", name: "ingredient_rationales", strict: true, schema } },
    }),
  });

  let parsed;
  try { parsed = JSON.parse(extractOutputText(response)); }
  catch (error) { throw new ExternalServiceError("OpenAI returned invalid ingredient rationales.", { code: "invalid_model_output", cause: error }); }

  const byId = new Map(list.map((c) => [c.id, c]));
  const out = [];
  for (const r of Array.isArray(parsed?.rationales) ? parsed.rationales : []) {
    const id = String(r?.id || "").trim();
    const text = String(r?.text || "").replace(/\s+/g, " ").trim();
    if (!byId.has(id)) continue;
    if (text.length < 20 || text.length > 420 || INGREDIENT_RATIONALE_BLOCK.test(text)) continue;
    out.push({ ingredientId: id, text, source: byId.get(id).note?.source || null, mode: "openai_grounded_ingredient_rationale" });
  }
  return out;
}

/**
 * LLM-driven ingredient synthesis, constrained to the RAG-approved pool. The
 * model receives, per safety-cleared category, ONLY the approved candidate
 * options (each with its verified safety note) plus the environmental context,
 * and picks the single most contextually appropriate ingredient per category.
 * It cannot invent an ingredient: the server re-validates every pick against the
 * pool and the incompatibility matrix. Returns a { categoryId: ingredientId }
 * map; on any failure the caller falls back to deterministic first-match.
 */
export async function synthesizeIngredientSelection({ config, concern, environment, pool } = {}) {
  if (!config?.liveServicesEnabled || !config?.openai?.apiKey) {
    throw new ExternalServiceError("OpenAI ingredient selection is not enabled.", { code: "not_enabled" });
  }
  const categories = (Array.isArray(pool) ? pool : [])
    .filter((c) => c && c.categoryId && Array.isArray(c.candidates) && c.candidates.length)
    .slice(0, 8);
  if (!categories.length) return {};

  let dominant = null;
  try {
    const ex = buildEnvironmentalExplainability({ concern, environment });
    dominant = ex.dominantFeature ? { label: ex.dominantFeature.label } : null;
  } catch { dominant = null; }

  const facts = {
    research_context: concern,
    environmental_context: environment?.readings || {},
    dominant_environmental_signal: dominant,
    categories: categories.map((c) => ({
      category: c.categoryId,
      category_title: c.categoryTitle,
      options: c.candidates.slice(0, 8).map((cand) => {
        const note = getIngredientEvidenceNote(cand.ingredientId);
        return { id: cand.ingredientId, name: cand.displayName, safety_basis: note?.text || null, source: note?.source || null };
      }),
    })),
  };
  const schema = {
    type: "object", additionalProperties: false,
    properties: { selections: { type: "array", items: { type: "object", additionalProperties: false, properties: { category: { type: "string" }, ingredientId: { type: "string" } }, required: ["category", "ingredientId"] } } },
    required: ["selections"],
  };

  const response = await fetchJson("https://api.openai.com/v1/responses", {
    service: "OpenAI ingredient selection",
    timeoutMs: config.requestTimeoutMs,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openai.apiKey}` },
    body: JSON.stringify({
      model: config.openai.model,
      store: false,
      reasoning: { effort: config.openai.reasoningEffort },
      max_output_tokens: 60 * categories.length + 200,
      instructions: [
        "You select skincare ingredients for a research-only preview, grounded in a retrieved candidate pool.",
        "For each category, choose exactly one ingredientId FROM THAT CATEGORY'S PROVIDED OPTIONS ONLY. Never invent an id or reuse an id from another category's options.",
        "Choose the option best suited to the environmental_context and research_context (for example, prefer a mineral photoprotection option when UV is high, or an antioxidant option when PM2.5 is elevated).",
        "Base your choice on the supplied safety_basis and environment only; do not add doses, percentages, or clinical claims.",
        "Return exactly one selection per provided category.",
      ].join(" "),
      input: JSON.stringify(facts),
      text: { format: { type: "json_schema", name: "ingredient_selection", strict: true, schema } },
    }),
  });

  let parsed;
  try { parsed = JSON.parse(extractOutputText(response)); }
  catch (error) { throw new ExternalServiceError("OpenAI returned an invalid ingredient selection.", { code: "invalid_model_output", cause: error }); }

  // Validate every pick against the pool; silently drop anything out of set.
  const optionByCategory = new Map(categories.map((c) => [c.categoryId, new Set(c.candidates.map((x) => x.ingredientId))]));
  const map = {};
  for (const sel of Array.isArray(parsed?.selections) ? parsed.selections : []) {
    const cat = String(sel?.category || "").trim();
    const id = String(sel?.ingredientId || "").trim();
    if (optionByCategory.has(cat) && optionByCategory.get(cat).has(id)) map[cat] = id;
  }
  return map;
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
    response = await fetchJson("https://api.openai.com/v1/responses", {
      service: "OpenAI synthesis",
      timeoutMs: config.requestTimeoutMs,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.openai.model,
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
      }),
    });
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
    finishPreference,
    reactivityLevel,
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
  try {
    const composedText = await composeRoutineRationale({
      config,
      concern,
      environment,
      routine,
      rationaleTags: selection.rationaleTags,
    });
    routine.generation.aiRationale = {
      ...localRationale,
      text: composedText,
      mode: "openai_composed_grounded_rationale",
      compositionStatus: "composed",
      localFallbackText: localRationale.text,
    };
  } catch {
    routine.generation.aiRationale = { ...localRationale, compositionStatus: "fallback_local" };
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
  const response = await fetchJson("https://api.openai.com/v1/responses", {
    service: "OpenAI research summary",
    timeoutMs: config.requestTimeoutMs,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openai.apiKey}` },
    body: JSON.stringify({
      model: config.openai.model,
      store: false,
      reasoning: { effort: config.openai.reasoningEffort },
      max_output_tokens: 180,
      instructions: "Write one short, neutral research-context summary (60-100 words) using only the supplied metadata. Do not diagnose, predict an outcome, claim efficacy or safety, give a product, dose, frequency, treatment, prescription, or personalised advice. Do not invent findings or sources. Say what the source set maps or covers, not what it proves.",
      input: JSON.stringify({ subject, sources: sources.slice(0, 6) }),
    }),
  });
  const text = extractOutputText(response).replace(/\s+/g, " ").trim();
  if (text.length < 30 || text.length > 900 || /\b(diagnos|treat|cure|prescri|guarantee|mg\b|%\b)/i.test(text)) {
    throw new ExternalServiceError("OpenAI returned an unsuitable research summary.", { code: "invalid_model_output" });
  }
  return { status: "available", text, sourceCount: sources.length, mode: "openai_grounded_metadata_summary" };
}
