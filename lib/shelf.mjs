import { checkProduct } from "./product-check.mjs";
import { incompatibilityMatrix, safetyFlagConfig } from "./kb-reference.mjs";

/**
 * "My shelf": the products a user owns, checked together against today's
 * routine. Deterministic, built on the same product check, incompatibility
 * matrix and safety lists as the routine itself. Nothing is stored here; the
 * browser keeps the shelf and sends it with each check.
 *
 * For each product: which of today's steps it can fill, clashes with today's
 * named ingredients, and cautions. Across products: pairs that should not be
 * used in the same routine. For each step: the best product on the shelf, or a
 * gap when nothing fits. A sun-sensitising product is never placed in a
 * morning step.
 */

export const SHELF_LIMIT = 20;
export const PRODUCT_TYPES = Object.freeze(["cleanser", "toner", "serum", "moisturiser", "sunscreen", "exfoliant", "mask", "oil", "other"]);

const STEP_WORDS = {
  "daytime-photoprotection": "sunscreen", "antioxidant-context": "antioxidant", "comfort-hydration": "hydrating layer", "light-hydration": "light hydrating layer",
  "supportive-hydration": "hydrating layer", "barrier-support-moisturising": "rich moisturiser", "lightweight-moisturising": "light moisturiser",
  "supportive-moisturising": "moisturiser", "texture-renewal": "exfoliant", "overnight-comfort": "soothing night step", "low-irritation-cleansing": "cleanser",
};

// A product's own type is a strong hint for the steps it belongs to.
const TYPE_STEPS = {
  cleanser: ["low-irritation-cleansing"],
  sunscreen: ["daytime-photoprotection"],
  exfoliant: ["texture-renewal"],
  moisturiser: ["barrier-support-moisturising", "lightweight-moisturising", "supportive-moisturising", "overnight-comfort"],
  serum: ["antioxidant-context", "comfort-hydration", "light-hydration", "supportive-hydration", "texture-renewal", "overnight-comfort"],
  toner: ["comfort-hydration", "light-hydration", "supportive-hydration"],
  oil: ["overnight-comfort", "barrier-support-moisturising"],
  mask: ["overnight-comfort"],
};
// Steps a product type should never fill, whatever its ingredients.
const TYPE_BLOCKED = {
  cleanser: (categoryId) => categoryId !== "low-irritation-cleansing",
  sunscreen: (categoryId) => categoryId !== "daytime-photoprotection",
};

export function cleanShelfProduct(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").slice(0, 40);
  if (!/^[a-z0-9-]{4,40}$/i.test(id)) return null;
  const name = String(raw.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const text = String(raw.text || "").slice(0, 4000);
  if (!name) return null;
  const type = PRODUCT_TYPES.includes(raw.type) ? raw.type : "other";
  return { id, name, type, text };
}

const stepWord = (categoryId) => STEP_WORDS[categoryId] || "step";
const halfWord = (phase) => (phase === "am" ? "morning" : "evening");

export function checkShelf({ products = [], repository, routine = {} }) {
  const flags = safetyFlagConfig();
  const photosensitising = new Set(flags.photosensitising?.ids || []);
  const matrix = incompatibilityMatrix();
  const entries = Array.isArray(routine.entries) ? routine.entries : [];
  const steps = Array.isArray(routine.steps) && routine.steps.length ? routine.steps : entries.map((e) => `${e.phase}:${e.categoryId}`);

  const items = products.slice(0, SHELF_LIMIT).map((product) => {
    const result = product.text.trim().length >= 3
      ? checkProduct({ text: product.text, repository, routine: { ...routine, entries, steps } })
      : { verdict: "Add the ingredient list to check this product.", total: 0, recognised: [], unrecognised: [], fits: [], conflicts: [], cautions: [], note: null };
    const ids = [...new Set(result.recognised.map((r) => r.ingredientId))];
    const names = new Map(result.recognised.map((r) => [r.ingredientId, r.name]));
    const blocked = TYPE_BLOCKED[product.type];
    const preferred = new Set(TYPE_STEPS[product.type] || []);
    const fits = result.fits
      .filter((fit) => !blocked || !blocked(fit.categoryId))
      .filter((fit) => !(fit.phase === "am" && ids.some((id) => photosensitising.has(id))))
      .map((fit) => ({ ...fit, key: `${fit.phase}:${fit.categoryId}`, score: (fit.exact ? 2 : 0) + (preferred.has(fit.categoryId) ? 1 : 0) }));
    // A typed product with no recognised match can still sit in its usual step.
    if (!fits.length && preferred.size && !ids.some((id) => photosensitising.has(id)) && product.type !== "other") {
      for (const key of steps) {
        const [phase, categoryId] = String(key).split(":");
        if (preferred.has(categoryId) && (!blocked || !blocked(categoryId))) fits.push({ phase, categoryId, key, step: stepWord(categoryId), exact: false, score: 0.5, byType: true, text: product.text.trim() ? `Placed by its type: a ${product.type} fills your ${halfWord(phase)} ${stepWord(categoryId)}.` : `A ${product.type} usually fills your ${halfWord(phase)} ${stepWord(categoryId)}. Add its ingredient list to check it.` });
      }
    }
    return { ...product, ids, names, result, fits, photosensitising: ids.some((id) => photosensitising.has(id)) };
  });

  // Pairs of shelf products that should not share a routine.
  const clashes = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i], b = items[j];
      for (const x of a.ids) for (const y of b.ids) {
        if (x !== y && (matrix.pairs.has(`${x}|${y}`) || matrix.pairs.has(`${y}|${x}`))) {
          clashes.push({ a: a.id, b: b.id, ingredients: [x, y], text: `${a.name} has ${a.names.get(x)} and ${b.name} has ${b.names.get(y)}. Don't layer them in the same routine; use them on different days or at different times.` });
        }
      }
    }
  }
  const clashKeys = new Set();
  const uniqueClashes = clashes.filter((c) => { const k = `${c.a}|${c.b}`; if (clashKeys.has(k)) return false; clashKeys.add(k); return true; });

  // Best product per step. Products already placed in the same half are not
  // paired with one they clash with.
  const placed = { am: [], pm: [] };
  const entryStepKey = new Map(entries.map((e) => [`${e.phase}|${e.ingredientId}`, `${e.phase}:${e.categoryId}`]));
  const clashesWith = (id, others) => others.some((o) => clashKeys.has(`${id}|${o}`) || clashKeys.has(`${o}|${id}`));
  const stepPlan = steps.map((key) => {
    const [phase, categoryId] = String(key).split(":");
    const candidates = items
      .map((item) => ({ item, fit: item.fits.find((f) => f.key === key) }))
      .filter((c) => c.fit)
      .sort((x, y) => y.fit.score - x.fit.score);
    // One product fills one step per half; a clashing pair never shares a half.
    // Never place a product in a half where it clashes with one of today's
    // named ingredients, unless that ingredient's own step is the one it fills.
    const clashesWithRoutine = (item) => item.result.conflicts.some((cf) => cf.phase === phase && entryStepKey.get(`${cf.phase}|${cf.routineIngredient}`) !== key);
    const chosen = candidates.find((c) => !placed[phase].includes(c.item.id) && !clashesWith(c.item.id, placed[phase]) && !clashesWithRoutine(c.item));
    if (chosen) placed[phase].push(chosen.item.id);
    return {
      key, phase, categoryId, step: stepWord(categoryId),
      productId: chosen?.item.id || null,
      exact: Boolean(chosen?.fit.exact),
      byType: Boolean(chosen?.fit.byType),
      alternatives: candidates.filter((c) => c !== chosen).map((c) => c.item.id),
      text: chosen ? chosen.fit.text : `Nothing on your shelf fits your ${halfWord(phase)} ${stepWord(categoryId)} yet.`,
    };
  });

  const covered = new Set(stepPlan.filter((s) => s.productId).map((s) => s.key));
  const entryStep = new Map(entries.map((e) => [`${e.phase}|${e.ingredientId}`, `${e.phase}:${e.categoryId}`]));
  const listSteps = (keys) => keys.map((k) => { const s = stepPlan.find((p) => p.key === k); return `${halfWord(s.phase)} ${s.step}`; });
  const joinWords = (words) => (words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);
  const shelfVerdict = (item, used, conflicts) => {
    if (item.result.cautions.some((c) => c.level === "stop")) return item.result.verdict;
    if (!item.text.trim() && !used.length) return "Add the ingredient list to check this product.";
    if (!steps.length) return item.result.cautions.length ? item.result.cautions[0].text : item.ids.length ? "Build today's routine to see where it fits." : item.result.verdict;
    if (used.length) return `Use it today for your ${joinWords(listSteps(used))}.`;
    if (conflicts.length || uniqueClashes.some((c) => c.a === item.id || c.b === item.id)) return "Rest it today: it shouldn't be layered with today's routine.";
    if (item.fits.length) return "It fits today, but another product on your shelf was a better match.";
    return "Not needed in today's routine.";
  };
  return {
    products: items.map((item) => {
      const used = stepPlan.filter((s) => s.productId === item.id).map((s) => s.key);
      // A clash with a named ingredient only matters if you'd still buy and
      // use that ingredient, i.e. its step isn't already filled from the shelf.
      const conflicts = item.result.conflicts.filter((c) => !covered.has(entryStep.get(`${c.phase}|${c.routineIngredient}`)));
      return {
      id: item.id,
      name: item.name,
      type: item.type,
      verdict: shelfVerdict(item, used, conflicts),
      id: item.id,
      name: item.name,
      type: item.type,
      recognised: item.result.recognised,
      unrecognisedCount: item.result.unrecognised.length,
      total: item.result.total,
      note: item.result.note,
      cautions: item.result.cautions,
      conflicts,
      photosensitising: item.photosensitising,
      steps: used,
      fits: item.fits.map((f) => f.key),
      };
    }),
    steps: stepPlan,
    clashes: uniqueClashes,
    gaps: stepPlan.filter((s) => !s.productId).map((s) => s.key),
  };
}
