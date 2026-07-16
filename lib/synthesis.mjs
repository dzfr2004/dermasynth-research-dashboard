import { createCategoryRoutine } from "./safety.mjs";
import { ExternalServiceError, fetchJson } from "./http-client.mjs";

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

export async function synthesizeRoutine({ config, profile, concern, environment, evidence }) {
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
    generation: "openai-allowlisted-selection",
  });
  routine.generation.selectionEvidenceIds = selection.evidenceIds;
  routine.generation.aiRationale = buildAiCategoryRationale({
    rationaleTags: selection.rationaleTags,
    includeHydration: selection.includeHydration,
    evidenceIds: selection.evidenceIds,
  });
  return routine;
}
