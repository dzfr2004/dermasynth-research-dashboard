import { readFileSync } from "node:fs";

/**
 * Personalisation rules (B1 to B4).
 *
 * 1. Effective reactivity: a "sensitive" skin profile raises a low or missing
 *    self-reported reactivity to "moderate", so the barrier guardrail applies.
 *    It never lowers what the user reported.
 * 2. Texture vote: five signals each vote for a richer (+1) or lighter (-1)
 *    routine: skin profile, finish preference, research concern, humidity and
 *    temperature. The sum picks the hydration and moisturising variants and
 *    sets the target richness used to rank ingredients.
 * 3. User fit: a fifth candidate-score factor (0 to 1) that says how well an
 *    ingredient fits this user: its recorded concern contexts, its texture
 *    against the target richness, and (for reactive skin) whether its
 *    functional class is soothing or protective.
 *
 * Every rule is a fixed, documented research parameter. None is learned, and
 * none has been clinically validated; they are listed for expert review in
 * data/ingredients/ingredient-texture.v1.json.
 */

export const COLD_MAX_C = 15;
export const HOT_MIN_C = 30;
export const DRY_AIR_MAX_HUMIDITY = 50;
export const HUMID_AIR_MIN_HUMIDITY = 75;

const RICHER_CONCERNS = new Set(["dryness", "barrier", "sensitivity", "redness"]);
const LIGHTER_CONCERNS = new Set(["oil", "acne", "pores"]);

let textureTable = null;
function textures() {
  if (!textureTable) {
    try {
      textureTable = JSON.parse(readFileSync(new URL("../data/ingredients/ingredient-texture.v1.json", import.meta.url), "utf8"));
    } catch {
      textureTable = { classes: {}, ingredients: {} };
    }
  }
  return textureTable;
}

const num = (v) => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n; };
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export function effectiveReactivity({ profile, reactivityLevel } = {}) {
  const stated = ["low", "moderate", "high"].includes(reactivityLevel) ? reactivityLevel : "low";
  if (profile === "sensitive" && stated === "low") return { level: "moderate", stated, raisedByProfile: true };
  return { level: stated, stated, raisedByProfile: false };
}

/** The richer/lighter vote. Returns each signal's vote so the UI and PEG can show it. */
export function textureVotes({ profile, finishPreference, concern, readings = {} } = {}) {
  const humidity = num(readings?.humidity);
  const temperature = num(readings?.temperature);
  const votes = [];
  if (profile === "dry") votes.push({ signal: "profile", value: "dry", vote: 1, reason: "dry skin profile" });
  else if (profile === "oily") votes.push({ signal: "profile", value: "oily", vote: -1, reason: "oily skin profile" });
  if (finishPreference === "dewy") votes.push({ signal: "finish", value: "dewy", vote: 1, reason: "dewy finish preference" });
  else if (finishPreference === "matte") votes.push({ signal: "finish", value: "matte", vote: -1, reason: "matte finish preference" });
  if (RICHER_CONCERNS.has(concern)) votes.push({ signal: "concern", value: concern, vote: 1, reason: `${concern} concern` });
  else if (LIGHTER_CONCERNS.has(concern)) votes.push({ signal: "concern", value: concern, vote: -1, reason: `${concern} concern` });
  if (humidity !== null && humidity <= DRY_AIR_MAX_HUMIDITY) votes.push({ signal: "humidity", value: humidity, vote: 1, reason: `humidity ${Math.round(humidity)}% (dry air)` });
  else if (humidity !== null && humidity >= HUMID_AIR_MIN_HUMIDITY) votes.push({ signal: "humidity", value: humidity, vote: -1, reason: `humidity ${Math.round(humidity)}% (humid air)` });
  if (temperature !== null && temperature <= COLD_MAX_C) votes.push({ signal: "temperature", value: temperature, vote: 1, reason: `${Math.round(temperature)} °C (cold)` });
  else if (temperature !== null && temperature >= HOT_MIN_C) votes.push({ signal: "temperature", value: temperature, vote: -1, reason: `${Math.round(temperature)} °C (hot)` });
  const sum = votes.reduce((total, item) => total + item.vote, 0);
  return {
    votes,
    sum,
    direction: sum > 0 ? "richer" : sum < 0 ? "lighter" : "balanced",
    targetRichness: round(clamp(0.5 + 0.15 * sum, 0.1, 0.9)),
  };
}

export function ingredientTexture(ingredientId) {
  const table = textures();
  const explicit = table.ingredients?.[ingredientId];
  if (explicit) return explicit;
  return null;
}

/**
 * How well one candidate fits this user, 0 to 1.
 * `concernContexts` comes from the ingredient's database record.
 */
export function userFit({ ingredientId, concern, concernContexts = [], texture = null, reactivityLevel = "low" } = {}) {
  const components = [];
  const info = ingredientTexture(ingredientId);
  const contexts = (concernContexts || []).map((item) => String(item).toLowerCase());
  components.push(contexts.includes(concern)
    ? { id: "concern", x: 1, reason: `its database record lists the ${concern} context` }
    : { id: "concern", x: 0.3, reason: `its database record does not list the ${concern} context` });
  if (info && typeof info.richness === "number" && texture) {
    const gap = Math.abs(info.richness - texture.targetRichness);
    const x = round(clamp(1 - gap / 0.6));
    const feel = info.richness >= 0.65 ? "richer" : info.richness <= 0.35 ? "lighter" : "medium";
    components.push({ id: "texture", x, feel, direction: texture.direction, basis: info.basis, reason: texture.direction === "balanced" ? `a ${feel} texture (${info.basis}) for a balanced routine` : `a ${feel} texture (${info.basis}) for a routine that leans ${texture.direction}` });
  }
  if (["moderate", "high"].includes(reactivityLevel) && info) {
    components.push(info.gentle
      ? { id: "gentleness", x: 1, reason: "a soothing or protective functional class for reactive skin" }
      : { id: "gentleness", x: 0.4, reason: "not a soothing or protective functional class" });
  }
  const value = round(components.reduce((total, item) => total + item.x, 0) / components.length);
  return { value, components };
}
