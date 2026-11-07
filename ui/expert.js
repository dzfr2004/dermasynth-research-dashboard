// Expert view: research panels, scores and traces, the run report, run history, exports and the
// defence walkthrough.

import { INCORPORATED_INGREDIENTS, pipeline, presentationSteps } from "./data.js";
import {
  activeEnvironment,
  environmentCards,
  environmentModeLabel,
  environmentSourceLabel,
  environmentValue,
  locationLabel,
} from "./environment.js";
import { locationPayload } from "./location.js";
import {
  concernSummary,
  cueSummary,
  gptTag,
  isQuotaFallback,
  normaliseRoutine,
  routineStatusLabel,
  routineStepList,
} from "./routine.js";
import { navigateView, render, shell, showToast } from "./shell.js";
import { RUN_HISTORY_STORAGE_KEY, state } from "./state.js";
import { escapeHtml, icon, safelyNumber } from "./util.js";

export function ingredientAttributionMarkup(attr) {
  if (!attr || !Array.isArray(attr.features)) return "";
  const rows = attr.features
    .map((f) => {
      const value = Number(f.shapValue) || 0;
      return `<span class="ingredient-attr-row"><i>${escapeHtml(f.label)}</i><b class="ingredient-attr-bar"><b style="width:${Math.max(0, Math.min(100, Number(f.influencePercent) || 0))}%"></b></b><em>${value >= 0 ? "+" : "−"}${escapeHtml(Math.abs(value).toFixed(3))}</em></span>`;
    })
    .join("");
  const contrast = attr.contrast
    ? `<span class="ingredient-attr-contrast">vs ${escapeHtml(attr.contrast.runnerUp?.displayName || "runner-up")}: margin ${escapeHtml(Number(attr.contrast.margin || 0).toFixed(3))}${attr.contrast.decisive ? ` · decided by ${escapeHtml(attr.contrast.decisive.label)}` : ""}</span>`
    : `<span class="ingredient-attr-contrast">Only candidate in the retrieved pool</span>`;
  return `<div class="ingredient-attr"><span class="ingredient-attr-head">${icon("activity", 11)} Why chosen · rank ${escapeHtml(String(attr.poolRank || "—"))} of ${escapeHtml(String(attr.poolSize || "—"))} · score ${escapeHtml(Number(attr.selectionScore || 0).toFixed(3))}</span>${rows}${contrast}</div>`;
}

export function atlasReferenceLine(ingredient) {
  const parts = [];
  const safety = ingredient?.safetyEvidence;
  if (safety) {
    const kind = /no_dedicated/.test(safety.verificationStatus || "")
      ? "no dedicated assessment"
      : `${safety.sourceFamily} conclusion`;
    parts.push(`Safety card: ${kind}${safety.verifiedAt ? ` (checked ${safety.verifiedAt})` : ""}`);
  }
  const ewg = ingredient?.ewgReference;
  if (ewg)
    parts.push(
      ewg.status === "listed" ? `EWG ${ewg.hazardScore}/10 · ${ewg.dataAvailability} data` : "EWG: not listed",
    );
  if (ingredient?.routineSelectionAllowed === false) parts.push("Not selectable in routines");
  return parts.length ? `<p class="atlas-reference-line">${escapeHtml(parts.join(" · "))}</p>` : "";
}

export function approvedIngredientCandidatePanel(meta = state.routineMeta) {
  const selection = meta?.ingredientCandidates;
  const entries = Array.isArray(selection?.entries) ? selection.entries : [];
  const removed = Array.isArray(selection?.removedBySafety) ? selection.removedBySafety : [];
  if ((selection?.status !== "available" || !entries.length) && !removed.length) return "";
  const contextStatus = state.routineContext?.status;
  const gptStatusMarkup =
    contextStatus === "error" || contextStatus === "unavailable"
      ? `<p class="ingredient-gpt-status">${icon("info", 13)} GPT explanations are not shown: ${escapeHtml(state.routineContext.error || "unavailable")} The score-based explanation is shown instead.</p>`
      : contextStatus === "available" && state.routineContext.withheld?.some((item) => item.kind === "ingredient")
        ? `<p class="ingredient-gpt-status">${icon("info", 13)} Some GPT explanations were withheld because their CUE stayed below ${escapeHtml(String(state.routineMeta?.grounding?.cue?.threshold ?? 0.8))}; the score-based explanation is shown for those.</p>`
        : "";
  const removedMarkup = removed.length
    ? `<p class="ingredient-removed-note">${icon("shield", 13)} Final safety rescan removed ${escapeHtml(removed.map((item) => item.displayName).join(", "))}; ${removed.length === 1 ? "its step stays" : "their steps stay"} as a category.</p>`
    : "";
  const cards = entries
    .map((entry) => {
      const source = Array.isArray(entry.sourceRecords) ? entry.sourceRecords[0] : null;
      const url = safeEvidenceUrl(source?.sourceUrl);
      const trace = entry.selectionTrace || {};
      const attr = entry.attribution || {};
      const checked =
        Array.isArray(trace.compatibility?.checkedAgainst) && trace.compatibility.checkedAgainst.length
          ? trace.compatibility.checkedAgainst.map((item) => item.displayName).join(", ")
          : "No earlier named recommendation";
      const gpt = state.routineContext?.ingredients?.[`${entry.phase}:${entry.categoryId}`] || null;
      const explanation = entry.explanation || {};
      const whyStep = gpt?.whyThisStep || explanation.whyThisStep || "";
      const rationaleText =
        gpt?.whyThisIngredient ||
        explanation.whyThisIngredient ||
        entry.rationale ||
        "Matched from the approved knowledge base.";
      const expertBoth =
        state.expertView && gpt && explanation.whyThisIngredient
          ? `<div class="ingredient-rule-version"><b>Rule-based version (always computed):</b> ${escapeHtml(explanation.whyThisStep || "")} ${escapeHtml(explanation.whyThisIngredient)}${gpt.cue && Number.isFinite(Number(gpt.cue.score)) ? `<small>GPT version CUE ${Number(gpt.cue.score).toFixed(2)} (threshold ${escapeHtml(String(state.routineMeta?.grounding?.cue?.threshold ?? 0.8))})${gpt.cue.attempt === 2 ? ", passed after one rewrite" : ""}</small>` : ""}</div>`
          : "";
      const llm = gpt ? { text: gpt.whyThisIngredient } : null;
      const rationaleTag = gpt
        ? gptTag(gpt)
        : state.routineContext?.status === "loading"
          ? '<span class="ingredient-rationale-tag is-loading">GPT is writing the explanation…</span>'
          : "";
      const pickChip =
        entry.selectedBy === "llm_from_rag_pool"
          ? `<span class="ingredient-pick-chip">${icon("sparkles", 10)} LLM · from retrieved pool${attr.agreesWithSurrogate === false ? " · differs from top score" : ""}</span>`
          : '<span class="ingredient-pick-chip is-rule">top-scored</span>';
      const ranking = Array.isArray(attr.ranking)
        ? attr.ranking.map((item) => `${item.rank}. ${item.displayName} (${Number(item.score).toFixed(3)})`).join(" · ")
        : "—";
      const retrieval = trace.retrieval
        ? `${trace.retrieval.mode || "retrieval"} · pool ${trace.poolSource || "—"}`
        : trace.poolSource || "not reported";
      return `<article><div><strong>${escapeHtml(entry.displayName || "Approved ingredient")}</strong><small>${escapeHtml(`${entry.phase === "am" ? "Morning" : "Evening"} · ${entry.categoryTitle || entry.categoryId || "routine category"}`)} ${pickChip}</small></div>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Evidence ${icon("arrow", 12)}</a>` : ""}${whyStep ? `<p class="ingredient-why-step"><b>Why this step:</b> ${escapeHtml(whyStep)}</p>` : ""}<p class="ingredient-rationale ${llm && llm.text ? "is-grounded" : ""}"><b>Why this ingredient:</b> ${escapeHtml(rationaleText)}</p>${rationaleTag}${expertBoth}${ingredientAttributionMarkup(attr)}<details class="selection-trace"><summary>Selection trace</summary><span>Category: ${escapeHtml(trace.category?.title || entry.categoryId || "—")}</span><span>Retrieval: ${escapeHtml(retrieval)}</span><span>Pool ranking: ${escapeHtml(ranking)}</span><span>Language model: ${escapeHtml(String(trace.llmPickStatus || "not requested").replaceAll("_", " "))}</span><span>Record: ${escapeHtml(trace.selectedRecord?.ingredientId || entry.ingredientId || "—")} · v${escapeHtml(String(trace.selectedRecord?.version || "—"))}</span><span>Compatibility: ${escapeHtml(trace.compatibility?.status || "not reported")} · checked against ${escapeHtml(checked)}</span>${explanation.whyThisIngredient ? `<span>Score explanation: ${escapeHtml(explanation.whyThisIngredient)}</span>` : ""}</details></article>`;
    })
    .join("");
  return `<section class="research-context-card ingredient-candidate-panel"><div class="ingredient-card-top"><div><p class="ingredient-eyebrow">${icon("shield", 14)} Approved ingredient recommendations</p><h3>Named AM/PM recommendations</h3></div><span class="ingredient-output-mode">${escapeHtml(selection.registryVersion || "live database")}</span></div><p class="ingredient-card-summary">Each step's candidates are retrieved from the approved knowledge base, ranked by a transparent score, and rescanned by the final safety pass.</p>${gptStatusMarkup}${removedMarkup}<div class="research-context-list">${cards}</div></section>`;
}

export function presentationGuide() {
  if (!state.presentation.active) return "";
  const step = presentationSteps[state.presentation.step] || presentationSteps[0];
  const isFirst = state.presentation.step === 0;
  const isLast = state.presentation.step === presentationSteps.length - 1;
  const runRequired = Boolean(step.requiresRun && !state.routineMeta);
  const primaryAction = runRequired ? "presentation-run" : "presentation-next";
  const primaryLabel = runRequired
    ? state.runStatus === "running"
      ? "Preview is running…"
      : "Run gated preview"
    : isLast
      ? "Finish walkthrough"
      : "Next section";
  return `<aside class="presentation-guide" id="presentation-guide" tabindex="-1" aria-label="Guided presentation mode">
    <div class="presentation-guide-top">
      <div><span class="presentation-kicker">${escapeHtml(step.eyebrow)}</span><strong>${escapeHtml(step.title)}</strong></div>
      <button type="button" class="presentation-close" data-action="presentation-close" aria-label="Exit guided presentation">×</button>
    </div>
    <p>${escapeHtml(step.detail)}</p>
    ${runRequired ? `<p class="presentation-gate">${icon("info", 14)} <span>Run the preview to show an actual gate trace, or skip this proof point for rehearsal.</span></p>` : ""}
    <div class="presentation-progress" aria-label="Presentation progress">${presentationSteps.map((item, index) => `<span class="${index === state.presentation.step ? "is-current" : index < state.presentation.step ? "is-complete" : ""}" title="${escapeHtml(item.title)}"></span>`).join("")}</div>
    <div class="presentation-actions">
      <button type="button" class="ghost-button" data-action="presentation-back" ${isFirst ? "disabled" : ""}>Back</button>
      <div class="presentation-primary-actions">${runRequired ? `<button type="button" class="text-button presentation-skip" data-action="presentation-skip">Skip proof</button>` : ""}<button type="button" class="primary-button" data-action="${primaryAction}" ${state.runStatus === "running" ? "disabled" : ""}>${primaryLabel} ${runRequired ? icon("sparkles", 14) : isLast ? icon("check", 14) : icon("arrow", 14)}</button></div>
    </div>
  </aside>`;
}

export function focusPresentationGuide() {
  window.requestAnimationFrame(() => document.querySelector("#presentation-guide")?.focus());
}

export function setPresentationStep(step) {
  const next = Math.max(0, Math.min(presentationSteps.length - 1, Number(step) || 0));
  state.presentation = { active: true, step: next };
  const presentationStep = presentationSteps[next];
  if (presentationStep.view === "knowledge") {
    state.knowledgeConcern = state.concern;
    state.relationshipFocus = state.concern;
    state.relationshipSelectedId = "";
    state.knowledgeSearchResult = null;
  }
  navigateView(presentationStep.view, { source: "presentation", history: "replace", focus: false, scroll: true });
  window.requestAnimationFrame(() => {
    document
      .getElementById(presentationStep.anchor || "main-content")
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
    focusPresentationGuide();
  });
}

export function startPresentation() {
  setPresentationStep(0);
  showToast("Defence walkthrough started. Follow the labelled research journey.");
}

export function endPresentation({ completed = false } = {}) {
  state.presentation = { active: false, step: 0 };
  render();
  window.requestAnimationFrame(() => document.querySelector("[data-action='presentation-start']")?.focus());
  showToast(completed ? "Guided presentation complete." : "Guided presentation closed.");
}

export function advancePresentation({ skipProof = false } = {}) {
  const current = presentationSteps[state.presentation.step] || presentationSteps[0];
  if (current.requiresRun && !state.routineMeta && !skipProof) {
    showToast("Run the gated preview to continue, or choose Skip proof for a rehearsal-only walkthrough.");
    return;
  }
  if (state.presentation.step >= presentationSteps.length - 1) endPresentation({ completed: true });
  else setPresentationStep(state.presentation.step + 1);
}

export function metricStrip() {
  const meta = state.routineMeta;
  const grounding = meta?.grounding;
  const metrics = [
    [
      "Evidence gate",
      grounding ? (grounding.passed ? "Passed" : "Not passed") : "—",
      grounding
        ? `Sufficiency ${safelyNumber(grounding.sufficiencyScore)} · ${grounding.criteria?.length || 0} criteria`
        : "Not run",
    ],
    ["CUE", grounding ? cueSummary(grounding).value : "—", grounding ? cueSummary(grounding).foot : "Not run"],
    [
      "Safety",
      routineStatusLabel(),
      meta?.safety?.postSelection?.removed?.length
        ? `${meta.safety.postSelection.removed.length} removed by final rescan`
        : "Deterministic passes + final rescan",
    ],
    ["Environment", activeEnvironment().mode || "demo", environmentSourceLabel()],
    ["Retrieval", meta?.grounding?.evidenceCount ?? "—", meta?.grounding?.scoreType || "Awaiting index"],
  ];
  return `<section class="panel metric-strip" aria-label="Model quality overview">${metrics.map(([label, value, foot]) => `<div class="metric"><span class="metric-label">${escapeHtml(label)}</span><strong class="metric-value">${escapeHtml(value)}</strong><span class="metric-foot">${escapeHtml(foot)}</span></div>`).join("")}</section>`;
}

export function dashboardHero() {
  const overview = state.knowledgeExplorer?.overview || {};
  const environment = activeEnvironment();
  const readings = environment.readings || {};
  const ingredientCount = Number(overview.ingredientCount) || 50;
  const sourceCount = Number(overview.sourceCount) || 52;
  const cardCount = Number(overview.demoEvidenceCards) || 31;
  return `<section class="dashboard-hero" aria-labelledby="dashboard-hero-title">
    <div class="dashboard-hero-copy">
      <p class="hero-kicker">${icon("sparkles", 15)} Final-review research system</p>
      <h2 id="dashboard-hero-title">Environment-aware insight,<span>made visibly explainable.</span></h2>
      <p class="hero-description">DermaSynth connects live environmental context, source-linked ingredient research, safety traces, and transparent reasoning in one final-review experience.</p>
      <div class="hero-actions">
        <button class="primary-button" type="button" data-action="navigate" data-view="simulator">${icon("sparkles", 15)} Start a preview</button>
        <button class="ghost-button" type="button" data-action="presentation-start">Begin defence walkthrough</button>
        <button class="hero-secondary-action" type="button" data-action="navigate" data-view="knowledge">Browse Ingredient Atlas ${icon("arrow", 15)}</button>
      </div>
      <div class="hero-proof-row" aria-label="System coverage">
        <span><strong>${escapeHtml(String(ingredientCount))}</strong> ingredients</span>
        <span><strong>${escapeHtml(String(sourceCount))}</strong> source records</span>
        <span><strong>${escapeHtml(String(cardCount))}</strong> Pinecone cards</span>
      </div>
    </div>
    <div class="hero-visual">
      <div class="hero-mark-orbit"><img src="/assets/dermasynth-mark.svg" alt="" /></div>
      <div class="hero-context-card">
        <span>Active environment</span>
        <strong>${escapeHtml(locationLabel())}</strong>
        <div class="hero-context-readings"><span>UV <b>${escapeHtml(environmentValue(readings.uvi))}</b></span><span>Humidity <b>${escapeHtml(environmentValue(readings.humidity))}%</b></span><span>PM2.5 <b>${escapeHtml(environmentValue(readings.pm25))}</b></span></div>
        <small>${escapeHtml(environmentModeLabel())} · ${escapeHtml(environmentSourceLabel())}</small>
      </div>
    </div>
  </section>`;
}

export function pipelinePanel() {
  const selected = pipeline.find((step) => step.id === state.selectedStage);
  return `<section class="panel pipeline">
    <div class="panel-header"><h2 class="panel-title">${icon("activity", 17)} Synthesis Pipeline</h2><p class="panel-note">Six gates before a routine is shown</p></div>
    <ol class="pipeline-list">${pipeline.map((step) => `<li><button type="button" class="pipeline-step ${selected?.id === step.id ? "is-selected" : ""}" data-action="stage" data-stage="${step.id}" aria-pressed="${selected?.id === step.id}"><span class="step-number">${step.number}</span><span class="step-name">${step.name}</span><span class="step-meta">${step.meta}</span><span class="step-check">${icon("check", 10, 2.4)}</span></button></li>`).join("")}</ol>
    ${selected ? `<p class="pipeline-detail">${icon("info", 16)} <span><strong>${selected.name}:</strong> ${selected.detail}</span></p>` : ""}
  </section>`;
}

export function incorporatedIngredientRecords() {
  return INCORPORATED_INGREDIENTS;
}

export function ingredientSystemPanel() {
  const ingredients = incorporatedIngredientRecords();
  return `<section class="ingredient-system-panel" aria-labelledby="ingredient-system-title">
    <div class="ingredient-system-copy">
      <p class="hero-kicker">${icon("layers", 15)} Incorporated ingredient system</p>
      <h2 id="ingredient-system-title">${escapeHtml(String(ingredients.length))} ingredients, one inspectable research layer.</h2>
      <p>Every incorporated record is listed here. The Atlas distinguishes the source-mapped explorer subset from staged, review-pending research metadata for final-review inspection.</p>
      <button class="hero-secondary-action" type="button" data-action="navigate" data-view="knowledge">Open full Ingredient Atlas ${icon("arrow", 15)}</button>
    </div>
    <div class="ingredient-system-roster">
      <div class="ingredient-system-roster-head"><span>Incorporated records</span><strong>${ingredients.length} listed</strong></div>
      <div class="ingredient-system-grid" tabindex="0" role="region" aria-label="Ingredients in the knowledge base (scrollable list)">${ingredients.map((ingredient) => `<article class="ingredient-system-chip"><strong>${escapeHtml(ingredient.name)}</strong><small>${escapeHtml(ingredient.inci)}</small></article>`).join("")}</div>
    </div>
  </section>`;
}

export function environmentPanel() {
  return `<section class="panel environment-panel">
    <div class="panel-header"><h2 class="panel-title">${icon("sun", 17)} Environment</h2><p class="panel-note">${escapeHtml(locationLabel())} · ${escapeHtml(state.lastUpdated)}</p></div>
    <div class="environment-grid">${environmentCards()
      .map(
        (item) =>
          `<article class="env-card"><div class="env-card-top">${icon(item.icon, 17)}<span class="severity ${item.severity}">${item.severityLabel}</span></div><div class="env-card-value"><strong>${escapeHtml(item.value)}</strong><span>${item.unit}</span></div><p class="env-card-label">${item.label}</p></article>`,
      )
      .join("")}</div>
  </section>`;
}

export function routinePanel() {
  if (!state.routineMeta && state.runStatus !== "running") {
    return `<section class="panel routine-panel routine-panel-empty"><div class="panel-header"><h2 class="panel-title">${icon("sparkles", 17)} Preview ready</h2><p class="panel-note">No gated run yet</p></div><div class="routine-empty-state"><span>${icon("flask", 22)}</span><div><strong>Set your research inputs, then run the preview.</strong><p>The dashboard deliberately withholds routine categories until the selected profile, concern, location context, evidence gate, and deterministic checks have been requested.</p></div></div><button class="ghost-button" type="button" data-action="navigate" data-view="simulator">Open Routine Preview ${icon("arrow", 14)}</button></section>`;
  }
  const routine = normaliseRoutine();
  const cleared = state.routineMeta?.status === "cleared";
  const quotaFallback = isQuotaFallback();
  const statusLine = cleared
    ? "Two deterministic safety passes cleared the current result."
    : quotaFallback
      ? "Live AI synthesis is unavailable because the API account has no available quota. Showing a generic research preview; no personalised routine was generated."
      : "Generic research preview only — a live result has not cleared all gates.";
  return `<section class="panel routine-panel">
    <div class="panel-header"><h2 class="panel-title">${icon("sparkles", 17)} Category preview</h2><p class="panel-note">${escapeHtml(routineStatusLabel())}</p></div>
    <div class="routine-layout">
      <div class="routine-slot"><p class="routine-label">${icon("sun", 13)} Morning</p>${routineStepList(routine.am)}</div>
      <div class="routine-slot"><p class="routine-label">${icon("sparkles", 13)} Evening</p>${routineStepList(routine.pm)}</div>
    </div>
    ${approvedIngredientCandidatePanel()}
    <p class="screening-pass ${cleared ? "" : "is-warning"}">${icon("shield", 15)} ${escapeHtml(statusLine)}</p>
  </section>`;
}

export function safeEvidenceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

export function textList(value, { limit = 8 } = {}) {
  const values = (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]).flat(Infinity);
  const entries = values
    .map((entry) => {
      if (typeof entry === "string" || typeof entry === "number") return String(entry).trim();
      if (!entry || typeof entry !== "object") return "";
      return String(entry.displayName || entry.name || entry.title || entry.label || entry.text || "").trim();
    })
    .filter(Boolean);
  return [...new Set(entries)].slice(0, limit);
}

export function researchContextPanel(meta = state.routineMeta) {
  const research = meta?.researchEvidence;
  const evidence = Array.isArray(research?.evidence) ? research.evidence.slice(0, 6) : [];
  const coverage = research?.coverage || {};
  if (!research) {
    const atlasCount = Number(state.knowledgeExplorer?.overview?.ingredientCount) || 50;
    return `<section class="research-context-card is-empty"><div><p class="ingredient-eyebrow">${icon("layers", 14)} Research corpus</p><h3>Ingredient source retrieval awaits a run</h3></div><p>Run the simulator to retrieve the selected concern from the ${escapeHtml(String(atlasCount))}-ingredient final-review Atlas. It combines the existing isolated demo segment with local, review-pending metadata; neither is a treatment selector.</p></section>`;
  }
  return `<section class="research-context-card"><div class="ingredient-card-top"><div><p class="ingredient-eyebrow">${icon("layers", 14)} Research context</p><h3>${escapeHtml(String(coverage.uniqueIngredients || 0))} mapped ingredient record${Number(coverage.uniqueIngredients) === 1 ? "" : "s"}</h3></div><span class="ingredient-output-mode">${escapeHtml(research.mode || "research retrieval")}</span></div><p class="ingredient-card-summary">${escapeHtml(coverage.rationale || "Source-linked context for this preview.")}</p><div class="research-context-list">${
    evidence
      .map((item) => {
        const url = safeEvidenceUrl(item.sourceUrl);
        return `<article><div><strong>${escapeHtml((item.ingredientNames || []).join(" · ") || item.title || "Ingredient record")}</strong><small>${escapeHtml(item.source || "Source metadata")}</small></div>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Source ${icon("arrow", 12)}</a>` : ""}</article>`;
      })
      .join("") || `<p>No matching record was returned for this context.</p>`
  }</div></section>`;
}

export function evidencePanel() {
  const meta = state.routineMeta;
  const grounding = meta?.grounding;
  const evidence = Array.isArray(meta?.evidence) ? meta.evidence.slice(0, 4) : [];
  const cue = Number(grounding?.sufficiencyScore);
  const cueText = Number.isFinite(cue) ? `Evidence sufficiency ${cue.toFixed(2)}` : "Evidence gate not run";
  const detail = String(grounding?.scoreType || "").includes("evidence_sufficiency")
    ? "An evidence-coverage check before the model is called, not a diagnosis score."
    : "No indexed evidence was used for this preview.";

  if (!evidence.length) {
    return `<section class="panel evidence-panel"><div class="panel-header"><h2 class="panel-title">${icon("file", 17)} Evidence grounding</h2><p class="panel-note">${escapeHtml(cueText)}</p></div><div class="evidence-empty"><strong>No retrieved sources yet.</strong><span>Run the gated preview to inspect the limited research notes used by this prototype.</span></div></section>`;
  }

  return `<section class="panel evidence-panel"><div class="panel-header"><h2 class="panel-title">${icon("file", 17)} Evidence grounding</h2><p class="panel-note">${escapeHtml(cueText)} · ${evidence.length} sources</p></div><p class="evidence-summary">${escapeHtml(detail)}</p><div class="evidence-list">${evidence
    .map((item) => {
      const sourceUrl = safeEvidenceUrl(item.sourceUrl);
      const tags = [
        item.evidenceTier,
        item.jurisdiction,
        item.conflictFlag || item.conflictOfInterest ? "Conflict flag" : "",
        item.productSpecific ? "Product-specific" : "",
      ].filter(Boolean);
      const score = Number(item.score ?? item.relevanceScore);
      return `<article class="evidence-item"><div class="evidence-item-head"><div><strong>${escapeHtml(item.title || "Indexed evidence")}</strong><span>${escapeHtml(item.source || "Source unavailable")}${Number.isFinite(score) ? ` · relevance ${escapeHtml(score.toFixed(2))}` : ""}</span></div>${sourceUrl ? `<a class="evidence-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">Open source ${icon("arrow", 13)}</a>` : ""}</div>${tags.length ? `<div class="evidence-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}</article>`;
    })
    .join("")}</div></section>`;
}

export function traceEntries(meta = state.routineMeta) {
  const raw = meta?.runReport?.stages || meta?.runReport?.trace || meta?.trace?.stages || meta?.trace || [];
  if (Array.isArray(raw)) return raw.filter((entry) => entry && typeof entry === "object");
  if (raw && typeof raw === "object")
    return Object.entries(raw).map(([id, value]) => ({
      id,
      ...(value && typeof value === "object" ? value : { status: value }),
    }));
  return [];
}

export function inferredStage(step, index, meta = state.routineMeta) {
  const stageAliases = {
    input: [],
    triage: ["triage"],
    retrieval: ["retrieval"],
    cue: ["evidence_sufficiency_gate", "cue"],
    safety: ["first_safety", "second_safety", "post_selection_safety"],
    synthesis: ["synthesis"],
  };
  const matches = traceEntries(meta).filter((entry) =>
    stageAliases[step.id]?.includes(String(entry.id || entry.stage || entry.name || "").toLowerCase()),
  );
  if (matches.length) {
    const matched = matches.at(-1);
    const raw = String(matched.status || matched.state || "reported").toLowerCase();
    const kind = /pass|clear|complete|allow|success/.test(raw)
      ? "passed"
      : /block|redirect|fail|error/.test(raw)
        ? "blocked"
        : /skip/.test(raw)
          ? "skipped"
          : "reported";
    const ruleIds = matches.flatMap((entry) => (Array.isArray(entry.ruleIds) ? entry.ruleIds : []));
    const detail =
      matched.detail ||
      matched.message ||
      (ruleIds.length
        ? `${[...new Set(ruleIds)].length} rule trace${ruleIds.length === 1 ? "" : "s"} reported by the server.`
        : matched.durationMs !== undefined
          ? `${matched.durationMs} ms server stage.`
          : "Server trace");
    return { kind, label: String(matched.label || matched.status || "Reported by server"), detail: String(detail) };
  }
  if (state.runStatus === "running")
    return index === 0
      ? { kind: "active", label: "Request submitted", detail: "Waiting for the server to report progress." }
      : { kind: "waiting", label: "Awaiting server", detail: "Not marked complete by this interface." };
  if (!meta) return { kind: "waiting", label: "Not run", detail: "Start a preview to create a run report." };
  if (step.id === "input")
    return {
      kind: "reported",
      label: "Normalised",
      detail: "Profile, concern, location, and optional safety text were sent for this run.",
    };
  if (meta.status === "medical_redirect") {
    if (step.id === "triage")
      return { kind: "blocked", label: "Redirected", detail: "Routine generation stopped before advice." };
    if (index > 1) return { kind: "skipped", label: "Skipped", detail: "Triage did not permit this stage." };
  }
  if (step.id === "retrieval" && meta.grounding?.evidenceCount)
    return {
      kind: "passed",
      label: "Evidence returned",
      detail: `${meta.grounding.evidenceCount} indexed note(s) reported.`,
    };
  if (step.id === "cue" && meta.grounding)
    return {
      kind: meta.grounding.passed ? "passed" : "reported",
      label: `Evidence sufficiency ${safelyNumber(meta.grounding.sufficiencyScore)}`,
      detail: `CUE ${cueSummary(meta.grounding).value}`,
    };
  if (step.id === "safety" && meta.safety)
    return {
      kind: meta.safety.status === "cleared" ? "passed" : "reported",
      label: String(meta.safety.status || "Reported"),
      detail: "Deterministic safety result from server.",
    };
  if (step.id === "synthesis" && meta.synthesisStatus)
    return {
      kind: meta.synthesisStatus === "completed" ? "passed" : "reported",
      label: String(meta.synthesisStatus).replaceAll("_", " "),
      detail: "Provider status reported by server.",
    };
  return {
    kind: meta.status === "cleared" ? "passed" : "reported",
    label: meta.status === "cleared" ? "Completed" : "Reported",
    detail: "Client-side fallback inferred from the response.",
  };
}

export function progressPanel() {
  const busy = state.runStatus === "running";
  return `<section class="panel run-progress" aria-label="Research run progress" aria-busy="${busy}"><div class="panel-header"><h3 class="panel-title">${icon("activity", 17)} Run progress</h3><p class="panel-note">${busy ? "Server request in flight" : "Server trace when available"}</p></div><ol class="run-stage-list">${pipeline
    .map((step, index) => {
      const status = inferredStage(step, index);
      return `<li class="run-stage is-${escapeHtml(status.kind)}"><span class="run-stage-dot" aria-hidden="true"></span><div><strong>${escapeHtml(step.name)}</strong><small>${escapeHtml(status.label)} · ${escapeHtml(status.detail)}</small></div></li>`;
    })
    .join("")}</ol></section>`;
}

export function reportPanel() {
  const meta = state.routineMeta;
  const grounding = meta?.grounding || {};
  const safetyFlags = Array.isArray(meta?.safety?.flags) ? meta.safety.flags : [];
  const reportTime = meta?.runReport?.completedAt || meta?.runReport?.startedAt || meta?.generatedAt;
  const parsedReportTime = reportTime ? new Date(reportTime) : null;
  const generatedAt =
    parsedReportTime && Number.isFinite(parsedReportTime.getTime())
      ? parsedReportTime.toLocaleString()
      : state.runStartedAt
        ? new Date(state.runStartedAt).toLocaleString()
        : "Not run";
  const reportRows = [
    ["Concern", concernSummary()],
    ["Environment", `${locationLabel()} · ${environmentModeLabel()}`],
    ["Evidence", grounding.evidenceCount ?? "—"],
    [
      "Evidence gate",
      Number.isFinite(Number(grounding.sufficiencyScore))
        ? `${grounding.passed ? "Passed" : "Not passed"} · sufficiency ${safelyNumber(grounding.sufficiencyScore)}`
        : "Not reported",
    ],
    ["CUE", cueSummary(grounding).value],
    ["Safety flags", safetyFlags.length ? safetyFlags.length : "None reported"],
    ["Run time", generatedAt],
  ];
  return `<section class="panel run-report"><div class="panel-header"><div><h3 class="panel-title">${icon("file", 17)} Explainable run report</h3></div><div class="run-report-actions"><button class="ghost-button" type="button" data-action="print-research-report" ${meta ? "" : "disabled"}>${icon("file", 14)} Print / Save PDF</button><button class="ghost-button" type="button" data-action="export-current-run" ${meta?.runReport ? "" : "disabled"}>${icon("download", 14)} Export JSON</button></div></div><dl class="run-report-grid">${reportRows.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>${safetyFlags.length ? `<p class="report-flags"><strong>Reported safety flags:</strong> ${escapeHtml(safetyFlags.join(" · "))}</p>` : ""}</section>`;
}

export function historyPanel() {
  const runs = state.runHistory.slice(0, 5);
  return `<section class="panel history-panel"><div class="panel-header"><div><h2 class="panel-title">${icon("layers", 17)} Local research run history</h2><p class="panel-note">De-identified summary only · newest first</p></div><div class="history-actions"><button class="ghost-button" type="button" data-action="export-run-history" ${runs.length ? "" : "disabled"}>${icon("download", 14)} Export</button><button class="text-button" type="button" data-action="clear-run-history" ${runs.length ? "" : "disabled"}>Clear</button></div></div>${runs.length ? `<div class="history-list">${runs.map((run) => `<article class="history-item"><div><strong>${escapeHtml(run.concern || "Research run")}</strong><small>${escapeHtml(run.timestamp || "Time unavailable")} · ${escapeHtml(run.profile || "Profile unavailable")}</small></div><div><span class="table-status ${run.status === "Cleared" ? "" : "review"}">${escapeHtml(run.status || "Reported")}</span><small>CUE / evidence score ${escapeHtml(run.cue || "—")} · ${escapeHtml(run.evidenceCount ?? "—")} notes</small></div></article>`).join("")}</div>` : `<div class="evidence-empty"><strong>No local run summaries yet.</strong><span>Completed requests can be exported as a de-identified research record from this browser.</span></div>`}<p class="history-privacy">Stored locally: time, profile, concern, city/area context, status, CUE (or evidence-sufficiency score when no model text was written) and evidence count. Never stored: free-text symptoms, source excerpts, or identifiers.</p></section>`;
}

export function forecastSynthesisCard() {
  const synth = state.forecastSynthesis || {};
  if (synth.status === "available" && synth.text) {
    const when = synth.generatedAt ? new Date(synth.generatedAt) : null;
    const stamp =
      when && !Number.isNaN(when.getTime())
        ? when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : "";
    return `<article class="forecast-synthesis is-available"><div class="forecast-synthesis-head"><span>${icon("sparkles", 15)} Weather synthesis</span><small>GPT${stamp ? ` · ${escapeHtml(stamp)}` : ""}</small></div><p>${escapeHtml(synth.text)}</p></article>`;
  }
  if (synth.status === "loading")
    return `<article class="forecast-synthesis is-loading"><div class="forecast-synthesis-head"><span>${icon("sparkles", 15)} Weather synthesis</span><small>GPT</small></div><p>Synthesising the next-24-hour outlook…</p></article>`;
  return `<article class="forecast-synthesis is-empty"><div class="forecast-synthesis-head"><span>${icon("sparkles", 15)} Weather synthesis</span><small>GPT</small></div><p>A GPT weather synthesis will appear here when live services are available.</p></article>`;
}

export let forecastHoverData = null;

export function forecastSmoothPath(points) {
  if (!points.length) return "";
  if (points.length < 3) return `M ${points.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ")}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export function forecastRoutinePanel() {
  const forecast = state.forecast || {};
  const hourly = Array.isArray(forecast.next24Hours) ? forecast.next24Hours : [];
  const reliability = Array.isArray(forecast.providerReliability) ? forecast.providerReliability : [];
  const provider = reliability.find((item) => item.provider === "OpenWeather");
  const pm = Number(activeEnvironment().readings?.pm25);
  const head = `<div class="panel-header"><div><h3 class="panel-title">${icon("activity", 17)} Forecast outlook</h3><p class="panel-note">Next 24 hours · adaptive routine</p></div><span class="pill is-neutral">${escapeHtml(forecast.status || "labelled")}</span></div>`;
  if (!hourly.length)
    return `<section class="panel forecast-panel">${head}<p class="forecast-empty">No 24-hour forecast trend is available from the current weather provider.</p>${forecastSynthesisCard()}</section>`;

  // Plot area within a 100 x VBH viewBox; lines are inset from the edges and each
  // metric is scaled to its own 24-hour range so the shapes stay comparable.
  const VBH = 42;
  const TOP = 5;
  const BOTTOM = 37;
  const span = BOTTOM - TOP;
  const n = hourly.length;
  const xAt = (index) => (index / Math.max(1, n - 1)) * 100;
  const series = (key) => {
    const values = hourly.map((period) => Number(period.environment?.readings?.[key]));
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return null;
    const low = Math.min(...finite);
    const high = Math.max(...finite);
    const range = high - low || 1;
    const points = [];
    const cells = values.map((value, index) => {
      if (!Number.isFinite(value)) return { value: null, y: null };
      const y = BOTTOM - ((value - low) / range) * span;
      points.push({ x: xAt(index), y });
      return { value, y };
    });
    return { low, high, points, cells };
  };

  const defs = [
    { key: "uvi", label: "UV", color: "var(--warning)", unit: "UVI", digits: 1 },
    { key: "humidity", label: "Humidity", color: "var(--accent)", unit: "%", digits: 0 },
    { key: "temperature", label: "Temperature", color: "var(--danger)", unit: "°C", digits: 1 },
  ];
  const lines = [];
  const legend = [];
  const hoverSeries = [];
  for (const def of defs) {
    const s = series(def.key);
    if (!s) {
      legend.push(
        `<span class="forecast-key is-off"><i style="--dot:${def.color}"></i>${escapeHtml(def.label)} · n/a</span>`,
      );
      continue;
    }
    lines.push(`<path class="forecast-line" d="${forecastSmoothPath(s.points)}" style="stroke:${def.color}" />`);
    legend.push(
      `<span class="forecast-key"><i style="--dot:${def.color}"></i>${escapeHtml(def.label)} · ${s.low.toFixed(def.digits)}–${s.high.toFixed(def.digits)} ${def.unit}</span>`,
    );
    hoverSeries.push({ label: def.label, color: def.color, unit: def.unit, digits: def.digits, cells: s.cells });
  }
  // PM2.5 has no hourly series; draw it as a horizontal reference line placed on a 0–150 µg/m³ scale.
  const pmColor = "var(--faint)";
  if (Number.isFinite(pm)) {
    const y = (BOTTOM - Math.max(0, Math.min(1, pm / 150)) * span).toFixed(2);
    lines.push(`<line class="forecast-ref" x1="0" y1="${y}" x2="100" y2="${y}" style="stroke:${pmColor}" />`);
    legend.push(
      `<span class="forecast-key"><i class="is-dashed" style="--dot:${pmColor}"></i>PM2.5 · ${pm.toFixed(1)} µg/m³ now</span>`,
    );
  } else {
    legend.push(
      `<span class="forecast-key is-off"><i class="is-dashed" style="--dot:${pmColor}"></i>PM2.5 · n/a</span>`,
    );
  }

  const gridlines = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (f) =>
        `<line class="grid" x1="0" y1="${(TOP + span * f).toFixed(2)}" x2="100" y2="${(TOP + span * f).toFixed(2)}" />`,
    )
    .join("");
  const vgrid = [25, 50, 75]
    .map((x) => `<line class="grid vgrid" x1="${x}" y1="${TOP}" x2="${x}" y2="${BOTTOM}" />`)
    .join("");
  const timeShort = (index) => {
    const at = hourly[index]?.at;
    const d = at ? new Date(at) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString(undefined, { hour: "numeric" }) : "";
  };
  const timeLong = (index) => {
    const at = hourly[index]?.at;
    const d = at ? new Date(at) : null;
    return d && !Number.isNaN(d.getTime())
      ? d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })
      : "";
  };
  const midIndex = Math.floor((n - 1) / 2);
  const axis = `<div class="forecast-axis"><span>${escapeHtml(timeShort(0))}</span><span>${escapeHtml(timeShort(midIndex))}</span><span>${escapeHtml(timeShort(n - 1))}</span></div>`;

  // Data used by the shared hover handler (see setupForecastHover).
  forecastHoverData = {
    n,
    top: TOP,
    bottom: BOTTOM,
    vbh: VBH,
    times: hourly.map((_, index) => timeLong(index)),
    xFracs: hourly.map((_, index) => xAt(index) / 100),
    series: hoverSeries,
    pm: Number.isFinite(pm) ? { color: pmColor, value: pm } : null,
  };

  const overlay = `<div class="forecast-hover" aria-hidden="true"><div class="forecast-guide"></div><div class="forecast-dots"></div><div class="forecast-tooltip"></div></div>`;

  return `<section class="panel forecast-panel">${head}<div class="forecast-legend">${legend.join("")}</div><div class="forecast-timeline" data-forecast-hover><svg viewBox="0 0 100 ${VBH}" preserveAspectRatio="none" role="img" aria-label="Next 24-hour UV, humidity, temperature, and PM2.5 timeline">${vgrid}${gridlines}${lines.join("")}</svg>${overlay}</div>${axis}<p class="forecast-scale-note">Each line is scaled to its own 24-hour range; PM2.5 is a current reference on a 0–150 µg/m³ scale. Hover the chart for hourly readings.</p>${forecastSynthesisCard()}<div class="forecast-reliability">OpenWeather: ${escapeHtml(provider?.successRate === null || provider?.successRate === undefined ? "not observed" : `${provider.successRate}% available`)}${provider?.averageLatencyMs ? ` · ${provider.averageLatencyMs} ms` : ""}</div></section>`;
}

export function safetyDecisionTrace(safety) {
  const rules = Array.isArray(safety?.rules) ? safety.rules : [];
  if (!rules.length)
    return `<details class="safety-decision-trace"><summary>Safety decision trace <span>Awaiting server rule details</span></summary><p>Run a server preview to inspect the deterministic rule IDs, statuses, and any reported detail.</p></details>`;
  return `<details class="safety-decision-trace"><summary>Safety decision trace <span>${rules.length} deterministic rule${rules.length === 1 ? "" : "s"}</span></summary><p>Inspectable server rule trace. A reported pass describes this configured research guardrail, not a clinical safety guarantee.</p><div class="safety-trace-list">${rules
    .map((rule) => {
      const status = String(rule?.status || "reported").replaceAll("_", " ");
      return `<article class="safety-trace-rule is-${escapeHtml(status.replaceAll(" ", "-"))}"><div><code>${escapeHtml(rule?.id || "rule-not-reported")}</code><strong>${escapeHtml(rule?.label || "Deterministic rule")}</strong><small>${escapeHtml(rule?.detail || "No additional detail was reported by this rule.")}</small></div><span>${escapeHtml(status)}</span></article>`;
    })
    .join("")}</div></details>`;
}

export function safetyPanel() {
  const safety = state.routineMeta?.safety;
  const checks = safety?.checks?.length
    ? safety.checks
    : ["No live safety result yet — generate a preview to run the server safety gates."];
  const level = safety?.status === "cleared" ? "low" : "medium";
  const label = safety?.status === "cleared" ? "Cleared" : "Pending";
  return `<section class="panel safety-panel"><div class="panel-header"><h2 class="panel-title">${icon("shield", 17)} Safety Gates</h2><p class="panel-note">${escapeHtml(routineStatusLabel())}</p></div><div class="safety-list">${checks.map((check) => `<div class="safety-item"><div><strong>${escapeHtml(check)}</strong><small>${safety?.flags?.length ? escapeHtml(safety.flags.join(" ")) : "Deterministic check status from the current result."}</small></div><span class="severity ${level}">${label}</span></div>`).join("")}</div>${safetyDecisionTrace(safety)}</section>`;
}

export function insightPanel() {
  const explanation = state.routineMeta?.explainability || state.explainability;
  const features = Array.isArray(explanation?.features) ? explanation.features : [];
  const peg = explanation?.peg;
  const weightStatus = String(explanation?.model?.weightStatus || "");
  const label =
    explanation?.method === "exact_shapley_values_for_additive_environmental_surrogate"
      ? `Exact Shapley values · additive surrogate ${/expert/.test(weightStatus) ? "fitted to expert-labelled scenarios" : /fitted/.test(weightStatus) ? "fitted to a labelled dataset" : "with configured weights"}`
      : "Loading contribution model";
  if (!features.length) {
    return `<section class="panel insight-panel"><div class="panel-header"><h2 class="panel-title">${icon("sparkles", 17)} Environmental contribution</h2><p class="panel-note">${escapeHtml(label)}</p></div><div class="evidence-empty"><strong>Contribution profile is loading.</strong><span>The final-review model decomposes UV, humidity, PM2.5, and temperature against a transparent baseline.</span></div></section>`;
  }
  return `<section class="panel insight-panel"><div class="panel-header"><h2 class="panel-title">${icon("sparkles", 17)} What drove the context?</h2><p class="panel-note">${escapeHtml(label)}</p></div><p class="explainability-score">Research-context score <strong>${escapeHtml(safelyNumber(explanation?.model?.contextScore))}</strong><span>baseline ${escapeHtml(safelyNumber(explanation?.model?.baselineScore))}</span></p>${features
    .map((feature) => {
      const value = Number(feature.influencePercent);
      const percentage = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
      const direction =
        feature.direction === "above_baseline" ? "+" : feature.direction === "below_baseline" ? "−" : "·";
      const raw =
        feature.rawValue === null || feature.rawValue === undefined
          ? "Unavailable"
          : `${feature.rawValue}${feature.unit ? ` ${feature.unit}` : ""}`;
      return `<div class="influence-row"><span>${escapeHtml(feature.label)}<small>${escapeHtml(raw)}</small></span><div class="influence-bar"><div class="influence-fill ${feature.direction === "below_baseline" ? "is-negative" : ""}" style="width:${percentage}%"></div></div><b>${escapeHtml(direction)}${escapeHtml(safelyNumber(Math.abs(Number(feature.shapValue) || 0), 3))}</b></div>`;
    })
    .join(
      "",
    )}<div class="insight-callout">${icon("info", 17)}<span><strong>${escapeHtml(peg?.headline || "Transparent environmental decomposition")}</strong><br />${escapeHtml(peg?.rationale || "This is a non-clinical research explanation, not a treatment decision.")} ${escapeHtml(peg?.limitations || "")}</span></div></section>`;
}

export function dashboardView() {
  return shell(
    `${dashboardHero()}<section class="dashboard-spotlight"><div>${routinePanel()}</div>${environmentPanel()}</section>${metricStrip()}${pipelinePanel()}${ingredientSystemPanel()}<div class="dashboard-grid">${safetyPanel()}${insightPanel()}${evidencePanel()}${historyPanel()}</div>`,
  );
}

export async function refreshExplainability({ shouldRender = true } = {}) {
  const location = locationPayload();
  const params = new URLSearchParams({
    concern: state.concern,
    lat: String(location.lat),
    lon: String(location.lon),
    location: location.name,
  });
  try {
    const response = await fetch(`/api/explainability?${params}`);
    if (!response.ok) throw new Error("Explainability unavailable");
    const payload = await response.json();
    state.explainability = payload.explainability || null;
    if (payload.environment && state.runStatus !== "running") state.environment = payload.environment;
  } catch {
    // Retain the last labelled explanation rather than substituting an
    // unlabelled client-side score.
  }
  if (shouldRender) render();
}

export function exportCurrentRun() {
  const report = state.routineMeta?.runReport;
  if (!report) {
    showToast("Run a preview before exporting its research report.");
    return;
  }
  const content = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      scope:
        "Non-clinical research run export. Free-text symptoms are excluded; only a boolean indicates whether safety text was provided.",
      runReport: report,
    },
    null,
    2,
  );
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "dermasynth-research-run.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Research run report exported.");
}

export function printReportDate() {
  const value =
    state.routineMeta?.runReport?.completedAt ||
    state.routineMeta?.runReport?.startedAt ||
    state.routineMeta?.generatedAt ||
    state.runStartedAt;
  const parsed = value ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : new Date().toLocaleString();
}

export function printableReportSourceRows() {
  const raw = [
    ...(Array.isArray(state.routineMeta?.evidence) ? state.routineMeta.evidence : []),
    ...(Array.isArray(state.routineMeta?.researchEvidence?.evidence)
      ? state.routineMeta.researchEvidence.evidence
      : []),
  ];
  const seen = new Set();
  return raw
    .filter((item) => {
      const key = String(item?.id || item?.documentId || `${item?.title || ""}|${item?.sourceUrl || ""}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8)
    .map((item) => {
      const url = safeEvidenceUrl(item?.sourceUrl);
      const title = escapeHtml(
        item?.title || (item?.ingredientNames || []).join(" · ") || "Source-linked research record",
      );
      const source = escapeHtml(item?.source || "Source metadata");
      const scope = escapeHtml(item?.evidenceScope || item?.excerpt || "Source-linked research context only.");
      return `<li><strong>${title}</strong><span>${source}</span><p>${scope}</p>${url ? `<a href="${escapeHtml(url)}">Open attributed source</a>` : ""}</li>`;
    })
    .join("");
}

export function printableResearchReportDocument() {
  const meta = state.routineMeta || {};
  const routine = normaliseRoutine();
  const environment = activeEnvironment();
  const readings = environment.readings || {};
  const grounding = meta.grounding || {};
  const safety = meta.safety || {};
  const features = Array.isArray(meta.explainability?.features)
    ? meta.explainability.features
    : Array.isArray(state.explainability?.features)
      ? state.explainability.features
      : [];
  const safetyChecks = Array.isArray(safety.checks) ? safety.checks : [];
  const sources = printableReportSourceRows();
  const stepRows = (steps) =>
    steps
      .map(
        (step, index) =>
          `<li><b>${index + 1}</b><div><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(step.note)}</span></div></li>`,
      )
      .join("");
  const contributionRows = features
    .slice(0, 4)
    .map(
      (feature) =>
        `<tr><td>${escapeHtml(feature.label || "Environmental input")}</td><td>${escapeHtml(feature.rawValue ?? "—")}${feature.unit ? ` ${escapeHtml(feature.unit)}` : ""}</td><td>${escapeHtml(safelyNumber(feature.shapValue, 3))}</td><td>${escapeHtml(String(feature.direction || "reported").replaceAll("_", " "))}</td></tr>`,
    )
    .join("");
  const environmentRows = [
    ["UV index", environmentValue(readings.uvi)],
    ["Humidity", `${environmentValue(readings.humidity)}%`],
    ["Temperature", `${environmentValue(readings.temperature)} °C`],
    ["PM2.5", `${environmentValue(readings.pm25)} µg/m³`],
  ]
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
  const status = routineStatusLabel();
  const sourceNote =
    sources ||
    "<li><strong>No retrieved source list was returned for this run.</strong><span>Review the run trace and Atlas separately.</span></li>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>DermaSynth final-review report</title><style>
    :root { color-scheme: light; --ink:#173530; --muted:#5e716b; --line:#d8e5e0; --accent:#1b7467; --soft:#eef8f4; }
    * { box-sizing:border-box; } body { margin:0; color:var(--ink); background:#eef4f1; font:14px/1.48 Inter, Avenir Next, Arial, sans-serif; } main { width:min(920px,100%); margin:0 auto; padding:34px; background:#fff; } .masthead { display:flex; justify-content:space-between; gap:24px; padding:25px 28px; color:#effff9; border-radius:20px; background:linear-gradient(135deg,#0c3d38,#176a5e); } .mark { display:flex; align-items:center; gap:11px; color:#b9e6d9; font-size:11px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; } .mark::before { width:12px; height:12px; border-radius:4px; background:#8ee2ca; content:""; } h1 { margin:8px 0 0; color:#fff; font-size:31px; letter-spacing:-.05em; } .masthead p { max-width:510px; margin:8px 0 0; color:#c7e8df; } .stamp { min-width:155px; color:#b7ded4; font-size:11px; text-align:right; } .stamp strong { display:block; margin-top:4px; color:#fff; font-size:13px; } section { margin-top:24px; padding:22px; border:1px solid var(--line); border-radius:16px; } h2 { margin:0; font-size:16px; letter-spacing:-.02em; } .lead { margin:6px 0 0; color:var(--muted); font-size:12px; } .status { display:inline-block; margin-top:13px; padding:5px 9px; color:#235f54; border-radius:999px; background:#dcf1ea; font-size:11px; font-weight:800; } .environment { display:grid; grid-template-columns:repeat(4,1fr); gap:9px; margin-top:15px; } .environment div { padding:12px; border-radius:11px; background:#f6faf8; } .environment span, .environment strong { display:block; } .environment span { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.08em; } .environment strong { margin-top:4px; font-size:17px; } .routine { display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-top:15px; } .routine article { padding:15px; border-radius:12px; background:#f8fbf9; } .routine h3 { margin:0; font-size:12px; text-transform:uppercase; letter-spacing:.08em; } ol { display:grid; gap:10px; margin:13px 0 0; padding:0; list-style:none; } ol li { display:grid; grid-template-columns:22px 1fr; gap:9px; } ol b { display:grid; width:21px; height:21px; place-items:center; color:#176a5e; border-radius:50%; background:#dff2ec; font-size:10px; } ol strong, ol span { display:block; } ol span { margin-top:2px; color:var(--muted); font-size:11px; } .facts { display:grid; grid-template-columns:repeat(3,1fr); gap:9px; margin-top:14px; } .facts div { padding:11px; border-left:3px solid #9ed6c8; background:#f8fbf9; } .facts dt { color:var(--muted); font-size:10px; text-transform:uppercase; } .facts dd { margin:4px 0 0; font-weight:750; } .checks { display:grid; gap:7px; margin-top:14px; padding:0; list-style:none; } .checks li { padding:10px 11px; color:#41564f; border-radius:10px; background:#f7faf8; font-size:12px; } table { width:100%; margin-top:14px; border-collapse:collapse; font-size:12px; } th, td { padding:9px; border-bottom:1px solid var(--line); text-align:left; } th { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.06em; } .sources { display:grid; gap:10px; margin:14px 0 0; padding:0; list-style:none; } .sources li { padding:12px; border:1px solid var(--line); border-radius:10px; } .sources strong, .sources span { display:block; } .sources span, .sources p { color:var(--muted); font-size:11px; } .sources p { margin:4px 0; } a { color:#176a5e; font-size:11px; font-weight:750; } .boundary { margin-top:24px; padding:15px 17px; color:#46625a; border:1px solid #cbe7dd; border-radius:13px; background:#eff9f5; font-size:11px; } .boundary strong { color:#176a5e; } footer { margin-top:18px; color:#71827d; font-size:10px; text-align:center; } @media print { body { background:#fff; } main { padding:0; } section { break-inside:avoid; } } @media (max-width:620px) { main { padding:18px; } .masthead { display:block; } .stamp { margin-top:15px; text-align:left; } .environment, .facts, .routine { grid-template-columns:1fr 1fr; } }
  </style></head><body><main><header class="masthead"><div><div class="mark">DermaSynth · Final-review research report</div><h1>Explainable category-preview record</h1><p>Environment inputs, category-only routine output, source links, deterministic guardrails, and configured contribution values in one printable artefact.</p></div><div class="stamp">Generated<strong>${escapeHtml(printReportDate())}</strong><br />Non-clinical research demonstrator</div></header><section><h2>Run boundary</h2><p class="lead">The report intentionally omits optional free-text safety context. It does not diagnose, prescribe, select a named ingredient, establish individual suitability, or replace qualified care.</p><span class="status">${escapeHtml(status)}</span><dl class="facts"><div><dt>Research context</dt><dd>${escapeHtml(concernSummary())}</dd></div><div><dt>Profile input</dt><dd>${escapeHtml(state.profile)}</dd></div><div><dt>Evidence-sufficiency gate</dt><dd>${Number.isFinite(Number(grounding.sufficiencyScore)) ? `${grounding.passed ? "Passed" : "Not passed"} · ${escapeHtml(safelyNumber(grounding.sufficiencyScore))}` : "Not reported"}</dd></div><div><dt>CUE (model text)</dt><dd>${escapeHtml(cueSummary(grounding).value)}</dd></div></dl></section><section><h2>Labelled environment inputs</h2><p class="lead">${escapeHtml(locationLabel())} · ${escapeHtml(environmentModeLabel())} · ${escapeHtml(state.lastUpdated)}</p><div class="environment">${environmentRows}</div></section><section><h2>Category-only routine preview</h2><p class="lead">${escapeHtml(routine.label)}</p><div class="routine"><article><h3>Morning</h3><ol>${stepRows(routine.am)}</ol></article><article><h3>Evening</h3><ol>${stepRows(routine.pm)}</ol></article></div></section><section><h2>Deterministic guardrail trace</h2><p class="lead">${escapeHtml(String(safety.status || "Not reported").replaceAll("_", " "))}. The guardrail status is reported by the server; it is not a clinical safety guarantee.</p><ul class="checks">${safetyChecks.length ? safetyChecks.map((check) => `<li>${escapeHtml(check)}</li>`).join("") : "<li>No safety-check list was returned for this report.</li>"}</ul></section><section><h2>Configured environmental contribution view</h2><p class="lead">Exact Shapley values for the configured additive study-demo surrogate. Values explain this transparent study model only, not clinical causation.</p>${contributionRows ? `<table><thead><tr><th>Input</th><th>Reading</th><th>Shapley value</th><th>Direction</th></tr></thead><tbody>${contributionRows}</tbody></table>` : '<p class="lead">No contribution values were returned for this run.</p>'}</section><section><h2>Source-linked research records</h2><p class="lead">Links are provided for final-review traceability. Their presence does not authorise a named ingredient, product, dose, frequency, compatibility, or treatment claim.</p><ul class="sources">${sourceNote}</ul></section><aside class="boundary"><strong>Scope declaration:</strong> this printable report documents a non-clinical technology demonstration. Category-source cards are source-mapped research context, remain pending qualified clinical review, and are excluded from the evidence-sufficiency gate, live category selection, ingredient activation, and routine selection.</aside><footer>DermaSynth · local final-review export · save through the browser print dialog if a PDF file is needed.</footer></main></body></html>`;
}

export function printResearchReport() {
  if (!state.routineMeta) {
    showToast("Run a gated preview before creating a printable research report.");
    return;
  }
  const reportWindow = window.open("", "dermasynth-final-review-report", "popup,width=960,height=900");
  if (!reportWindow) {
    showToast("The browser blocked the report window. Allow pop-ups, then try again.");
    return;
  }
  reportWindow.document.open();
  reportWindow.document.write(printableResearchReportDocument());
  reportWindow.document.close();
  reportWindow.focus();
  window.setTimeout(() => reportWindow.print(), 250);
}

export function persistRunHistory() {
  try {
    window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(state.runHistory.slice(0, 12)));
  } catch {
    // Local storage is optional; the active browser session still keeps the summary.
  }
}

export function recordRunSummary(payload, location) {
  const status =
    payload?.status === "cleared"
      ? "Cleared"
      : payload?.status === "medical_redirect"
        ? "Redirected"
        : payload?.status === "review_required"
          ? "Review"
          : "Reported";
  const cueScore = payload?.grounding?.cue?.score;
  const cue = Number(cueScore === null || cueScore === undefined ? payload?.grounding?.sufficiencyScore : cueScore);
  const entry = {
    id: String(payload?.requestId || `local-${Date.now()}`),
    timestamp: new Date().toLocaleString(),
    profile: state.profile,
    concern: concernSummary(),
    location: String(location?.name || "Location unavailable").slice(0, 80),
    status,
    cue: Number.isFinite(cue) ? cue.toFixed(2) : "—",
    evidenceCount: Number.isFinite(Number(payload?.grounding?.evidenceCount))
      ? Number(payload.grounding.evidenceCount)
      : "—",
  };
  state.runHistory = [entry, ...state.runHistory.filter((run) => run.id !== entry.id)].slice(0, 12);
  persistRunHistory();
}

export function exportRunHistory() {
  if (!state.runHistory.length) return;
  const content = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      scope:
        "De-identified frontend research-run summaries. Free-text symptoms, source excerpts, and identifiers are excluded.",
      runs: state.runHistory,
    },
    null,
    2,
  );
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "dermasynth-deidentified-run-history.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("De-identified local run history exported.");
}

export function clearRunHistory() {
  state.runHistory = [];
  try {
    window.localStorage.removeItem(RUN_HISTORY_STORAGE_KEY);
  } catch {
    /* Optional browser storage. */
  }
  render();
  showToast("Local de-identified run history cleared.");
}

export function moveForecastHover(event) {
  if (!(event.target instanceof Element)) {
    hideForecastHover();
    return;
  }
  const timeline = event.target.closest("[data-forecast-hover]");
  if (!timeline || !forecastHoverData || !forecastHoverData.n) {
    hideForecastHover();
    return;
  }
  const svg = timeline.querySelector("svg");
  const overlay = timeline.querySelector(".forecast-hover");
  const guide = timeline.querySelector(".forecast-guide");
  const dots = timeline.querySelector(".forecast-dots");
  const tooltip = timeline.querySelector(".forecast-tooltip");
  if (!svg || !overlay || !guide || !dots || !tooltip) return;
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const data = forecastHoverData;
  const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  let index = Math.round(frac * (data.n - 1));
  index = Math.max(0, Math.min(data.n - 1, index));
  const toY = (vy) => (vy / data.vbh) * rect.height;
  const xPx = (data.xFracs[index] ?? frac) * rect.width;

  overlay.classList.add("is-active");
  guide.style.left = `${xPx}px`;
  guide.style.top = `${toY(data.top)}px`;
  guide.style.height = `${toY(data.bottom) - toY(data.top)}px`;

  const rows = [];
  let dotsHtml = "";
  for (const s of data.series) {
    const cell = s.cells[index];
    if (!cell || cell.value === null) {
      rows.push(
        `<span class="forecast-tip-row is-off"><i style="--dot:${s.color}"></i>${escapeHtml(s.label)}<b>n/a</b></span>`,
      );
      continue;
    }
    dotsHtml += `<span class="forecast-dot" style="left:${xPx}px;top:${toY(cell.y)}px;--dot:${s.color}"></span>`;
    rows.push(
      `<span class="forecast-tip-row"><i style="--dot:${s.color}"></i>${escapeHtml(s.label)}<b>${cell.value.toFixed(s.digits)} ${escapeHtml(s.unit)}</b></span>`,
    );
  }
  if (data.pm)
    rows.push(
      `<span class="forecast-tip-row is-ref"><i class="is-dashed" style="--dot:${data.pm.color}"></i>PM2.5<b>${data.pm.value.toFixed(1)} µg/m³</b></span>`,
    );
  dots.innerHTML = dotsHtml;
  tooltip.innerHTML = `<strong>${escapeHtml(data.times[index] || "")}</strong>${rows.join("")}`;

  const width = overlay.clientWidth || rect.width;
  const tipWidth = tooltip.offsetWidth || 150;
  let left = xPx + 12;
  if (left + tipWidth > width) left = xPx - tipWidth - 12;
  if (left < 0) left = 0;
  tooltip.style.left = `${left}px`;
}

export function hideForecastHover() {
  document.querySelectorAll(".forecast-hover.is-active").forEach((el) => el.classList.remove("is-active"));
}
