import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { inspectUploadReuseRights } from "../lib/evidence-rights.mjs";
import { assertIntegratedTextIndex, describePineconeIndex, upsertTextRecords } from "../lib/pinecone.mjs";

const MAX_CHUNK_CHARS = 5_000;
const CHUNK_OVERLAP_CHARS = 500;

const usage = `Usage:
  npm run ingest:evidence -- [--file path/to/evidence.jsonl] [--upload | --demo-upload --namespace demo-namespace | --research-upload --namespace demo-namespace]

Options:
  --file <path>  Add a JSONL file. Repeat this option for multiple files.
  --upload       Write clinically approved, rights-cleared chunks to the ordinary Pinecone namespace. Without it, the script is a dry run.
  --demo-upload  Write explicitly demo-only research records to an isolated demo-* Pinecone namespace.
  --research-upload  Write non-clinical category-source cards to an isolated demo-* Pinecone namespace.
  --namespace    Override the Pinecone namespace for this run. Required for --demo-upload and --research-upload.
  --help          Show this help.

Without --file, the script validates all .jsonl files in data/evidence/.
Each source row must include document_id, title, source, and either chunk_text or text.
An ordinary upload requires clinical_review_status to begin with "approved" and documented reuse rights for every record.
A demo upload requires an explicit demo-only record contract and documented reuse rights; it does not mark records clinically approved.
A research upload requires a pending clinical_review_status and an explicit non-clinical category-only card contract; it cannot enter ordinary synthesis.
`;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const files = [];
  let upload = false;
  let demoUpload = false;
  let researchUpload = false;
  let namespace = "";

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true, files, upload, demoUpload, researchUpload, namespace };
    if (argument === "--upload") {
      upload = true;
      continue;
    }
    if (argument === "--demo-upload") {
      demoUpload = true;
      continue;
    }
    if (argument === "--research-upload") {
      researchUpload = true;
      continue;
    }
    if (argument === "--file") {
      const file = argv[index + 1];
      if (!file || file.startsWith("--")) fail("--file requires a path.");
      files.push(file);
      index += 1;
      continue;
    }
    if (argument === "--namespace") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail("--namespace requires a namespace value.");
      namespace = value.trim();
      index += 1;
      continue;
    }
    fail(`Unknown option: ${argument}`);
  }

  if ([upload, demoUpload, researchUpload].filter(Boolean).length > 1) fail("Choose only one of --upload, --demo-upload, or --research-upload.");
  if ((demoUpload || researchUpload) && !namespace) fail("--demo-upload and --research-upload require an explicit isolated --namespace beginning with demo-.");
  if ((demoUpload || researchUpload) && !/^demo-[a-z0-9][a-z0-9._-]{1,120}$/i.test(namespace)) {
    fail("--demo-upload and --research-upload require a namespace beginning with demo- and containing only letters, numbers, dot, underscore, or hyphen.");
  }

  return { help: false, files, upload, demoUpload, researchUpload, namespace };
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function requiredText(value, field, context, maximum = 2_000) {
  const text = cleanText(value);
  if (!text) fail(`${context}: ${field} is required.`);
  if (text.length > maximum) fail(`${context}: ${field} exceeds ${maximum} characters.`);
  return text;
}

function optionalText(value, field, context, maximum = 2_000) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, field, context, maximum);
}

function optionalStringList(value, field, context, maximumItems = 50) {
  if (value === undefined || value === null || value === "") return undefined;
  const rawValues = Array.isArray(value) ? value : [value];
  if (!rawValues.length || rawValues.length > maximumItems) fail(`${context}: ${field} must contain 1–${maximumItems} strings.`);
  return rawValues.map((item) => requiredText(item, field, context, 300));
}

function optionalBoolean(value, field, context) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "boolean") fail(`${context}: ${field} must be a boolean.`);
  return value;
}

function makeChunks(text) {
  const source = cleanText(text);
  if (!source) return [];
  if (source.length <= MAX_CHUNK_CHARS) return [source];

  const chunks = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(start + MAX_CHUNK_CHARS, source.length);
    if (end < source.length) {
      const candidates = [
        source.lastIndexOf(". ", end),
        source.lastIndexOf("? ", end),
        source.lastIndexOf("! ", end),
        source.lastIndexOf(" ", end),
      ];
      const boundary = Math.max(...candidates);
      if (boundary > start + Math.floor(MAX_CHUNK_CHARS * 0.55)) end = boundary + 1;
    }

    const chunk = source.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= source.length) break;
    start = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1);
  }
  return chunks;
}

function normaliseYear(value, context) {
  if (value === undefined || value === null || value === "") return undefined;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1800 || year > 2100) fail(`${context}: published_year must be a four-digit year.`);
  return year;
}

function normaliseChunkNumber(value, fallback, context) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) fail(`${context}: chunk_number must be a positive integer.`);
  return number;
}

function normaliseId(value, context) {
  const id = requiredText(value, "record id", context, 512);
  return id;
}

function isClinicallyApproved(value) {
  const status = cleanText(value);
  const indicatesApproval = /^approved(?:\b|[-_:])/i.test(status);
  const indicatesQualifiedReviewer = /\b(qualified|licensed|credentialed|dermatolog(?:ist|y)|domain[-\s]?reviewer)\b/i.test(status);
  const lacksReviewerIdentity = /user[-\s]?confirmed|identity\s+not\s+captured|reviewer\s+not\s+(?:named|identified)|unverified/i.test(status);
  return indicatesApproval && indicatesQualifiedReviewer && !lacksReviewerIdentity;
}

function assertUploadReview(records) {
  const pending = records.filter((record) => !isClinicallyApproved(record.clinical_review_status));
  if (!pending.length) return;
  const examples = pending.slice(0, 3).map((record) => record._id).join(", ");
  fail(`Refusing upload: ${pending.length} record(s) lack a documented qualified-review approval (${examples}). Use an approved status that identifies a qualified reviewer and excludes user-confirmed or unverified wording before uploading.`);
}

function assertUploadReuseRights(records) {
  const rejected = records
    .map((record) => ({ record, result: inspectUploadReuseRights(record) }))
    .filter(({ result }) => !result.allowed);
  if (!rejected.length) return;

  const examples = rejected
    .slice(0, 3)
    .map(({ record, result }) => `${record._id} (${result.reason})`)
    .join(", ");
  fail(`Refusing upload: ${rejected.length} record(s) lack a cleared reuse basis (${examples}). Use documented research/non-commercial or commercial-safe rights metadata before uploading.`);
}

function isPendingDemoReview(value) {
  return /^pending(?:\b|[-_:])/i.test(cleanText(value));
}

function assertDemoUpload(records, namespace) {
  if (!/^demo-/i.test(namespace)) fail("Demo uploads must use an isolated namespace beginning with demo-.");
  const invalid = records.filter((record) => (
    record.demo_only !== true
    || record.demo_use_status !== "research_demo_only"
    || record.routine_selection_allowed !== false
    || !isPendingDemoReview(record.clinical_review_status)
  ));
  if (!invalid.length) return;
  const examples = invalid.slice(0, 3).map((record) => record._id).join(", ");
  fail(`Refusing demo upload: ${invalid.length} record(s) do not satisfy the explicit demo-only contract (${examples}). Require demo_only: true, demo_use_status: research_demo_only, routine_selection_allowed: false, and a pending clinical_review_status.`);
}

function isMappedResearchReview(value) {
  return /^source_mapped_not_clinically_reviewed(?:\b|[-_:])/i.test(cleanText(value));
}

function assertResearchUpload(records, namespace) {
  if (!/^demo-/i.test(namespace)) fail("Research category cards must use an isolated namespace beginning with demo-.");
  const invalid = records.filter((record) => (
    record.demo_only !== true
    || record.demo_use_status !== "research_demo_only"
    || record.category_only_card !== true
    || record.research_card_status !== "category_only_research_context"
    || record.routine_selection_allowed !== false
    || record.product_specific === true
    || !isPendingDemoReview(record.clinical_review_status)
    || !isMappedResearchReview(record.research_review_status)
  ));
  if (!invalid.length) return;
  const examples = invalid.slice(0, 3).map((record) => record._id).join(", ");
  fail(`Refusing research upload: ${invalid.length} record(s) do not satisfy the non-clinical category-card contract (${examples}). Require demo_only: true, demo_use_status: research_demo_only, category_only_card: true, research_card_status: category_only_research_context, routine_selection_allowed: false, product_specific: false, pending clinical_review_status, and source_mapped_not_clinically_reviewed research_review_status.`);
}

function readRecord(raw, context, config, counters) {
  if (!raw || Array.isArray(raw) || typeof raw !== "object") fail(`${context}: each line must be a JSON object.`);

  const documentId = requiredText(raw.document_id, "document_id", context, 200);
  const title = requiredText(raw.title, "title", context, 500);
  const source = requiredText(raw.source, "source", context, 500);
  const sourceText = raw[config.pinecone.textField] ?? raw.chunk_text ?? raw.text;
  const text = requiredText(sourceText, config.pinecone.textField, context, 100_000);
  const chunks = makeChunks(text);
  const firstChunk = normaliseChunkNumber(raw.chunk_number, (counters.get(documentId) || 0) + 1, context);
  const suppliedId = raw._id ?? raw.id;
  const metadata = {
    document_id: documentId,
    title,
    source,
    source_url: optionalText(raw.source_url, "source_url", context, 2_000),
    published_year: normaliseYear(raw.published_year, context),
    document_type: optionalText(raw.document_type, "document_type", context, 120),
    evidence_tier: optionalText(raw.evidence_tier, "evidence_tier", context, 120),
  };
  for (const field of ["doi_or_pmid", "source_locator", "clinical_review_status", "source_card_review_status", "review_scope", "research_review_status", "research_reviewed_at", "research_reviewer_role", "research_card_status", "document_version", "sha256", "license_or_access", "reuse_rights_status", "reuse_rights_basis", "reuse_rights_reviewed_at", "claim_category", "ingredient_evidence_role", "source_use_mode", "normalization_status", "demo_use_status", "retrieved_at", "jurisdiction", "evidence_scope", "conflict_disclosure"]) {
    const value = optionalText(raw[field], field, context, 2_000);
    if (value !== undefined) metadata[field] = value;
  }
  const citationText = optionalText(raw.citation_text, "citation_text", context, 5_000);
  if (citationText !== undefined) metadata.citation_text = citationText;
  for (const field of ["authors", "ingredient_ids", "ingredient_names", "inci_names", "source_record_ids", "env_tags"]) {
    const value = optionalStringList(raw[field], field, context);
    if (value !== undefined) metadata[field] = value;
  }
  for (const field of ["conflict_flag", "product_specific", "industry_sponsored", "commercial_restriction", "attribution_required", "demo_only", "category_only_card", "routine_selection_allowed"]) {
    const value = optionalBoolean(raw[field], field, context);
    if (value !== undefined) metadata[field] = value;
  }

  const records = chunks.map((chunk, index) => {
    const chunkNumber = firstChunk + index;
    const id = suppliedId && chunks.length === 1
      ? normaliseId(suppliedId, context)
      : normaliseId(`${documentId}#chunk-${String(chunkNumber).padStart(4, "0")}`, context);
    return {
      _id: id,
      [config.pinecone.textField]: chunk,
      ...Object.fromEntries(Object.entries({ ...metadata, chunk_number: chunkNumber }).filter(([, value]) => value !== undefined)),
    };
  });

  counters.set(documentId, firstChunk + chunks.length - 1);
  return records;
}

async function defaultFiles(root) {
  const directory = resolve(root, "data/evidence");
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => resolve(directory, entry.name));
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function loadRecords(files, config) {
  const records = [];
  const seenIds = new Set();
  const counters = new Map();

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    for (const [lineOffset, line] of raw.split(/\r?\n/).entries()) {
      const value = line.trim();
      if (!value || value.startsWith("#")) continue;
      const context = `${basename(file)}:${lineOffset + 1}`;
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch {
        fail(`${context}: invalid JSON.`);
      }
      for (const record of readRecord(parsed, context, config, counters)) {
        if (seenIds.has(record._id)) fail(`${context}: duplicate record id ${record._id}.`);
        seenIds.add(record._id);
        records.push(record);
      }
    }
  }

  if (!records.length) fail("No evidence records were found.");
  return records;
}

function batches(records, size) {
  const output = [];
  for (let index = 0; index < records.length; index += size) output.push(records.slice(index, index + size));
  return output;
}

async function main() {
  const root = resolve(process.cwd());
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }

  loadDotEnv(root);
  const config = createConfig();
  if (options.namespace) config.pinecone.namespace = options.namespace;
  const files = options.files.length ? options.files.map((file) => resolve(root, file)) : await defaultFiles(root);
  if (!files.length) fail("No JSONL files found. Add curated sources under data/evidence/ or pass --file.");

  const records = await loadRecords(files, config);
  const summary = {
    mode: options.demoUpload ? "demo-upload" : options.researchUpload ? "research-upload" : options.upload ? "upload" : "dry-run",
    index: config.pinecone.index || "not configured",
    namespace: config.pinecone.namespace,
    files: files.map((file) => basename(file)),
    records: records.length,
    batches: batches(records, config.pinecone.ingestBatchSize).length,
    textField: config.pinecone.textField,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!options.upload && !options.demoUpload && !options.researchUpload) {
    console.log("Dry run only. Add --upload to write these validated records to Pinecone.");
  } else {
    if (options.demoUpload) assertDemoUpload(records, config.pinecone.namespace);
    else if (options.researchUpload) assertResearchUpload(records, config.pinecone.namespace);
    else assertUploadReview(records);
    assertUploadReuseRights(records);
    const descriptor = await describePineconeIndex(config, { force: true });
    assertIntegratedTextIndex(descriptor, config.pinecone.textField);
    const pending = batches(records, config.pinecone.ingestBatchSize);
    for (const [index, batch] of pending.entries()) {
      await upsertTextRecords({ config, descriptor, records: batch });
      console.log(`Uploaded batch ${index + 1}/${pending.length} (${batch.length} records).`);
    }
    console.log(options.demoUpload
      ? "Demo research upload submitted to the isolated namespace. Pinecone indexing is eventually consistent; these records remain non-clinical and unavailable for routine selection."
      : options.researchUpload
        ? "Category-source coverage upload submitted to the isolated namespace. These pending-review cards remain outside strict CUE, GPT synthesis, ingredient activation, and routine selection."
        : "Evidence upload submitted. Pinecone indexing is eventually consistent, so results can take a short time to appear in search.");
  }
}

try {
  await main();
} catch (error) {
  console.error(`Evidence ingestion stopped: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
}
