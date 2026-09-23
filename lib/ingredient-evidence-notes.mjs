import { readdirSync, readFileSync, existsSync } from "node:fs";

/**
 * Loads the verified factual-context cards (CIR, SCCS, AICIS, FDA/EU, status
 * cards, and EWG reference cards) and indexes them by ingredient id.
 *
 * Two views are exposed:
 *   - getIngredientEvidenceNote(id): the single best SAFETY-CONCLUSION card for
 *     an ingredient (regulatory panels only, never EWG). This grounds the
 *     per-ingredient LLM rationale and the "evidence strength" factor.
 *   - getIngredientEvidenceCards(id): every verified card for the ingredient,
 *     including EWG reference cards. This feeds the candidate-retrieval corpus.
 *
 * Only cards whose verification_status begins with "verified" are used.
 */

const DIR = new URL("../data/evidence/cir-ewg/", import.meta.url);
let cache = null;

// Lower rank wins when several safety cards exist for one ingredient.
function familyRank(family) {
  const f = String(family || "").toUpperCase();
  if (f === "CIR") return 0;
  if (f === "SCCS" || f === "AICIS") return 1;
  if (f === "FDA" || f === "EU-REGULATION") return 2;
  return 3;
}

function isConsumerReference(card) {
  return String(card.source_family || "").toUpperCase() === "EWG";
}

function loadCards() {
  const notes = new Map();
  const cards = new Map();
  let files = [];
  try { files = readdirSync(DIR).filter((f) => f.includes("verified") && f.endsWith(".jsonl")).sort(); } catch { return { notes, cards }; }
  for (const file of files) {
    const url = new URL(file, DIR);
    if (!existsSync(url)) continue;
    let text = "";
    try { text = readFileSync(url, "utf8"); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      let card;
      try { card = JSON.parse(trimmed); } catch { continue; }
      if (!String(card.verification_status || "").startsWith("verified")) continue;
      const ids = Array.isArray(card.ingredient_ids) ? card.ingredient_ids : [];
      for (const rawId of ids) {
        const id = String(rawId || "").trim().toLowerCase();
        if (!id) continue;
        const summary = {
          id,
          documentId: String(card.document_id || ""),
          title: String(card.title || ""),
          text: String(card.chunk_text || "").replace(/\s+/g, " ").trim(),
          source: String(card.source || card.source_family || "").trim(),
          sourceFamily: String(card.source_family || "").trim(),
          url: String(card.source_url || "").trim(),
          citation: String(card.citation_text || "").trim(),
          verificationStatus: String(card.verification_status || ""),
          verifiedAt: String(card.verified_at || ""),
          safetyFlags: Array.isArray(card.safety_flags) ? card.safety_flags.map(String) : [],
          supportingLiteratureSourceIds: Array.isArray(card.supporting_literature_source_ids) ? card.supporting_literature_source_ids.map(String) : [],
        };
        cards.set(id, [...(cards.get(id) || []), summary]);
        if (isConsumerReference(card)) continue;
        const existing = notes.get(id);
        if (!existing || familyRank(summary.sourceFamily) < familyRank(existing.sourceFamily)) notes.set(id, summary);
      }
    }
  }
  return { notes, cards };
}

function loaded() {
  if (!cache) cache = loadCards();
  return cache;
}

export function getIngredientEvidenceNote(ingredientId) {
  return loaded().notes.get(String(ingredientId || "").trim().toLowerCase()) || null;
}

export function getIngredientEvidenceCards(ingredientId) {
  return [...(loaded().cards.get(String(ingredientId || "").trim().toLowerCase()) || [])];
}

/**
 * "verified_conclusion": a panel/regulator conclusion was read and paraphrased.
 * "status_only": the card records that no dedicated assessment exists.
 * "none": no verified safety card.
 */
export function evidenceGrade(ingredientId) {
  const note = getIngredientEvidenceNote(ingredientId);
  if (!note) return { grade: "none", value: 0, label: "no verified safety card", note: null };
  if (/no_dedicated_assessment/i.test(note.verificationStatus) || /^regulatory-status$/i.test(note.sourceFamily)) {
    return { grade: "status_only", value: 0.5, label: "status only (no dedicated assessment)", note };
  }
  return { grade: "verified_conclusion", value: 1, label: `verified ${note.sourceFamily || "regulatory"} conclusion`, note };
}

export function resetIngredientEvidenceNotes() { cache = null; }
