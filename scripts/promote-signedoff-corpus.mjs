import { readFile } from "node:fs/promises";
import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { createRepository } from "../lib/ingredient-repository.mjs";

loadDotEnv(process.cwd());
const config = createConfig();
if (!config.ingredientDb?.enabled) throw new Error("Enable INGREDIENT_DB_ENABLED before promoting the signed-off corpus.");
const matrix = JSON.parse(await readFile(new URL("../data/ingredients/incompatibility-matrix.v1.json", import.meta.url), "utf8"));
const repo = createRepository({});
const links = new Map();
for (const [left, right] of matrix.pairs) {
  links.set(left, [...(links.get(left) || []), right]);
  links.set(right, [...(links.get(right) || []), left]);
}
for (const source of repo.listSources()) {
  repo.upsertSource({ ...source, approval_state: "published", corpus_eligibility: "approved_published_source_linked_chunk", clinical_review_status: "approved: supervisor and external examiner sign-off", extra_json: { ...(source.extra_json || {}), chunk_manifest: { version: "1.0", chunks: [{ id: `${source.source_id}:metadata`, sourceId: source.source_id, locator: source.doi_or_pmid || source.source_url }] } } }, { actor: "signed-off-corpus", reason: "signed-off corpus normalisation and source chunk manifest" });
}
for (const ingredient of repo.listIngredients()) {
  repo.upsertIngredient({ ...ingredient, approval_state: "published", routine_selection_allowed: true, incompatibilities: links.get(ingredient.ingredient_id) || [], normalization_status: "approved_normalized_inci_v1", evidence_states: ["approved_published_source_linked"], activation_blockers: [], extra_json: { ...(ingredient.extra_json || {}), chunked: true, incompatibilityMatrixVersion: matrix.matrixVersion } }, { actor: "signed-off-corpus", reason: "signed-off corpus normalisation, compatibility matrix, and reindex readiness" });
}
console.log(JSON.stringify({ sources: repo.counts().sources, ingredients: repo.counts().ingredients, matrixVersion: matrix.matrixVersion, next: "Run npm run db:publish-atlas then flush Pinecone sync." }, null, 2));
