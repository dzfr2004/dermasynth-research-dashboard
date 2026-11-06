/**
 * Symptom triage: decides whether free-text symptoms need professional care
 * before any routine is generated.
 *
 * Layer 1 (deterministic, always runs):
 *   - text is split into clauses (sentence punctuation, "but", "however");
 *   - words are matched by stem, so "swollen", "swelling" and "swells" all
 *     match, and by edit distance 1 (2 for long words) so typos such as
 *     "blistr" or "swolen" still match;
 *   - a match is ignored when a negation ("no", "not", "without", "never",
 *     "don't", ...) appears up to three words before it in the same clause,
 *     unless the negation is itself hedged ("not sure", "not certain");
 *   - some findings only count together (a burn/sting/itch/redness word plus a
 *     "new product" context, or redness plus "spreading").
 * Layer 2 (optional, lib/triage-llm.mjs): a model second opinion that can only
 * turn "cleared" into "redirect", never the reverse.
 *
 * Tested by scripts/evaluate-triage.mjs against a labelled case set.
 */

// Each rule: id, category, stems (a token matches when it starts with a stem
// after typo tolerance), optional `requiresAny` groups that must also appear
// in the same clause, and `always` phrases matched as literal text.
const RULES = [
  { id: "swelling", category: "possible allergic reaction", stems: ["swell", "swollen", "swolen", "puff", "puffy", "puffiness", "oedema", "edema", "balloon"], requiresAny: [["face", "facial", "lip", "lips", "eye", "eyes", "eyelid", "eyelids", "tongue", "throat", "mouth", "cheek", "cheeks", "skin", "neck", "jaw", "whole", "entire"]] },
  { id: "hives", category: "possible allergic reaction", stems: ["hives", "welts", "urticaria", "anaphyla"] },
  { id: "breathing", category: "urgent", phrases: [/\b(difficulty|trouble|hard|struggling|can'?t|cannot|unable)\s+(to\s+)?breath/i, /\bshort(ness)?\s+of\s+breath/i, /\bwheez/i, /\bthroat\s+(is\s+|feels\s+)?(tight|closing|swell)/i, /\bchest\s+(feels\s+|is\s+|gets\s+)?tight/i, /\bbreath(ing)?\s+(is\s+|feels\s+)?(hard|difficult|laboured|labored)/i] },
  { id: "blister", category: "acute skin reaction", stems: ["blister", "blistering"] },
  { id: "fluid-blisters", category: "acute skin reaction", phrases: [/\bfluid[\s-]*filled/i, /\bwater\s+blisters?/i, /\bbubbles?\s+(on|under|in)\s+(my\s+)?(skin|face|chin|cheek|lip|forehead|nose|neck)/i] },
  { id: "bleeding", category: "acute skin reaction", stems: ["bleed", "bleeding", "bled"] },
  { id: "pus", category: "possible infection", stems: ["pus", "oozing", "ooze", "weeping", "discharge"], exact: ["pus"] },
  { id: "leaking", category: "possible infection", phrases: [/\b(leak|leaking|draining|dripping)\w*\b.{0,25}\b(fluid|liquid|pus|yellow|clear)/i] },
  { id: "hot-red-painful", category: "possible infection", phrases: [/\bhot\b.{0,30}\b(red|swollen|painful|hurts?|tender)\b/i, /\b(red|swollen|painful|tender)\b.{0,30}\bhot\s+to\s+(the\s+)?touch/i, /\bred\s+streaks?/i] },
  { id: "infection", category: "possible infection", stems: ["infect", "infected", "infection", "cellulitis", "abscess"] },
  { id: "fever", category: "possible infection", stems: ["fever", "feverish", "chills"] },
  { id: "severe-pain", category: "urgent", phrases: [/\b(severe|extreme|intense|unbearable|very\s+bad|excruciating|really\s+bad)\s+(pain|burning|stinging)/i, /\b(very|extremely|really)\s+painful/i, /\bhurts?\s+(so\s+much|a\s+lot|badly|really\s+bad)/i, /\b(pain|hurts?)\b.{0,30}\bcant\s+sleep/i, /\bcant\s+sleep\b.{0,30}\b(pain|hurts?)/i, /\bburning\s+like\s+fire/i] },
  { id: "mole", category: "needs clinical assessment", phrases: [/\bmole\b.{0,30}\b(chang|grow|bigger|bleed|itch|dark|new|irregular|spread)/i, /\b(spot|patch|lesion|mark|growth)\b.{0,40}\b(has\s+grown|grew|growing|changed\s+(colou?r|shape|size)|changing\s+(colou?r|shape|size)|keeps?\s+bleeding|bleeds)/i, /\b(chang|grow|new|irregular|bleed)\w*\s+(\w+\s+)?mole/i, /\bskin\s+cancer/i, /\bmelanoma/i, /\bsore\s+(that\s+)?(won'?t|doesn'?t|does\s+not|will\s+not)\s+heal/i, /\blumps?\b/i] },
  { id: "open-wound", category: "needs clinical assessment", phrases: [/\bopen\s+(wound|sore|cut)/i, /\braw\s+(skin|patch|area)/i, /\bskin\s+(is\s+)?(cracked\s+and\s+)?bleeding/i] },
  { id: "spreading", category: "acute skin reaction", stems: ["spreading", "spread", "spreads"], requiresAny: [["rash", "redness", "red", "rapidly", "fast", "quickly", "rapid"]] },
  { id: "widespread-rash", category: "acute skin reaction", phrases: [/\b(widespread|all\s+over|whole\s+body|entire\s+body|body\s+rash)/i] },
  { id: "product-reaction", category: "possible reaction to a product", stems: ["burn", "burning", "burned", "burnt", "sting", "stinging", "stings", "itch", "itchy", "itching", "rash", "red", "redness", "redden", "peel", "peeling", "hives", "bumps", "reaction", "irritat", "swell", "swollen", "puffy"], requiresAny: [["after", "since", "from", "when", "applying", "applied", "using", "used"], ["product", "products", "cream", "serum", "lotion", "moisturiser", "moisturizer", "sunscreen", "toner", "mask", "peel", "cleanser", "treatment", "retinol", "acid", "new", "applying", "applied", "using"]] },
  { id: "worsening", category: "needs clinical assessment", phrases: [/\b(getting|keeps?\s+getting|is\s+getting|gets)\s+worse/i, /\bworsen/i, /\bnot\s+(getting\s+)?(better|improving)/i, /\bwon'?t\s+go\s+away/i] },
  { id: "scarring", category: "needs clinical assessment", stems: ["scarring"] },
  // Loss of sensation, or a pale/white/leathery patch after a burn, can mean a
  // deeper burn or nerve involvement (added 2026-09-25 after the fresh set).
  // "numb" is exact so "numbing cream" does not match.
  { id: "numbness", category: "needs clinical assessment", stems: ["numb", "numbness"], exact: ["numb"] },
  { id: "lost-sensation", category: "needs clinical assessment", phrases: [/\b(no|lost\s+(the\s+)?|loss\s+of)\s*(feeling|sensation)\b/i, /\bcan'?t\s+feel\s+(anything|my\s+skin|it|the\s+(skin|spot|patch|area))/i, /\bcant\s+feel\s+(anything|my\s+skin|it|the\s+(skin|spot|patch|area))/i] },
  { id: "pale-after-burn", category: "needs clinical assessment", phrases: [/\b(white|pale|waxy|grey|gray|leathery)\b.{0,40}\b(after|from|since)\b.{0,25}\b(sun\s*burn|burn|burnt|burned|peel)/i, /\b(sun\s*burn|burn|burnt|burned)\w*\b.{0,40}\b(white|waxy|leathery)\b/i] },
  { id: "distress", category: "needs clinical assessment", phrases: [/\bdistress(ing)?\s+symptom/i] },
  // Added 2026-11-06 after the first run of the second blind set
  // (triage-cases.blind2.v1.json); its first-run result is kept unchanged.
  { id: "fever-high-temperature", category: "possible infection", phrases: [/\bhigh\s+temp(erature)?\b/i, /\btemperature\s+(of\s+)?(3[89]|4[0-2])/i] },
  { id: "child-with-rash", category: "urgent", phrases: [/\b(baby|babys|infant|newborn|toddler)\b.{0,50}\b(rash|spots|temperature|fever)/i] },
  { id: "non-blanching", category: "urgent", phrases: [/\b(dont|do\s+not|doesnt|wont)\s+fade\b.{0,40}\b(press|glass)/i, /\bglass\s+test/i] },
  { id: "spreading-crust", category: "possible infection", phrases: [/\b(crust|crusty|crusted|scab|scabs|scabby)\b.{0,40}\b(spread|golden|honey|yellow)/i, /\b(golden|honey)[\s-]*(colou?red\s+)?(crust|scab)/i] },
  { id: "sores-unwell", category: "needs clinical assessment", phrases: [/\b(sores?|ulcers?)\b.{0,50}\b(unwell|sick|fever|shivery)/i, /\b(unwell|sick|fever|shivery)\b.{0,50}\b(sores?|ulcers?)/i, /\bpunched[\s-]*out/i, /\bmouth\s+(is\s+)?(sore|ulcer|blister)/i] },
  { id: "drug-reaction", category: "urgent", phrases: [/\b(new|started|starting|began)\b.{0,25}\b(tablets?|pills?|medicine|medication|antibiotics?|drug)\b/i, /\bpeel\w*\s+(off\s+)?in\s+sheets/i] },
  { id: "changing-spot", category: "needs clinical assessment", phrases: [/\b(spot|patch|mark|mole|freckle|growth)\b.{0,40}\b(got|getting|grown|grew|become)\s+(much\s+)?(bigger|larger|darker|raised)/i, /\bedges?\s+(look|looks|is|are|seems?)?\s*(uneven|irregular|ragged|blurry|jagged)/i, /\bmole\b.{0,30}\bcrust/i] },
  { id: "night-itch-fingers", category: "needs clinical assessment", phrases: [/\bitch\w*\b.{0,40}\b(at\s+night|between\s+(my\s+)?(fingers|toes))/i, /\bburrows?\b/i] },
  { id: "ring-rash", category: "needs clinical assessment", phrases: [/\b(ring|circular|round)\b.{0,25}\b(scaly|rash|patch)\b/i, /\bringworm/i] },
  // Malay and mixed Malay-English (blind set 2 showed the rules did not cover them).
  { id: "malay-swelling", category: "possible allergic reaction", phrases: [/\bbengkak/i] },
  { id: "malay-blister-burn", category: "acute skin reaction", phrases: [/\bmelecur/i, /\bmelepuh/i, /\bberair\b/i, /\blepuh/i] },
  { id: "malay-pus-bleeding", category: "possible infection", phrases: [/\b(ber)?nanah/i, /\bberdarah/i] },
  { id: "malay-fever", category: "possible infection", phrases: [/\bdemam/i] },
  { id: "malay-breathing", category: "urgent", phrases: [/\b(susah|sukar|payah|tak\s+boleh)\s+(nak\s+)?bernafas/i, /\bsesak\s+nafas/i] },
  { id: "malay-widespread", category: "acute skin reaction", phrases: [/\b(satu|seluruh)\s+badan/i, /\bruam\b.{0,25}\bmerebak/i, /\bmerebak/i] },
];

const NEGATORS = new Set(["no", "not", "never", "without", "dont", "doesnt", "didnt", "isnt", "arent", "wasnt", "werent", "havent", "hasnt", "none", "nor", "zero", "free"]);
const HEDGES = new Set(["sure", "certain", "know", "positive"]);
// Common English words one edit away from a symptom stem; never typo-matched.
const TYPO_STOPLIST = new Set(["fewer", "never", "lever", "liver", "fiver", "lives", "hides", "hikes", "hires", "dives", "fives", "string", "strings", "thing", "things", "turning", "burying", "sting", "swell", "spell", "smell", "dozing", "bleed", "breed", "bread", "freed", "greed", "infest", "infested", "pull", "puss", "plus", "pus", "red", "bed", "rest", "peek", "reel", "feel", "feels", "bumps", "pumps", "jumps", "welts", "melts", "belts", "wells", "cells", "sells", "tells", "bells", "chills", "hills", "fills", "mills", "pills", "wills", "spills", "boils", "coils", "foils", "soils", "toils", "boil", "coil", "foil", "soil", "toil", "spread", "bred", "blister"]);

function normalise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/n't\b/g, "nt")
    .replace(/'/g, "");
}

function clausesOf(text) {
  return normalise(text)
    .split(/[.!?;\n]+|\bbut\b|\bhowever\b|\balthough\b|\bthough\b/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function tokens(clause) {
  return clause.split(/[^a-z0-9]+/).filter(Boolean);
}

// Damerau-Levenshtein (optimal string alignment) with an early cut-off.
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

function tokenMatchesStem(token, stem, exactOnly = false) {
  if (token === stem) return true;
  if (exactOnly) return false;
  if (stem.length >= 4 && token.startsWith(stem)) return true;
  if (TYPO_STOPLIST.has(token) || stem.length < 5) return false;
  // A 4-letter token may be a 5-letter stem with one letter dropped ("fevr").
  if (token.length === 4 && stem.length === 5) {
    return [...stem].some((_, i) => stem.slice(0, i) + stem.slice(i + 1) === token);
  }
  // Typo tolerance: only for tokens of 5+ letters that are not common words.
  if (token.length < 5) return false;
  const max = stem.length >= 9 ? 2 : 1;
  const prefix = token.slice(0, Math.min(token.length, stem.length + 1));
  return editDistance(token, stem, max) <= max || editDistance(prefix, stem, max) <= max || editDistance(token.slice(0, stem.length), stem, max) <= max - (stem.length < 9 ? 0 : 1);
}

// Words that end a negation's scope ("no fever and my lips are swollen").
const SCOPE_BREAKERS = new Set(["and", "so", "because", "now", "then", "which", "while", "yet", "until", "except"]);

// A match is negated when a negator appears up to six words before it, with
// no scope breaker in between ("I don't have any rash or hives" is negated;
// "no fever and my lips are swollen" is not).
function negatedAt(words, index) {
  for (let k = index - 1; k >= Math.max(0, index - 6); k -= 1) {
    if (SCOPE_BREAKERS.has(words[k])) return false;
    if (NEGATORS.has(words[k]) && !HEDGES.has(words[k + 1])) return true;
  }
  return false;
}

function clauseHasAny(words, group) {
  return words.some((word) => group.some((item) => word === item || (item.length >= 5 && word.startsWith(item))));
}

/**
 * @returns {{ redirect: boolean, matches: Array<{rule, category, term, clause}>, negated: Array<{rule, term, clause}> }}
 */
export function analyseSymptoms(text) {
  const matches = [];
  const negated = [];
  for (const clause of clausesOf(text)) {
    const words = tokens(clause);
    for (const rule of RULES) {
      if (rule.phrases) {
        for (const pattern of rule.phrases) {
          const match = clause.match(pattern);
          if (!match) continue;
          const before = tokens(clause.slice(0, match.index));
          const isNegated = negatedAt([...before, "__"], before.length);
          (isNegated ? negated : matches).push({ rule: rule.id, category: rule.category, term: match[0].trim(), clause });
          break;
        }
        continue;
      }
      const index = words.findIndex((word) => rule.stems.some((stem) => tokenMatchesStem(word, stem, (rule.exact || []).includes(stem))));
      if (index < 0) continue;
      if (rule.requiresAny && !rule.requiresAny.every((group) => clauseHasAny(words, group))) continue;
      const record = { rule: rule.id, category: rule.category, term: words[index], clause };
      if (negatedAt(words, index)) negated.push(record);
      else matches.push(record);
    }
  }
  return { redirect: matches.length > 0, matches, negated };
}
