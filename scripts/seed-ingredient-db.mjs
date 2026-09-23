// One-time (idempotent) importer: loads the existing validated JSON Atlas
// (50 ingredients + 52 attributed sources) into the database. Each record is
// created at version 1 with an explicit approval_state, then the admin workflow
// takes over. Re-running creates a new version per record, so pass --fresh to
// wipe first for a clean reseed.
//
// Usage:
//   node scripts/seed-ingredient-db.mjs [--state in_review] [--fresh]

import { getDatabase, migrate } from "../lib/db/database.mjs";
import { createRepository, APPROVAL_STATES } from "../lib/ingredient-repository.mjs";
import { getIngredientKnowledgeBase } from "../lib/ingredient-knowledge.mjs";
import { getRuntimePolicy } from "../lib/policy-store.mjs";

function parseArgs(argv) {
  let state = "in_review";
  let fresh = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--fresh") { fresh = true; continue; }
    if (arg === "--state") {
      state = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") { console.log("Usage: seed-ingredient-db.mjs [--state <state>] [--fresh]"); process.exit(0); }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!APPROVAL_STATES.includes(state)) throw new Error(`--state must be one of ${APPROVAL_STATES.join(", ")}`);
  return { state, fresh };
}

function mapSource(record, state) {
  return {
    source_id: record.id,
    approval_state: state,
    source_family: record.sourceFamily,
    source_type: record.sourceType || null,
    title: record.title,
    publisher: record.publisher || null,
    published_year: Number.isInteger(record.publishedYear) ? record.publishedYear : null,
    source_url: record.sourceUrl,
    doi_or_pmid: record.doiOrPmid || null,
    evidence_role: record.evidenceRole || null,
    evidence_type: record.sourceType || record.evidenceRole || null,
    use_mode: record.useMode || null,
    corpus_eligibility: record.corpusEligibility || null,
    rights_status: record.rightsStatus || record.licenceOrAccess || null,
    clinical_review_status: record.clinicalReviewStatus || null,
    reuse_note: record.reuseNote || null,
    claim_boundary: record.claimBoundary || null,
    commercial_restriction: record.commercialRestriction ?? null,
    attribution_required: record.attributionRequired ?? null,
    extra_json: { licenceOrAccess: record.licenceOrAccess ?? null, ingredientIds: record.ingredientIds ?? [] },
  };
}

function mapIngredient(record, state, categories) {
  return {
    ingredient_id: record.id,
    approval_state: state,
    display_name: record.displayName,
    inci_names: record.inciNames || [],
    aliases: record.aliases || [],
    // Category membership is persisted with each database record. Runtime
    // selection therefore never reads the legacy JSON Atlas or an ingredient
    // ID registry; an administrator can change membership through versioned
    // records and the normal approval workflow.
    categories,
    concern_contexts: record.concernContexts || [],
    am_pm_eligibility: null,
    environmental_rules: null,
    incompatibilities: [],
    reactivity_class: null,
    normalization_status: record.normalizationStatus || null,
    evidence_states: record.evidenceStates || [],
    activation_blockers: record.activationBlockers || [],
    // An approved/published import is explicitly eligible for the separate
    // candidate layer. It still cannot alter the category-only routine.
    routine_selection_allowed: ["approved", "published"].includes(state),
    source_ids: record.sourceIds || [],
  };
}

const { state, fresh } = parseArgs(process.argv.slice(2));
const db = getDatabase();
migrate(db);

if (fresh) {
  for (const table of ["ingredient_sources", "ingredients", "sources", "record_versions"]) {
    db.run(`DELETE FROM ${table}`);
  }
  db.run("INSERT INTO audit_log (id, at, actor, entity_type, entity_id, action, detail_json) VALUES (?,?,?,?,?,?,?)",
    [cryptoId(), new Date().toISOString(), "seed", "ingredient", null, "import", JSON.stringify({ note: "fresh reseed: cleared prior records" })]);
}

function cryptoId() {
  return `seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const repo = createRepository({ db });
const kb = getIngredientKnowledgeBase();
const policy = getRuntimePolicy();
const categoryMembership = new Map();
for (const category of policy.ingredientSelection.eligibleCategories) {
  categoryMembership.set(category, new Set());
}
// Preserve the initially curated category membership only at import time.
// After import, the database is the source of truth and membership is edited
// through the admin API/version workflow, not this legacy source.
const legacyMembership = {
  "comfort-hydration": ["glycerin", "sodium-hyaluronate", "beta-glucan", "ectoin"],
  "light-hydration": ["glycerin", "sodium-hyaluronate", "beta-glucan", "niacinamide"],
  "supportive-hydration": ["glycerin", "beta-glucan", "ectoin", "niacinamide"],
  "barrier-support-moisturising": ["ceramide-np", "ceramide-eop", "squalane", "dimethicone"],
  "lightweight-moisturising": ["dimethicone", "squalane", "glycerin", "niacinamide"],
  "supportive-moisturising": ["squalane", "linoleic-acid", "ceramide-ap", "ectoin"],
  "daytime-photoprotection": ["zinc-oxide", "titanium-dioxide"],
  "antioxidant-context": ["ascorbic-acid", "tocopherol", "resveratrol"],
  "texture-renewal": ["gluconolactone", "mandelic-acid", "glycolic-acid", "salicylic-acid"],
  "overnight-comfort": ["ceramide-np", "squalane", "allantoin", "madecassoside"],
};
for (const [category, ingredientIds] of Object.entries(legacyMembership)) {
  for (const ingredientId of ingredientIds) categoryMembership.get(category)?.add(ingredientId);
}

let sourceCount = 0;
for (const record of kb.sourceRecords) {
  repo.upsertSource(mapSource(record, state), { actor: "seed", reason: "import from JSON Atlas" });
  sourceCount += 1;
}

let ingredientCount = 0;
for (const record of kb.ingredients) {
  const categories = [...categoryMembership.entries()]
    .filter(([, ids]) => ids.has(record.id))
    .map(([category]) => category);
  repo.upsertIngredient(mapIngredient(record, state, categories), { actor: "seed", reason: "initial import into dynamic knowledge base" });
  ingredientCount += 1;
}

const counts = repo.counts();
console.log(`Imported ${sourceCount} sources and ${ingredientCount} ingredients at state '${state}'.`);
console.log("Current counts:", JSON.stringify(counts, null, 2));
