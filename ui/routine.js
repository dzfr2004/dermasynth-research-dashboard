// Routines: concerns, normalising the server's routine, plain step names, building a routine (POST
// /api/routine) and the friendlier GPT explanations.

import { computeChangeInfo, previousDayRoutine, rememberRoutineDay } from "./daily.js";
import { concernOptions, profileRoutines } from "./data.js";
import { recordRunSummary } from "./expert.js";
import { isLocationUpdating, locationPayload } from "./location.js";
import { previousRoutineForCompare, rememberRoutine, scrollToResult } from "./result-actions.js";
import { refreshShelfCheck } from "./shelf.js";
import { isWideLayout, prefersReducedMotion, render, renderAnimated, scheduleRender, showToast } from "./shell.js";
import { state } from "./state.js";
import { escapeHtml, icon, safelyNumber } from "./util.js";
import { refreshOutlook, refreshWeek } from "./week.js";

export function cueLabel() {
  const rawCue = state.routineMeta?.grounding?.cue?.score;
  const cue = rawCue === null || rawCue === undefined ? NaN : Number(rawCue);
  if (Number.isFinite(cue)) return `CUE ${cue.toFixed(2)}`;
  const sufficiency = Number(state.routineMeta?.grounding?.sufficiencyScore);
  return Number.isFinite(sufficiency) ? `Evidence sufficiency ${sufficiency.toFixed(2)}` : "Evidence gate not run";
}

export function cueSummary(grounding) {
  const cue = grounding?.cue;
  if (!cue || cue.score === null || cue.score === undefined)
    return { value: "Not run", foot: "Runs when the model writes text" };
  const status = String(cue.status || "").replaceAll("_", " ");
  return {
    value: safelyNumber(cue.score),
    foot: `${status} · threshold ${safelyNumber(cue.threshold)} · ${cue.method || "method n/a"}`,
  };
}

export function routineStatusLabel() {
  if (state.runStatus === "running") return "Run in progress";
  if (state.runStatus === "error") return "Local fallback";
  const status = state.routineMeta?.status;
  if (isQuotaFallback()) return "Live synthesis unavailable";
  if (status === "cleared") return "Cleared";
  if (status === "medical_redirect") return "Clinical redirect";
  if (status === "review_required") return "Review required";
  return "Preview only";
}

export function isQuotaFallback() {
  return state.routineMeta?.synthesisStatus === "quota_unavailable";
}

export function concernOption(id = state.concern) {
  return concernOptions.find((option) => option.id === id) || concernOptions[0];
}

export const MAX_CONCERNS = 3;

export function selectedConcerns() {
  const list = Array.isArray(state.concerns) && state.concerns.length ? state.concerns : [state.concern || "acne"];
  return [...new Set(list)].slice(0, MAX_CONCERNS);
}

export function concernSummary() {
  return selectedConcerns()
    .map((id) => concernOption(id).label)
    .join(" + ");
}

export function toggleConcern(id) {
  const current = selectedConcerns();
  let next;
  if (current.includes(id)) {
    // Keep at least one concern selected.
    next = current.length > 1 ? current.filter((item) => item !== id) : current;
  } else {
    next = current.length < MAX_CONCERNS ? [...current, id] : current;
  }
  state.concerns = next;
  state.concern = next[0];
  return next !== current;
}

export function normaliseRoutineStep(step, index) {
  if (Array.isArray(step)) {
    return {
      title: String(step[0] || `Research category ${index + 1}`),
      note: String(step[1] || "Research-only category"),
      sourceIds: [],
    };
  }
  if (typeof step === "string") return { title: step, note: "Research-only category", sourceIds: [] };
  if (step && typeof step === "object") {
    const sourceIds = Array.isArray(step.evidenceIds)
      ? step.evidenceIds
      : Array.isArray(step.sourceIds)
        ? step.sourceIds
        : Array.isArray(step.sources)
          ? step.sources
          : [];
    return {
      id: typeof step.id === "string" ? step.id : "",
      title: String(step.title || step.name || step.category || `Research category ${index + 1}`),
      note: String(step.note || step.rationale || step.reason || step.description || "Research-only category"),
      sourceIds: sourceIds.map((value) => String(value)).slice(0, 3),
      ruleIds: Array.isArray(step.ruleIds) ? step.ruleIds.map(String) : [],
    };
  }
  return { title: `Research category ${index + 1}`, note: "Research-only category", sourceIds: [] };
}

export function normaliseRoutine(rawRoutine = state.generatedRoutine, concern = state.concern) {
  const fallback = profileRoutines[concern] || profileRoutines.acne;
  const candidate = rawRoutine && typeof rawRoutine === "object" ? rawRoutine : fallback;
  const legacySteps = Array.isArray(candidate.steps) ? candidate.steps.map(normaliseRoutineStep) : [];
  const fallbackAm = fallback.am.map(normaliseRoutineStep);
  const fallbackPm = fallback.pm.map(normaliseRoutineStep);
  const am =
    Array.isArray(candidate.am) && candidate.am.length
      ? candidate.am.map(normaliseRoutineStep)
      : legacySteps.length
        ? legacySteps.slice(0, Math.max(1, Math.ceil(legacySteps.length / 2)))
        : fallbackAm;
  const pm =
    Array.isArray(candidate.pm) && candidate.pm.length
      ? candidate.pm.map(normaliseRoutineStep)
      : legacySteps.length
        ? legacySteps.slice(Math.max(1, Math.ceil(legacySteps.length / 2)))
        : fallbackPm;
  return {
    label: String(candidate.label || candidate.title || fallback.label),
    reason: String(candidate.reason || candidate.rationale || fallback.reason),
    am: am.length ? am : fallbackAm,
    pm: pm.length ? pm : fallbackPm,
  };
}

export function routineStepList(steps, { dark = false, ingredientCandidates = [], phase = "" } = {}) {
  return `<ol class="${dark ? "synth-step-list" : "routine-list"}">${steps
    .map((step, index) => {
      const sourceText = step.sourceIds?.length ? ` · evidence ${step.sourceIds.join(", ")}` : "";
      const names = ingredientCandidates
        .filter((entry) => entry?.categoryId === step?.id && (!phase || entry?.phase === phase))
        .map((entry) => entry.displayName)
        .filter(Boolean);
      const recommendation = names.length
        ? `<span class="routine-step-ingredients">Recommended: ${escapeHtml(names.join(", "))}</span>`
        : "";
      const gpt = phase && step?.id ? state.routineContext?.steps?.[`${phase}:${step.id}`] : null;
      // C5: without GPT text, show the rule-based reason for this step, never the generic category note.
      const ruleText = stepRuleReason(phase, step?.id) || step.note;
      const note = gpt?.text
        ? `<small class="routine-step-gpt">${escapeHtml(gpt.text)}</small>${state.expertView ? `<small class="routine-step-rule"><b>Rule-based version:</b> ${escapeHtml(ruleText)}${gpt.cue && Number.isFinite(Number(gpt.cue.score)) ? ` · GPT text CUE ${Number(gpt.cue.score).toFixed(2)}${gpt.cue.attempt === 2 ? " after one rewrite" : ""}` : ""}</small>` : ""}`
        : `<small>${escapeHtml(ruleText)}${escapeHtml(sourceText)}${phase && state.routineContext?.status === "loading" ? " · writing context…" : ""}</small>`;
      return `<li><span class="routine-step-title">${escapeHtml(step.title)}</span>${note}${recommendation}${!dark ? "" : `<span class="synth-step-number">${index + 1}</span>`}</li>`;
    })
    .join("")}</ol>`;
}

export function stepRuleReason(phase, categoryId) {
  const steps = state.routineMeta?.explanation?.steps;
  if (!Array.isArray(steps) || !phase || !categoryId) return "";
  return steps.find((item) => item.phase === phase && item.categoryId === categoryId)?.text || "";
}

// ---- G1/G2/G3: consumer view ---------------------------------------------
export const STEP_PLAIN = Object.freeze({
  "low-irritation-cleansing": { name: "Gentle cleanse", what: "Any gentle, fragrance-free cleanser." },
  "comfort-hydration": { name: "Hydrating layer", what: "A hydrating serum or essence that draws in water." },
  "light-hydration": { name: "Light hydrating layer", what: "A light, water-based hydrating layer." },
  "supportive-hydration": { name: "Hydrating layer", what: "A hydrating serum or essence." },
  "barrier-support-moisturising": {
    name: "Rich moisturiser",
    what: "A richer moisturiser that helps skin hold on to water.",
  },
  "lightweight-moisturising": { name: "Light moisturiser", what: "A light gel or lotion moisturiser." },
  "supportive-moisturising": { name: "Moisturiser", what: "An everyday moisturiser." },
  "daytime-photoprotection": { name: "Sun protection", what: "Sunscreen as the last morning step." },
  "antioxidant-context": { name: "Antioxidant", what: "An antioxidant serum for high-pollution days." },
  "texture-renewal": { name: "Gentle exfoliant", what: "A mild leave-on exfoliant, evenings only." },
  "overnight-comfort": { name: "Night moisturiser", what: "A plain moisturiser or balm to finish your evening." },
});

export function plainStep(step) {
  return STEP_PLAIN[step?.id] || { name: step?.title || "Routine step", what: step?.note || "" };
}

// F2: the page never waits silently. After 25 s the user can keep waiting for
// GPT or get the standard (rule-based) routine at once.
export const SLOW_ROUTINE_MS = 25_000;

export let routineAbort = null;

export function showStandardRoutineNow() {
  const reportedConditions = state.lastReportedConditions || null;
  if (routineAbort) routineAbort.abort();
  routineAbort = null;
  state.runStatus = "idle";
  state.runSlow = false;
  generateRoutine({ reportedConditions, standardRoutine: true });
}

export async function generateRoutine({ reportedConditions = null, standardRoutine = false } = {}) {
  if (isLocationUpdating()) {
    showToast("Wait for the selected location's readings to finish updating.");
    return;
  }
  if (state.runStatus === "running") return;
  state.reasonOpen = false;
  const location = locationPayload();
  const symptoms = (state.symptoms || state.pendingSymptoms || "").trim().slice(0, 280);
  const locationVersion = state.locationVersion;
  const requestVersion = ++state.routineRequestVersion;
  state.runStatus = "running";
  state.runStartedAt = Date.now();
  state.runSlow = false;
  state.lastReportedConditions = reportedConditions;
  const controller = new AbortController();
  routineAbort = controller;
  const slowTimer = setTimeout(() => {
    if (requestVersion === state.routineRequestVersion && state.runStatus === "running") {
      state.runSlow = true;
      render();
    }
  }, SLOW_ROUTINE_MS);
  render();
  // On a phone the form stays above the result, so bring the live progress into view.
  if (!state.expertView && !isWideLayout())
    requestAnimationFrame(() =>
      document
        .querySelector(".build-card")
        ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" }),
    );
  try {
    const body = { profile: state.profile, concern: state.concern, concerns: selectedConcerns(), location };
    if (standardRoutine) body.standardRoutine = true;
    if (state.finishPreference) body.finishPreference = state.finishPreference;
    if (state.reactivityLevel) body.reactivityLevel = state.reactivityLevel;
    if (state.exposureContext) body.exposureContext = state.exposureContext;
    if (symptoms) body.symptoms = symptoms;
    if (reportedConditions) body.reportedConditions = reportedConditions;
    const previous = previousRoutineForCompare();
    const compareBase = previousDayRoutine();
    const usual = state.myRoutine?.steps?.length ? state.myRoutine.steps : null;
    if (usual || previous)
      body.compare = {
        ...(usual ? { usualSteps: usual } : {}),
        ...(previous ? { previous: { steps: previous.steps, readings: previous.readings, at: previous.at } } : {}),
      };
    // A replaced request can still hold the server's one in-flight slot for a
    // moment after it is cancelled; retry briefly on that specific 429.
    let response;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      response = await fetch("/api/routine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const retryAfter = Number(response.headers.get("retry-after"));
      if (response.status !== 429 || !(retryAfter > 0 && retryAfter <= 3)) break;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    clearTimeout(slowTimer);
    if (!response.ok) {
      const failure = new Error("Routine API is unavailable");
      failure.status = response.status;
      throw failure;
    }
    const payload = await response.json();
    if (requestVersion !== state.routineRequestVersion || locationVersion !== state.locationVersion) return;
    state.generatedRoutine = payload.routine || null;
    state.routineMeta = payload;
    state.runStatus = "complete";
    // Keep the safety text only while we wait for the user's conditions, so
    // the resubmitted request is triaged again with the same text.
    state.pendingSymptoms = payload.status === "needs_conditions" ? symptoms : "";
    if (payload.status !== "needs_conditions") state.reportedConditions = null;
    state.symptoms = "";
    if (payload.environment) {
      state.environment = payload.environment;
      state.selectedLocation = locationPayload(payload.environment.location || state.selectedLocation);
      state.locationQuery = state.selectedLocation.name;
      state.lastUpdated = payload.environment.updatedAt || state.lastUpdated;
    }
    state.explainability = payload.explainability || state.explainability;
    recordRunSummary(payload, location);
    state.changeInfo = payload.status === "cleared" ? computeChangeInfo(compareBase, payload) : null;
    rememberRoutine(payload);
    rememberRoutineDay(payload);
    refreshShelfCheck({ force: true });
    state.productCheck = null;
    state.checkinDraft = null;
    state.editingProducts = false;
    state.formCollapsed = ["cleared", "review_required"].includes(payload.status);
    state.resultView = "today";
    renderAnimated({ entering: true });
    requestAnimationFrame(scrollToResult);
    refreshRoutineContext();
    refreshOutlook();
    refreshWeek();
    if (payload.status === "needs_conditions") {
      showToast("We couldn't get today's weather. Tell us the conditions to continue.");
    } else if (payload.status === "cleared") {
      showToast("Your routine is ready.");
    } else if (payload.status === "medical_redirect") {
      showToast("Please get your skin checked before starting a routine.");
    } else if (payload.synthesisStatus === "quota_unavailable") {
      showToast("Your routine is ready. Some personalised parts are unavailable right now.");
    } else {
      showToast("Your routine is ready.");
    }
  } catch (failure) {
    clearTimeout(slowTimer);
    if (failure?.name === "AbortError") return; // replaced by the standard-routine request
    if (requestVersion !== state.routineRequestVersion || locationVersion !== state.locationVersion) return;
    state.generatedRoutine = profileRoutines[state.concern] || profileRoutines.acne;
    state.routineMeta = {
      status: "review_required",
      mode: "local",
      errorKind:
        failure?.status === 429 || failure?.status === 503
          ? "busy"
          : failure?.status === 400
            ? "invalid"
            : "unreachable",
      safety: { status: "pending", checks: [], flags: [] },
      notices: ["The server could not be reached. This is a local generic research preview."],
    };
    state.runStatus = "error";
    state.symptoms = "";
    recordRunSummary(state.routineMeta, location);
    render();
    showToast(
      state.routineMeta?.errorKind === "busy"
        ? "Too many requests just now. Please wait a minute and try again."
        : "We couldn't reach DermaSynth. Check your connection and try again.",
    );
  }
}

export async function refreshRoutineContext() {
  const meta = state.routineMeta;
  const runId = meta?.routineContext?.runId || "";
  if (!runId) {
    state.routineContext = { runId: "", status: "idle", steps: {}, ingredients: {}, error: "", model: "" };
    return;
  }
  if (!meta.routineContext.available) {
    state.routineContext = {
      runId,
      status: "unavailable",
      steps: {},
      ingredients: {},
      error: meta.routineContext.reason || "GPT explanations are not available for this run.",
      model: "",
    };
    scheduleRender();
    return;
  }
  if (state.routineContext.runId === runId && ["loading", "available"].includes(state.routineContext.status)) return;
  state.routineContext = { runId, status: "loading", steps: {}, ingredients: {}, error: "", model: "" };
  const slowContextTimer = setTimeout(() => {
    if (state.routineContext.runId === runId && state.routineContext.status === "loading") {
      state.routineContext = { ...state.routineContext, slow: true };
      scheduleRender();
    }
  }, SLOW_ROUTINE_MS);
  scheduleRender();
  try {
    const response = await fetch("/api/ai/routine-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (state.routineContext.runId !== runId) return;
    if (!response.ok) throw new Error(payload?.error || "GPT explanations are unavailable.");
    state.routineContext = {
      runId,
      status: "available",
      steps: payload.steps || {},
      ingredients: payload.ingredients || {},
      withheld: Array.isArray(payload.withheld) ? payload.withheld : [],
      error: "",
      model: payload.model || "",
    };
    state.gptJustArrived = true;
    clearTimeout(slowContextTimer);
  } catch (error) {
    clearTimeout(slowContextTimer);
    if (state.routineContext.runId !== runId) return;
    state.routineContext = {
      runId,
      status: "error",
      steps: {},
      ingredients: {},
      error: error instanceof Error ? error.message : "GPT explanations are unavailable.",
      model: "",
    };
  }
  scheduleRender({ animated: true });
}

export function gptTag(item) {
  const cue = item?.cue && Number.isFinite(Number(item.cue.score)) ? ` · CUE ${Number(item.cue.score).toFixed(2)}` : "";
  const model = state.routineContext?.model ? ` · ${escapeHtml(state.routineContext.model)}` : "";
  return `<span class="ingredient-rationale-tag">${icon("sparkles", 11)} GPT${escapeHtml(cue)}${model}</span>`;
}
