import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvValue(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const first = trimmed[0];
  const last = trimmed.at(-1);
  if ((first === '"' || first === "'") && last === first) {
    return trimmed.slice(1, -1);
  }

  return trimmed.replace(/\s+#.*$/, "").trim();
}

/**
 * Load a local .env file without adding a runtime dependency. Existing process
 * environment variables take precedence, which keeps deployment configuration
 * separate from local development configuration.
 */
export function loadDotEnv(root) {
  try {
    const raw = readFileSync(resolve(root, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;

      const [, key, value] = match;
      if (process.env[key] === undefined) {
        process.env[key] = parseEnvValue(value);
      }
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
  }
}

function enabled(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
}

function optional(value) {
  return typeof value === "string" ? value.trim() : "";
}

const REASONING_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

function reasoningEffort(value) {
  const requested = optional(value).toLowerCase();
  return REASONING_EFFORTS.has(requested) ? requested : "none";
}

export function createConfig() {
  const reviewerQueueToken = optional(process.env.REVIEWER_QUEUE_TOKEN);
  const governanceToken = optional(process.env.GOVERNANCE_ADMIN_TOKEN);
  return {
    liveServicesEnabled: enabled(process.env.LIVE_SERVICES_ENABLED, false),
    // Named research candidates are a separately auditable layer. They never
    // alter AM/PM routine steps and remain opt-in at deployment time.
    ingredientSelectionEnabled: enabled(process.env.INGREDIENT_SELECTION_ENABLED, false),
    // Dynamic knowledge base: when enabled the Atlas/knowledge-explorer reads
    // from the versioned database instead of the static JSON files, and the
    // token-protected /api/admin ingredient + source workflow becomes active.
    ingredientDb: {
      enabled: enabled(process.env.INGREDIENT_DB_ENABLED, false),
      path: optional(process.env.INGREDIENT_DB_PATH),
    },
    governance: {
      token: governanceToken,
      localOnly: optional(process.env.NODE_ENV).toLowerCase() !== "production",
    },
    requestTimeoutMs: boundedNumber(process.env.SERVICE_TIMEOUT_MS, 9_000, 1_000, 30_000),
    environmentCacheSeconds: boundedNumber(process.env.ENVIRONMENT_CACHE_SECONDS, 600, 30, 3_600),
    airQualityCacheSeconds: boundedNumber(process.env.IQAIR_CACHE_SECONDS, 1_800, 60, 7_200),
    locationSearchCacheSeconds: boundedNumber(process.env.LOCATION_SEARCH_CACHE_SECONDS, 900, 60, 86_400),
    // Context Utilisation Evaluation: share of the model's claims that are
    // supported by the context it was given. Output below the threshold is
    // regenerated once, then withheld.
    cueThreshold: boundedNumber(process.env.CUE_THRESHOLD, 0.8, 0, 1),
    cue: {
      // "llm_judge" asks the model to verify each claim against the context
      // (RAGAS-style faithfulness) and falls back to the lexical check if the
      // judge call fails. "lexical" never makes an extra model call.
      method: ["llm_judge", "lexical"].includes(optional(process.env.CUE_METHOD).toLowerCase()) ? optional(process.env.CUE_METHOD).toLowerCase() : "llm_judge",
      maxRetries: boundedNumber(process.env.CUE_MAX_RETRIES, 1, 0, 2),
    },
    triage: {
      // Model second opinion on symptoms the rules cleared (escalate-only).
      llmEnabled: enabled(process.env.TRIAGE_LLM_ENABLED, true),
    },
    selectionLog: {
      enabled: enabled(process.env.SELECTION_LOG_ENABLED, true),
      path: optional(process.env.SELECTION_LOG_PATH) || "data/logs/selection-log.jsonl",
      // GPT explanation drafts with their CUE verdicts (C1, C3).
      contextPath: optional(process.env.CONTEXT_LOG_PATH) || "data/logs/context-log.jsonl",
    },
    openai: {
      apiKey: optional(process.env.OPENAI_API_KEY),
      model: optional(process.env.OPENAI_MODEL) || "gpt-5.6-sol",
      reasoningEffort: reasoningEffort(process.env.OPENAI_REASONING_EFFORT),
      // Tried in order when OPENAI_MODEL is not available to this API key.
      fallbackModels: (optional(process.env.OPENAI_FALLBACK_MODELS) || "gpt-6-sol,gpt-6-luna,gpt-5.5")
        .split(",").map((item) => item.trim()).filter(Boolean),
      timeoutMs: boundedNumber(process.env.OPENAI_TIMEOUT_MS, 30_000, 5_000, 120_000),
      // C4: total GPT time per routine request, and per explanation request.
      routineBudgetMs: boundedNumber(process.env.GPT_ROUTINE_BUDGET_MS, 20_000, 3_000, 120_000),
      contextBudgetMs: boundedNumber(process.env.GPT_CONTEXT_BUDGET_MS, 45_000, 5_000, 180_000),
      // Only for local test harnesses (a mock server); leave unset in real use.
      baseUrl: optional(process.env.OPENAI_BASE_URL) || "https://api.openai.com/v1",
      errorLogPath: optional(process.env.OPENAI_ERROR_LOG_PATH) || "data/logs/provider-errors.jsonl",
    },
    openWeather: {
      apiKey: optional(process.env.OPENWEATHER_API_KEY),
    },
    iqAir: {
      apiKey: optional(process.env.IQAIR_API_KEY),
    },
    pinecone: {
      apiKey: optional(process.env.PINECONE_API_KEY),
      index: optional(process.env.PINECONE_INDEX),
      indexHost: optional(process.env.PINECONE_INDEX_HOST),
      namespace: optional(process.env.PINECONE_NAMESPACE) || "__default__",
      // The final-review research corpus is intentionally isolated from the
      // generic category-synthesis namespace. It can be searched and browsed
      // in the Knowledge Atlas without turning its records into routine steps.
      researchNamespace: optional(process.env.PINECONE_RESEARCH_NAMESPACE) || "demo-atlas-50-v1",
      // Candidate-pool retrieval searches the ingredient evidence documents in
      // their own namespace (npm run sync:evidence-pinecone -- --upload).
      evidenceNamespace: optional(process.env.PINECONE_EVIDENCE_NAMESPACE) || "demo-ingredient-evidence-v2",
      textField: optional(process.env.PINECONE_TEXT_FIELD) || "chunk_text",
      titleField: optional(process.env.PINECONE_TITLE_FIELD) || "title",
      sourceField: optional(process.env.PINECONE_SOURCE_FIELD) || "source",
      ingestBatchSize: boundedNumber(process.env.PINECONE_UPSERT_BATCH_SIZE, 50, 1, 96),
    },
    reviewerQueue: {
      // This workflow is deliberately local-only. A token is not exposed to
      // the browser through the public health/config endpoint.
      requested: enabled(process.env.REVIEWER_QUEUE_ENABLED, false),
      token: reviewerQueueToken,
      localOnly: optional(process.env.NODE_ENV).toLowerCase() !== "production",
    },
  };
}

export function publicConfigStatus(config) {
  const reviewerQueue = config.reviewerQueue || {};
  const reviewerQueueMode = !reviewerQueue.requested
    ? "disabled"
    : !reviewerQueue.localOnly
      ? "refused_nonproduction_only"
      : typeof reviewerQueue.token !== "string" || reviewerQueue.token.length < 24
        ? "disabled_missing_token"
        : "local_only_token_protected";
  return {
    liveServicesEnabled: config.liveServicesEnabled,
    ingredientSelectionEnabled: Boolean(config.ingredientSelectionEnabled),
    ingredientDb: { enabled: Boolean(config.ingredientDb?.enabled) },
    governance: {
      mode: !config.governance?.localOnly
        ? "refused_nonproduction_only"
        : config.governance?.token?.length >= 24
          ? "local_token_protected"
          : "read_only_missing_token",
    },
    providers: {
      openai: Boolean(config.openai.apiKey),
      openWeather: Boolean(config.openWeather.apiKey),
      iqAir: Boolean(config.iqAir.apiKey),
      pinecone: Boolean(config.pinecone.apiKey && config.pinecone.index),
    },
    reviewerQueue: { mode: reviewerQueueMode },
  };
}
