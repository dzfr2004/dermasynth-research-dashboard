import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getIngredientKnowledgeBase, ingredientKnowledgeSummary } from "../lib/ingredient-knowledge.mjs";

const root = resolve(process.cwd());
const corpusPath = resolve(root, "data/evidence/ingredient-demo.v1.jsonl");
const supplementPath = resolve(root, "data/evidence/ingredient-source-supplement.v1.jsonl");
const knowledgeBase = getIngredientKnowledgeBase();
const summary = ingredientKnowledgeSummary();
const sourceIds = new Set(knowledgeBase.sourceRecords.map((source) => source.id));
const ingredientIds = new Set(knowledgeBase.ingredients.map((ingredient) => ingredient.id));

const raw = await readFile(corpusPath, "utf8");
const records = raw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`Demo corpus line ${index + 1} is not valid JSON.`);
    }
  });
const supplementaryRaw = await readFile(supplementPath, "utf8");
const supplementaryRecords = supplementaryRaw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`Supplemental demo corpus line ${index + 1} is not valid JSON.`);
    }
  });

assert.equal(summary.ingredientCount, 50, "The final-review Atlas must contain exactly 50 held ingredient records.");
assert.equal(records.length, 20, "The final-demo corpus must contain exactly 20 records.");
assert.equal(supplementaryRecords.length, 11, "The final-demo corpus must contain 11 supplemental source metadata cards.");
assert.equal(summary.demoEvidenceCardCount, 31, "The existing isolated Pinecone demo must remain a 31-card corpus until staged records receive a separate upload approval.");
assert.equal(summary.demoPineconeUploadAllowed, true, "The registry must explicitly allow isolated demo upload.");
assert.match(summary.demoPineconeNamespace, /^demo-/, "The demo namespace must be isolated.");

const seenIngredientIds = new Set();
const seenDocumentIds = new Set();
for (const record of records) {
  assert.equal(record.demo_only, true, `${record.document_id} must be demo-only.`);
  assert.equal(record.demo_use_status, "research_demo_only", `${record.document_id} must remain research-demo only.`);
  assert.equal(record.routine_selection_allowed, false, `${record.document_id} must block routine selection.`);
  assert.match(String(record.clinical_review_status || ""), /^pending/i, `${record.document_id} must remain pending clinical review.`);
  assert.equal(record.ingredient_evidence_role, "demo_context_not_activated", `${record.document_id} must remain unactivated.`);
  assert.equal(record.product_specific, true, `${record.document_id} must remain excluded from generic synthesis.`);
  assert.ok(Array.isArray(record.ingredient_ids) && record.ingredient_ids.length === 1, `${record.document_id} must map exactly one canonical ingredient.`);
  assert.ok(Array.isArray(record.source_record_ids) && record.source_record_ids.length >= 1, `${record.document_id} needs source registry links.`);
  assert.ok(record.source_record_ids.every((sourceId) => sourceIds.has(sourceId)), `${record.document_id} references an unknown source record.`);
  assert.ok(ingredientIds.has(record.ingredient_ids[0]), `${record.document_id} references an unknown ingredient.`);
  assert.equal(seenIngredientIds.has(record.ingredient_ids[0]), false, `Duplicate demo ingredient record: ${record.ingredient_ids[0]}.`);
  assert.equal(seenDocumentIds.has(record.document_id), false, `Duplicate demo document ID: ${record.document_id}.`);
  seenIngredientIds.add(record.ingredient_ids[0]);
  seenDocumentIds.add(record.document_id);
}

const stagedAtlasIngredients = knowledgeBase.ingredients.filter((ingredient) => !seenIngredientIds.has(ingredient.id));
assert.equal(stagedAtlasIngredients.length, 30, "Thirty held Atlas records must remain staged outside the existing demo Pinecone corpus.");
assert.ok(stagedAtlasIngredients.every((ingredient) => ingredient.status === "held_research_only" && ingredient.routineSelectionAllowed === false), "Staged Atlas records must stay held and non-selectable.");
const corpusSourceIds = new Set(records.flatMap((record) => record.source_record_ids || []));
for (const record of supplementaryRecords) {
  assert.equal(record.demo_only, true, `${record.document_id} must be demo-only.`);
  assert.equal(record.demo_use_status, "research_demo_only", `${record.document_id} must remain research-demo only.`);
  assert.equal(record.routine_selection_allowed, false, `${record.document_id} must block routine selection.`);
  assert.match(String(record.clinical_review_status || ""), /^pending/i, `${record.document_id} must remain pending research review.`);
  assert.ok(Array.isArray(record.ingredient_ids) && record.ingredient_ids.length >= 1, `${record.document_id} needs ingredient links.`);
  assert.ok(record.ingredient_ids.every((ingredientId) => ingredientIds.has(ingredientId)), `${record.document_id} references an unknown ingredient.`);
  assert.ok(Array.isArray(record.source_record_ids) && record.source_record_ids.length >= 1, `${record.document_id} needs source registry links.`);
  assert.ok(record.source_record_ids.every((sourceId) => sourceIds.has(sourceId)), `${record.document_id} references an unknown source record.`);
  record.source_record_ids.forEach((sourceId) => corpusSourceIds.add(sourceId));
}
const stagedSourceIds = new Set(stagedAtlasIngredients.flatMap((ingredient) => ingredient.sourceIds));
const indexedMedicalSourceIds = knowledgeBase.sourceRecords
  .filter((source) => source.sourceFamily === "medical_journal" && !stagedSourceIds.has(source.id))
  .map((source) => source.id);
assert.deepEqual(indexedMedicalSourceIds.filter((sourceId) => !corpusSourceIds.has(sourceId)), [], "Every medical-journal source used by the existing demo corpus must be linked from a demo metadata card.");
console.log(`Demo ingredient KB verification passed: ${records.length} indexed ingredient cards + ${supplementaryRecords.length} indexed supplemental source cards; ${stagedAtlasIngredients.length} additional held Atlas ingredients remain local/review-pending; ${summary.sourceCount} attributed source records total; target namespace ${summary.demoPineconeNamespace}.`);
