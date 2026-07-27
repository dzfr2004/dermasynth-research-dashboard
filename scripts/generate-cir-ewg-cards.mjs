import { readFileSync, writeFileSync } from "node:fs";

/**
 * Generates honest SCAFFOLD CIR + EWG factual-context cards for every ingredient
 * in the Atlas. Each generated card is a placeholder marked
 * `verification_status: "unverified_needs_source_read"` — it does NOT assert a
 * conclusion or hazard score. A human must locate the source, read it, and
 * replace chunk_text with a paraphrase before flipping verification_status to
 * "verified_paraphrase". Verified cards live in a separate *.verified.*.jsonl.
 *
 * This keeps 50-ingredient coverage available without fabricating conclusions.
 */

const SOURCES = [
  "data/ingredients/knowledge-base.v1.json",
  "data/ingredients/demo-extension.v1.json",
  "data/ingredients/atlas-extension-50.v1.json",
];

const seen = new Map();
for (const file of SOURCES) {
  const doc = JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
  for (const ing of doc.ingredients || []) {
    const id = ing.id || ing.ingredientId;
    if (!id || seen.has(id)) continue;
    const name = ing.displayName || ing.name || id;
    let inci = ing.inciNames || ing.inciName || [];
    if (typeof inci === "string") inci = [inci];
    seen.set(id, { id, name, inci: inci.length ? inci : [name] });
  }
}

const slug = (s) => encodeURIComponent(s.trim());
const cirCard = ({ id, name, inci }) => ({
  document_id: `cir-${id}-safety-assessment-scaffold-v1`,
  title: `${name} — CIR safety-assessment factual card (scaffold)`,
  source: "Cosmetic Ingredient Review (CIR)",
  source_family: "CIR",
  source_url: `https://cir-reports.cir-safety.org/search/?q=${slug(name)}`,
  published_year: "",
  document_type: "regulatory-safety-provenance-card",
  evidence_tier: "regulatory-safety-provenance",
  chunk_text: `Scaffold card for ${name}. TASK: locate the applicable CIR safety assessment (it may be a grouped/family report), read the Expert Panel conclusion, then paraphrase it here in your own words. Do not store verbatim CIR text. Unverified until the source is read.`,
  source_locator: "Scaffold placeholder; paraphrased conclusion pending source read.",
  citation_text: `Cosmetic Ingredient Review. Safety Assessment relevant to ${name} (locate and verify report + year).`,
  claim_category: "ingredient-regulatory-safety-context",
  clinical_review_status: "pending: qualified review required before activation.",
  reuse_rights_status: "attribution_only",
  reuse_rights_basis: "Factual paraphrase with attribution and source link; protected expression not reproduced.",
  verification_status: "unverified_needs_source_read",
  verified_by: "",
  verified_at: "",
  product_specific: false,
  attribution_required: true,
  routine_selection_allowed: false,
  ingredient_ids: [id],
  ingredient_names: [name],
  inci_names: inci,
});
const ewgCard = ({ id, name, inci }) => ({
  document_id: `ewg-${id}-reference-scaffold-v1`,
  title: `${name} — EWG Skin Deep reference card (scaffold)`,
  source: "EWG Skin Deep",
  source_family: "EWG",
  source_url: `https://www.ewg.org/skindeep/search/?query=${slug(name)}`,
  published_year: "",
  document_type: "reference-database-provenance-card",
  evidence_tier: "reference-database-provenance",
  chunk_text: `Scaffold card for ${name}. TASK: locate the EWG Skin Deep entry, record the current hazard rating as a paraphrased reference (ratings can change; note the date checked). Do not copy bulk EWG data. Unverified until the source is read.`,
  source_locator: "Scaffold placeholder; hazard rating pending source read.",
  citation_text: `EWG Skin Deep. ${name} entry (locate and verify current rating + date).`,
  claim_category: "ingredient-reference-database-context",
  clinical_review_status: "pending: qualified review required before activation.",
  reuse_rights_status: "attribution_only",
  reuse_rights_basis: "Single-entry reference with attribution and source link; database not reproduced.",
  verification_status: "unverified_needs_source_read",
  verified_by: "",
  verified_at: "",
  product_specific: false,
  attribution_required: true,
  routine_selection_allowed: false,
  ingredient_ids: [id],
  ingredient_names: [name],
  inci_names: inci,
});

const ingredients = [...seen.values()];
const lines = ["# AUTO-GENERATED scaffold CIR/EWG cards for all Atlas ingredients. All rows are unverified placeholders — read each source and paraphrase before use."];
for (const ing of ingredients) lines.push(JSON.stringify(cirCard(ing)));
for (const ing of ingredients) lines.push(JSON.stringify(ewgCard(ing)));
const outUrl = new URL("../data/evidence/cir-ewg/cir-ewg-factual-context.scaffold-50.v1.jsonl", import.meta.url);
writeFileSync(outUrl, `${lines.join("\n")}\n`);
console.log(JSON.stringify({ output: "data/evidence/cir-ewg/cir-ewg-factual-context.scaffold-50.v1.jsonl", ingredients: ingredients.length, cards: ingredients.length * 2 }, null, 2));
