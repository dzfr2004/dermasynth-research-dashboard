import { incompatibilityMatrix, safetyFlagConfig } from "./kb-reference.mjs";

/**
 * "Check my product" (improvement 5). The user pastes the ingredient list
 * from a product label; this matches it against DermaSynth's own ingredient
 * names (INCI names, aliases, display names) and answers, deterministically:
 *   - which of today's routine steps the product can fill;
 *   - whether it clashes with an ingredient in today's routine (the same
 *     incompatibility matrix the routine itself obeys);
 *   - cautions from the same safety lists (sun-sensitising, strong
 *     exfoliants for reactive skin, prescription-only, excluded).
 * Ingredients DermaSynth has no record of are counted and listed as
 * "not checked", never guessed. No GPT, nothing stored.
 */

const EXTRA_NAMES = Object.freeze({
  // Everyday label names that map to a related record, marked as related.
  "hyaluronic acid": { id: "sodium-hyaluronate", related: true },
  "vitamin c": { id: "ascorbic-acid" },
  "vitamin e": { id: "tocopherol" },
  "vitamin b3": { id: "niacinamide" },
  "nicotinamide": { id: "niacinamide" },
  "glycerol": { id: "glycerin" },
  "retinaldehyde": { id: "retinal" },
  "bha": { id: "salicylic-acid" },
});

const titleFromId = (id) => id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
export const normaliseName = (text) => String(text || "")
  .toLowerCase()
  .replace(/[*†‡]+/g, "")
  .replace(/\b\d+(\.\d+)?\s*%/g, "")
  .replace(/\s+/g, " ")
  .trim();

let indexCache = null;
function nameIndex(repository) {
  if (indexCache) return indexCache;
  const index = new Map();
  const names = new Map();
  const add = (name, id, related = false) => {
    const key = normaliseName(name);
    if (key.length < 3 || index.has(key)) return;
    index.set(key, { id, related });
  };
  for (const record of repository?.listIngredients?.() || []) {
    names.set(record.ingredient_id, record.display_name);
    add(record.display_name, record.ingredient_id);
    for (const inci of record.inci_names || []) add(inci, record.ingredient_id);
    for (const alias of record.aliases || []) add(alias, record.ingredient_id);
  }
  const flags = safetyFlagConfig();
  const matrixIds = [...incompatibilityMatrix().pairs].flatMap((pair) => pair.split("|"));
  for (const id of [...matrixIds, ...(flags.prescriptionOnly || []), ...(flags.photosensitising?.ids || []), ...(flags.highIntensityExfoliants?.ids || []), ...(flags.excludedFromSelection || []).map((e) => e.ingredientId)]) {
    if (!names.has(id)) names.set(id, titleFromId(id));
    add(titleFromId(id), id);
    add(id.replaceAll("-", " "), id);
  }
  for (const [name, target] of Object.entries(EXTRA_NAMES)) add(name, target.id, Boolean(target.related));
  indexCache = { index, names };
  return indexCache;
}

/** Splits a pasted ingredient list into names; "Aqua (Water)" yields both names. */
export function parseIngredientList(text) {
  const cleaned = String(text || "")
    .replace(/^\s*(ingredients|inci|composition)\s*[:\-]/i, "")
    .replace(/\r/g, "")
    .slice(0, 4000);
  const parts = cleaned.split(/[,;\n•·|]+/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const inner = [...part.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
    const outer = part.replace(/\([^)]*\)/g, " ").trim();
    if (outer) out.push({ written: part, name: normaliseName(outer) });
    for (const alt of inner) for (const piece of alt.split("/")) out.push({ written: part, name: normaliseName(piece), inner: true });
  }
  return out.filter((item) => item.name.length >= 2);
}

const STEP_WORDS = {
  "daytime-photoprotection": "sunscreen", "antioxidant-context": "antioxidant", "comfort-hydration": "hydrating layer", "light-hydration": "light hydrating layer",
  "supportive-hydration": "hydrating layer", "barrier-support-moisturising": "rich moisturiser", "lightweight-moisturising": "light moisturiser",
  "supportive-moisturising": "moisturiser", "texture-renewal": "exfoliant", "overnight-comfort": "soothing night step", "low-irritation-cleansing": "cleanser",
};

/**
 * @param routine { entries: [{ ingredientId, displayName, phase, categoryId }], steps: ["am:id", ...], concern, reactivityLevel }
 */
export function checkProduct({ text, repository, routine = {} }) {
  const { index, names } = nameIndex(repository);
  const parsed = parseIngredientList(text);
  const byWritten = new Map();
  for (const item of parsed) {
    const hit = index.get(item.name);
    const current = byWritten.get(item.written);
    if (hit && (!current || !current.hit)) byWritten.set(item.written, { written: item.written, hit });
    else if (!current) byWritten.set(item.written, { written: item.written, hit: null });
  }
  // Water is the base of most products; it is neither checked nor counted.
  const rows = [...byWritten.values()].filter((r) => r.hit || !/^(aqua|water|eau)\b/i.test(r.written.trim()));
  const recognised = rows.filter((r) => r.hit).map((r) => ({ written: r.written, ingredientId: r.hit.id, name: names.get(r.hit.id) || titleFromId(r.hit.id), related: r.hit.related }));
  const unrecognised = rows.filter((r) => !r.hit).map((r) => r.written);
  const ids = [...new Set(recognised.map((r) => r.ingredientId))];

  // Steps it can fill: an ingredient chosen for a step today, or any
  // ingredient the knowledge base files under that step's category.
  const categoriesById = new Map((repository?.listIngredients?.() || []).map((r) => [r.ingredient_id, new Set(r.categories || [])]));
  const entries = Array.isArray(routine.entries) ? routine.entries : [];
  const steps = Array.isArray(routine.steps) ? routine.steps : entries.map((e) => `${e.phase}:${e.categoryId}`);
  const fits = [];
  for (const key of steps) {
    const [phase, categoryId] = String(key).split(":");
    const chosen = entries.find((e) => e.phase === phase && e.categoryId === categoryId);
    const direct = chosen && ids.includes(chosen.ingredientId) ? chosen.ingredientId : null;
    const member = ids.find((id) => categoriesById.get(id)?.has(categoryId));
    if (direct || member) {
      const id = direct || member;
      fits.push({ phase, categoryId, step: STEP_WORDS[categoryId] || categoryId, ingredientId: id, name: names.get(id) || titleFromId(id), exact: Boolean(direct), text: `${direct ? "Contains" : "Has"} ${names.get(id) || titleFromId(id)}, ${direct ? "the ingredient chosen for" : "which suits"} your ${phase === "am" ? "morning" : "evening"} ${STEP_WORDS[categoryId] || "step"}.` });
    }
  }

  // Clashes with today's routine (same matrix as the routine itself).
  const matrix = incompatibilityMatrix();
  const conflicts = [];
  for (const id of ids) for (const entry of entries) {
    if (entry.ingredientId !== id && matrix.pairs.has(`${id}|${entry.ingredientId}`)) {
      conflicts.push({ productIngredient: id, routineIngredient: entry.ingredientId, phase: entry.phase, text: `It contains ${names.get(id) || titleFromId(id)}, which shouldn't be used in the same routine as ${entry.displayName || names.get(entry.ingredientId)} (your ${entry.phase === "am" ? "morning" : "evening"} ${STEP_WORDS[entry.categoryId] || "step"}). Use them on different days or at different times.` });
    }
  }

  const flags = safetyFlagConfig();
  const reactive = ["barrier", "sensitivity", "dryness"].includes(routine.concern) || ["moderate", "high"].includes(routine.reactivityLevel);
  const cautions = [];
  const idsWith = (list) => ids.filter((id) => (list || []).includes(id));
  const nameList = (list) => list.map((id) => names.get(id) || titleFromId(id)).join(", ");
  const rx = idsWith(flags.prescriptionOnly);
  if (rx.length) cautions.push({ level: "stop", text: `Contains ${nameList(rx)}, which is prescription-only in many countries. Ask a pharmacist or doctor before using it.` });
  const excluded = idsWith((flags.excludedFromSelection || []).map((e) => e.ingredientId));
  if (excluded.length) cautions.push({ level: "stop", text: `Contains ${nameList(excluded)}, which DermaSynth leaves out of routines because of a recent safety evaluation.` });
  const strong = idsWith(flags.highIntensityExfoliants?.ids);
  if (strong.length && reactive) cautions.push({ level: "warn", text: `Contains ${nameList(strong)}, a stronger exfoliant. With your skin details, DermaSynth keeps exfoliants out of your routine, so this may be too much for your skin right now.` });
  const photo = idsWith(flags.photosensitising?.ids);
  if (photo.length) cautions.push({ level: "info", text: `Contains ${nameList(photo)}, which makes skin more sensitive to the sun. Use it in the evening and wear sunscreen the next day.` });

  const verdict = !ids.length
    ? "DermaSynth didn't recognise any ingredients in this list."
    : cautions.some((c) => c.level === "stop") ? "Check with a pharmacist before using this product."
      : conflicts.length ? "Usable, but not in the same routine as one of today's steps."
        : fits.length ? `A good fit for your ${fits[0].phase === "am" ? "morning" : "evening"} ${fits[0].step}.`
          : "No clashes with today's routine, but it doesn't match one of today's steps.";

  return {
    verdict,
    total: rows.length,
    recognised,
    unrecognised,
    fits,
    conflicts,
    cautions,
    note: unrecognised.length ? `${unrecognised.length} of ${rows.length} ingredients aren't in DermaSynth's records, so they weren't checked.` : null,
  };
}
