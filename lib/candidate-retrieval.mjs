import { planningUvi } from "./uv.mjs";
import { bm25 } from "./bm25.mjs";
import { fetchJson } from "./http-client.mjs";
import { describePineconeIndex, isIntegratedTextIndex, PINECONE_API_VERSION } from "./pinecone.mjs";
import { CONCERN_CATALOG, ROUTINE_CATEGORY_CATALOG } from "./safety.mjs";
import { cachedSearch, searchCacheKey } from "./search-cache.mjs";

/**
 * Retrieval step that builds each routine slot's candidate pool.
 *
 * For every safety-cleared slot a query is built from the slot's category and
 * the live environmental reading that triggered it. The query is run over the
 * ingredient evidence corpus (lib/ingredient-evidence-corpus.mjs) with local
 * BM25 and, when Pinecone is configured, dense search over the same documents
 * in the evidence namespace. The two rankings are fused with reciprocal rank
 * fusion (k = 60). Only approved ingredients that the retriever actually
 * surfaces for the slot enter the pool the language model chooses from.
 */

export const RRF_K = 60;
export const RETRIEVAL_TOP_N = 12;

// Query expansion per category: a fixed, documented vocabulary that describes
// what each slot is for. It is not tuned per ingredient.
const CATEGORY_QUERY_TERMS = Object.freeze({
  "daytime-photoprotection": "daytime UV ultraviolet sun protection photoprotection UV filter mineral sunscreen photoaging",
  "antioxidant-context": "antioxidant oxidative stress pollution particulate matter PM2.5 environmental exposure",
  "comfort-hydration": "comfort hydration humectant dry skin water binding barrier support",
  "light-hydration": "light lightweight hydration humectant humid conditions",
  "supportive-hydration": "supportive hydration humectant moisture balanced conditions",
  "barrier-support-moisturising": "barrier support moisturising barrier lipid emollient occlusive dry skin",
  "lightweight-moisturising": "lightweight moisturising emollient humectant light texture humid conditions",
  "supportive-moisturising": "supportive moisturising emollient barrier lipid",
  "texture-renewal": "texture renewal exfoliant exfoliation hydroxy acid keratolytic evening",
  "overnight-comfort": "overnight comfort soothing calming barrier repair evening",
});

const CONCERN_LABELS = new Map(CONCERN_CATALOG.map((item) => [item.id, item.label]));

function reading(environment, key) {
  const value = Number(environment?.readings?.[key]);
  return Number.isFinite(value) ? value : null;
}

export function slotQuery({ categoryId, concern, concerns = [], environment, policy }) {
  const definition = ROUTINE_CATEGORY_CATALOG[categoryId];
  const parts = [definition ? `${definition.title} ${definition.note}` : categoryId, CATEGORY_QUERY_TERMS[categoryId] || ""];
  const uvi = planningUvi(environment?.readings || {});
  const pm25 = reading(environment, "pm25");
  const humidity = reading(environment, "humidity");
  if (categoryId === "daytime-photoprotection" && uvi !== null) {
    parts.push(`UV index ${uvi}`);
    if (uvi >= (policy?.environment?.highUvThreshold ?? 8)) parts.push("high UV");
  }
  if (categoryId === "antioxidant-context" && pm25 !== null) parts.push(`PM2.5 ${pm25} particulate pollution`);
  if (/hydration|moisturising/.test(categoryId) && humidity !== null) {
    if (humidity <= 50) parts.push("low humidity dry air");
    else if (humidity >= 75) parts.push("high humidity humid air");
  }
  // The main concern first, then any extra concerns the user picked.
  for (const item of [...new Set([concern, ...(Array.isArray(concerns) ? concerns : [])])]) {
    const concernLabel = CONCERN_LABELS.get(item);
    if (concernLabel) parts.push(concernLabel);
  }
  return parts.map((part) => String(part).trim().replace(/[.\s]+$/, "")).filter(Boolean).join(". ").replace(/\s+/g, " ").trim();
}

function denseSearch({ config, query }) {
  const key = searchCacheKey(["slot", config.pinecone.index, config.pinecone.evidenceNamespace, RETRIEVAL_TOP_N, query]);
  return cachedSearch(config.searchCacheMs, key, () => runDenseSearch({ config, query }));
}

async function runDenseSearch({ config, query }) {
  const descriptor = await describePineconeIndex(config);
  if (!isIntegratedTextIndex(descriptor, config.pinecone.textField)) throw new Error("Pinecone index lacks integrated text embedding.");
  const namespace = config.pinecone.evidenceNamespace;
  const payload = await fetchJson(`https://${descriptor.host}/records/namespaces/${encodeURIComponent(namespace)}/search`, {
    service: "Pinecone candidate retrieval",
    timeoutMs: config.requestTimeoutMs,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Api-Key": config.pinecone.apiKey,
      "X-Pinecone-Api-Version": PINECONE_API_VERSION,
    },
    body: JSON.stringify({ query: { inputs: { text: query }, top_k: RETRIEVAL_TOP_N }, fields: ["ingredient_ids", "title"] }),
  });
  const hits = payload?.result?.hits || payload?.hits || [];
  const ranked = [];
  const seen = new Set();
  for (const hit of Array.isArray(hits) ? hits : []) {
    const ids = hit?.fields?.ingredient_ids;
    const id = String(Array.isArray(ids) ? ids[0] : ids || "").toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ranked.push({ id, score: Number(hit?._score ?? hit?.score) || 0 });
  }
  return { namespace, ranked };
}

/**
 * Reciprocal rank fusion decides the ORDER. Because RRF scores are compressed
 * (1/61 vs 1/62), the per-candidate `relevance` used by the candidate score is
 * taken from the underlying retrievers instead: each retriever's score is
 * divided by its best score in this query, and the relevance is the mean over
 * the retrievers that ran (0 where a retriever did not return the candidate).
 */
function fuse(lexical, dense) {
  const byId = new Map();
  const retrievers = [["lexical", lexical], ["dense", dense]].filter(([, list]) => list.length);
  for (const [kind, list] of retrievers) {
    const best = Math.max(...list.map((item) => item.score), 0) || 1;
    list.forEach((item, index) => {
      const entry = byId.get(item.id) || { ingredientId: item.id, fusedScore: 0, normalised: {} };
      entry[`${kind}Rank`] = index + 1;
      entry[`${kind}Score`] = item.score;
      entry.normalised[kind] = item.score / best;
      entry.fusedScore += 1 / (RRF_K + index + 1);
      byId.set(item.id, entry);
    });
  }
  const ranked = [...byId.values()].sort((left, right) => right.fusedScore - left.fusedScore || left.ingredientId.localeCompare(right.ingredientId));
  return ranked.map((entry, index) => {
    const relevance = retrievers.reduce((sum, [kind]) => sum + (entry.normalised[kind] || 0), 0) / (retrievers.length || 1);
    const { normalised, ...rest } = entry;
    return { ...rest, fusedScore: Number(entry.fusedScore.toFixed(6)), rank: index + 1, relevance: Number(relevance.toFixed(4)) };
  });
}

function denseEnabledFor(config) {
  return Boolean(config?.liveServicesEnabled && config?.pinecone?.apiKey && config?.pinecone?.index && config?.pinecone?.evidenceNamespace);
}

/**
 * Starts the Pinecone searches for categories the routine is likely to use,
 * without waiting for them. The routine's categories are only final after the
 * GPT category step, but the likely set is known before it, so the searches
 * can run while GPT is working. retrieveSlotCandidates later picks up the same
 * searches from the cache (still running or finished). A category that was
 * not predicted is simply searched then, as before, so the result is the same
 * either way; only the waiting time changes.
 */
export function prefetchSlotSearches({ config, categoryIds = [], concern = "", concerns = [], environment = null, policy = null } = {}) {
  if (!denseEnabledFor(config) || !(config.searchCacheMs > 0)) return 0;
  const ids = [...new Set(categoryIds)];
  for (const categoryId of ids) {
    denseSearch({ config, query: slotQuery({ categoryId, concern, concerns, environment, policy }) }).catch(() => {});
  }
  return ids.length;
}

/**
 * @returns {Promise<Map<string, {query, mode, ranked, notices}>>} keyed by category id
 */
export async function retrieveSlotCandidates({ config, corpus = [], categoryIds = [], concern = "", concerns = [], environment = null, policy = null } = {}) {
  const results = new Map();
  const denseEnabled = denseEnabledFor(config);
  await Promise.all([...new Set(categoryIds)].map(async (categoryId) => {
    const query = slotQuery({ categoryId, concern, concerns, environment, policy });
    const lexical = bm25(corpus.map((document) => ({ id: document.id, text: document.text })), query)
      .filter((item) => item.score > 0)
      .slice(0, RETRIEVAL_TOP_N)
      .map((item) => ({ id: item.id, score: item.score }));
    let dense = [];
    let mode = "lexical-bm25";
    const notices = [];
    if (denseEnabled) {
      try {
        dense = (await denseSearch({ config, query })).ranked;
        mode = dense.length ? "hybrid-bm25-dense-rrf" : "lexical-bm25";
        if (!dense.length) notices.push("The Pinecone evidence namespace returned no hits; lexical retrieval only.");
      } catch {
        notices.push("Pinecone evidence retrieval was unavailable; lexical retrieval only.");
      }
    }
    results.set(categoryId, { categoryId, query, mode, ranked: fuse(lexical, dense), notices });
  }));
  return results;
}
