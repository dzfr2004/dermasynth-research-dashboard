export const ALLOWED_PROFILES = new Set(["dry", "combination", "oily", "sensitive"]);
export const ALLOWED_FINISH_PREFERENCES = new Set(["matte", "dewy", "no-preference"]);
export const ALLOWED_REACTIVITY_LEVELS = new Set(["low", "moderate", "high"]);
export const ALLOWED_EXPOSURE_CONTEXTS = new Set(["indoors", "mixed", "outdoors"]);

/**
 * These labels intentionally describe a research-preview topic rather than a
 * diagnosis or treatment indication. New topics without eligible indexed
 * evidence still receive a category-only fallback; they never unlock a claim.
 */
export const CONCERN_CATALOG = Object.freeze([
  {
    id: "acne",
    label: "Breakout-prone appearance",
    shortLabel: "Breakouts",
    description: "Research context for a simple, non-prescriptive routine preview.",
  },
  {
    id: "barrier",
    label: "Barrier comfort",
    shortLabel: "Barrier comfort",
    description: "Research context for low-irritation, comfort-focused categories.",
  },
  {
    id: "pigment",
    label: "Uneven-tone context",
    shortLabel: "Uneven tone",
    description: "Research context only; this does not assess or treat pigmentation conditions.",
  },
  {
    id: "sensitivity",
    label: "Sensitivity context",
    shortLabel: "Sensitivity",
    description: "Self-reported comfort context only; this prototype does not diagnose sensitive skin.",
  },
  {
    id: "dryness",
    label: "Dry-feeling comfort",
    shortLabel: "Dryness",
    description: "A non-medical comfort topic that remains generic unless eligible evidence is available.",
  },
  {
    id: "oil",
    label: "Oil/shine context",
    shortLabel: "Oil / shine",
    description: "A non-medical appearance topic that remains generic unless eligible evidence is available.",
  },
  {
    id: "texture",
    label: "Texture appearance",
    shortLabel: "Texture",
    description: "A cosmetic appearance topic; it does not assess scars, lesions, or a skin condition.",
  },
  {
    id: "redness",
    label: "Redness-prone appearance",
    shortLabel: "Redness",
    description: "A self-reported cosmetic appearance topic; it does not assess underlying causes.",
  },
  {
    id: "radiance",
    label: "Dullness/radiance appearance",
    shortLabel: "Radiance",
    description: "A cosmetic appearance topic; it does not assess skin health or barrier function.",
  },
  {
    id: "pores",
    label: "Visible-pore appearance",
    shortLabel: "Visible pores",
    description: "A cosmetic appearance topic; it does not assess pore size, sebum production, or underlying skin function.",
  },
]);

export const ALLOWED_CONCERNS = new Set(CONCERN_CATALOG.map(({ id }) => id));

const CONCERN_ALIASES = new Map([
  ["oiliness", "oil"],
  ["oily", "oil"],
  ["sensitive", "sensitivity"],
  ["uneven-tone", "pigment"],
  ["hyperpigmentation", "pigment"],
]);

export function normaliseConcern(value) {
  if (typeof value !== "string") return "";
  const candidate = value.trim().toLowerCase();
  const canonical = CONCERN_ALIASES.get(candidate) || candidate;
  return ALLOWED_CONCERNS.has(canonical) ? canonical : "";
}

export const ROUTINE_CATEGORY_CATALOG = Object.freeze({
  "low-irritation-cleansing": Object.freeze({
    category: "Cleansing",
    title: "Low-irritation cleansing category",
    note: "A gentle starting category for both routine phases.",
  }),
  "comfort-hydration": Object.freeze({
    category: "Hydration",
    title: "Comfort-focused hydration category",
    note: "Comfort-focused hydration context.",
  }),
  "light-hydration": Object.freeze({
    category: "Hydration",
    title: "Light hydration category",
    note: "Lightweight hydration context.",
  }),
  "supportive-hydration": Object.freeze({
    category: "Hydration",
    title: "Supportive hydration category",
    note: "Balanced hydration context.",
  }),
  "barrier-support-moisturising": Object.freeze({
    category: "Moisturising",
    title: "Barrier-support moisturising category",
    note: "Comfort-focused moisturising context.",
  }),
  "lightweight-moisturising": Object.freeze({
    category: "Moisturising",
    title: "Lightweight moisturising category",
    note: "Lightweight moisturising context.",
  }),
  "supportive-moisturising": Object.freeze({
    category: "Moisturising",
    title: "Supportive moisturising category",
    note: "Supportive moisturising context.",
  }),
  "daytime-photoprotection": Object.freeze({
    category: "Photoprotection",
    title: "Daytime photoprotection category",
    note: "Daytime UV-context category.",
  }),
  "antioxidant-context": Object.freeze({
    category: "Environmental context",
    title: "Antioxidant-context category",
    note: "Added when particulate readings are elevated.",
  }),
  "texture-renewal": Object.freeze({
    category: "Texture context",
    title: "Texture-renewal category",
    note: "Evening texture-context category.",
  }),
  "overnight-comfort": Object.freeze({
    category: "Comfort",
    title: "Overnight comfort category",
    note: "Overnight comfort context.",
  }),
});

export const ALLOWED_ROUTINE_CATEGORY_IDS = new Set(Object.keys(ROUTINE_CATEGORY_CATALOG));

const CONCERN_ROUTINE_COPY = Object.freeze({
  acne: {
    label: "Breakout-prone appearance AM/PM research preview",
    hydration: "light-hydration",
    moisturising: "lightweight-moisturising",
  },
  barrier: {
    label: "Barrier comfort AM/PM research preview",
    hydration: "comfort-hydration",
    moisturising: "barrier-support-moisturising",
  },
  pigment: {
    label: "Uneven-tone context AM/PM research preview",
    hydration: "supportive-hydration",
    moisturising: "supportive-moisturising",
  },
  sensitivity: {
    label: "Sensitivity context AM/PM research preview",
    hydration: "comfort-hydration",
    moisturising: "barrier-support-moisturising",
  },
  dryness: {
    label: "Dry-feeling comfort AM/PM research preview",
    hydration: "comfort-hydration",
    moisturising: "barrier-support-moisturising",
  },
  oil: {
    label: "Oil/shine context AM/PM research preview",
    hydration: "light-hydration",
    moisturising: "lightweight-moisturising",
  },
  texture: {
    label: "Texture appearance AM/PM research preview",
    hydration: "supportive-hydration",
    moisturising: "supportive-moisturising",
  },
  redness: {
    label: "Redness-prone appearance AM/PM research preview",
    hydration: "comfort-hydration",
    moisturising: "barrier-support-moisturising",
  },
  radiance: {
    label: "Dullness/radiance appearance AM/PM research preview",
    hydration: "supportive-hydration",
    moisturising: "supportive-moisturising",
  },
  pores: {
    label: "Visible-pore appearance AM/PM research preview",
    hydration: "light-hydration",
    moisturising: "lightweight-moisturising",
  },
});

const DEFAULT_HYDRATION_CONCERNS = new Set(["barrier", "sensitivity", "dryness"]);
const BARRIER_GUARDRAIL_CONCERNS = new Set(["barrier", "sensitivity", "dryness"]);
const TEXTURE_RENEWAL_CONCERNS = new Set(["acne", "oil", "texture", "pigment", "radiance", "pores"]);
// Retained only as the v1 baseline for scripts/evaluate-triage.mjs.
export const LEGACY_MEDICAL_REDIRECT_PATTERN = /\b(bleed(?:ing)?|blister(?:ing|s)?|rapidly spreading|spreading rapidly|difficulty breathing|shortness of breath|(?:face|facial|lip|eye) swelling|anaphylaxis|infect(?:ed|ion)|pus|fever|severe pain|changing mole|skin cancer|widespread rash|open wound|burn(?:ing)? after (?:a )?product|persistent(?:ly)? worsening|symptoms? (?:are )?worsening|scar(?:ring)?|distress(?:ing)? symptoms?)\b/i;
const BLOCKED_MODEL_CONTENT = /\b(isotretinoin|tretinoin|adapalene|prescription|topical steroid|corticosteroid|clindamycin|antibiotic(?:s)?|diagnos(?:e|is|tic)|cure|guarantee|treat(?:s|ment|ing)? eczema|treat(?:s|ment|ing)? acne)\b/i;
const SPECIFIC_INGREDIENT_OR_PRODUCT_PATTERN = /\b(niacinamide|ceramide(?:s)?|ceramide\s*(?:1|3|6\s*ii)|cholesterol|dexpanthenol|panthenol|glycerin|glycerol|hyaluronic acid|sodium hyaluronate|urea|salicylic acid|glycolic acid|lactic acid|benzoyl peroxide|retinol|retinoid|azelaic acid|tranexamic acid|kojic acid|colloidal oatmeal|avena sativa|tocopherol|vitamin e|vitamin c|ascorbic acid|hydroquinone|fragrance-free brand|spf\s*\d+)\b/i;
const PHOTOPROTECTION_PATTERN = /\b(photo[-\s]?protection|sun[-\s]?protection|sunscreen|sun\s*screen|broad[-\s]?spectrum|uv\s*protection)\b/i;
const BARRIER_EXFOLIATION_PATTERN = /\b(exfoliat(?:e|es|ed|ing|ion)|chemical peel|peel(?:ing)?|scrub(?:bing)?|aha|bha|pha|glycolic acid|salicylic acid|lactic acid)\b/i;
const BENZOYL_PEROXIDE_PATTERN = /\bbenzoyl peroxide\b/i;
const RETINOID_PATTERN = /\b(retinol|retinoid|tretinoin|adapalene)\b/i;

function validEvidenceId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9._:#/-]{1,160}$/.test(id) ? id : "";
}

function canonicalEvidence(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const id = validEvidenceId(item?.id ?? item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push({
      id,
      claimCategory: String(item?.claimCategory || "").toLowerCase(),
      envTags: Array.isArray(item?.envTags) ? item.envTags.map((tag) => String(tag).toLowerCase()) : [],
    });
    if (output.length >= 4) break;
  }
  return output;
}

function evidenceIdsFor(categoryId, evidence) {
  const candidates = canonicalEvidence(evidence);
  if (!candidates.length) return [];

  const isDaytime = categoryId === "daytime-photoprotection";
  const expected = candidates.filter((item) => {
    if (isDaytime) {
      return item.envTags.includes("uv") || item.claimCategory.includes("pigment") || item.claimCategory.includes("environment");
    }
    return !item.claimCategory.includes("clinical-scope-guardrail");
  });
  return (expected.length ? expected : candidates).slice(0, 2).map(({ id }) => id);
}

function categoryStep({ phase, categoryId, concern, environment, evidence, extraRuleIds = [] }) {
  const definition = ROUTINE_CATEGORY_CATALOG[categoryId];
  if (!definition) throw new Error(`Unknown routine category: ${categoryId}`);

  const evidenceIds = evidenceIdsFor(categoryId, evidence);
  const ruleIds = [
    "category-allowlist",
    "non-prescriptive-category-contract",
    `concern-${concern}`,
    `${phase}-phase`,
    ...extraRuleIds,
  ];
  if (evidenceIds.length) ruleIds.push("eligible-evidence-trace");

  return {
    id: categoryId,
    category: definition.category,
    title: definition.title,
    note: definition.note,
    evidenceIds,
    ruleIds: [...new Set(ruleIds)],
  };
}

function hydrationDefault(concern) {
  return DEFAULT_HYDRATION_CONCERNS.has(concern);
}

function normaliseOptionalChoice(value, allowed, fallback) {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return allowed.has(candidate) ? candidate : fallback;
}

function hasBarrierGuardrail(concern, reactivityLevel) {
  return BARRIER_GUARDRAIL_CONCERNS.has(concern) || reactivityLevel === "moderate" || reactivityLevel === "high";
}

function categoryVariants(copy, finishPreference, barrierGuardrail, environment) {
  // A moderate/high self-reported reactivity level is a deterministic
  // guardrail, not a style preference. It keeps the conservative variants
  // used by the existing barrier/sensitivity paths.
  if (barrierGuardrail) {
    return {
      hydration: "comfort-hydration",
      moisturising: "barrier-support-moisturising",
    };
  }
  const humidity = Number(environment?.readings?.humidity);
  // Environmental variants deliberately reuse the existing allowlisted
  // categories. They alter composition, never products, quantities, or rules.
  if (Number.isFinite(humidity) && humidity <= 50) {
    return { hydration: "comfort-hydration", moisturising: "barrier-support-moisturising" };
  }
  if (Number.isFinite(humidity) && humidity >= 75) {
    return { hydration: "light-hydration", moisturising: "lightweight-moisturising" };
  }
  if (finishPreference === "matte") {
    return {
      hydration: "light-hydration",
      moisturising: "lightweight-moisturising",
    };
  }
  if (finishPreference === "dewy") {
    return {
      hydration: "comfort-hydration",
      moisturising: "barrier-support-moisturising",
    };
  }
  return { hydration: copy.hydration, moisturising: copy.moisturising };
}

/**
 * Produce only fixed, allowlisted AM/PM category objects. A synthesis provider
 * may choose whether the optional hydration category is included, but it can
 * never provide user-facing ingredient names, products, quantities, or claims.
 */
export function createCategoryRoutine({
  concern = "acne",
  environment = null,
  evidence = [],
  includeHydration = undefined,
  finishPreference = undefined,
  reactivityLevel = undefined,
  exposureContext = undefined,
  generation = "deterministic-template",
} = {}) {
  const policy = getRuntimePolicy();
  const canonicalConcern = normaliseConcern(concern) || "acne";
  const copy = CONCERN_ROUTINE_COPY[canonicalConcern];
  const normalizedFinishPreference = normaliseOptionalChoice(finishPreference, ALLOWED_FINISH_PREFERENCES, "no-preference");
  const normalizedReactivityLevel = normaliseOptionalChoice(reactivityLevel, ALLOWED_REACTIVITY_LEVELS, "low");
  const normalizedExposureContext = normaliseOptionalChoice(exposureContext, ALLOWED_EXPOSURE_CONTEXTS, "mixed");
  const barrierGuardrail = hasBarrierGuardrail(canonicalConcern, normalizedReactivityLevel);
  const variants = categoryVariants(copy, normalizedFinishPreference, barrierGuardrail, environment);
  const uvi = Number(environment?.readings?.uvi);
  const highUv = Number.isFinite(uvi) && uvi >= policy.environment.highUvThreshold;
  // Preserve the conservative baseline for callers with no live reading;
  // an explicit low/night-time UVI is what removes the daytime category.
  const uvThreshold = normalizedExposureContext === "outdoors" ? 1 : normalizedExposureContext === "indoors" ? policy.environment.highUvThreshold : 3;
  const uvActive = !Number.isFinite(uvi) || uvi >= uvThreshold;
  const includesHydration = barrierGuardrail || !uvActive
    ? true
    : typeof includeHydration === "boolean"
      ? includeHydration
      : hydrationDefault(canonicalConcern);
  const highPm25 = Number(environment?.readings?.pm25) >= policy.environment.highPm25Threshold;
  const textureRenewalAllowed = TEXTURE_RENEWAL_CONCERNS.has(canonicalConcern) && !barrierGuardrail;
  const commonRules = barrierGuardrail
    ? ["low-irritation-barrier-guardrail"]
    : [];

  const am = [
    categoryStep({
      phase: "am",
      categoryId: "low-irritation-cleansing",
      concern: canonicalConcern,
      environment,
      evidence,
      extraRuleIds: commonRules,
    }),
    ...(includesHydration ? [categoryStep({
      phase: "am",
      categoryId: variants.hydration,
      concern: canonicalConcern,
      environment,
      evidence,
      extraRuleIds: commonRules,
    })] : []),
    ...(highPm25 ? [categoryStep({
      phase: "am",
      categoryId: "antioxidant-context",
      concern: canonicalConcern,
      environment,
      evidence,
      extraRuleIds: [...commonRules, "high-pm25-antioxidant-context-rule"],
    })] : []),
    ...(uvActive ? [categoryStep({
      phase: "am",
      categoryId: "daytime-photoprotection",
      concern: canonicalConcern,
      environment,
      evidence,
      extraRuleIds: highUv ? ["high-uv-photoprotection-rule"] : ["received-uv-photoprotection-rule"],
    })] : []),
  ];

  const pm = [
    categoryStep({
      phase: "pm",
      categoryId: "low-irritation-cleansing",
      concern: canonicalConcern,
      environment,
      evidence,
      extraRuleIds: commonRules,
    }),
    categoryStep({
      phase: "pm",
      categoryId: variants.moisturising,
      concern: canonicalConcern,
      environment,
      evidence,
      extraRuleIds: commonRules,
    }),
    ...(textureRenewalAllowed ? [categoryStep({
      phase: "pm",
      categoryId: "texture-renewal",
      concern: canonicalConcern,
      environment,
      evidence,
      extraRuleIds: ["texture-renewal-context-rule"],
    })] : []),
    categoryStep({
      phase: "pm",
      categoryId: "overnight-comfort",
      concern: canonicalConcern,
      environment,
      evidence,
      extraRuleIds: commonRules,
    }),
  ];

  const steps = [...am, ...pm].map((step) => [step.title, step.note]);
  return {
    schemaVersion: "1.0",
    label: copy.label,
    reason: "This fixed AM/PM research preview uses only broad category labels. It does not assess a condition or replace professional care.",
    am,
    pm,
    // Preserve the original tuple contract for existing UI consumers.
    steps,
    generation: {
      mode: generation,
      categoryOnly: true,
      includeHydration: includesHydration,
      finishPreference: normalizedFinishPreference,
      reactivityLevel: normalizedReactivityLevel,
      exposureContext: normalizedExposureContext,
      environmentalVariant: Number.isFinite(Number(environment?.readings?.humidity))
        ? Number(environment.readings.humidity) <= 50 ? "low-humidity-comfort" : Number(environment.readings.humidity) >= 75 ? "high-humidity-lightweight" : "balanced"
        : "unavailable",
      uvActive,
    },
  };
}

export function templateRoutine(concern, options = {}) {
  return createCategoryRoutine({ concern, ...options, generation: "deterministic-template" });
}

function safetyRule(id, label, status = "passed", detail = "") {
  return { id, label, status, ...(detail ? { detail } : {}) };
}

export function triageRoutineRequest({ symptoms = "" }) {
  const trimmedSymptoms = String(symptoms || "").trim().slice(0, 500);
  const checked = safetyRule("clinical-symptom-triage", "Urgent or clinical symptom triage");
  const analysis = trimmedSymptoms ? analyseSymptoms(trimmedSymptoms) : { redirect: false, matches: [], negated: [] };
  const triage = {
    method: "rules_v2_stems_typos_negation",
    matched: analysis.matches.map(({ rule, category, term }) => ({ rule, category, term })),
    negated: analysis.negated.map(({ rule, term }) => ({ rule, term })),
  };
  if (analysis.redirect) {
    const categories = [...new Set(analysis.matches.map((match) => match.category))];
    const flag = `The submitted symptoms may require clinical assessment (${categories.join(", ")}).`;
    return {
      status: "medical_redirect",
      checks: [checked.label],
      rules: [safetyRule(checked.id, checked.label, "redirected", flag)],
      flags: [flag],
      notices: ["This research prototype cannot assess urgent or clinical skin symptoms. Please seek appropriate professional care."],
      triage,
    };
  }

  return {
    status: "cleared",
    checks: [checked.label],
    rules: [checked],
    flags: [],
    notices: [],
    triage,
  };
}

export function firstSafetyPass({ concern, environment, reactivityLevel = undefined } = {}) {
  const policy = getRuntimePolicy();
  const canonicalConcern = normaliseConcern(concern) || "acne";
  const normalizedReactivityLevel = normaliseOptionalChoice(reactivityLevel, ALLOWED_REACTIVITY_LEVELS, "low");
  const barrierGuardrail = hasBarrierGuardrail(canonicalConcern, normalizedReactivityLevel);
  const rules = [
    safetyRule("prescription-exclusion", "No prescription-only ingredient categories selected"),
    safetyRule("incompatible-active-exclusion", "No deterministic incompatible active pair selected"),
    safetyRule("category-only-contract", "Only broad, non-prescriptive category identifiers may be assembled"),
  ];

  if (environment?.readings?.uvi !== null && environment?.readings?.uvi !== undefined && Number(environment.readings.uvi) >= policy.environment.highUvThreshold) {
    rules.push(safetyRule("high-uv-photoprotection", "High UV rule: daylight preview includes a photoprotection category"));
  }
  if (environment?.readings?.pm25 !== null && environment?.readings?.pm25 !== undefined && Number(environment.readings.pm25) >= policy.environment.highPm25Threshold) {
    rules.push(safetyRule("high-pm25-antioxidant-context", "High PM2.5 rule: daylight preview includes an antioxidant-context category"));
  }
  if (BARRIER_GUARDRAIL_CONCERNS.has(canonicalConcern)) {
    const label = canonicalConcern === "barrier"
      ? "Barrier rule: high-intensity exfoliation categories excluded from preview"
      : "Barrier-comfort rule: high-intensity exfoliation categories are excluded from preview";
    rules.push(safetyRule("barrier-exfoliation-exclusion", label));
  } else if (barrierGuardrail) {
    rules.push(safetyRule("low-irritation-barrier-guardrail", "Self-reported reactivity rule: conservative category variants are retained in the preview"));
    rules.push(safetyRule("barrier-exfoliation-exclusion", "Self-reported reactivity rule: high-intensity exfoliation categories are excluded from preview"));
  }

  return { status: "cleared", checks: rules.map(({ label }) => label), rules, flags: [] };
}

function structuredSteps(routine) {
  const phaseSteps = [
    ...(Array.isArray(routine?.am) ? routine.am.map((step) => ({ ...step, phase: "am" })) : []),
    ...(Array.isArray(routine?.pm) ? routine.pm.map((step) => ({ ...step, phase: "pm" })) : []),
  ];
  return phaseSteps;
}

function routineText(routine) {
  const structured = structuredSteps(routine);
  return [
    routine?.label,
    routine?.reason,
    routine?.generation?.aiRationale?.text,
    ...structured.flatMap((step) => [step.title, step.note]),
    ...(structured.length ? [] : (routine?.steps || []).flat()),
  ].filter(Boolean).join(" ");
}

export function secondSafetyPass(routine, {
  concern,
  environment,
  reactivityLevel = undefined,
  allowedEvidenceIds = [],
} = {}) {
  const policy = getRuntimePolicy();
  const canonicalConcern = normaliseConcern(concern) || "acne";
  const normalizedReactivityLevel = normaliseOptionalChoice(reactivityLevel, ALLOWED_REACTIVITY_LEVELS, "low");
  const barrierGuardrail = hasBarrierGuardrail(canonicalConcern, normalizedReactivityLevel);
  const combinedText = routineText(routine);
  const flags = [];
  const rules = [
    safetyRule("restricted-medical-content-scan", "Restricted medical/prescription claim scan"),
    safetyRule("incompatible-active-pair-scan", "Incompatible active-pair scan"),
    safetyRule("ingredient-product-specificity-scan", "Ingredient, quantity, and product-specificity scan"),
    safetyRule("structured-category-contract", "AM/PM category structure and evidence-link validation"),
  ];

  if (BLOCKED_MODEL_CONTENT.test(combinedText)) {
    flags.push("Routine text included a restricted medical or prescription claim.");
  }
  if (SPECIFIC_INGREDIENT_OR_PRODUCT_PATTERN.test(combinedText)) {
    flags.push("Routine text included a named ingredient, product-specific detail, or rating outside the category-only contract.");
  }
  if (BENZOYL_PEROXIDE_PATTERN.test(combinedText) && RETINOID_PATTERN.test(combinedText)) {
    flags.push("Routine text included a deterministic incompatible active pair.");
  }

  const steps = structuredSteps(routine);
  if (steps.length) {
    const expectedLegacySteps = [...(routine?.am || []), ...(routine?.pm || [])].map((step) => [step?.title, step?.note]);
    const hasBothPhases = Array.isArray(routine?.am) && routine.am.length >= 2 && Array.isArray(routine?.pm) && routine.pm.length >= 2;
    const validCategories = steps.every((step) => ALLOWED_ROUTINE_CATEGORY_IDS.has(step?.id));
    const validEvidence = new Set(canonicalEvidence(allowedEvidenceIds).map(({ id }) => id));
    const validLinks = steps.every((step) => Array.isArray(step.evidenceIds)
      && step.evidenceIds.every((id) => {
        const cleaned = validEvidenceId(id);
        return Boolean(cleaned) && validEvidence.has(cleaned);
      }));
    const matchingLegacy = Array.isArray(routine?.steps)
      && routine.steps.length === expectedLegacySteps.length
      && routine.steps.every((step, index) => Array.isArray(step) && step[0] === expectedLegacySteps[index][0] && step[1] === expectedLegacySteps[index][1]);
    if (!hasBothPhases || !validCategories || !validLinks || !matchingLegacy) {
      flags.push("Routine did not satisfy the fixed AM/PM category-only structure or contained an unlinked evidence identifier.");
    }
  } else if (Array.isArray(routine?.steps)) {
    // Retain support for legacy tests/callers while marking legacy model output
    // review-required at runtime once AM/PM assembly is enabled.
    flags.push("Routine did not include the required AM/PM category structure.");
  }

  const hasPhotoprotection = steps.some((step) => step.id === "daytime-photoprotection") || PHOTOPROTECTION_PATTERN.test(combinedText);
  if (Number(environment?.readings?.uvi) >= policy.environment.highUvThreshold && !hasPhotoprotection) {
    flags.push("High-UV context was missing a broad daytime photoprotection category.");
  }
  const hasAntioxidantContext = steps.some((step) => step.id === "antioxidant-context");
  if (Number(environment?.readings?.pm25) >= policy.environment.highPm25Threshold && !hasAntioxidantContext) {
    flags.push("High-PM2.5 context was missing a broad antioxidant-context category.");
  }
  const hasTextureRenewal = steps.some((step) => step.id === "texture-renewal");
  if (barrierGuardrail && (BARRIER_EXFOLIATION_PATTERN.test(combinedText) || hasTextureRenewal)) {
    const prefix = canonicalConcern === "barrier" ? "Barrier preview" : "Barrier-comfort preview";
    const label = BARRIER_GUARDRAIL_CONCERNS.has(canonicalConcern)
      ? prefix
      : "Self-reported reactivity preview";
    flags.push(`${label} included a high-intensity exfoliation category.`);
  }

  return {
    status: flags.length ? "review_required" : "cleared",
    checks: rules.map(({ label }) => label),
    rules: rules.map((rule) => ({ ...rule, status: flags.length ? "review_required" : "passed" })),
    flags,
  };
}
import { getRuntimePolicy } from "./policy-store.mjs";
import { analyseSymptoms } from "./triage.mjs";
