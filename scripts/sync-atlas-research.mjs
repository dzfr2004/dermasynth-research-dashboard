import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { getIngredientKnowledgeBase } from "../lib/ingredient-knowledge.mjs";
import { assertIntegratedTextIndex, describePineconeIndex, upsertTextRecords } from "../lib/pinecone.mjs";

const usage = `Usage: npm run sync:atlas-pinecone -- [--upload] [--namespace demo-atlas-50-v1]

Builds one project-authored, metadata-only Pinecone card for each Atlas
ingredient. These cards contain no copied journal, CIR, or EWG source text.
They remain research-demo-only and cannot enter strict CUE, GPT synthesis,
ingredient activation, or an individual AM/PM routine.`;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  let upload = false;
  let namespace = "";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true, upload, namespace };
    if (argument === "--upload") {
      upload = true;
      continue;
    }
    if (argument === "--namespace") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail("--namespace requires a value.");
      namespace = value.trim();
      index += 1;
      continue;
    }
    fail(`Unknown option: ${argument}`);
  }
  return { help: false, upload, namespace };
}

function cardForIngredient(ingredient) {
  const contexts = [...ingredient.concernContexts].join(", ");
  const sourceIds = [...ingredient.sourceIds];
  return {
    _id: `atlas-ingredient-${ingredient.id}-v1`,
    chunk_text: [
      `Project-authored research metadata card for ${ingredient.displayName}.`,
      `Mapped non-clinical research contexts: ${contexts}.`,
      "This card records source identifiers and normalisation metadata for final-review inspection only.",
      "It does not copy source text, select a product or ingredient, infer a result, specify an amount or frequency, or create an individual routine instruction.",
    ].join(" "),
    document_id: `atlas-ingredient-${ingredient.id}-v1`,
    title: `${ingredient.displayName} — source-attributed research metadata`,
    source: "DermaSynth project-authored research Atlas",
    published_year: 2026,
    document_type: "project-authored-category-only-atlas-card",
    evidence_tier: "source-attributed-research-context",
    source_locator: "Atlas source-record identifiers only; no source passage is stored.",
    clinical_review_status: "pending: source metadata remains outside clinical activation.",
    research_review_status: "source_mapped_not_clinically_reviewed",
    research_reviewed_at: "2026-07-17",
    research_reviewer_role: "project-source-curation",
    research_card_status: "category_only_research_context",
    document_version: "atlas-metadata-card-v1",
    reuse_rights_status: "cleared_research_noncommercial",
    reuse_rights_basis: "Project-authored metadata card containing no copied source text; external sources remain linked in the Atlas.",
    reuse_rights_reviewed_at: "2026-07-17",
    source_use_mode: "project_authored_metadata_with_atlas_links",
    normalization_status: ingredient.normalizationStatus,
    demo_use_status: "research_demo_only",
    evidence_scope: "Research-atlas metadata only; excluded from strict CUE, synthesis, activation, and routine selection.",
    ingredient_evidence_role: "atlas_metadata_not_activated",
    product_specific: false,
    commercial_restriction: true,
    attribution_required: true,
    demo_only: true,
    category_only_card: true,
    routine_selection_allowed: false,
    ingredient_ids: [ingredient.id],
    ingredient_names: [ingredient.displayName],
    inci_names: [...ingredient.inciNames],
    source_record_ids: sourceIds,
    env_tags: [],
  };
}

function batches(records, size) {
  const output = [];
  for (let index = 0; index < records.length; index += size) output.push(records.slice(index, index + size));
  return output;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }

  loadDotEnv(process.cwd());
  const config = createConfig();
  const namespace = options.namespace || config.pinecone.researchNamespace;
  if (!/^demo-[a-z0-9][a-z0-9._-]{1,120}$/i.test(namespace)) {
    fail("Atlas metadata synchronisation requires an isolated demo-* namespace.");
  }
  if (!config.pinecone.apiKey || !config.pinecone.index) {
    fail("Pinecone API key and index are required for Atlas synchronisation.");
  }

  const knowledgeBase = getIngredientKnowledgeBase();
  const records = knowledgeBase.ingredients.map(cardForIngredient);
  const summary = {
    mode: options.upload ? "upload" : "dry-run",
    namespace,
    records: records.length,
    ingredientCount: knowledgeBase.ingredients.length,
    batchCount: batches(records, config.pinecone.ingestBatchSize).length,
    safetyBoundary: "metadata-only; unavailable for strict CUE, synthesis, activation, and routine selection",
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!options.upload) {
    console.log("Dry run only. Add --upload to synchronise the project-authored Atlas cards.");
    return;
  }

  config.pinecone.namespace = namespace;
  const descriptor = await describePineconeIndex(config, { force: true });
  assertIntegratedTextIndex(descriptor, config.pinecone.textField);
  const pending = batches(records, config.pinecone.ingestBatchSize);
  for (const [index, batch] of pending.entries()) {
    await upsertTextRecords({ config, descriptor, records: batch });
    console.log(`Uploaded Atlas metadata batch ${index + 1}/${pending.length} (${batch.length} records).`);
  }
  console.log("Atlas metadata synchronised. Cards remain non-clinical and unavailable for routine selection.");
}

try {
  await main();
} catch (error) {
  console.error(`Atlas synchronisation stopped: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
}
