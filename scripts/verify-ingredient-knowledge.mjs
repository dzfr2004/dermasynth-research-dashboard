import assert from "node:assert/strict";
import { getIngredientKnowledgeBase, ingredientKnowledgeForConcern, ingredientKnowledgeSummary } from "../lib/ingredient-knowledge.mjs";

const knowledgeBase = getIngredientKnowledgeBase();
const summary = ingredientKnowledgeSummary();

assert.equal(knowledgeBase.deploymentScope, "research_only_noncommercial");
assert.equal(knowledgeBase.corpusStatus, "review_pending");
assert.equal(knowledgeBase.routineSelectionAllowed, false);
assert.equal(knowledgeBase.pineconeUploadAllowed, false);
assert.ok(knowledgeBase.sourceRecords.some((source) => source.sourceFamily === "CIR"), "CIR provenance records are required.");
assert.ok(knowledgeBase.sourceRecords.some((source) => source.sourceFamily === "EWG"), "EWG link-only record is required.");
assert.ok(knowledgeBase.sourceRecords.some((source) => source.sourceFamily === "medical_journal"), "Medical-journal records are required.");

for (const source of knowledgeBase.sourceRecords) {
  assert.ok(source.sourceUrl.startsWith("https://"), `${source.id} requires an HTTPS source URL.`);
  if (source.sourceFamily === "CIR") {
    assert.equal(source.useMode, "citation_link_only", `${source.id} must remain citation/link only.`);
    assert.equal(source.corpusEligibility, "rights_hold", `${source.id} must remain on rights hold.`);
  }
  if (source.sourceFamily === "EWG") {
    assert.equal(source.useMode, "external_link_only", `${source.id} must remain link only.`);
    assert.equal(source.corpusEligibility, "not_eligible_without_permission", `${source.id} must not enter the corpus.`);
  }
  if (source.sourceFamily === "medical_journal") {
    assert.match(source.clinicalReviewStatus, /pending|review/i, `${source.id} must stay pending clinical review.`);
  }
}

for (const ingredient of knowledgeBase.ingredients) {
  assert.equal(ingredient.status, "held_research_only", `${ingredient.id} must remain held.`);
  assert.equal(ingredient.routineSelectionAllowed, false, `${ingredient.id} must not be selectable.`);
  assert.ok(ingredient.activationBlockers.length > 0, `${ingredient.id} needs activation blockers.`);
}

const barrier = ingredientKnowledgeForConcern("barrier");
const acne = ingredientKnowledgeForConcern("acne");
assert.ok(barrier.candidates.length > 0, "Barrier research records are required.");
assert.ok(acne.candidates.some((ingredient) => ingredient.id === "salicylic-acid"), "Acne research must retain salicylic-acid context as held evidence.");
assert.ok(acne.candidates.every((ingredient) => ingredient.routineSelectionAllowed === false), "Concern lookup must not activate ingredients.");

console.log(`Ingredient knowledge-base verification passed: ${summary.ingredientCount} held ingredients, ${summary.sourceCount} source records, ${summary.sourceFamilies.CIR} CIR, ${summary.sourceFamilies.EWG} EWG, ${summary.sourceFamilies.medical_journal} medical-journal.`);
