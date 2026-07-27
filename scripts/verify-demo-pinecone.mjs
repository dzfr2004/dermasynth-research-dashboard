import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { fetchJson } from "../lib/http-client.mjs";
import { ingredientKnowledgeSummary } from "../lib/ingredient-knowledge.mjs";
import { assertIntegratedTextIndex, describePineconeIndex, PINECONE_API_VERSION } from "../lib/pinecone.mjs";

const root = resolve(process.cwd());
loadDotEnv(root);
const config = createConfig();
const summary = ingredientKnowledgeSummary();
const namespace = summary.demoPineconeNamespace;
const corpusPath = resolve(root, "data/evidence/ingredient-demo.v1.jsonl");
const supplementPath = resolve(root, "data/evidence/ingredient-source-supplement.v1.jsonl");
async function readJsonl(path) {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => JSON.parse(line));
}
const ingredientCorpus = await readJsonl(corpusPath);
const supplementaryCorpus = await readJsonl(supplementPath);
const expectedIngredientIds = new Set(ingredientCorpus.map((record) => record.ingredient_ids?.[0]).filter(Boolean));
const expectedDocumentIds = new Set([...ingredientCorpus, ...supplementaryCorpus].map((record) => record.document_id).filter(Boolean));

assert.match(namespace, /^demo-/, "Demo verification must target an isolated demo namespace.");
assert.ok(summary.ingredientCount >= expectedIngredientIds.size, "The complete local Atlas must include every ingredient represented by the isolated demo corpus.");

config.pinecone.namespace = namespace;
const descriptor = await describePineconeIndex(config, { force: true });
assertIntegratedTextIndex(descriptor, config.pinecone.textField);

const url = `https://${descriptor.host}/records/namespaces/${encodeURIComponent(namespace)}/search`;
const payload = await fetchJson(url, {
  service: "Pinecone demo ingredient verification",
  timeoutMs: config.requestTimeoutMs,
  method: "POST",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Api-Key": config.pinecone.apiKey,
    "X-Pinecone-Api-Version": PINECONE_API_VERSION,
  },
  body: JSON.stringify({
    query: {
      inputs: { text: "ingredient research demo knowledge base" },
      top_k: 96,
    },
    fields: [
      config.pinecone.textField,
      "document_id",
      "ingredient_ids",
      "demo_only",
      "demo_use_status",
      "routine_selection_allowed",
      "clinical_review_status",
      "title",
      "source",
    ],
  }),
});

const hits = payload?.result?.hits || payload?.hits || payload?.matches || [];
assert.ok(Array.isArray(hits), "Pinecone demo verification did not return a hit list.");
const actualIngredientIds = new Set();
const actualDocumentIds = new Set();
for (const hit of hits) {
  const fields = hit?.fields || hit?.metadata || {};
  if (fields.document_id) actualDocumentIds.add(String(fields.document_id));
  const ids = Array.isArray(fields.ingredient_ids) ? fields.ingredient_ids : [];
  ids.forEach((id) => actualIngredientIds.add(String(id)));
  assert.equal(fields.demo_only, true, "Demo namespace contains a record without demo_only: true.");
  assert.equal(fields.demo_use_status, "research_demo_only", "Demo namespace contains a record outside research_demo_only scope.");
  assert.equal(fields.routine_selection_allowed, false, "Demo namespace contains a record that could enable routine selection.");
  assert.match(String(fields.clinical_review_status || ""), /^pending/i, "Demo namespace contains a clinically activated record.");
}

const missing = [...expectedIngredientIds].filter((id) => !actualIngredientIds.has(id));
assert.deepEqual(missing, [], `Pinecone demo namespace is still missing: ${missing.join(", ")}. Wait for indexing, then rerun this verifier.`);
const missingDocuments = [...expectedDocumentIds].filter((id) => !actualDocumentIds.has(id));
assert.deepEqual(missingDocuments, [], `Pinecone demo namespace is missing source metadata cards: ${missingDocuments.join(", ")}. Wait for indexing, then rerun this verifier.`);
console.log(JSON.stringify({
  namespace,
  expectedIngredientCount: expectedIngredientIds.size,
  retrievedIngredientCount: actualIngredientIds.size,
  expectedDocumentCount: expectedDocumentIds.size,
  retrievedDocumentCount: actualDocumentIds.size,
  hitCount: hits.length,
  status: "demo-kb-verified",
}, null, 2));
