// Small, dependency-free Okapi BM25 ranker (Robertson & Zaragoza, 2009).
// Shared by the candidate-pool retriever and the published-database evidence
// retriever so both report a real lexical relevance score rather than a
// position-derived placeholder.

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into", "is", "it", "its", "of", "on",
  "or", "that", "the", "their", "this", "to", "was", "were", "with", "within", "per", "used", "use",
]);

export function tokenise(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/(?<![0-9])\.|\.(?![0-9])/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && (token.length > 1 || /^\d$/.test(token)) && !STOP_WORDS.has(token));
}

/**
 * Ranks documents against a query.
 * @param {Array<{id: string, text: string}>} documents
 * @param {string} query
 * @returns {Array<{id: string, score: number, rank: number, normalisedScore: number, matchedTerms: string[]}>}
 *   Sorted by score (desc). `normalisedScore` divides by the best score in the
 *   set, so the top-ranked document is 1 and unmatched documents are 0.
 */
export function bm25(documents, query) {
  const queryTerms = [...new Set(tokenise(query))];
  if (!documents.length) return [];
  const parsed = documents.map((document) => {
    const tokens = tokenise(document.text);
    const frequencies = new Map();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
    return { id: document.id, tokens, frequencies };
  });
  const averageLength = parsed.reduce((sum, document) => sum + document.tokens.length, 0) / parsed.length || 1;
  const documentFrequency = new Map();
  for (const document of parsed) {
    for (const token of new Set(document.tokens)) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
  }
  const total = parsed.length;
  const scored = parsed.map((document) => {
    const matchedTerms = [];
    const score = queryTerms.reduce((sum, term) => {
      const tf = document.frequencies.get(term) || 0;
      if (!tf) return sum;
      matchedTerms.push(term);
      const df = documentFrequency.get(term) || 0;
      const idf = Math.log(1 + ((total - df + 0.5) / (df + 0.5)));
      const denominator = tf + (BM25_K1 * (1 - BM25_B + (BM25_B * document.tokens.length / averageLength)));
      return sum + (idf * tf * (BM25_K1 + 1) / denominator);
    }, 0);
    return { id: document.id, score, matchedTerms };
  });
  scored.sort((left, right) => right.score - left.score || String(left.id).localeCompare(String(right.id)));
  const best = scored[0]?.score || 0;
  return scored.map((item, index) => ({
    ...item,
    score: Number(item.score.toFixed(4)),
    rank: index + 1,
    normalisedScore: best > 0 ? Number((item.score / best).toFixed(4)) : 0,
  }));
}
