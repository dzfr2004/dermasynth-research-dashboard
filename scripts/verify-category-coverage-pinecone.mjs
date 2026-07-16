import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { fetchJson } from "../lib/http-client.mjs";
import { assertIntegratedTextIndex, describePineconeIndex, PINECONE_API_VERSION } from "../lib/pinecone.mjs";

const root = resolve(process.cwd());
const corpusPath = resolve(root, "data/evidence/category-source-cards.research.v1.jsonl");
const namespace = "demo-category-cue-v1";
loadDotEnv(root);
const config = createConfig();
config.pinecone.namespace = namespace;

const expected = (await readFile(corpusPath, "utf8"))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => JSON.parse(line));
const expectedIds = new Set(expected.map((record) => record._id));
const descriptor = await describePineconeIndex(config, { force: true });
assertIntegratedTextIndex(descriptor, config.pinecone.textField);
const payload = await fetchJson(`https://${descriptor.host}/records/namespaces/${encodeURIComponent(namespace)}/search`, {
  service: "Pinecone category-source coverage verification",
  timeoutMs: config.requestTimeoutMs,
  method: "POST",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Api-Key": config.pinecone.apiKey,
    "X-Pinecone-Api-Version": PINECONE_API_VERSION,
  },
  body: JSON.stringify({
    query: { inputs: { text: "category-only research context source card" }, top_k: 96 },
    fields: [
      config.pinecone.textField,
      "document_id", "clinical_review_status", "research_review_status", "research_card_status",
      "category_only_card", "routine_selection_allowed", "product_specific", "ingredient_ids", "ingredient_names",
      "ingredient_evidence_role", "demo_only", "demo_use_status", "claim_category",
    ],
  }),
});
const hits = payload?.result?.hits || payload?.hits || payload?.matches || [];
assert.ok(Array.isArray(hits), "Pinecone category coverage verification did not return a hit list.");
const actualIds = new Set();
for (const hit of hits) {
  const fields = hit?.fields || hit?.metadata || {};
  const id = String(hit?._id || hit?.id || "");
  if (!id) continue;
  actualIds.add(id);
  assert.match(String(fields.clinical_review_status || ""), /^pending/i, `${id} is not pending clinical review.`);
  assert.equal(fields.research_review_status, "source_mapped_not_clinically_reviewed", `${id} has an invalid research review status.`);
  assert.equal(fields.research_card_status, "category_only_research_context", `${id} has an invalid card status.`);
  assert.equal(fields.category_only_card, true, `${id} is not category-only.`);
  assert.equal(fields.routine_selection_allowed, false, `${id} could enter a routine.`);
  assert.equal(fields.product_specific, false, `${id} is product-specific.`);
  assert.equal(fields.demo_only, true, `${id} is outside demo scope.`);
  assert.equal(fields.demo_use_status, "research_demo_only", `${id} is outside research-demo scope.`);
  assert.equal(fields.ingredient_ids, undefined, `${id} retains ingredient IDs.`);
  assert.equal(fields.ingredient_names, undefined, `${id} retains ingredient names.`);
  assert.equal(fields.ingredient_evidence_role, undefined, `${id} retains ingredient activation metadata.`);
}
const missing = [...expectedIds].filter((id) => !actualIds.has(id));
assert.deepEqual(missing, [], `Pinecone category-source namespace is missing: ${missing.join(", ")}. Wait for indexing, then rerun this verifier.`);
console.log(JSON.stringify({
  namespace,
  expectedCards: expectedIds.size,
  retrievedCards: actualIds.size,
  status: "category-coverage-pinecone-verified",
}, null, 2));
