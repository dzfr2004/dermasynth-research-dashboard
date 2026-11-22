/**
 * Score-band rotation: variety among ingredients that are equally supported.
 *
 * Without it the rule-based selector always takes the top-scored candidate,
 * so a slot whose candidates are near-tied (titanium dioxide 0.730 vs zinc
 * oxide 0.704, or resveratrol 0.714 vs ascorbic acid 0.708 vs tocopherol
 * 0.702) shows the same ingredient on every run.
 *
 * The rule:
 *   1. Only candidates already in the slot's retrieved, approved,
 *      compatibility-checked pool are considered (rotation never widens the
 *      pool and never bypasses a safety pass).
 *   2. The "band" is every candidate within BAND of the top score. BAND = 0.05
 *      is smaller than one evidence-grade step in the candidate score
 *      (0.15 × 0.5 = 0.075) and smaller than the EWG factor's full range
 *      above neutral (0.10 × 0.5), so a candidate inside the band cannot be
 *      worse on any single factor by a full grade. Gaps that small are below
 *      the resolution of the configured research weights, so the band's
 *      members are treated as equally supported.
 *   3. Inside the band, one candidate is drawn with a seeded weighted draw:
 *      weight = exp((score − top) / TAU), so the higher score is still more
 *      likely, multiplied by RECENT_PENALTY if that ingredient was shown for
 *      the same slot in the last RECENT_WINDOW runs.
 *   4. The seed, the band, the weights and the recent list are returned so the
 *      run report and selection log can replay the draw exactly.
 *
 * With no seed the caller keeps the old top-score behaviour, so every
 * offline evaluation stays deterministic unless it asks for rotation.
 */

export const ROTATION = Object.freeze({
  id: "dermasynth-score-band-rotation",
  version: "1.0",
  band: 0.05,
  tau: 0.025,
  recentWindow: 3,
  recentPenalty: 0.2,
});

// FNV-1a 32-bit hash of a string.
function hash(text) {
  let h = 0x811c9dc5;
  for (const char of String(text)) {
    h ^= char.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// mulberry32: small, well-known seeded PRNG returning [0, 1).
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * @param ranked   candidates sorted best first, each { ingredientId, score }
 * @param seed     string; the draw is a pure function of (seed, slotKey, ranked, recent)
 * @param slotKey  e.g. "am:daytime-photoprotection"
 * @param recent   ingredient ids shown for this slot in recent runs, newest first
 * @returns { chosen, trace } or null when rotation does not apply
 */
export function rotateWithinBand({ ranked = [], seed = null, slotKey = "", recent = [], settings = ROTATION } = {}) {
  if (seed === null || seed === undefined || seed === "" || !ranked.length) return null;
  const top = Number(ranked[0].score) || 0;
  const band = ranked.filter((item) => top - (Number(item.score) || 0) <= settings.band + 1e-9);
  const recentSet = new Set((recent || []).slice(0, settings.recentWindow));
  const weighted = band.map((item) => {
    const base = Math.exp(((Number(item.score) || 0) - top) / settings.tau);
    const isRecent = recentSet.has(item.ingredientId);
    return { ingredientId: item.ingredientId, score: item.score, recent: isRecent, weight: base * (isRecent ? settings.recentPenalty : 1) };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0) || 1;
  const draw = prng(hash(`${seed}|${slotKey}`))();
  let cumulative = 0;
  let pickIndex = weighted.length - 1;
  for (let i = 0; i < weighted.length; i += 1) {
    cumulative += weighted[i].weight / total;
    if (draw < cumulative) { pickIndex = i; break; }
  }
  const chosen = ranked.find((item) => item.ingredientId === weighted[pickIndex].ingredientId);
  return {
    chosen,
    trace: {
      method: settings.id,
      version: settings.version,
      seed: String(seed),
      band: settings.band,
      topScore: top,
      bandMembers: weighted.map((item) => ({ ingredientId: item.ingredientId, score: item.score, recent: item.recent, probability: round(item.weight / total) })),
      recent: [...recentSet],
      draw: round(draw),
      chosen: chosen.ingredientId,
      rotated: band.length > 1,
      differsFromTopScore: chosen.ingredientId !== ranked[0].ingredientId,
    },
  };
}

/**
 * In-process memory of what each slot recently showed. The app runs as one
 * instance (docs/DEPLOYMENT.md), so this is shared by every visitor; a restart
 * simply starts the memory empty.
 */
export function createRecentPicks(window = ROTATION.recentWindow) {
  const bySlot = new Map();
  return {
    get(slotKey) { return [...(bySlot.get(slotKey) || [])]; },
    replace(snapshot = {}) {
      bySlot.clear();
      for (const [key, list] of Object.entries(snapshot)) if (Array.isArray(list)) bySlot.set(key, list.slice(0, window));
    },
    snapshot() { return Object.fromEntries([...bySlot.entries()].map(([key, list]) => [key, [...list]])); },
    record(entries = []) {
      for (const entry of entries) {
        if (!entry?.ingredientId || !entry?.categoryId) continue;
        const key = `${entry.phase || "am"}:${entry.categoryId}`;
        const list = (bySlot.get(key) || []).filter((id) => id !== entry.ingredientId);
        list.unshift(entry.ingredientId);
        bySlot.set(key, list.slice(0, window));
      }
    },
  };
}
