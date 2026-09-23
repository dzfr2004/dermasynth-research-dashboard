// Compact, database-derived corpus facts for the interface. The optional LLM
// layer can later paraphrase this payload, but it never becomes the source of truth.

const FAMILY_LABELS = Object.freeze({ CIR: "CIR safety references", EWG: "EWG reference links", medical_journal: "journal records" });
const LIVE_STATES = new Set(["approved", "published"]);

function countByFamily(records) {
  return records.reduce((counts, record) => {
    const family = record.source_family || record.sourceFamily || "other";
    counts[family] = (counts[family] || 0) + 1;
    return counts;
  }, {});
}

export function corpusSummaryFromRepository(repo) {
  const ingredients = repo.listIngredients().filter((record) => LIVE_STATES.has(record.approval_state));
  const sources = repo.listSources().filter((record) => LIVE_STATES.has(record.approval_state));
  const families = countByFamily(sources);
  const familyText = Object.entries(families).map(([family, count]) => `${count} ${FAMILY_LABELS[family] || `${family} records`}`).join(" · ");
  return {
    mode: "database_facts",
    title: "What this corpus covers",
    ingredientCount: ingredients.length,
    sourceCount: sources.length,
    sourceFamilies: families,
    digest: `${ingredients.length} published ingredient records are linked to ${sources.length} source records. The Atlas supports evidence browsing and research context—not diagnosis scoring from environmental readings.`,
    highlights: [`${ingredients.length} published ingredient records`, familyText || "source-linked records", "Evidence links stay attached to each ingredient"],
    provenance: "Counts and source-family labels are read from the live knowledge-base database.",
  };
}
