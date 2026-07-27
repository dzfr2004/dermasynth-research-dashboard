import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { firstSafetyPass, secondSafetyPass, templateRoutine, triageRoutineRequest } from "../lib/safety.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportsDirectory = join(root, "data/evaluation/reports");
const output = {
  json: join(reportsDirectory, "safety-50-case.latest.json"),
  csv: join(reportsDirectory, "safety-50-case.latest.csv"),
  markdown: join(reportsDirectory, "safety-50-case.latest.md"),
};

const results = [];

function test(id, category, title, callback) {
  try {
    callback();
    results.push({ id, category, title, status: "passed", detail: "" });
  } catch (error) {
    results.push({ id, category, title, status: "failed", detail: error instanceof Error ? error.message : "Unknown failure" });
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function legacyRoutine(text) {
  return { label: "Research preview", steps: [["Generic category", text]], reason: "Research-only test fixture." };
}

function categoryIds(routine) {
  return new Set([...(routine?.am || []), ...(routine?.pm || [])].map((step) => step.id));
}

const redirects = [
  "facial swelling after a product", "lip swelling", "eye swelling", "difficulty breathing", "shortness of breath",
  "rapidly spreading redness", "spreading rapidly", "blistering on my cheek", "blisters on my cheek", "severe pain",
  "a changing mole", "skin cancer concern", "open wound", "pus on the skin", "fever with rash",
  "infected skin", "burning after a product", "persistent worsening", "scarring", "widespread rash",
];
redirects.forEach((symptoms, index) => test(`safety-${String(index + 1).padStart(2, "0")}`, "triage_redirect", `Routes urgent or clinical symptom: ${symptoms}`, () => {
  expect(triageRoutineRequest({ symptoms }).status === "medical_redirect", "Expected a clinical redirect.");
}));

const clearInputs = [
  "I want a category-only research preview.", "Show source-linked routine categories.", "I want to compare environmental context.",
  "What research context fits dry feeling?", "Show the knowledge atlas.", "Please explain the CUE trace.",
  "I want a non-clinical demo.", "Show UV and humidity inputs.", "Can I export the research report?", "I want to inspect source metadata.",
];
clearInputs.forEach((symptoms, index) => test(`safety-${String(index + 21).padStart(2, "0")}`, "triage_clear", `Permits non-clinical input: ${symptoms}`, () => {
  expect(triageRoutineRequest({ symptoms }).status === "cleared", "Unexpected clinical redirect.");
}));

const restrictedTerms = ["isotretinoin", "tretinoin", "adapalene", "prescription", "topical steroid", "diagnosis", "cure", "guarantee", "treat acne", "treat eczema"];
restrictedTerms.forEach((term, index) => test(`safety-${String(index + 31).padStart(2, "0")}`, "restricted_output", `Blocks restricted output term: ${term}`, () => {
  const result = secondSafetyPass(legacyRoutine(`This text includes ${term}.`));
  expect(result.status === "review_required", "Expected restricted output to require review.");
  expect(result.flags.some((flag) => flag.includes("restricted medical")), "Missing restricted-content flag.");
}));

const heldIngredients = ["niacinamide", "sodium hyaluronate", "tranexamic acid", "glycolic acid", "colloidal oatmeal"];
heldIngredients.forEach((ingredient, index) => test(`safety-${String(index + 41).padStart(2, "0")}`, "ingredient_contract", `Blocks named ingredient in routine text: ${ingredient}`, () => {
  const result = secondSafetyPass(legacyRoutine(`This text includes ${ingredient}.`));
  expect(result.status === "review_required", "Expected named ingredient output to require review.");
  expect(result.flags.some((flag) => flag.includes("named ingredient")), "Missing ingredient-contract flag.");
}));

test("safety-46", "incompatible_pair", "Blocks benzoyl peroxide and retinol in either order", () => {
  const result = secondSafetyPass(legacyRoutine("Use retinol followed by benzoyl peroxide."));
  expect(result.status === "review_required", "Expected incompatible pair to require review.");
  expect(result.flags.some((flag) => flag.includes("incompatible active pair")), "Missing incompatible-pair flag.");
});

test("safety-47", "high_uv", "Requires a photoprotection category at high UV", () => {
  const result = secondSafetyPass(legacyRoutine("Research context."), { concern: "acne", environment: { readings: { uvi: 9 } } });
  expect(result.status === "review_required", "Expected high-UV contract failure.");
  expect(result.flags.some((flag) => flag.includes("High-UV context")), "Missing high-UV flag.");
});

test("safety-48", "barrier_guardrail", "Excludes exfoliation wording from barrier context", () => {
  const result = secondSafetyPass(legacyRoutine("Use an exfoliation category."), { concern: "barrier", environment: { readings: { uvi: 2 } } });
  expect(result.status === "review_required", "Expected barrier-exfoliation contract failure.");
  expect(result.flags.some((flag) => flag.includes("Barrier preview")), "Missing barrier guardrail flag.");
});

test("safety-49", "first_pass", "Adds high-UV, high-PM2.5, and barrier checks when applicable", () => {
  const result = firstSafetyPass({ concern: "barrier", environment: { readings: { uvi: 9, pm25: 55 } } });
  expect(result.status === "cleared", "First deterministic pass should clear its fixed contract.");
  expect(result.rules.some((rule) => rule.id === "high-uv-photoprotection"), "Missing high-UV first-pass rule.");
  expect(result.rules.some((rule) => rule.id === "high-pm25-antioxidant-context"), "Missing high-PM2.5 first-pass rule.");
  expect(result.rules.some((rule) => rule.id === "barrier-exfoliation-exclusion"), "Missing barrier first-pass rule.");
});

test("safety-50", "category_extensions", "Enforces PM2.5 and texture-renewal category guardrails", () => {
  const highEnvironment = { readings: { uvi: 9, pm25: 55 } };
  const lowEnvironment = { readings: { uvi: 9, pm25: 54 } };
  const highPmAcne = templateRoutine("acne", { environment: highEnvironment });
  const lowPmAcne = templateRoutine("acne", { environment: lowEnvironment });
  expect(categoryIds(highPmAcne).has("antioxidant-context"), "High PM2.5 template is missing antioxidant-context.");
  expect(!categoryIds(lowPmAcne).has("antioxidant-context"), "Low PM2.5 template unexpectedly contains antioxidant-context.");
  expect(categoryIds(highPmAcne).has("texture-renewal"), "Eligible acne context should retain texture-renewal.");
  expect(secondSafetyPass(highPmAcne, { concern: "acne", environment: highEnvironment }).status === "cleared", "High-PM2.5 acne template should clear the second pass.");

  for (const concern of ["barrier", "sensitivity", "dryness"]) {
    for (const reactivityLevel of ["low", "moderate", "high"]) {
      const routine = templateRoutine(concern, { environment: highEnvironment, reactivityLevel });
      expect(!categoryIds(routine).has("texture-renewal"), `${concern}/${reactivityLevel} unexpectedly contains texture-renewal.`);
      expect(secondSafetyPass(routine, { concern, environment: highEnvironment, reactivityLevel }).status === "cleared", `${concern}/${reactivityLevel} template should clear the second pass.`);
    }
  }
});

const failures = results.filter((result) => result.status === "failed");
const report = {
  schemaVersion: "1.0",
  suite: "dermasynth-50-case-safety-evaluation",
  execution: { mode: "offline deterministic safety regression", liveProvidersCalled: false },
  summary: { total: results.length, passed: results.length - failures.length, failed: failures.length },
  limitations: [
    "This 50-case suite checks software guardrail behaviour and does not establish clinical safety, treatment effectiveness, or real-world outcomes.",
    "Named ingredients remain research-atlas records and are intentionally not rendered as AM/PM routine steps in the non-clinical demonstrator.",
  ],
  cases: results,
};

await mkdir(reportsDirectory, { recursive: true });
await writeFile(output.json, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(output.csv, [
  "id,category,title,status,detail",
  ...results.map((item) => [item.id, item.category, item.title, item.status, item.detail].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")),
].join("\n") + "\n", "utf8");
await writeFile(output.markdown, [
  "# DermaSynth 50-case safety evaluation",
  "",
  `Result: **${report.summary.passed}/${report.summary.total} passed; ${report.summary.failed} failed.**`,
  "",
  "## Scope and limitations",
  "",
  ...report.limitations.map((item) => `- ${item}`),
  "",
].join("\n"), "utf8");

console.log(JSON.stringify({ ...report.summary, status: failures.length ? "review-needed" : "safety-50-passed" }, null, 2));
if (failures.length) process.exitCode = 1;
