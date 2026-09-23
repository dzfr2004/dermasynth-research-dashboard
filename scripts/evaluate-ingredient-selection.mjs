import assert from "node:assert/strict";
import { getDatabase, migrate } from "../lib/db/database.mjs";
import { createRepository } from "../lib/ingredient-repository.mjs";
import { selectApprovedIngredientCandidates } from "../lib/ingredient-selection.mjs";
import { templateRoutine } from "../lib/safety.mjs";

const environment = { readings: { uvi: 9, pm25: 60 } };
const tests = [];

function evaluate(name, fn) {
  try {
    fn();
    tests.push({ name, status: "passed" });
  } catch (error) {
    tests.push({ name, status: "failed", error: error instanceof Error ? error.message : String(error) });
  }
}

function approvedRepository() {
  const db = getDatabase({ path: ":memory:" });
  migrate(db);
  const repo = createRepository({ db });
  repo.upsertSource({
    source_id: "journal-example", approval_state: "published", source_family: "medical_journal",
    title: "Example evidence source", source_url: "https://example.org/evidence",
  });
  repo.upsertIngredient({
    ingredient_id: "database-ascorbic", approval_state: "approved", display_name: "Database Ascorbic",
    inci_names: ["Ascorbic Acid"], categories: ["antioxidant-context"], concern_contexts: ["pigment"],
    routine_selection_allowed: true, source_ids: ["journal-example"],
  });
  repo.upsertIngredient({
    ingredient_id: "unapproved-option", approval_state: "in_review", display_name: "Unapproved Option",
    inci_names: ["Example"], categories: ["daytime-photoprotection"], concern_contexts: ["pigment"],
    routine_selection_allowed: true, source_ids: ["journal-example"],
  });
  return repo;
}

evaluate("disabled candidate layer returns no names", () => {
  const result = selectApprovedIngredientCandidates({
    enabled: false, repository: approvedRepository(), routine: templateRoutine("pigment", { environment }), concern: "pigment", environment,
  });
  assert.equal(result.status, "disabled");
  assert.deepEqual(result.entries, []);
});

evaluate("dynamic selector uses only approved/published database records", () => {
  const routine = templateRoutine("pigment", { environment });
  const result = selectApprovedIngredientCandidates({ enabled: true, repository: approvedRepository(), routine, concern: "pigment", environment });
  assert.equal(result.status, "available");
  assert.ok(result.entries.every((entry) => entry.ingredientId !== "unapproved-option"));
  assert.ok(result.entries.every((entry) => ["approved", "published"].includes(entry.approval.status)));
  assert.equal(result.entries[0].ingredientId, "database-ascorbic");
});

evaluate("unavailable database never falls back to the legacy Atlas", () => {
  const result = selectApprovedIngredientCandidates({
    enabled: true, routine: templateRoutine("pigment", { environment }), concern: "pigment", environment,
  });
  assert.equal(result.status, "knowledge_base_unavailable");
  assert.deepEqual(result.entries, []);
});

evaluate("high self-reported reactivity does not expose texture-renewal candidates", () => {
  const db = getDatabase({ path: ":memory:" });
  migrate(db);
  const repo = createRepository({ db });
  repo.upsertSource({ source_id: "source", approval_state: "published", source_family: "medical_journal", title: "Source", source_url: "https://example.org/source" });
  repo.upsertIngredient({
    ingredient_id: "renewal", approval_state: "published", display_name: "Renewal", inci_names: ["Renewal"],
    categories: ["texture-renewal"], concern_contexts: ["texture"], routine_selection_allowed: true, source_ids: ["source"],
  });
  const routine = templateRoutine("texture", { environment, reactivityLevel: "high" });
  const result = selectApprovedIngredientCandidates({ enabled: true, repository: repo, routine, concern: "texture", environment, reactivityLevel: "high" });
  assert.ok(result.entries.every((entry) => entry.categoryId !== "texture-renewal"));
});

evaluate("database incompatibility matrix prevents conflicting approved selections", () => {
  const db = getDatabase({ path: ":memory:" });
  migrate(db);
  const repo = createRepository({ db });
  repo.upsertSource({ source_id: "source", approval_state: "published", source_family: "medical_journal", title: "Source", source_url: "https://example.org/source" });
  repo.upsertIngredient({ ingredient_id: "day", approval_state: "published", display_name: "Day", inci_names: ["Day"], categories: ["daytime-photoprotection"], routine_selection_allowed: true, source_ids: ["source"], incompatibilities: ["night"] });
  repo.upsertIngredient({ ingredient_id: "night", approval_state: "published", display_name: "Night", inci_names: ["Night"], categories: ["overnight-comfort"], routine_selection_allowed: true, source_ids: ["source"], incompatibilities: ["day"] });
  const routine = templateRoutine("pigment", { environment });
  const result = selectApprovedIngredientCandidates({ enabled: true, repository: repo, routine, concern: "pigment", environment });
  assert.equal(result.entries.filter((entry) => ["day", "night"].includes(entry.ingredientId)).length, 1);
  assert.ok(result.entries.every((entry) => entry.selectionTrace.compatibility.status === "passed"));
});

const failed = tests.filter((result) => result.status === "failed");
console.log(JSON.stringify({
  suite: "approved-ingredient-selection-regression",
  total: tests.length,
  passed: tests.length - failed.length,
  failed: failed.length,
  results: tests,
}, null, 2));

if (failed.length) process.exitCode = 1;
