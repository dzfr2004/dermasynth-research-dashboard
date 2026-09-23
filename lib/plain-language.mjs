import { functionalClass } from "./ingredient-evidence-corpus.mjs";
import { evidenceGrade } from "./ingredient-evidence-notes.mjs";

/**
 * Everyday-language facts for the consumer "Why?" panel:
 *   what it is  - a plain definition of the ingredient's functional class;
 *   is it safe  - who assessed it and what they concluded, from the verified
 *                 safety card;
 *   on labels   - the INCI name(s) and common names to look for.
 * These strings are both the rule-based text (shown when GPT is off) and part
 * of the facts GPT must stay within when it rewrites the panel; CUE checks
 * the GPT text against them.
 *
 * Definitions are developer-authored descriptions of what each class of
 * ingredient is. They describe a function, not an effect on the user, and are
 * listed for expert review alongside ingredient-texture.v1.json.
 */

export const FUNCTION_PLAIN = Object.freeze({
  "Humectant": "a humectant: an ingredient that attracts water and holds it in the top layer of the skin",
  "Humectant / soothing": "a humectant (an ingredient that attracts and holds water) that is also used in soothing products",
  "Humectant / solvent": "a humectant (an ingredient that attracts and holds water) that also helps other ingredients dissolve",
  "Protectant / hydration": "a hydrating, protective ingredient used in moisturisers and serums",
  "Emollient": "an emollient: an ingredient that softens and smooths the skin's surface",
  "Emollient / occlusive": "an emollient that also forms a light film on the skin to slow water loss",
  "Occlusive": "an occlusive: an ingredient that forms a thin film on the skin to slow water loss",
  "Barrier lipid": "a barrier lipid: one of the fats naturally found in the skin's outer layer",
  "Barrier / brightening": "a form of vitamin B3 used in moisturisers and serums",
  "Soothing": "a soothing ingredient used in products made for easily irritated skin",
  "Soothing / barrier": "a soothing ingredient used in products for easily irritated or dry skin",
  "Soothing / brightening": "an ingredient used in products for easily irritated skin and uneven tone",
  "Antioxidant": "an antioxidant: an ingredient that reacts with unstable molecules (free radicals), such as those formed by sunlight and pollution",
  "Mineral UV filter": "a mineral UV filter: it sits on the skin and reflects and absorbs UV light",
  "PHA exfoliant": "a PHA: a gentle type of chemical exfoliant that loosens dead cells on the skin's surface",
  "AHA exfoliant": "an AHA: a chemical exfoliant that loosens dead cells on the skin's surface",
  "AHA / pH adjuster": "an AHA (a chemical exfoliant) that is also used to adjust a product's acidity",
  "BHA exfoliant": "a BHA: an oil-soluble chemical exfoliant that loosens dead skin cells, including inside pores",
  "Acid (brightening)": "an acid used in products for uneven skin tone",
  "Brightening": "an ingredient used in products for uneven skin tone",
  "Retinoid": "a retinoid: a form of vitamin A used in skincare",
  "Antimicrobial (scalp)": "an ingredient mainly used in scalp and dandruff care",
});

// Common names people see on packaging, where they differ from the INCI name.
const LABEL_NOTES = Object.freeze({
  "sodium-hyaluronate": "Often sold as \"hyaluronic acid\".",
  "ascorbic-acid": "Also known as vitamin C.",
  "tocopherol": "Also known as vitamin E.",
  "niacinamide": "Also known as vitamin B3.",
  "titanium-dioxide": "Found in mineral (physical) sunscreens.",
  "zinc-oxide": "Found in mineral (physical) sunscreens.",
  "glycerin": "Sometimes listed as glycerol.",
});

export function plainFunction(ingredientId) {
  const cls = functionalClass(ingredientId);
  return cls ? FUNCTION_PLAIN[cls] || `an ingredient classed as ${cls.toLowerCase()}` : null;
}

export function safetyPlain(ingredientId) {
  const grade = evidenceGrade(ingredientId);
  const family = String(grade.note?.sourceFamily || "").toUpperCase();
  if (family === "CIR") return "An independent US expert panel, the Cosmetic Ingredient Review (CIR), concluded it is safe as used in cosmetics.";
  if (family === "SCCS") return "The EU's Scientific Committee on Consumer Safety (SCCS) has assessed it for its permitted cosmetic uses.";
  if (family === "AICIS") return "Australia's industrial chemicals regulator (AICIS) has assessed it for cosmetic use.";
  if (family === "FDA" || family === "EU-REGULATION") return "It is permitted in cosmetics under US or EU rules.";
  if (grade.note) return "It is used in cosmetics, but no dedicated expert safety assessment was found.";
  return "No safety summary is recorded for it yet.";
}

export function labelNames({ ingredientId, displayName, inciNames = [], aliases = [] }) {
  const names = [...new Set([...(inciNames || []), ...(aliases || [])].filter(Boolean))];
  const note = LABEL_NOTES[ingredientId] || null;
  // Skip the note when it only repeats a name already listed.
  const repeats = note && names.slice(1).some((name) => note.toLowerCase().includes(name.toLowerCase()));
  return { names: names.length ? names : [displayName], note: repeats ? null : note };
}

const capital = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);

/** Rule-based consumer panel (no GPT). `whyToday` comes from the step reason. */
export function consumerIngredientFacts({ entry, whyToday }) {
  const fn = plainFunction(entry.ingredientId);
  return {
    whatItIs: fn ? `${capital(fn)}.` : `${entry.displayName} is an approved cosmetic ingredient.`,
    whyToday,
    safety: safetyPlain(entry.ingredientId),
    labels: labelNames({ ingredientId: entry.ingredientId, displayName: entry.displayName, inciNames: entry.inciNames, aliases: entry.aliases }),
  };
}

export const CONCERN_WORDS = Object.freeze({ acne: "breakouts", barrier: "a sensitive skin barrier", pigment: "uneven tone", dryness: "dryness", oil: "oiliness", sensitivity: "sensitivity", texture: "rough texture", redness: "redness", radiance: "dullness", pores: "visible pores" });

function uvWord(uvi) {
  const v = Number(uvi);
  if (!Number.isFinite(v)) return null;
  return v < 3 ? "low" : v < 6 ? "moderate" : v < 8 ? "high" : v < 11 ? "very high" : "extreme";
}
const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0] || "");
function voteWords(item) {
  if (item.signal === "concern") return `your ${CONCERN_WORDS[item.value] || item.value} concern`;
  if (item.signal === "profile") return `your ${item.value} skin`;
  if (item.signal === "finish") return `your ${item.value} finish preference`;
  if (item.signal === "humidity") return item.vote > 0 ? `dry air (${Math.round(item.value)}% humidity)` : `humid air (${Math.round(item.value)}% humidity)`;
  return item.vote > 0 ? `the cold (${Math.round(item.value)} °C)` : `the heat (${Math.round(item.value)} °C)`;
}

/** Why this step is in today's routine, in everyday words (same facts as the rule-based reason). */
export function plainStepReason({ step, phase, environment, routine }) {
  const readings = environment?.readings || {};
  const generation = routine?.generation || {};
  const vote = generation.textureVote;
  const guarded = (step?.ruleIds || []).includes("low-irritation-barrier-guardrail");
  const id = step?.id || "";
  if (id === "low-irritation-cleansing") return phase === "am" ? `Start the day with a gentle cleanse${guarded ? ", kept extra mild for your skin" : ""}.` : `Gently wash off sunscreen and the day's grime${guarded ? ", kept extra mild for your skin" : ""}.`;
  if (/hydration|moisturising/.test(id)) {
    if (guarded) return generation.reactivityRaisedByProfile ? "Kept extra gentle and comforting because your skin is sensitive." : "Kept extra gentle and comforting for your skin today.";
    if (vote?.direction === "richer") return `A richer texture today because of ${list(vote.votes.filter((v) => v.vote > 0).map(voteWords))}.`;
    if (vote?.direction === "lighter") return `Kept light today because of ${list(vote.votes.filter((v) => v.vote < 0).map(voteWords))}.`;
    return "A balanced texture suits today's conditions.";
  }
  if (id === "daytime-photoprotection") {
    const word = uvWord(readings.uvi);
    return word ? `UV is ${word} today (${Number(readings.uvi).toFixed(1)}), so sunscreen ${["high", "very high", "extreme"].includes(word) ? "is essential" : "still matters when you go out"}.` : "Sunscreen is kept in because today's UV couldn't be read.";
  }
  if (id === "antioxidant-context") return `The air is hazy today (PM2.5 ${Math.round(Number(readings.pm25))} µg/m³), so an antioxidant step is added.`;
  if (id === "texture-renewal") return "Evenings only, because exfoliants make skin more sensitive to the sun.";
  if (id === "overnight-comfort") return "The last step of your evening routine.";
  return "";
}

/** "Why it suits you" from the fit components that count in its favour. */
export function plainFitReasons({ userFit, concern }) {
  const out = [];
  for (const c of userFit?.components || []) {
    if (c.x < 0.6) continue;
    if (c.id === "concern") out.push(`It is one of the ingredients DermaSynth's records link to ${CONCERN_WORDS[concern] || concern}.`);
    if (c.id === "texture") out.push(c.direction === "balanced" ? `Its ${c.feel} texture suits a balanced routine.` : `Its ${c.feel} texture suits today's ${c.direction} routine.`);
    if (c.id === "gentleness") out.push("It is a gentle choice for skin that reacts easily.");
  }
  return out;
}
