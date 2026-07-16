import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectUploadReuseRights } from "../lib/evidence-rights.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corpusRelativePath = "data/evidence/category-source-cards.research.v1.jsonl";
const corpusPath = resolve(root, corpusRelativePath);
const reportsDirectory = resolve(root, "data/evaluation/reports");
const reportPath = resolve(reportsDirectory, "category-coverage.latest.json");
const concerns = ["acne", "barrier", "pigment", "sensitivity", "dryness", "oil", "texture"];
const claimPrefix = Object.freeze({
  acne: "acne-",
  barrier: "barrier-",
  pigment: "pigment-",
  sensitivity: "sensitive-skin-",
  dryness: "dryness-",
  oil: "oil-",
  texture: "texture-",
});
const retrievalTerms = Object.freeze({
  acne: ["acne"],
  barrier: ["barrier"],
  pigment: ["pigment"],
  sensitivity: ["sensitive", "sensitivity"],
  dryness: ["dryness", "dry-feeling", "moisturis"],
  oil: ["oil", "sebum", "shine"],
  texture: ["texture"],
});

const source = await readFile(corpusPath, "utf8");
const records = source
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${corpusRelativePath}:${index + 1} is not valid JSON: ${error.message}`);
    }
  });
const results = [];

function evaluate(id, title, callback) {
  try {
    callback();
    results.push({ id, title, status: "passed", detail: "" });
  } catch (error) {
    results.push({ id, title, status: "failed", detail: error instanceof Error ? error.message : "Unknown error" });
  }
}

function expect(value, message) {
  assert.ok(value, message);
}

evaluate("category-card-schema", "Every category-source card preserves its isolated non-clinical contract", () => {
  expect(records.length === 21, `Expected 21 category-source cards, found ${records.length}.`);
  expect(new Set(records.map((record) => record._id)).size === records.length, "Category-source card IDs must be unique.");
  for (const record of records) {
    expect(record.document_id && record.title && record.source && record.source_url && record.chunk_text, `${record._id} lacks attributable source metadata.`);
    expect(/^https:\/\//.test(record.source_url), `${record._id} has an unsafe source URL.`);
    expect(record.document_type === "category-only-source-card", `${record._id} has an invalid document type.`);
    expect(record.evidence_tier === "source-attributed-research-context", `${record._id} has an invalid evidence tier.`);
    expect(/^pending/i.test(record.clinical_review_status || ""), `${record._id} must remain pending clinical review.`);
    expect(record.research_review_status === "source_mapped_not_clinically_reviewed", `${record._id} has an invalid non-clinical review status.`);
    expect(record.research_card_status === "category_only_research_context", `${record._id} is not a category-only research card.`);
    expect(record.category_only_card === true && record.demo_only === true && record.demo_use_status === "research_demo_only", `${record._id} is outside the isolated research-demo scope.`);
    expect(record.routine_selection_allowed === false, `${record._id} could enter a routine.`);
    expect(record.product_specific === false, `${record._id} is product-specific.`);
    expect(!record.ingredient_ids && !record.ingredient_names && !record.ingredient_evidence_role, `${record._id} must not carry ingredient-selection metadata.`);
    expect(inspectUploadReuseRights(record).allowed, `${record._id} lacks a documented reuse basis.`);
  }
});

for (const concern of concerns) {
  evaluate(`category-coverage-${concern}`, `${concern} has source-mapped coverage across distinct documents`, () => {
    const matching = records.filter((record) => String(record.claim_category || "").startsWith(claimPrefix[concern]));
    expect(matching.length >= 3, `${concern} requires at least three category-source cards.`);
    expect(new Set(matching.map((record) => record.document_id)).size >= 2, `${concern} requires at least two attributable documents.`);
    expect(matching.every((record) => retrievalTerms[concern].some((term) => record.chunk_text.toLowerCase().includes(term))), `${concern} cards must retain clear concern terminology for retrieval.`);
  });
}

evaluate("strict-cue-separation", "No category-source card can be mistaken for a clinically approved strict-CUE record", () => {
  expect(records.every((record) => !/^approved/i.test(record.clinical_review_status || "")), "A category-source card is marked clinically approved.");
  expect(records.every((record) => record.routine_selection_allowed === false && record.category_only_card === true), "A category-source card could enable routine synthesis.");
});

const failed = results.filter((result) => result.status === "failed");
const coverage = Object.fromEntries(concerns.map((concern) => {
  const matching = records.filter((record) => String(record.claim_category || "").startsWith(claimPrefix[concern]));
  return [concern, { cards: matching.length, documents: new Set(matching.map((record) => record.document_id)).size }];
}));
const report = {
  schemaVersion: "1.0",
  suite: "dermasynth-category-source-coverage",
  execution: {
    mode: "offline-versioned-source-card-validation",
    corpus: corpusRelativePath,
    corpusSha256: createHash("sha256").update(source).digest("hex"),
    deterministicRunMarker: "2026-07-16-category-coverage-v1",
  },
  summary: {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    categorySourceCards: records.length,
    mappedContexts: concerns.length,
  },
  coverage,
  results,
  limitations: [
    "This validates source-mapped, category-only research coverage; it is not a clinical evidence assessment, a CUE score, or a model-authorisation gate.",
    "All records remain pending qualified clinical review and are isolated from strict retrieval, live GPT category selection, ingredient activation, and routine selection.",
    "Non-commercial source cards remain restricted to the final-review demonstrator and require a new rights review before any commercial deployment.",
  ],
};

await mkdir(reportsDirectory, { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...report.summary, status: failed.length ? "review-needed" : "category-coverage-passed" }, null, 2));
if (failed.length) process.exitCode = 1;
