export const ALLOWED_PROFILES = new Set(["dry", "combination", "oily", "sensitive"]);

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
    note: "Broad research-preview category; no product, ingredient, amount, or frequency is specified.",
  }),
  "comfort-hydration": Object.freeze({
    category: "Hydration",
    title: "Comfort-focused hydration category",
    note: "Supportive category shown only as non-prescriptive research context.",
  }),
  "light-hydration": Object.freeze({
    category: "Hydration",
    title: "Light hydration category",
    note: "Supportive category shown only as non-prescriptive research context.",
  }),
  "supportive-hydration": Object.freeze({
    category: "Hydration",
    title: "Supportive hydration category",
    note: "Supportive category shown only as non-prescriptive research context.",
  }),
  "barrier-support-moisturising": Object.freeze({
    category: "Moisturising",
    title: "Barrier-support moisturising category",
    note: "Comfort-oriented category; no therapeutic or ingredient claim is made.",
  }),
  "lightweight-moisturising": Object.freeze({
    category: "Moisturising",
    title: "Lightweight moisturising category",
    note: "Finish context only; it is not a suitability or efficacy claim.",
  }),
  "supportive-moisturising": Object.freeze({
    category: "Moisturising",
    title: "Supportive moisturising category",
    note: "Broad research-preview category; it is not treatment guidance.",
  }),
  "daytime-photoprotection": Object.freeze({
    category: "Photoprotection",
    title: "Daytime photoprotection category",
    note: "Broad daytime category in a research preview; no product, amount, rating, or reapplication instruction is specified.",
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
});

const DEFAULT_HYDRATION_CONCERNS = new Set(["barrier", "sensitivity", "dryness"]);
const MEDICAL_REDIRECT_PATTERN = /\b(bleed(?:ing)?|blister(?:ing|s)?|rapidly spreading|spreading rapidly|difficulty breathing|shortness of breath|(?:face|facial|lip|eye) swelling|anaphylaxis|infect(?:ed|ion)|pus|fever|severe pain|changing mole|skin cancer|widespread rash|open wound|burn(?:ing)? after (?:a )?product|persistent(?:ly)? worsening|symptoms? (?:are )?worsening|scar(?:ring)?|distress(?:ing)? symptoms?)\b/i;
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
  generation = "deterministic-template",
} = {}) {
  const canonicalConcern = normaliseConcern(concern) || "acne";
  const copy = CONCERN_ROUTINE_COPY[canonicalConcern];
  const includesHydration = typeof includeHydration === "boolean" ? includeHydration : hydrationDefault(canonicalConcern);
  const highUv = Number(environment?.readings?.uvi) >= 8;
  const commonRules = canonicalConcern === "barrier" || canonicalConcern === "sensitivity" || canonicalConcern === "dryness"
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
      categoryId: copy.hydration,
      concern: canonicalConcern,
      environment,
      evidence,
      extraRuleIds: commonRules,
    })] : []),
    categoryStep({
      phase: "am",
      categoryId: "daytime-photoprotection",
      concern: canonicalConcern,
      environment,
      evidence,
      extraRuleIds: highUv ? ["high-uv-photoprotection-rule"] : ["daytime-photoprotection-baseline"],
    }),
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
      categoryId: copy.moisturising,
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
  if (trimmedSymptoms && MEDICAL_REDIRECT_PATTERN.test(trimmedSymptoms)) {
    const flag = "The submitted symptoms may require clinical assessment.";
    return {
      status: "medical_redirect",
      checks: [checked.label],
      rules: [safetyRule(checked.id, checked.label, "redirected", flag)],
      flags: [flag],
      notices: ["This research prototype cannot assess urgent or clinical skin symptoms. Please seek appropriate professional care."],
    };
  }

  return {
    status: "cleared",
    checks: [checked.label],
    rules: [checked],
    flags: [],
    notices: [],
  };
}

export function firstSafetyPass({ concern, environment }) {
  const canonicalConcern = normaliseConcern(concern) || "acne";
  const rules = [
    safetyRule("prescription-exclusion", "No prescription-only ingredient categories selected"),
    safetyRule("incompatible-active-exclusion", "No deterministic incompatible active pair selected"),
    safetyRule("category-only-contract", "Only broad, non-prescriptive category identifiers may be assembled"),
  ];

  if (environment?.readings?.uvi !== null && environment?.readings?.uvi !== undefined && Number(environment.readings.uvi) >= 8) {
    rules.push(safetyRule("high-uv-photoprotection", "High UV rule: daylight preview includes a photoprotection category"));
  }
  if (["barrier", "sensitivity", "dryness"].includes(canonicalConcern)) {
    const label = canonicalConcern === "barrier"
      ? "Barrier rule: high-intensity exfoliation categories excluded from preview"
      : "Barrier-comfort rule: high-intensity exfoliation categories are excluded from preview";
    rules.push(safetyRule("barrier-exfoliation-exclusion", label));
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

export function secondSafetyPass(routine, { concern, environment, allowedEvidenceIds = [] } = {}) {
  const canonicalConcern = normaliseConcern(concern) || "acne";
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
  if (Number(environment?.readings?.uvi) >= 8 && !hasPhotoprotection) {
    flags.push("High-UV context was missing a broad daytime photoprotection category.");
  }
  if (["barrier", "sensitivity", "dryness"].includes(canonicalConcern) && BARRIER_EXFOLIATION_PATTERN.test(combinedText)) {
    const prefix = canonicalConcern === "barrier" ? "Barrier preview" : "Barrier-comfort preview";
    flags.push(`${prefix} included a high-intensity exfoliation category.`);
  }

  return {
    status: flags.length ? "review_required" : "cleared",
    checks: rules.map(({ label }) => label),
    rules: rules.map((rule) => ({ ...rule, status: flags.length ? "review_required" : "passed" })),
    flags,
  };
}
