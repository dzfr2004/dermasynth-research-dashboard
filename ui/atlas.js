// The Ingredients page (Ingredient Atlas): search, filters, relationship explorer and loading the
// knowledge base.

import { concernOptions } from "./data.js";
import { atlasReferenceLine, safeEvidenceUrl, textList } from "./expert.js";
import { concernOption } from "./routine.js";
import { render, shell } from "./shell.js";
import { state } from "./state.js";
import { escapeHtml, icon } from "./util.js";

export function concernLabelFromId(value) {
  if (value === "all") return "All research contexts";
  return concernOption(value).label;
}

export function sourceFamilyLabel(value) {
  const labels = { CIR: "CIR provenance", EWG: "EWG external link", medical_journal: "Journal source" };
  return labels[value] || String(value || "Source").replaceAll("_", " ");
}

export function atlasSourceCard(source) {
  const url = safeEvidenceUrl(source?.sourceUrl);
  return `<article class="atlas-source"><div><span class="atlas-source-family">${escapeHtml(sourceFamilyLabel(source?.sourceFamily))}</span><strong>${escapeHtml(source?.title || "Source record")}</strong><small>${escapeHtml(source?.source || "")}${source?.sourceLocator ? ` · ${escapeHtml(source.sourceLocator)}` : ""}</small></div>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open source ${icon("arrow", 12)}</a>` : ""}</article>`;
}

export function relationshipSourceFamilies(ingredient) {
  const families = (ingredient?.sources || []).map((source) => String(source?.sourceFamily || "")).filter(Boolean);
  return [...new Set(families)];
}

export function relationshipIngredients() {
  const atlasIngredients = Array.isArray(state.knowledgeExplorer?.ingredients)
    ? state.knowledgeExplorer.ingredients
    : [];
  const focus = state.relationshipFocus || "all";
  return atlasIngredients.filter((ingredient) => {
    if (focus === "all") return true;
    if (focus.startsWith("family:")) return relationshipSourceFamilies(ingredient).includes(focus.slice(7));
    return (ingredient.concernContexts || []).includes(focus);
  });
}

export function compactGraphLabel(value, limit = 16) {
  const text = String(value || "Record");
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1))}…` : text;
}

export function relationshipFocusName(focus) {
  if (focus === "all") return "All source-mapped records";
  if (focus.startsWith("family:")) return sourceFamilyLabel(focus.slice(7));
  return concernLabelFromId(focus);
}

export function ingredientRelationshipExplorer() {
  const atlasIngredients = Array.isArray(state.knowledgeExplorer?.ingredients)
    ? state.knowledgeExplorer.ingredients
    : [];
  const filteredIngredients = relationshipIngredients();
  const graphIngredients = filteredIngredients.slice(0, 12);
  const focus = state.relationshipFocus || "all";
  const sourceFamilies = ["CIR", "EWG", "medical_journal"];
  const selectedIngredient =
    filteredIngredients.find((ingredient) => ingredient.id === state.relationshipSelectedId) ||
    filteredIngredients[0] ||
    null;
  const totalAtlasRecords = Number(state.knowledgeExplorer?.overview?.ingredientCount) || 50;
  const sourceX = 842;
  const contextX = 92;
  const graphRows = Math.max(1, Math.ceil(graphIngredients.length / 3));
  const graphHeight = Math.max(402, graphRows * 78 + 54);
  const contextY = (index) => 28 + index * 50;
  const sourceY = (index) => 104 + index * 112;
  const ingredientX = (index) => 260 + (index % 3) * 178;
  const ingredientY = (index) => 30 + Math.floor(index / 3) * 76;
  const contextIndex = new Map(concernOptions.map((item, index) => [item.id, index]));
  const familyIndex = new Map(sourceFamilies.map((item, index) => [item, index]));
  const activeContexts = new Set(selectedIngredient?.concernContexts || []);
  const activeFamilies = new Set(relationshipSourceFamilies(selectedIngredient));
  const graphEdges = graphIngredients
    .flatMap((ingredient, index) => {
      const cx = ingredientX(index) + 57;
      const cy = ingredientY(index) + 20;
      const highlighted = selectedIngredient?.id === ingredient.id ? " is-highlighted" : "";
      const contextEdges = (ingredient.concernContexts || [])
        .filter((id) => contextIndex.has(id))
        .map(
          (id) =>
            `<path class="relationship-edge is-context${highlighted}" d="M ${contextX + 54} ${contextY(contextIndex.get(id)) + 17} C 170 ${contextY(contextIndex.get(id)) + 17}, 203 ${cy}, ${cx} ${cy}" />`,
        );
      const sourceEdges = relationshipSourceFamilies(ingredient)
        .filter((family) => familyIndex.has(family))
        .map(
          (family) =>
            `<path class="relationship-edge is-source${highlighted}" d="M ${cx} ${cy} C 676 ${cy}, 717 ${sourceY(familyIndex.get(family)) + 17}, ${sourceX - 58} ${sourceY(familyIndex.get(family)) + 17}" />`,
        );
      return [...contextEdges, ...sourceEdges];
    })
    .join("");
  const graphIngredientNodes = graphIngredients
    .map((ingredient, index) => {
      const x = ingredientX(index);
      const y = ingredientY(index);
      const selected = selectedIngredient?.id === ingredient.id;
      return `<g class="relationship-node is-ingredient ${selected ? "is-selected" : ""}"><rect x="${x}" y="${y}" width="114" height="40" rx="11"></rect><text x="${x + 10}" y="${y + 17}">${escapeHtml(compactGraphLabel(ingredient.displayName, 17))}</text><text class="relationship-status-label" x="${x + 10}" y="${y + 31}">${escapeHtml(
        String(ingredient.researchUseStatus || ingredient.status || "mapped")
          .replaceAll("_", " ")
          .slice(0, 18),
      )}</text></g>`;
    })
    .join("");
  const graphContexts = concernOptions
    .map(
      (context, index) =>
        `<g class="relationship-node is-context ${focus === context.id || activeContexts.has(context.id) ? "is-selected" : ""}"><rect x="${contextX - 60}" y="${contextY(index)}" width="122" height="34" rx="9"></rect><text x="${contextX - 50}" y="${contextY(index) + 21}">${escapeHtml(compactGraphLabel(context.label, 18))}</text></g>`,
    )
    .join("");
  const graphSources = sourceFamilies
    .map(
      (family, index) =>
        `<g class="relationship-node is-source ${focus === `family:${family}` || activeFamilies.has(family) ? "is-selected" : ""}"><rect x="${sourceX - 58}" y="${sourceY(index)}" width="116" height="34" rx="9"></rect><text x="${sourceX - 48}" y="${sourceY(index) + 21}">${escapeHtml(compactGraphLabel(sourceFamilyLabel(family), 17))}</text></g>`,
    )
    .join("");
  const contextFilters = [
    `<button type="button" class="relationship-filter ${focus === "all" ? "is-selected" : ""}" data-action="relationship-filter" data-relationship-focus="all" aria-pressed="${focus === "all"}">All records</button>`,
    ...concernOptions.map(
      (context) =>
        `<button type="button" class="relationship-filter ${focus === context.id ? "is-selected" : ""}" data-action="relationship-filter" data-relationship-focus="${escapeHtml(context.id)}" aria-pressed="${focus === context.id}">${escapeHtml(context.label)}</button>`,
    ),
  ].join("");
  const familyFilters = sourceFamilies
    .map(
      (family) =>
        `<button type="button" class="relationship-filter is-source-filter ${focus === `family:${family}` ? "is-selected" : ""}" data-action="relationship-filter" data-relationship-focus="family:${escapeHtml(family)}" aria-pressed="${focus === `family:${family}`}">${escapeHtml(sourceFamilyLabel(family))}</button>`,
    )
    .join("");
  const recordButtons = graphIngredients
    .map(
      (ingredient) =>
        `<button type="button" class="relationship-record ${selectedIngredient?.id === ingredient.id ? "is-selected" : ""}" data-action="relationship-select" data-relationship-id="${escapeHtml(ingredient.id)}" aria-pressed="${selectedIngredient?.id === ingredient.id}"><span class="relationship-record-mark">${icon("layers", 14)}</span><span><strong>${escapeHtml(ingredient.displayName)}</strong><small>${escapeHtml((ingredient.concernContexts || []).map(concernLabelFromId).slice(0, 2).join(" · ") || "Source-mapped record")}</small></span></button>`,
    )
    .join("");
  const selectedContexts = (selectedIngredient?.concernContexts || [])
    .map((context) => `<span>${escapeHtml(concernLabelFromId(context))}</span>`)
    .join("");
  const selectedFamilies = relationshipSourceFamilies(selectedIngredient)
    .map((family) => `<span>${escapeHtml(sourceFamilyLabel(family))}</span>`)
    .join("");
  const selectedSources = (selectedIngredient?.sources || [])
    .slice(0, 3)
    .map(
      (source) =>
        `<li><span>${escapeHtml(sourceFamilyLabel(source?.sourceFamily))}</span><strong>${escapeHtml(source?.title || source?.source || "Attributed source")}</strong></li>`,
    )
    .join("");
  const recordSummary = filteredIngredients.length
    ? `${graphIngredients.length} of ${filteredIngredients.length} filtered explorer record${filteredIngredients.length === 1 ? "" : "s"} shown`
    : "No explorer record matches this filter";

  return `<section class="panel relationship-explorer" aria-labelledby="relationship-explorer-title"><div class="panel-header"><div><h3 class="panel-title" id="relationship-explorer-title">${icon("activity", 17)} Ingredient Relationship Explorer</h3><p class="panel-note">Contexts, ingredients, and source families</p></div><span class="pill is-neutral">${escapeHtml(String(atlasIngredients.length))} records</span></div>${atlasIngredients.length ? `<div class="relationship-filter-groups"><div class="relationship-filter-group"><span>Research context</span><div role="group" aria-label="Filter relationship map by research context">${contextFilters}</div></div><div class="relationship-filter-group"><span>Source family</span><div role="group" aria-label="Filter relationship map by source family">${familyFilters}</div></div></div><div class="relationship-workspace"><section class="relationship-map-panel" aria-label="Relationship topology map"><div class="relationship-map-head"><div><span>Relationship topology</span><small>${escapeHtml(recordSummary)}</small></div><div class="relationship-legend"><span><i></i>Context</span><span><i class="is-source"></i>Source family</span><span><i class="is-record"></i>Ingredient</span></div></div><div class="relationship-canvas"><svg viewBox="0 0 920 ${graphHeight}" role="img" aria-label="Visual relationship topology for ${escapeHtml(relationshipFocusName(focus))}"><title>Ingredient provenance relationship topology</title><desc>Visual map of linked ingredient records.</desc><g class="relationship-edge-layer">${graphEdges}</g><g class="relationship-context-nodes">${graphContexts}</g><g class="relationship-ingredient-nodes">${graphIngredientNodes}</g><g class="relationship-source-nodes">${graphSources}</g></svg></div></section><aside class="relationship-inspector" aria-live="polite">${selectedIngredient ? `<span class="relationship-inspector-kicker">Selected ingredient</span><h4>${escapeHtml(selectedIngredient.displayName)}</h4><p>${escapeHtml((selectedIngredient.inciNames || []).join(" · ") || selectedIngredient.id)}</p><div class="relationship-inspector-tags"><div><span>Contexts</span><p>${selectedContexts || "—"}</p></div><div><span>Source families</span><p>${selectedFamilies || "—"}</p></div></div><ul class="relationship-source-list">${selectedSources || "<li><strong>No source summary recorded.</strong></li>"}</ul>` : `<div class="relationship-inspector-empty"><span>${icon("layers", 22)}</span><strong>No record in this view.</strong></div>`}</aside></div><div class="relationship-record-section"><div><span>Select an ingredient</span><small>${escapeHtml(recordSummary)}</small></div><div class="relationship-record-list" role="list">${recordButtons || `<div class="relationship-no-records">No records match this filter.</div>`}</div></div><div class="relationship-summary" role="status"><strong>${escapeHtml(relationshipFocusName(focus))}</strong><span>${escapeHtml(recordSummary)}</span><button type="button" class="text-button" data-action="relationship-filter" data-relationship-focus="all">Reset</button></div>` : `<div class="evidence-empty"><strong>No relationship records available.</strong></div>`}</section>`;
}

export function knowledgeExplorerView() {
  const atlas = state.knowledgeExplorer;
  const overview = atlas?.overview || {};
  const squash = (text) =>
    String(text || "")
      .toLowerCase()
      .replace(/[-‐‑–_/]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const query = squash(state.knowledgeQuery);
  const allIngredients = Array.isArray(atlas?.ingredients) ? atlas.ingredients : [];
  const filtered = allIngredients.filter((ingredient) => {
    if (!query) return true;
    return squash(
      [ingredient.displayName, ...(ingredient.inciNames || []), ...(ingredient.aliases || [])].join(" "),
    ).includes(query);
  });
  const results = Array.isArray(state.knowledgeSearchResult?.evidence) ? state.knowledgeSearchResult.evidence : [];
  const retrieval = state.knowledgeSearchResult;
  const sourceFamilies = Object.entries(overview.sourceFamilies || {});
  const liveResearchIndex = overview.liveResearchIndex || {
    enabled: false,
    namespace: overview.demoNamespace || "research index",
  };
  const statusText = state.knowledgeStatus === "loading" ? "Updating Atlas…" : state.knowledgeNotice;
  const consumer = !state.expertView;
  const ATLAS_PAGE = 12;
  const atlasLimited = !state.atlasShowAll && !query && filtered.length > ATLAS_PAGE;
  const cards = (atlasLimited ? filtered.slice(0, ATLAS_PAGE) : filtered)
    .map((ingredient) => {
      const contexts = (ingredient.concernContexts || [])
        .map((context) => `<span>${escapeHtml(concernLabelFromId(context))}</span>`)
        .join("");
      const inci = (ingredient.inciNames || []).join(" · ");
      const sources = Array.isArray(ingredient.sources) ? ingredient.sources : [];
      const primarySource = sources[0];
      const sourceCount = sources.length;
      const labelLine = inci && inci.toLowerCase() !== String(ingredient.displayName || "").toLowerCase() ? inci : "";
      if (consumer) {
        return `<article class="atlas-ingredient is-consumer"><h3>${escapeHtml(ingredient.displayName)}</h3>${labelLine ? `<p class="atlas-label-line">On labels: ${escapeHtml(labelLine)}</p>` : ""}${ingredient.plain?.whatItIs ? `<p class="atlas-what">${escapeHtml(ingredient.plain.whatItIs)}</p>` : ""}<div class="atlas-contexts">${contexts}</div>${ingredient.plain?.safety ? `<p class="atlas-safety">${icon("shield", 13)} ${escapeHtml(ingredient.plain.safety)}</p>` : ""}${ingredient.routineSelectionAllowed === false ? `<p class="atlas-safety is-warn">${icon("info", 13)} DermaSynth does not use it in routines.</p>` : ""}${sources.length ? `<details class="atlas-limitations"><summary>Studies and sources (${sources.length})</summary><div class="atlas-sources">${sources.map(atlasSourceCard).join("")}</div></details>` : ""}</article>`;
      }
      return `<article class="atlas-ingredient"><div class="atlas-ingredient-head"><div><h3>${escapeHtml(ingredient.displayName)}</h3>${labelLine ? `<p>${escapeHtml(labelLine)}</p>` : ""}</div><span class="atlas-state">${sourceCount} source${sourceCount === 1 ? "" : "s"}</span></div><div class="atlas-contexts">${contexts}</div>${atlasReferenceLine(ingredient)}${primarySource ? `<div class="atlas-primary-source">${atlasSourceCard(primarySource)}</div>` : ""}${sources.length > 1 ? `<details class="atlas-limitations"><summary>View ${sources.length - 1} more source${sources.length === 2 ? "" : "s"}</summary><div class="atlas-sources">${sources.slice(1).map(atlasSourceCard).join("")}</div></details>` : ""}</article>`;
    })
    .join("");
  const retrievalCards = results
    .slice(0, 8)
    .map((item) => {
      const sourceUrl = safeEvidenceUrl(item.sourceUrl);
      const names = textList(item.ingredientNames, { limit: 3 }).join(" · ");
      return `<article class="research-hit"><div><span class="atlas-state">${escapeHtml(retrieval?.mode || "research retrieval")}</span><strong>${escapeHtml(item.title || "Research record")}</strong><small>${escapeHtml(names || "Ingredient mapping")} · ${escapeHtml(item.source || "Source record")}</small></div>${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">Source ${icon("arrow", 12)}</a>` : ""}<p>${escapeHtml(item.excerpt || "No metadata excerpt returned.")}</p></article>`;
    })
    .join("");
  const ingredientCount = Number(overview.ingredientCount) || allIngredients.length;
  const sourceMappedCount = allIngredients.length;
  const showRetrieval = Boolean(state.knowledgeQuery.trim() && retrieval);
  const corpus = state.corpusSummary;
  const corpusCard = corpus
    ? `<section class="panel corpus-digest"><div><p class="ingredient-eyebrow">${icon("layers", 14)} ${escapeHtml(corpus.title || "Corpus summary")}</p><h3>${escapeHtml(corpus.digest || "Live database facts are loading.")}</h3></div><div class="corpus-digest-tags">${(corpus.highlights || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></section>`
    : "";
  return shell(
    `<div class="view-heading atlas-heading"><div><h2>${consumer ? "Ingredient guide" : "Ingredient Atlas"}</h2><p>${consumer ? "What each ingredient does, and the studies behind it." : "Search ingredients, filter by context, and open the linked sources."}</p></div>${consumer ? "" : `<button class="ghost-button" type="button" data-action="knowledge-refresh" ${state.knowledgeStatus === "loading" ? "disabled" : ""}>${icon("refresh", 15)} Refresh</button>`}</div>${consumer ? "" : `<section class="atlas-summary panel"><div class="atlas-summary-stat"><span>Ingredients</span><strong>${escapeHtml(String(ingredientCount || "—"))}</strong><small>incorporated records</small></div><div class="atlas-summary-stat"><span>Sources</span><strong>${escapeHtml(String(overview.sourceCount || "—"))}</strong><small>${sourceFamilies.map(([family, count]) => `${sourceFamilyLabel(family)} ${count}`).join(" · ") || "linked records"}</small></div><div class="atlas-summary-stat"><span>Index</span><strong>${liveResearchIndex.enabled ? "Live" : "Local"}</strong><small>${escapeHtml(liveResearchIndex.namespace || "metadata index")}</small></div></section>${corpusCard}`}<section class="panel atlas-controls"><div class="atlas-search"><label for="knowledge-query">Find an ingredient</label><div><input id="knowledge-query" value="${escapeHtml(state.knowledgeQuery)}" placeholder="${consumer ? "e.g. niacinamide" : "Search Atlas"}" data-action="knowledge-query" /><button type="button" class="primary-button" data-action="knowledge-search" ${state.knowledgeSearchStatus === "searching" ? "disabled" : ""}>${state.knowledgeSearchStatus === "searching" ? "Searching…" : "Search"}</button></div></div><div class="atlas-filter"><span>${consumer ? "Filter by skin concern" : "Filter by context"}</span><div>${["all", ...concernOptions.map((option) => option.id)].map((concern) => `<button type="button" data-action="knowledge-concern" data-concern="${escapeHtml(concern)}" class="filter-chip ${state.knowledgeConcern === concern ? "is-selected" : ""}" aria-pressed="${state.knowledgeConcern === concern}">${escapeHtml(consumer && concern === "all" ? "All" : concernLabelFromId(concern))}</button>`).join("")}</div></div>${statusText && (!consumer || state.knowledgeStatus === "loading" || state.knowledgeStatus === "error") ? `<p class="atlas-notice" role="status">${escapeHtml(statusText)}</p>` : ""}</section>${showRetrieval ? `<section class="panel atlas-retrieval"><div class="panel-header"><div><h3 class="panel-title">Search results</h3><p class="panel-note">${escapeHtml(String(retrieval.coverage?.uniqueIngredients ?? 0))} matches</p></div></div><div class="research-hit-grid">${retrievalCards || `<div class="evidence-empty"><strong>No source match found.</strong></div>`}</div></section>` : ""}${consumer ? "" : `<details class="atlas-explorer-details"><summary>${icon("activity", 16)} Explore ingredient relationships</summary>${ingredientRelationshipExplorer()}</details>`}<section class="atlas-grid" aria-live="polite">${cards || `<div class="panel evidence-empty"><strong>No ingredients match this view.</strong></div>`}</section>${atlasLimited ? `<div class="atlas-more"><button type="button" class="ghost-button" data-action="atlas-show-all">Show all ${filtered.length} ingredients</button></div>` : ""}`,
  );
}

export function selectedKnowledgeConcern() {
  return state.knowledgeConcern === "all" ? "" : state.knowledgeConcern;
}

export async function loadKnowledgeExplorer({ force = false } = {}) {
  if (state.knowledgeStatus === "loading" && !force) return;
  state.knowledgeStatus = "loading";
  state.knowledgeNotice = "Loading versioned source metadata…";
  if (state.activeView === "knowledge") render();
  try {
    const concern = selectedKnowledgeConcern();
    const response = await fetch(`/api/knowledge-explorer${concern ? `?concern=${encodeURIComponent(concern)}` : ""}`);
    if (!response.ok) throw new Error("Knowledge atlas is unavailable");
    const payload = await response.json();
    state.knowledgeExplorer = payload;
    state.knowledgeStatus = "ready";
    const liveIndex = payload.overview?.liveResearchIndex;
    state.knowledgeNotice = `${payload.overview?.ingredientCount || 0} ingredients · ${payload.overview?.sourceCount || 0} linked sources · ${liveIndex?.enabled ? `live index: ${liveIndex.namespace}` : "local index"}`;
  } catch {
    state.knowledgeStatus = "error";
    state.knowledgeNotice = "The source registry could not be loaded. Retry when the local server is available.";
  }
  if (state.activeView === "knowledge") render();
}

export async function loadCorpusSummary() {
  try {
    const response = await fetch("/api/corpus-summary");
    if (!response.ok) return;
    state.corpusSummary = await response.json();
    if (state.activeView === "knowledge") render();
  } catch {
    // The Atlas stays usable if this compact optional summary is unavailable.
  }
}

export async function loadResearchSearch({ background = false } = {}) {
  if (state.knowledgeSearchStatus === "searching") return;
  state.knowledgeSearchStatus = "searching";
  if (!background && state.activeView === "knowledge") render();
  try {
    const params = new URLSearchParams();
    const concern = selectedKnowledgeConcern();
    if (concern) params.set("concern", concern);
    if (state.knowledgeQuery.trim()) params.set("q", state.knowledgeQuery.trim());
    const response = await fetch(`/api/research-search?${params}`);
    if (!response.ok) throw new Error("Research search unavailable");
    state.knowledgeSearchResult = await response.json();
    state.knowledgeSearchStatus = "ready";
  } catch {
    state.knowledgeSearchStatus = "error";
    state.knowledgeSearchResult = null;
    state.knowledgeNotice = "Research search is unavailable right now; the local atlas remains browseable.";
  }
  if (state.activeView === "knowledge") render();
}
