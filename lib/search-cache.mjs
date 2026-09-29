/**
 * Short-lived cache for Pinecone searches.
 *
 * A search result depends only on the index contents and the query text, and
 * the query text is built from the concern, the category and the weather band.
 * Many routine runs repeat the same combination (everyone in a study session
 * shares one location), so repeating the search adds 2 to 4 seconds and gives
 * the same answer. Results are kept for a short time (30 minutes by default)
 * and cleared whenever the index is re-synced, so a cached answer is never
 * older than the index it came from.
 *
 * The promise itself is stored, so a search that is still running is shared
 * with any caller asking for the same query (this is what lets the ingredient
 * searches start early and be picked up later). Failed searches are not kept.
 */

const MAX_ENTRIES = 400;
const entries = new Map();
const stats = { hits: 0, misses: 0 };

export function searchCacheKey(parts) {
  return JSON.stringify(parts);
}

/**
 * @param {number} ttlMs  0 or less turns the cache off (the search always runs)
 * @param {string} key
 * @param {() => Promise<any>} run
 */
export function cachedSearch(ttlMs, key, run) {
  if (!(ttlMs > 0)) return run();
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && now - hit.at < ttlMs) {
    stats.hits += 1;
    return hit.promise;
  }
  stats.misses += 1;
  const promise = Promise.resolve().then(run);
  entries.set(key, { at: now, promise });
  promise.catch(() => {
    if (entries.get(key)?.promise === promise) entries.delete(key);
  });
  if (entries.size > MAX_ENTRIES) {
    // Map keeps insertion order, so the first key is the oldest.
    entries.delete(entries.keys().next().value);
  }
  return promise;
}

export function clearSearchCache() {
  entries.clear();
}

export function searchCacheStats() {
  return { entries: entries.size, ...stats };
}
