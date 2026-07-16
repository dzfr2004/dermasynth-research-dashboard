import { ExternalServiceError, fetchJson } from "./http-client.mjs";

export const PINECONE_API_VERSION = "2026-04";
const INDEX_CACHE_TTL_MS = 5 * 60 * 1_000;
const indexCache = new Map();

function cacheKey(config) {
  return `${config.pinecone.index}:${config.pinecone.indexHost || "control-plane"}`;
}

export function normalisePineconeHost(host) {
  return String(host || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function configuredTextFields(descriptor) {
  const fieldMap = descriptor?.embed?.field_map || descriptor?.embed?.fieldMap || {};
  return Object.values(fieldMap).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
}

export function isIntegratedTextIndex(descriptor, textField) {
  return Boolean(descriptor?.embed) && configuredTextFields(descriptor).includes(textField);
}

export async function describePineconeIndex(config, { force = false } = {}) {
  if (!config.pinecone.apiKey || !config.pinecone.index) {
    throw new ExternalServiceError("Pinecone index configuration is incomplete.", { code: "not_configured" });
  }

  const key = cacheKey(config);
  const existing = indexCache.get(key);
  if (!force && existing && Date.now() - existing.savedAt < INDEX_CACHE_TTL_MS) return existing.value;

  const url = `https://api.pinecone.io/indexes/${encodeURIComponent(config.pinecone.index)}`;
  const descriptor = await fetchJson(url, {
    service: "Pinecone index discovery",
    timeoutMs: config.requestTimeoutMs,
    headers: {
      Accept: "application/json",
      "Api-Key": config.pinecone.apiKey,
      "X-Pinecone-Api-Version": PINECONE_API_VERSION,
    },
  });

  const host = normalisePineconeHost(config.pinecone.indexHost || descriptor?.host);
  if (!host || descriptor?.status?.ready === false) {
    throw new ExternalServiceError("Pinecone index is not ready.", { code: "index_not_ready" });
  }

  const value = { ...descriptor, host };
  indexCache.set(key, { value, savedAt: Date.now() });
  return value;
}

export function assertIntegratedTextIndex(descriptor, textField) {
  if (!descriptor?.embed) {
    throw new ExternalServiceError("The Pinecone index is not configured for integrated embedding.", {
      code: "not_integrated",
    });
  }
  if (!configuredTextFields(descriptor).includes(textField)) {
    throw new ExternalServiceError(`The Pinecone text field does not match ${textField}.`, {
      code: "field_map_mismatch",
    });
  }
}

export async function upsertTextRecords({ config, descriptor, records }) {
  assertIntegratedTextIndex(descriptor, config.pinecone.textField);
  if (!Array.isArray(records) || !records.length || records.length > 96) {
    throw new ExternalServiceError("Integrated text upsert batches must contain 1–96 records.", {
      code: "invalid_batch_size",
    });
  }

  const url = `https://${descriptor.host}/records/namespaces/${encodeURIComponent(config.pinecone.namespace)}/upsert`;
  await fetchJson(url, {
    service: "Pinecone evidence ingestion",
    timeoutMs: config.requestTimeoutMs,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-ndjson",
      "Api-Key": config.pinecone.apiKey,
      "X-Pinecone-Api-Version": PINECONE_API_VERSION,
    },
    body: `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  });
}
