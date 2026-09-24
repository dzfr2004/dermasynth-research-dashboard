import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { ExternalServiceError } from "./http-client.mjs";

/**
 * Single entry point for every OpenAI Responses call.
 *
 * - Model fallback: tries OPENAI_MODEL, then OPENAI_FALLBACK_MODELS in order,
 *   when a model is not available to this key (new accounts on a low usage
 *   tier often cannot use the newest model yet). The first model that works
 *   is remembered for the rest of the process.
 * - Reasoning retry: if a model rejects the `reasoning` setting, the call is
 *   repeated without it and that is remembered for the model.
 * - Own timeout (OPENAI_TIMEOUT_MS, default 30 s): batched explanation calls
 *   take longer than the 9 s used for weather and Pinecone.
 * - Time budget (C4): a caller may attach a budget (createGptBudget) as
 *   config.openai.budget. Each call's timeout is capped by the time left,
 *   and no call starts once less than MIN_CALL_MS remains, so a routine never
 *   waits on GPT for longer than its budget. Exhaustion is recorded on the
 *   budget so the response can carry a "degraded" flag.
 * - Errors are written to data/logs/provider-errors.jsonl (never the key) and
 *   the latest one is exposed through /api/health, so a silent fallback to
 *   local text can always be traced.
 */

const MIN_CALL_MS = 1500;

/** A shared deadline for every GPT call made while serving one request. */
export function createGptBudget(totalMs, { disabled = false } = {}) {
  const startedAt = Date.now();
  const budget = {
    totalMs,
    // disabled: the user asked for the standard (rule-based) routine, so every
    // GPT call in this request is skipped without contacting OpenAI.
    disabled,
    startedAt,
    exhausted: false,
    skipped: [],
    timedOut: [],
    calls: 0,
    remaining: () => Math.max(0, totalMs - (Date.now() - startedAt)),
    usedMs: () => Date.now() - startedAt,
  };
  return budget;
}

const budgetStore = new AsyncLocalStorage();

/** Runs `fn` so that every GPT call inside it (at any depth) shares `budget`. */
export function runWithGptBudget(budget, fn) {
  return budgetStore.run(budget, fn);
}

/** The budget shared by the current request, if any. */
export function currentGptBudget() {
  return budgetStore.getStore() || null;
}

export function budgetSummary(budget) {
  if (!budget) return null;
  return { disabled: Boolean(budget.disabled), totalMs: Number.isFinite(budget.totalMs) ? budget.totalMs : null, usedMs: budget.usedMs(), calls: budget.calls, exhausted: budget.exhausted, skipped: [...budget.skipped], timedOut: [...budget.timedOut] };
}

const unavailableModels = new Set();
const noReasoningModels = new Set();
let activeModel = null;
let lastError = null;
let lastSuccess = null;

function modelList(config) {
  const models = [config.openai.model, ...(config.openai.fallbackModels || [])].map((m) => String(m || "").trim()).filter(Boolean);
  const unique = [...new Set(models)];
  if (activeModel && unique.includes(activeModel)) return [activeModel, ...unique.filter((m) => m !== activeModel)];
  return unique;
}

function isModelUnavailable(status, code, message) {
  if (status === 404 || code === "model_not_found") return true;
  if ((status === 400 || status === 403) && /model/i.test(message) && /(not (?:be )?available|does not exist|not found|do not have access|not supported|invalid model)/i.test(message)) return true;
  return false;
}

async function logProviderError(config, record) {
  lastError = record;
  try {
    const path = resolve(process.cwd(), config.openai.errorLogPath || "data/logs/provider-errors.jsonl");
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // Logging is best effort.
  }
  console.error(`[openai] ${record.service} · model ${record.model} · HTTP ${record.status ?? "-"} · ${record.code}${record.message ? ` · ${record.message}` : ""}`);
}

async function post(config, body, service) {
  const budget = config.openai.budget || budgetStore.getStore() || null;
  if (budget?.disabled) {
    budget.skipped.push(service);
    throw new ExternalServiceError(`${service} was skipped: the standard routine was requested.`, { code: "skipped_standard_routine" });
  }
  const baseTimeout = config.openai.timeoutMs || 30_000;
  if (budget && budget.remaining() < MIN_CALL_MS) {
    budget.exhausted = true;
    budget.skipped.push(service);
    throw new ExternalServiceError(`${service} was skipped: the GPT time budget for this request is used up.`, { code: "budget_exhausted" });
  }
  const limitMs = budget ? Math.min(baseTimeout, budget.remaining()) : baseTimeout;
  const cappedByBudget = Boolean(budget) && limitMs < baseTimeout;
  if (budget) budget.calls += 1;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), limitMs);
  try {
    const response = await fetch(`${(config.openai.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "")}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openai.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
      const message = String(data?.error?.message || "").replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-…").slice(0, 300);
      const code = String(data?.error?.code || data?.error?.type || "http_error");
      const error = new ExternalServiceError(`${service} is unavailable.`, { status: response.status, code: /^[a-z][a-z0-9_-]{0,99}$/i.test(code) ? code : "http_error" });
      error.providerMessage = message;
      throw error;
    }
    if (data === null) throw new ExternalServiceError(`${service} returned an invalid response.`, { status: response.status, code: "invalid_json" });
    return data;
  } catch (error) {
    if (error instanceof ExternalServiceError) throw error;
    if (error?.name === "AbortError") {
      if (cappedByBudget) { budget.exhausted = true; budget.timedOut.push(service); }
      throw new ExternalServiceError(`${service} timed out.`, { code: cappedByBudget ? "budget_exhausted" : "timeout", cause: error });
    }
    throw new ExternalServiceError(`${service} could not be reached.`, { code: "network_error", cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @param {object} config  createConfig() output
 * @param {object} body    Responses API body WITHOUT `model` (it is filled in)
 * @param {{service: string}} options
 */
export async function callResponses(config, body, { service = "OpenAI" } = {}) {
  if (!config?.openai?.apiKey) throw new ExternalServiceError("OpenAI is not configured.", { code: "not_enabled" });
  let lastFailure = null;
  for (const model of modelList(config)) {
    if (unavailableModels.has(model)) continue;
    let request = { ...body, model };
    if (noReasoningModels.has(model)) {
      request = { ...request, max_output_tokens: Math.max(1600, (request.max_output_tokens || 400) * 4) };
      delete request.reasoning;
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        let data = await post(config, request, service);
        // A reasoning model can spend the whole output budget on reasoning and
        // return no text. Retry once with a larger budget.
        if (data?.status === "incomplete" && data?.incomplete_details?.reason === "max_output_tokens") {
          request = { ...request, max_output_tokens: Math.max(1600, (request.max_output_tokens || 400) * 4) };
          data = await post(config, request, service);
        }
        if (activeModel !== model) activeModel = model;
        lastSuccess = { at: new Date().toISOString(), service, model };
        return { ...data, _model: model };
      } catch (error) {
        const status = error?.status ?? null;
        const code = error?.code || "error";
        const message = error?.providerMessage || "";
        await logProviderError(config, { at: new Date().toISOString(), service, model, status, code, message });
        lastFailure = error;
        if (attempt === 0 && request.reasoning && status === 400 && /reasoning/i.test(message)) {
          noReasoningModels.add(model);
          // Without an explicit low effort the model may reason by default,
          // so give it room to do so and still answer.
          request = { ...request, max_output_tokens: Math.max(1600, (request.max_output_tokens || 400) * 4) };
          delete request.reasoning;
          continue;
        }
        if (isModelUnavailable(status, code, message)) {
          unavailableModels.add(model);
          break;
        }
        throw error;
      }
    }
  }
  throw lastFailure || new ExternalServiceError("No configured OpenAI model is available to this API key.", { code: "no_model_available" });
}

/** Plain-language reason for the browser; never includes provider text verbatim. */
export function describeOpenAiError(error) {
  const code = error?.code || "";
  const status = error?.status;
  if (code === "not_enabled") return "GPT is not configured (set LIVE_SERVICES_ENABLED=true and OPENAI_API_KEY in .env).";
  if (code === "insufficient_quota" || status === 429) return "The OpenAI account has no available quota or hit its rate limit. Check billing and usage limits.";
  if (status === 401) return "The OpenAI API key was rejected. Check OPENAI_API_KEY in .env.";
  if (code === "no_model_available" || code === "model_not_found" || status === 404) return "None of the configured GPT models is available to this API key. Run npm run check:openai to see which models it can use.";
  if (code === "timeout") return "GPT took too long to answer. Try again, or raise OPENAI_TIMEOUT_MS.";
  if (code === "budget_exhausted") return "GPT ran out of its time budget for this request, so the rule-based text is shown.";
  if (code === "network_error") return "The server could not reach api.openai.com.";
  return "GPT is temporarily unavailable. The server log (data/logs/provider-errors.jsonl) has the details.";
}

export function openAiStatus(config) {
  return {
    configuredModel: config.openai.model,
    fallbackModels: config.openai.fallbackModels || [],
    activeModel,
    unavailableModels: [...unavailableModels],
    lastSuccess,
    lastError: lastError ? { at: lastError.at, service: lastError.service, model: lastError.model, status: lastError.status, code: lastError.code } : null,
  };
}

export function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
      if (content?.type === "refusal") throw new ExternalServiceError("OpenAI declined the request.", { code: "model_refusal" });
    }
  }
  throw new ExternalServiceError("OpenAI did not return text output.", { code: "missing_model_output" });
}
