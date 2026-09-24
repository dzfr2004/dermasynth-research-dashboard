import { callResponses, parseStructuredOutput } from "./openai.mjs";
import { tokenise } from "./bm25.mjs";
import { fetchJson } from "./http-client.mjs";

/**
 * Context Utilisation Evaluation (CUE).
 *
 * CUE measures how much of a model-written text is supported by the context
 * the model was given (retrieved evidence plus the run's facts):
 *
 *   CUE = supported claims / evaluated claims
 *
 * The text is split into sentence-level claims. Sentences that only restate
 * the system boundary ("deterministic safety checks remain the final
 * authority", "research preview", ...) and contain no number are counted as
 * framing and left out of the denominator; they are still reported.
 *
 * Two verification methods:
 *   - llm_judge: the model is asked, claim by claim, whether the claim can be
 *     inferred from the context alone (the faithfulness procedure used by
 *     RAGAS, Es et al., 2023). Falls back to lexical if the call fails.
 *   - lexical: a deterministic proxy. A claim is supported when at least 60%
 *     of its content words (after light stemming) occur in the context and
 *     every number it states also occurs in the context.
 *
 * Output below the threshold is regenerated with feedback, then withheld.
 */

export const LEXICAL_SUPPORT_THRESHOLD = 0.6;
const FRAMING = /(final authority|research[- ]only|research preview|non-clinical|not (?:a )?(?:clinical|medical|treatment) (?:advice|decision|recommendation)|does not replace|not a substitute)/i;
const READABLE_KEYS = new Map([
  ["uvi", "UV index"],
  ["pm25", "PM2.5"],
  ["humidity", "humidity"],
  ["temperature", "temperature"],
]);

function stem(token) {
  if (/^\d/.test(token)) return token;
  return token
    .replace(/(ations?|itions?)$/, "ate")
    .replace(/(ies)$/, "y")
    .replace(/(ing|ed|es|s|ly)$/, "")
    .replace(/(ive|al|ic)$/, "");
}

function numbersIn(text) {
  return (String(text).match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
}

export function splitClaims(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 3);
}

/** Turns a nested facts object into readable context sentences. */
export function flattenFacts(value, prefix = "") {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenFacts(item, prefix));
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => flattenFacts(item, READABLE_KEYS.get(key) || key.replaceAll("_", " ")));
  }
  return [`${prefix ? `${prefix}: ` : ""}${value}`];
}

function contextText({ facts = null, passages = [] }) {
  return [...flattenFacts(facts), ...passages.map((item) => (typeof item === "string" ? item : [item?.title, item?.text || item?.excerpt].filter(Boolean).join(". ")))].join("\n");
}

function lexicalVerdicts(claims, context) {
  const contextTokens = new Set(tokenise(context).map(stem));
  const contextNumbers = numbersIn(context);
  return claims.map((claim) => {
    const tokens = [...new Set(tokenise(claim).filter((token) => !/^\d/.test(token)).map(stem))];
    const found = tokens.filter((token) => contextTokens.has(token));
    const coverage = tokens.length ? found.length / tokens.length : 1;
    const numbers = numbersIn(claim);
    const missingNumbers = numbers.filter((n) => !contextNumbers.some((m) => Math.abs(m - n) < 0.051));
    const supported = coverage >= LEXICAL_SUPPORT_THRESHOLD && missingNumbers.length === 0;
    return {
      supported,
      support: Number(coverage.toFixed(3)),
      reason: supported
        ? `${found.length}/${tokens.length} content words found in the context`
        : missingNumbers.length
          ? `states number(s) not in the context: ${missingNumbers.join(", ")}`
          : `only ${found.length}/${tokens.length} content words found in the context`,
    };
  });
}

async function judgeVerdicts({ config, claims, context }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { index: { type: "integer" }, supported: { type: "boolean" }, reason: { type: "string" } },
          required: ["index", "supported", "reason"],
        },
      },
    },
    required: ["verdicts"],
  };
  const response = await callResponses(config, {
      store: false,
      reasoning: { effort: config.openai.reasoningEffort },
      max_output_tokens: 80 * claims.length + 200,
      instructions: [
        "You verify statements against a context. For each numbered statement decide whether it can be directly inferred from the CONTEXT alone.",
        "Mark supported=false if the statement adds any fact, number, cause, or claim that is not stated in or directly implied by the context. General background knowledge does not count as support.",
        "Give a short reason. Return one verdict per statement index.",
      ].join(" "),
      input: JSON.stringify({ context, statements: claims.map((text, index) => ({ index, text })) }),
      text: { format: { type: "json_schema", name: "cue_verdicts", strict: true, schema } },
    }, { service: "OpenAI CUE judge" });
  let raw = typeof response?.output_text === "string" ? response.output_text : "";
  if (!raw) {
    for (const item of response?.output || []) for (const content of item?.content || []) if (content?.type === "output_text") raw = content.text;
  }
  const parsed = parseStructuredOutput(raw, schema, "CUE judge");
  const byIndex = new Map((parsed?.verdicts || []).map((verdict) => [Number(verdict.index), verdict]));
  if (byIndex.size < claims.length) throw new Error("Judge returned incomplete verdicts.");
  return claims.map((_, index) => ({ supported: Boolean(byIndex.get(index)?.supported), support: byIndex.get(index)?.supported ? 1 : 0, reason: String(byIndex.get(index)?.reason || "").slice(0, 240) }));
}

/**
 * @returns {Promise<{score, threshold, passed, method, evaluatedClaims, supportedClaims, framingClaims, claims, unsupported}>}
 */
export async function evaluateCue({ config, text, facts = null, passages = [], threshold = config?.cueThreshold ?? 0.8, method = config?.cue?.method || "lexical" }) {
  const all = splitClaims(text);
  const framing = all.filter((claim) => FRAMING.test(claim) && !numbersIn(claim).length);
  const claims = all.filter((claim) => !framing.includes(claim));
  const context = contextText({ facts, passages });
  let usedMethod = "lexical";
  let verdicts;
  if (method === "llm_judge" && config?.liveServicesEnabled && config?.openai?.apiKey && claims.length) {
    try {
      verdicts = await judgeVerdicts({ config, claims, context });
      usedMethod = "llm_judge";
    } catch {
      verdicts = null;
      usedMethod = "lexical_fallback_after_judge_error";
    }
  }
  if (!verdicts) verdicts = lexicalVerdicts(claims, context);
  const detailed = claims.map((claim, index) => ({ text: claim, ...verdicts[index] }));
  const supportedClaims = detailed.filter((claim) => claim.supported).length;
  const score = claims.length ? Number((supportedClaims / claims.length).toFixed(3)) : 1;
  return {
    score,
    threshold,
    passed: score >= threshold,
    method: usedMethod,
    evaluatedClaims: claims.length,
    supportedClaims,
    framingClaims: framing.length,
    claims: detailed,
    framing,
    unsupported: detailed.filter((claim) => !claim.supported).map((claim) => claim.text),
  };
}

/**
 * Runs generate → CUE → (regenerate with feedback) → CUE. `generate(feedback)`
 * must return the candidate text. Returns the accepted text or null.
 */
export async function generateWithCue({ config, generate, facts, passages, maxRetries = config?.cue?.maxRetries ?? 1 }) {
  const attempts = [];
  let feedback = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const text = await generate(feedback);
    const cue = await evaluateCue({ config, text, facts, passages });
    attempts.push({ attempt: attempt + 1, score: cue.score, passed: cue.passed, method: cue.method, unsupported: cue.unsupported });
    if (cue.passed) return { text, cue: { ...cue, attempts, status: attempt ? "passed_after_regeneration" : "passed" } };
    feedback = cue.unsupported;
  }
  const last = attempts.at(-1);
  return { text: null, cue: { status: "withheld_below_threshold", score: last?.score ?? 0, threshold: config?.cueThreshold ?? 0.8, passed: false, method: last?.method, attempts, unsupported: last?.unsupported || [] } };
}

async function judgeBatch({ config, items }) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            verdicts: {
              type: "array",
              items: { type: "object", additionalProperties: false, properties: { index: { type: "integer" }, supported: { type: "boolean" }, reason: { type: "string" } }, required: ["index", "supported", "reason"] },
            },
          },
          required: ["id", "verdicts"],
        },
      },
    },
    required: ["items"],
  };
  const response = await callResponses(config, {
    store: false,
    reasoning: { effort: config.openai.reasoningEffort },
    max_output_tokens: 60 * items.reduce((sum, item) => sum + item.claims.length, 0) + 300,
    instructions: [
      "You verify statements against a context. Each item has its own CONTEXT and numbered statements.",
      "For each statement decide whether it can be directly inferred from that item's CONTEXT alone. Mark supported=false if it adds any fact, number, cause, mechanism or claim that the context does not state or directly imply. General background knowledge does not count as support.",
      "Return one verdict per statement index for every item id, with a short reason.",
    ].join(" "),
    input: JSON.stringify({ items: items.map((item) => ({ id: item.id, context: item.context, statements: item.claims.map((text, index) => ({ index, text })) })) }),
    text: { format: { type: "json_schema", name: "cue_batch_verdicts", strict: true, schema } },
  }, { service: "OpenAI CUE judge (batch)" });
  let raw = typeof response?.output_text === "string" ? response.output_text : "";
  if (!raw) for (const out of response?.output || []) for (const content of out?.content || []) if (content?.type === "output_text") raw = content.text;
  const parsed = parseStructuredOutput(raw, schema, "CUE judge (batch)");
  const byId = new Map((parsed?.items || []).map((item) => [String(item.id), new Map((item.verdicts || []).map((v) => [Number(v.index), v]))]));
  return byId;
}

/**
 * CUE for several texts at once (one judge call for all of them).
 * @param items [{ id, text, facts, passages }]
 * @returns Map id → CUE result (same shape as evaluateCue)
 */
export async function evaluateCueBatch({ config, items, threshold = config?.cueThreshold ?? 0.8, method = config?.cue?.method || "lexical" }) {
  const prepared = items.map((item) => {
    const all = splitClaims(item.text);
    const framing = all.filter((claim) => FRAMING.test(claim) && !numbersIn(claim).length);
    const claims = all.filter((claim) => !framing.includes(claim));
    return { ...item, claims, framing, context: contextText({ facts: item.facts, passages: item.passages || [] }) };
  });
  let judged = null;
  let usedMethod = "lexical";
  const evaluable = prepared.filter((item) => item.claims.length);
  if (method === "llm_judge" && config?.liveServicesEnabled && config?.openai?.apiKey && evaluable.length) {
    try {
      judged = await judgeBatch({ config, items: evaluable });
      usedMethod = "llm_judge";
    } catch {
      judged = null;
      usedMethod = "lexical_fallback_after_judge_error";
    }
  }
  const results = new Map();
  for (const item of prepared) {
    const verdictMap = judged?.get(String(item.id));
    const complete = verdictMap && item.claims.every((_, index) => verdictMap.has(index));
    const verdicts = complete
      ? item.claims.map((_, index) => ({ supported: Boolean(verdictMap.get(index).supported), support: verdictMap.get(index).supported ? 1 : 0, reason: String(verdictMap.get(index).reason || "").slice(0, 240) }))
      : lexicalVerdicts(item.claims, item.context);
    const detailed = item.claims.map((claim, index) => ({ text: claim, ...verdicts[index] }));
    const supportedClaims = detailed.filter((claim) => claim.supported).length;
    const score = item.claims.length ? Number((supportedClaims / item.claims.length).toFixed(3)) : 1;
    results.set(item.id, {
      score,
      threshold,
      passed: score >= threshold,
      method: complete ? usedMethod : (usedMethod === "llm_judge" ? "lexical_fallback_incomplete_judge" : usedMethod),
      evaluatedClaims: item.claims.length,
      supportedClaims,
      framingClaims: item.framing.length,
      unsupported: detailed.filter((claim) => !claim.supported).map((claim) => claim.text),
    });
  }
  return results;
}
