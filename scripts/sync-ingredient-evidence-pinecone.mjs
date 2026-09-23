import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { createRepository } from "../lib/ingredient-repository.mjs";
import { buildIngredientEvidenceCorpus, EVIDENCE_CORPUS_VERSION } from "../lib/ingredient-evidence-corpus.mjs";
import { assertIntegratedTextIndex, describePineconeIndex, upsertTextRecords } from "../lib/pinecone.mjs";

/**
 * Uploads the ingredient evidence documents (lib/ingredient-evidence-corpus.mjs)
 * to the Pinecone evidence namespace, so the dense half of the candidate
 * retriever searches exactly the text the local BM25 half searches.
 *
 * Re-run it after any knowledge-base change (new cards, category tags, source
 * links). Records are upserted by stable id, so re-running replaces them.
 *
 * Usage:
 *   npm run sync:evidence-pinecone              # dry run: prints what would upload
 *   npm run sync:evidence-pinecone -- --upload  # uploads
 *   ... -- --namespace demo-ingredient-evidence-v2
 */

function parseArgs(argv) {
  const options = { upload: false, namespace: "" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--upload") options.upload = true;
    else if (argv[i] === "--namespace") { options.namespace = String(argv[i + 1] || "").trim(); i += 1; }
    else if (argv[i] === "--help" || argv[i] === "-h") options.help = true;
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log("Usage: npm run sync:evidence-pinecone -- [--upload] [--namespace demo-ingredient-evidence-v2]");
  process.exit(0);
}
loadDotEnv(process.cwd());
const config = createConfig();
const namespace = options.namespace || config.pinecone.evidenceNamespace;
if (!/^demo-[a-z0-9][a-z0-9._-]{1,120}$/i.test(namespace)) throw new Error("The evidence namespace must be an isolated demo-* namespace.");

const repo = createRepository({});
const corpus = buildIngredientEvidenceCorpus({ ingredients: repo.listIngredients(), sources: repo.listSources() });
const records = corpus.map((document) => ({
  _id: `ingredient-evidence-${document.id}-v2`,
  [config.pinecone.textField]: document.text,
  [config.pinecone.titleField]: document.title,
  [config.pinecone.sourceField]: "DermaSynth ingredient evidence document (project-authored; paraphrased verified cards)",
  document_id: `ingredient-evidence-${document.id}`,
  document_version: EVIDENCE_CORPUS_VERSION,
  ingredient_ids: [document.id],
  ingredient_names: [document.fields.displayName],
  categories: document.fields.categories,
  functional_class: document.fields.functionalClass,
  safety_document_id: document.fields.safetyDocumentId,
  safety_source_family: document.fields.safetySourceFamily,
  source_record_ids: document.fields.linkedSourceIds,
  routine_selection_allowed: false,
  card_role: "retrieval_document_only",
}));

console.log(JSON.stringify({
  mode: options.upload ? "upload" : "dry-run",
  namespace,
  records: records.length,
  corpusVersion: EVIDENCE_CORPUS_VERSION,
  example: { id: records[0]?._id, text: String(records[0]?.[config.pinecone.textField] || "").slice(0, 240) },
}, null, 2));
if (!options.upload) {
  console.log("Dry run only. Add --upload to send these records to Pinecone.");
  process.exit(0);
}
if (!config.pinecone.apiKey || !config.pinecone.index) throw new Error("PINECONE_API_KEY and PINECONE_INDEX are required.");
const descriptor = await describePineconeIndex(config, { force: true });
assertIntegratedTextIndex(descriptor, config.pinecone.textField);
const size = Math.min(config.pinecone.ingestBatchSize, 96);
for (let i = 0; i < records.length; i += size) {
  await upsertTextRecords({ config, descriptor, records: records.slice(i, i + size), namespace });
  console.log(`Uploaded ${Math.min(i + size, records.length)}/${records.length}`);
}
console.log(`Done. Set PINECONE_EVIDENCE_NAMESPACE=${namespace} in .env if it is not the default.`);
