// The Today page: the 'About your skin' form and the page layout around the result.

import { concernOptions } from "./data.js";
import { locationLabel } from "./environment.js";
import { evidencePanel, progressPanel, reportPanel, researchContextPanel } from "./expert.js";
import { skyHero } from "./hero.js";
import { isLocationUpdating, locationPicker } from "./location.js";
import { synthesizedRoutineCard } from "./result.js";
import { collapsedFormPanel } from "./result-actions.js";
import { MAX_CONCERNS, inputsChangedSinceBuild, normaliseRoutine, selectedConcerns } from "./routine.js";
import { isWideLayout, shell } from "./shell.js";
import { state } from "./state.js";
import { escapeHtml, icon } from "./util.js";

export function concernPicker() {
  const disabled = state.runStatus === "running";
  const picked = selectedConcerns();
  const full = picked.length >= MAX_CONCERNS;
  const choice = (option) => {
    const index = picked.indexOf(option.id);
    const selected = index !== -1;
    const blocked = !selected && full;
    const tag = selected ? `<span class="concern-order">${index === 0 ? "Main" : `#${index + 1}`}</span>` : "";
    return `<button type="button" class="concern-choice ${selected ? "is-selected" : ""} ${blocked ? "is-blocked" : ""}" data-action="concern-choice" data-concern="${option.id}" aria-pressed="${selected}" ${blocked ? 'aria-disabled="true"' : ""} ${disabled ? "disabled" : ""}><strong>${tag}${escapeHtml(option.label)}</strong><small>${escapeHtml(option.description)}</small></button>`;
  };
  return `<div class="field concern-field"><label id="concern-label">Skin concerns</label><p class="field-help" id="concern-help">Pick up to ${MAX_CONCERNS}. The first one you pick is your main concern. ${picked.length}/${MAX_CONCERNS} chosen.</p><div class="concern-grid" role="group" aria-labelledby="concern-label" aria-describedby="concern-help">${concernOptions.map(choice).join("")}</div></div>`;
}

export function profilePreferenceFields() {
  const disabled = state.runStatus === "running";
  const finishPreference = ["matte", "dewy", "no-preference"].includes(state.finishPreference)
    ? state.finishPreference
    : "";
  const reactivityLevel = ["low", "moderate", "high"].includes(state.reactivityLevel) ? state.reactivityLevel : "";
  const anySet = Boolean(
    finishPreference || reactivityLevel || (state.exposureContext && state.exposureContext !== "mixed"),
  );
  const open = state.openToggles?.["more-fields"] ?? anySet;
  return `<details class="more-fields" data-toggle-key="more-fields" ${open ? "open" : ""}><summary>More about your skin <span class="field-optional">(optional)</span></summary><div class="profile-secondary-fields" aria-label="Optional details">
    <div class="field"><label for="finish-preference">Finish preference <span class="field-optional">(optional)</span></label><select id="finish-preference" data-action="finish-preference" ${disabled ? "disabled" : ""}><option value="" ${finishPreference ? "" : "selected"}>Not specified</option><option value="matte" ${finishPreference === "matte" ? "selected" : ""}>Matte</option><option value="dewy" ${finishPreference === "dewy" ? "selected" : ""}>Dewy</option><option value="no-preference" ${finishPreference === "no-preference" ? "selected" : ""}>No preference</option></select><p class="field-help">How you like your skin to look after moisturising.</p></div>
    <div class="field"><label for="reactivity-level">Do new products often sting or redden your skin? <span class="field-optional">(optional)</span></label><select id="reactivity-level" data-action="reactivity-level" ${disabled ? "disabled" : ""}><option value="" ${reactivityLevel ? "" : "selected"}>Not specified</option><option value="low" ${reactivityLevel === "low" ? "selected" : ""}>Rarely</option><option value="moderate" ${reactivityLevel === "moderate" ? "selected" : ""}>Sometimes</option><option value="high" ${reactivityLevel === "high" ? "selected" : ""}>Often</option></select><p class="field-help">If they do, the routine stays extra gentle.</p></div>
    <div class="field"><label for="exposure-context">Your day today</label><select id="exposure-context" data-action="exposure-context" ${disabled ? "disabled" : ""}><option value="indoors" ${state.exposureContext === "indoors" ? "selected" : ""}>Mostly indoors</option><option value="mixed" ${state.exposureContext === "mixed" ? "selected" : ""}>Mixed</option><option value="outdoors" ${state.exposureContext === "outdoors" ? "selected" : ""}>Mostly outdoors</option></select><p class="field-help">More time outdoors means sun protection is added at lower UV.</p></div></div></details>`;
}

export function conditionsCard(meta) {
  const options = meta?.conditionOptions || {};
  const labels = { sky: "Sun right now", air: "How the air feels", haze: "Air quality", temperature: "Temperature" };
  const chosen = state.reportedConditions || {};
  const groups = Object.entries(labels)
    .map(
      ([key, label]) =>
        `<fieldset class="conditions-group"><legend>${escapeHtml(label)}</legend><div class="conditions-options">${(options[key] || []).map((option) => `<button type="button" class="condition-chip ${chosen[key] === option.id ? "is-selected" : ""}" data-action="report-condition" data-key="${escapeHtml(key)}" data-value="${escapeHtml(option.id)}" aria-pressed="${chosen[key] === option.id}">${escapeHtml(option.label)}</button>`).join("")}</div></fieldset>`,
    )
    .join("");
  const complete = Object.keys(labels).every((key) => chosen[key]);
  return `<section class="synthesized-routine-card is-review conditions-card" aria-live="polite"><div class="synth-card-top"><div><p class="routine-eyebrow">${icon("info", 14)} Live readings unavailable</p><h3>Tell us today's conditions</h3><p>We couldn't get live weather and air-quality readings for ${escapeHtml(locationLabel())}. Rather than guess, the routine will use what you choose below.</p></div></div>${groups}<div class="form-actions"><button class="primary-button" type="button" data-action="submit-conditions" ${complete ? "" : "disabled"}>${icon("sparkles", 15)} Build routine with these conditions</button></div></section>`;
}

export function simulatorView() {
  const routine = normaliseRoutine();
  const profileChoices = ["dry", "combination", "oily", "sensitive"]
    .map(
      (profile) =>
        `<button class="profile-choice ${state.profile === profile ? "is-selected" : ""}" type="button" data-action="profile" data-profile="${profile}" aria-pressed="${state.profile === profile}" ${state.runStatus === "running" ? "disabled" : ""}>${profile[0].toUpperCase()}${profile.slice(1)}</button>`,
    )
    .join("");
  const locationUpdating = isLocationUpdating();
  const running = state.runStatus === "running";
  const changed = !running && inputsChangedSinceBuild();
  const inputs = `<section class="panel form-panel" id="routine-preview"><div class="panel-header"><h3 class="panel-title">${icon("flask", 17)} About your skin</h3><p class="panel-note">Takes about a minute</p></div><div class="form-grid"><div class="field"><label id="skin-type-label">Skin type</label><div class="profile-pills" role="group" aria-labelledby="skin-type-label" aria-describedby="skin-type-help">${profileChoices}</div><p class="field-help" id="skin-type-help">Not sure? <b>Oily</b>: shiny by midday. <b>Dry</b>: feels tight or flaky. <b>Combination</b>: oily forehead and nose, normal or dry cheeks. <b>Sensitive</b>: stings or reddens easily.</p></div>${concernPicker()}${profilePreferenceFields()}<div class="field safety-input"><label for="symptoms">Anything unusual with your skin right now?</label><textarea id="symptoms" data-action="symptoms" maxlength="280" aria-describedby="symptoms-help" placeholder="For example: swelling, burning after a new product, or a spreading rash">${escapeHtml(state.symptoms || "")}</textarea><p class="field-help" id="symptoms-help">Leave empty if all is fine. If something needs a doctor or pharmacist, we'll say so. Not stored.</p></div>${locationPicker({ label: "Location" })}</div><div class="form-actions ${changed ? "is-changed" : ""}">${changed ? `<p class="form-changed-note" role="status">${icon("refresh", 13)} You changed your details, so the old routine was cleared. Rebuild to see the new one.</p>` : ""}<button class="primary-button" type="button" data-action="simulate" ${locationUpdating || running ? "disabled" : ""}>${icon(changed || state.routineMeta ? "refresh" : "sparkles", 15)} ${running ? "Building…" : changed ? "Rebuild with my changes" : state.routineMeta ? "Rebuild routine" : "Build routine"}</button>${state.expertView ? `<button class="ghost-button" type="button" data-action="navigate" data-view="monitor">Today's weather</button>` : ""}</div></section>`;
  // Desktop keeps "About your skin" open on the left beside the result, so
  // details can be changed and rebuilt without scrolling. Phones fold it up.
  const formPanel =
    state.formCollapsed && !state.expertView && state.routineMeta && !running && !isWideLayout()
      ? collapsedFormPanel()
      : inputs;
  const result = `<section class="sim-result" id="routine-result">${synthesizedRoutineCard(routine, state.routineMeta)}${state.expertView ? researchContextPanel(state.routineMeta) : ""}</section>`;
  if (!state.expertView)
    return shell(
      `<h2 class="sr-only">Your routine for today</h2><div class="simulator-grid today-grid-layout ${formPanel === inputs ? "" : "is-form-collapsed"} ${state.routineMeta || running ? "has-result" : ""}">${skyHero(state.routineMeta)}${formPanel}${result}</div>`,
    );
  return shell(
    `<div class="view-heading ${state.expertView ? "" : "is-sky-replaced"} ${state.routineMeta && !state.expertView ? "has-result" : ""}"><div><h2>${state.expertView ? "Routine preview (expert view)" : "Your routine for today"}</h2><p>${state.expertView ? "The same routine with scores, traces, evidence and the run report." : "Based on today's weather where you are and what you tell us about your skin."}</p></div></div><div class="simulator-grid ${formPanel === inputs ? "" : "is-form-collapsed"} ${state.routineMeta || running ? "has-result" : ""}">${formPanel}${result}</div>${state.expertView ? `<div class="simulator-report-grid">${progressPanel()}${reportPanel()}${evidencePanel()}</div>` : ""}`,
  );
}

export function resetPreviewForInputChange() {
  if (state.runStatus === "running") state.routineRequestVersion += 1;
  state.generatedRoutine = null;
  state.routineMeta = null;
  state.reasonOpen = false;
  state.runStatus = "idle";
}
