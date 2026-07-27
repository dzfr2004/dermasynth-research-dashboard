import { readdirSync, readFileSync, existsSync } from "node:fs";

/**
 * Loads the verified CIR/regulatory factual cards and indexes them by ingredient
 * id, so the per-ingredient LLM rationale can be GROUNDED in the actual verified
 * safety conclusion for each ingredient rather than free-form model memory.
 *
 * Only cards whose verification_status begins with "verified" are used; CIR
 * family is preferred over other regulatory families when several exist.
 */

const DIR = new URL("../data/evidence/cir-ewg/", import.meta.url);
let cache = null;

function familyRank(family) {
  const f = String(family || "").toUpperCase();
  if (f === "CIR") return 0;
  if (f === "SCCS") return 1;
  if (f === "FDA" || f === "EU-REGULATION") return 2;
  return 3;
}

function loadNotes() {
  const map = new Map();
  let dirPath;
  try { dirPath = new URL(".", DIR); } catch { return map; }
  let files = [];
  try { files = readdirSync(DIR).filter((f) => f.includes("verified") && f.endsWith(".jsonl")); } catch { return map; }
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
      for (const id of ids) {
        const note = {
          id,
          text: String(card.chunk_text || "").replace(/\s+/g, " ").trim(),
          source: String(card.source || card.source_family || "").trim(),
          sourceFamily: String(card.source_family || "").trim(),
          url: String(card.source_url || "").trim(),
          citation: String(card.citation_text || "").trim(),
        };
        const existing = map.get(id);
        if (!existing || familyRank(note.sourceFamily) < familyRank(existing.sourceFamily)) map.set(id, note);
      }
    }
  }
  return map;
}

export function getIngredientEvidenceNote(ingredientId) {
  if (!cache) cache = loadNotes();
  return cache.get(String(ingredientId || "").trim().toLowerCase()) || null;
}

export function resetIngredientEvidenceNotes() { cache = null; }
