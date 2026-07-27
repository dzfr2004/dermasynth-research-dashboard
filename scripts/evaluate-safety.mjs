import {
  ALLOWED_CONCERNS,
  firstSafetyPass,
  secondSafetyPass,
  templateRoutine,
  triageRoutineRequest,
} from "../lib/safety.mjs";

const results = [];

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function evaluate(name, callback) {
  try {
    callback();
    results.push({ name, status: "passed" });
  } catch (error) {
    results.push({ name, status: "failed", detail: error instanceof Error ? error.message : "Unknown failure" });
  }
}

for (const symptoms of [
  "facial swelling after a product",
  "lip swelling",
  "difficulty breathing",
  "shortness of breath",
  "rapidly spreading redness",
  "spreading rapidly",
  "blistering on my cheek",
  "blisters on my cheek",
  "severe pain",
  "a changing mole",
]) {
  evaluate(`triage redirects: ${symptoms}`, () => {
    expect(triageRoutineRequest({ symptoms }).status === "medical_redirect", "Expected a medical redirect.");
  });
}

evaluate("triage permits a non-urgent research input", () => {
  expect(triageRoutineRequest({ symptoms: "I want a gentle research preview." }).status === "cleared", "Unexpected medical redirect.");
});

evaluate("first pass adds high-UV and barrier checks", () => {
  const result = firstSafetyPass({ concern: "barrier", environment: { readings: { uvi: 8 } } });
  expect(result.status === "cleared", "First pass should remain cleared.");
  expect(result.checks.some((check) => check.startsWith("High UV rule:")), "High-UV check missing.");
  expect(result.checks.some((check) => check.startsWith("Barrier rule:")), "Barrier check missing.");
});

for (const concern of ALLOWED_CONCERNS) {
  evaluate(`fallback template is category-only and safe: ${concern}`, () => {
    const routine = templateRoutine(concern);
    const text = [routine.label, routine.reason, ...routine.steps.flat()].join(" ");
    expect(routine.steps.length >= 3 && routine.steps.length <= 6, "Baseline template must contain 3–6 steps.");
    expect(!/\b(niacinamide|ceramide|panthenol|spf\s*\d+)\b/i.test(text), "Template included a specific active or SPF number.");
    expect(secondSafetyPass(routine, { concern, environment: { readings: { uvi: 9 } } }).status === "cleared", "Safe template did not clear the second pass.");
  });
}

function categoryIds(routine) {
  return new Set([...(routine?.am || []), ...(routine?.pm || [])].map((step) => step.id));
}

evaluate("high PM2.5 adds antioxidant context and low PM2.5 does not", () => {
  const highEnvironment = { readings: { uvi: 2, pm25: 55 } };
  const lowEnvironment = { readings: { uvi: 2, pm25: 54 } };
  const high = templateRoutine("acne", { environment: highEnvironment });
  const low = templateRoutine("acne", { environment: lowEnvironment });

  expect(categoryIds(high).has("antioxidant-context"), "High PM2.5 template did not include the antioxidant-context category.");
  expect(!categoryIds(low).has("antioxidant-context"), "Low PM2.5 template unexpectedly included the antioxidant-context category.");
  expect(secondSafetyPass(high, { concern: "acne", environment: highEnvironment }).status === "cleared", "High PM2.5 category template did not clear the second pass.");
});

evaluate("texture renewal is limited to the intended cosmetic research contexts", () => {
  const environment = { readings: { uvi: 2, pm25: 20 } };
  expect(!categoryIds(templateRoutine("redness", { environment })).has("texture-renewal"), "Redness context must retain the conservative no-renewal path.");
  for (const concern of ["acne", "oil", "texture", "pigment", "radiance", "pores"]) {
    expect(categoryIds(templateRoutine(concern, { environment })).has("texture-renewal"), `${concern} should retain the allowlisted texture-renewal category.`);
  }
});

for (const concern of ["barrier", "sensitivity", "dryness"]) {
  evaluate(`texture renewal remains excluded for ${concern} at every reactivity level`, () => {
    const environment = { readings: { uvi: 9, pm25: 60 } };
    for (const reactivityLevel of ["low", "moderate", "high"]) {
      const routine = templateRoutine(concern, { environment, reactivityLevel });
      expect(!categoryIds(routine).has("texture-renewal"), `${concern}/${reactivityLevel} included texture-renewal.`);
      expect(secondSafetyPass(routine, { concern, environment, reactivityLevel }).status === "cleared", `${concern}/${reactivityLevel} did not clear the second pass.`);
    }
  });
}

evaluate("self-reported high reactivity applies a conservative category guardrail", () => {
  const environment = { readings: { uvi: 9, pm25: 60 } };
  const routine = templateRoutine("acne", {
    environment,
    finishPreference: "matte",
    reactivityLevel: "high",
  });
  const ruleIds = [...routine.am, ...routine.pm].flatMap((step) => step.ruleIds || []);

  expect(routine.generation?.finishPreference === "matte", "Finish preference was not retained as an optional modifier.");
  expect(routine.generation?.reactivityLevel === "high", "Reactivity level was not retained as an optional modifier.");
  expect(ruleIds.includes("low-irritation-barrier-guardrail"), "High reactivity did not add the conservative guardrail rule.");
  expect(!categoryIds(routine).has("texture-renewal"), "High reactivity did not exclude texture-renewal.");
  expect(secondSafetyPass(routine, { concern: "acne", environment, reactivityLevel: "high" }).status === "cleared", "High-reactivity category template did not clear the second pass.");
});

for (const phrase of ["isotretinoin", "tretinoin", "adapalene", "prescription", "diagnosis", "cure", "guarantee"]) {
  evaluate(`second pass blocks restricted term: ${phrase}`, () => {
    const result = secondSafetyPass({
      label: "Research preview",
      steps: [["Gentle cleansing category", "Research context"]],
      reason: `This text includes ${phrase}.`,
    });
    expect(result.status === "review_required", "Restricted model content was not blocked.");
    expect(result.flags.some((flag) => flag.includes("restricted medical")), "Expected a restricted-content flag.");
  });
}

for (const ingredient of ["sodium hyaluronate", "tocopherol", "tranexamic acid", "kojic acid", "colloidal oatmeal"]) {
  evaluate(`second pass blocks held ingredient: ${ingredient}`, () => {
    const result = secondSafetyPass({
      label: "Research preview",
      steps: [["Gentle cleansing category", "Research context"]],
      reason: `This text includes ${ingredient}.`,
    });
    expect(result.status === "review_required", "Held ingredient content was not blocked.");
    expect(result.flags.some((flag) => flag.includes("named ingredient")), "Expected an ingredient-specificity flag.");
  });
}

for (const pair of [
  "Use benzoyl peroxide, then retinol.",
  "Use retinol, then benzoyl peroxide.",
]) {
  evaluate(`second pass blocks incompatible pair: ${pair}`, () => {
    const result = secondSafetyPass({
      label: "Research preview",
      steps: [["Generic category", pair]],
      reason: "Research-only context.",
    });
    expect(result.status === "review_required", "Incompatible pair was not blocked.");
    expect(result.flags.some((flag) => flag.includes("incompatible active pair")), "Expected an incompatible-pair flag.");
  });
}

evaluate("second pass blocks a distant incompatible pair", () => {
  const result = secondSafetyPass({
    label: "Research preview",
    steps: [["Generic category", `Benzoyl peroxide ${"context ".repeat(40)}retinol.`]],
    reason: "Research-only context.",
  });
  expect(result.status === "review_required", "Distant incompatible pair was not blocked.");
});

evaluate("second pass requires photoprotection in high-UV context", () => {
  const result = secondSafetyPass({
    label: "Research preview",
    steps: [["Gentle cleansing category", "Research context"]],
    reason: "Research-only context.",
  }, { concern: "acne", environment: { readings: { uvi: 8 } } });
  expect(result.status === "review_required", "High-UV photoprotection requirement was not enforced.");
  expect(result.flags.some((flag) => flag.includes("High-UV context")), "Expected a high-UV flag.");
});

evaluate("second pass excludes exfoliation from barrier preview", () => {
  const result = secondSafetyPass({
    label: "Barrier research preview",
    steps: [["Exfoliation category", "Research context"]],
    reason: "Research-only context.",
  }, { concern: "barrier", environment: { readings: { uvi: 2 } } });
  expect(result.status === "review_required", "Barrier exfoliation restriction was not enforced.");
  expect(result.flags.some((flag) => flag.includes("Barrier preview")), "Expected a barrier-exfoliation flag.");
});

const failures = results.filter((result) => result.status === "failed");
console.log(JSON.stringify({
  suite: "deterministic-safety-regression",
  scope: "Implementation regression checks only; this is not clinical validation.",
  total: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  results,
}, null, 2));

if (failures.length) process.exitCode = 1;
