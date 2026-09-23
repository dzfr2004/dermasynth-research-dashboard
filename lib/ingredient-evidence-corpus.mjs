import { readFileSync } from "node:fs";
import { CONCERN_CATALOG, ROUTINE_CATEGORY_CATALOG } from "./safety.mjs";
import { getIngredientEvidenceNote } from "./ingredient-evidence-notes.mjs";

/**
 * One retrieval document per governed ingredient. The same text is used by the
 * local BM25 ranker and uploaded to the Pinecone evidence namespace, so the
 * lexical and dense halves of the hybrid retriever search identical content.
 *
 * Every field is project-authored or a paraphrased verified card; no source
 * text is copied. EWG reference cards are deliberately left out of the text:
 * they describe a hazard rating, not what the ingredient is for.
 */

export const EVIDENCE_CORPUS_VERSION = "ingredient-evidence-corpus-v2";

let functionalClasses = null;
export function functionalClass(id) {
  if (!functionalClasses) {
    functionalClasses = JSON.parse(readFileSync(new URL("../data/ingredients/functional-classes.v1.json", import.meta.url), "utf8")).classes || {};
  }
  return functionalClasses[id] || "";
}

const CONCERN_LABELS = new Map(CONCERN_CATALOG.map((item) => [item.id, item.label]));

function list(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [];
}

export function evidenceDocumentFor(ingredient, sourceById = new Map()) {
  const id = String(ingredient.ingredient_id || ingredient.id || "").toLowerCase();
  const name = ingredient.display_name || ingredient.displayName || id;
  const categories = list(ingredient.categories);
  const categoryText = categories.map((categoryId) => {
    const definition = ROUTINE_CATEGORY_CATALOG[categoryId];
    return definition ? `${definition.title}. ${definition.category}. ${definition.note}` : categoryId;
  });
  const concerns = list(ingredient.concern_contexts || ingredient.concernContexts).map((concern) => CONCERN_LABELS.get(concern) || concern);
  const note = getIngredientEvidenceNote(id);
  const sourceTitles = list(ingredient.source_ids || ingredient.sourceIds)
    .map((sourceId) => sourceById.get(sourceId)?.title)
    .filter(Boolean);
  const fnClass = functionalClass(id);
  const sections = [
    `${name}.`,
    list(ingredient.inci_names || ingredient.inciNames).length ? `INCI: ${list(ingredient.inci_names || ingredient.inciNames).join(", ")}.` : "",
    list(ingredient.aliases).length ? `Also known as ${list(ingredient.aliases).join(", ")}.` : "",
    fnClass ? `Functional class: ${fnClass}.` : "",
    categoryText.length ? `Routine categories: ${categoryText.join(" ")}` : "",
    concerns.length ? `Research contexts: ${concerns.join(", ")}.` : "",
    note?.text ? `Safety evidence (${note.sourceFamily}): ${note.text}` : "",
    sourceTitles.length ? `Linked literature: ${sourceTitles.join("; ")}.` : "",
  ].filter(Boolean);
  return {
    id,
    text: sections.join(" "),
    title: `${name} — ingredient evidence document`,
    fields: {
      ingredientId: id,
      displayName: name,
      categories,
      functionalClass: fnClass,
      safetyDocumentId: note?.documentId || "",
      safetySourceFamily: note?.sourceFamily || "",
      linkedSourceIds: list(ingredient.source_ids || ingredient.sourceIds),
    },
  };
}

export function buildIngredientEvidenceCorpus({ ingredients = [], sources = [] } = {}) {
  const sourceById = new Map(sources.map((source) => [source.source_id || source.id, source]));
  return ingredients.map((ingredient) => evidenceDocumentFor(ingredient, sourceById));
}
