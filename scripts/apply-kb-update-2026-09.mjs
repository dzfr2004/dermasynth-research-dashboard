import { createRepository } from "../lib/ingredient-repository.mjs";

/**
 * Knowledge-base update of 23 September 2026. Idempotent: running it again
 * changes nothing. Every change goes through the repository, so it is
 * versioned and written to the audit log.
 *
 * 1. Adds the AICIS Evaluation Statement EVA00186 (Retinal, 26 June 2026) as a
 *    source in review (publish it through the governance workflow after
 *    sign-off) and links it to the Retinal ingredient record.
 * 2. Blocks Retinal from routine selection: AICIS classifies it as a
 *    developmental toxicant (Reproductive toxicity Category 1B).
 *
 * Usage: node scripts/apply-kb-update-2026-09.mjs [--dry-run]
 */

const ACTOR = "kb-update-2026-09-23";
const DRY_RUN = process.argv.includes("--dry-run");
const repo = createRepository({});
const changes = [];

const AICIS_SOURCE = {
  source_id: "aicis-retinal-evaluation-2026",
  // Added for review, not published: it needs the same supervisor/examiner
  // sign-off as the rest of the corpus before it can count as evidence.
  approval_state: "in_review",
  source_family: "AICIS",
  source_type: "regulatory_evaluation",
  title: "Evaluation statement EVA00186: Retinal (Retinaldehyde)",
  publisher: "Australian Industrial Chemicals Introduction Scheme (AICIS)",
  published_year: 2026,
  source_url: "https://www.industrialchemicals.gov.au/sites/default/files/2026-06/EVA00186%20-%20Evaluation%20statement%20-%2026%20June%202026.pdf",
  doi_or_pmid: null,
  evidence_role: "regulatory_safety_conclusion",
  evidence_type: "regulatory_evaluation",
  use_mode: "citation_and_paraphrase_with_attribution",
  corpus_eligibility: "pending_signoff",
  rights_status: "attribution_only",
  clinical_review_status: "pending: supervisor and external examiner sign-off required (added and paraphrased 2026-09-23)",
  reuse_note: "Paraphrased conclusion only; see data/evidence/cir-ewg/factual-context.verified.batch7.v1.jsonl (aicis-retinal-evaluation-v1).",
  claim_boundary: "Hazard classification and introduction status only; not an individual-use or treatment statement.",
  commercial_restriction: false,
  attribution_required: true,
  extra_json: { addedBy: ACTOR, evidenceCardId: "aicis-retinal-evaluation-v1" },
};

const existingSource = repo.getCurrentSource(AICIS_SOURCE.source_id);
if (!existingSource) {
  changes.push({ entity: "source", id: AICIS_SOURCE.source_id, change: "create AICIS source (in_review)" });
  if (!DRY_RUN) repo.upsertSource(AICIS_SOURCE, { actor: ACTOR, reason: "Add AICIS EVA00186 retinal evaluation (2026-06-26)." });
}

const retinal = repo.getCurrentIngredient("retinal");
if (!retinal) throw new Error("Retinal ingredient record not found.");
const sourceIds = repo.listIngredientSourceIds("retinal");
const blocker = "aicis-2026-developmental-toxicant-repr-1b";
const needsUpdate = retinal.routine_selection_allowed !== false
  || !(retinal.activation_blockers || []).includes(blocker)
  || !sourceIds.includes(AICIS_SOURCE.source_id);
if (needsUpdate) {
  changes.push({ entity: "ingredient", id: "retinal", change: "routine_selection_allowed=false, add activation blocker and AICIS source link" });
  if (!DRY_RUN) {
    repo.upsertIngredient({
      ...retinal,
      source_ids: [...new Set([...sourceIds, AICIS_SOURCE.source_id])],
      routine_selection_allowed: false,
      activation_blockers: [...new Set([...(retinal.activation_blockers || []), blocker])],
      evidence_states: [...new Set([...(retinal.evidence_states || []), "aicis_2026_developmental_toxicant_classification"])],
      extra_json: { ...(retinal.extra_json || {}), safetyFlags: ["developmental_toxicity_repr_1b_aicis_2026"], blockedBy: ACTOR },
    }, { actor: ACTOR, reason: "AICIS EVA00186 classifies retinal as Repr. 1B developmental toxicant; blocked from routine selection." });
  }
}

console.log(JSON.stringify({ dryRun: DRY_RUN, changes, counts: repo.counts() }, null, 2));
