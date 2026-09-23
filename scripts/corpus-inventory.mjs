import { readdir, readFile, writeFile } from "node:fs/promises";
import { createRepository } from "../lib/ingredient-repository.mjs";

/**
 * Reproducible inventory of the evidence corpus, so every count quoted in the
 * report can be regenerated: sources by family and state, peer-reviewed papers,
 * verified factual cards by family and status, and EWG reference coverage.
 *
 * It also lists journal sources whose title does not name any ingredient they
 * are linked to. That is often fine (reviews, vehicle studies) but each one
 * should be checked once by hand.
 *
 * Output: data/source-manifests/corpus-inventory.md
 */

const repo = createRepository({});
const sources = repo.listSources();
const ingredients = repo.listIngredients();
const count = (items, key) => items.reduce((acc, item) => acc.set(key(item), (acc.get(key(item)) || 0) + 1), new Map());

const byFamilyState = count(sources, (s) => `${s.source_family} · ${s.approval_state}`);
const journals = sources.filter((s) => s.source_family === "medical_journal");
const journalsWithIds = journals.filter((s) => /doi:|PMID|PMCID/i.test(s.doi_or_pmid || ""));
const years = journals.map((s) => s.published_year).filter(Number.isFinite).sort((a, b) => a - b);

const cardDir = new URL("../data/evidence/cir-ewg/", import.meta.url);
const cards = [];
for (const file of (await readdir(cardDir)).filter((f) => f.includes("verified") && f.endsWith(".jsonl")).sort()) {
  for (const line of (await readFile(new URL(file, cardDir), "utf8")).split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    cards.push({ file, ...JSON.parse(line) });
  }
}
const cardsByFamily = count(cards, (c) => `${c.source_family} · ${c.verification_status}`);
const safetyCards = cards.filter((c) => c.source_family !== "EWG");
const ewg = JSON.parse(await readFile(new URL("../data/ingredients/ewg-hazard-reference.v1.json", import.meta.url), "utf8"));

const GENERIC = new Set(["acid", "extract", "root", "oil", "alpha", "beta", "legacy", "inci", "sodium", "fruit", "kernel", "flour", "oat"]);
const nameTokens = (ingredient) => [ingredient.display_name, ...(ingredient.aliases || []), ...(ingredient.inci_names || [])]
  .flatMap((value) => String(value || "").toLowerCase().replace(/\(.*?\)/g, " ").split(/[^a-z0-9]+/))
  .filter((token) => token.length > 3 && !GENERIC.has(token))
  .map((token) => token.replace(/s$/, ""));
const unmatched = journals.map((source) => {
  const linked = ingredients.filter((ingredient) => (ingredient.source_ids || []).includes(source.source_id));
  const title = String(source.title || "").toLowerCase();
  const match = linked.some((ingredient) => nameTokens(ingredient).some((token) => title.includes(token)));
  return { source, linked, match };
}).filter((item) => item.linked.length && !item.match);

const rows = (map) => [...map].sort().map(([k, v]) => `| ${k} | ${v} |`).join("\n");
const md = [
  "# Evidence corpus inventory",
  "",
  `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run report:corpus-inventory\` from the knowledge-base database and the verified card files.`,
  "",
  "## Sources in the knowledge base",
  "",
  "| Family · state | Count |",
  "| --- | ---: |",
  rows(byFamilyState),
  "",
  `**Peer-reviewed journal papers: ${journals.length}** (${journalsWithIds.length} with a DOI, PMID or PMCID; publication years ${years[0]}–${years.at(-1)}).`,
  "The FYP1 proposal defence planned 27 peer-reviewed papers; the corpus now holds more than that, so the report should quote the current count above rather than 27.",
  "",
  "## Verified factual-context cards",
  "",
  "| Family · verification status | Cards |",
  "| --- | ---: |",
  rows(cardsByFamily),
  "",
  `Safety-conclusion cards (all families except EWG): ${safetyCards.length}, covering ${new Set(safetyCards.flatMap((c) => c.ingredient_ids)).size} ingredients.`,
  `EWG Skin Deep reference: ${ewg.entries.filter((e) => e.status === "listed").length} of ${ewg.entries.length} ingredients listed (checked ${ewg.checkedAt}); not listed: ${ewg.entries.filter((e) => e.status !== "listed").map((e) => e.ingredientId).join(", ")}.`,
  "",
  "## Journal sources to check by hand",
  "",
  "These titles do not name any ingredient the source is linked to. Many are legitimate (reviews, vehicle or formulation studies), but each link should be confirmed once.",
  "",
  "| Source id | Title | Linked ingredients |",
  "| --- | --- | --- |",
  ...unmatched.map(({ source, linked }) => `| ${source.source_id} | ${String(source.title || "").replaceAll("|", "/")} | ${linked.map((i) => i.display_name).join(", ")} |`),
  "",
];
await writeFile(new URL("../data/source-manifests/corpus-inventory.md", import.meta.url), `${md.join("\n")}\n`);
console.log(JSON.stringify({ sources: sources.length, journals: journals.length, cards: cards.length, safetyCards: safetyCards.length, toCheck: unmatched.length, output: "data/source-manifests/corpus-inventory.md" }, null, 2));
