// DermaSynth front end: entry point. Wires up the page-wide event handlers, restores saved data and
// starts the first render. Each feature lives in ui/.

import { loadCorpusSummary, loadKnowledgeExplorer, loadResearchSearch } from "./ui/atlas.js";
import { streakCount, toggleStepDone } from "./ui/daily.js";
import { refreshEnvironment } from "./ui/environment.js";
import {
  advancePresentation,
  clearRunHistory,
  endPresentation,
  exportCurrentRun,
  exportRunHistory,
  hideForecastHover,
  moveForecastHover,
  printResearchReport,
  refreshExplainability,
  setPresentationStep,
  startPresentation,
} from "./ui/expert.js";
import {
  LOCATION_STORAGE_KEY,
  cancelLocationSearch,
  geolocationPermission,
  isLocationUpdating,
  loadSavedLocation,
  searchLocations,
  selectLocation,
  useMyLocation,
} from "./ui/location.js";
import { sendCheckin } from "./ui/result.js";
import {
  clearMyRoutine,
  downloadReminders,
  focusProductCheck,
  productCheckExample,
  runProductCheck,
  saveMyRoutine,
} from "./ui/result-actions.js";
import { generateRoutine, showStandardRoutineNow, toggleConcern } from "./ui/routine.js";
import {
  SHELF_TYPES,
  loadShelf,
  openShelfEditor,
  refreshShelfCheck,
  removeShelfProduct,
  saveShelfEditor,
  scanShelfLabel,
  shelfProduct,
} from "./ui/shelf.js";
import {
  WIDE_LAYOUT_QUERY,
  applyRoute,
  navigateView,
  prefersReducedMotion,
  render,
  renderAnimated,
  scheduleRender,
  showToast,
} from "./ui/shell.js";
import {
  MY_ROUTINE_KEY,
  defaultLocation,
  readStore,
  saveExpertView,
  state,
  viewFromHash,
  viewHash,
  writeStore,
} from "./ui/state.js";
import { closeStory, downloadStory, openStory, shareStory } from "./ui/story.js";
import { resetPreviewForInputChange } from "./ui/today.js";
import { refreshWeatherOutlook } from "./ui/weather.js";

try {
  window.matchMedia(WIDE_LAYOUT_QUERY).addEventListener("change", () => scheduleRender());
} catch {
  /* old browsers keep the first layout */
}

document.addEventListener("pointermove", moveForecastHover);

document.addEventListener(
  "pointerleave",
  (event) => {
    if (event.target.closest?.("[data-forecast-hover]")) hideForecastHover();
  },
  true,
);

document.addEventListener("pointerdown", moveForecastHover);

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action } = target.dataset;
  if (action === "story-open") {
    openStory();
    return;
  }
  if (action === "week-export") {
    openStory("week");
    return;
  }
  if (action === "result-view") {
    const view = target.dataset.view === "week" ? "week" : "today";
    if (state.resultView !== view) {
      state.resultView = view;
      renderAnimated().then(() =>
        document.querySelector(`[data-action="result-view"][data-view="${view}"]`)?.focus({ preventScroll: true }),
      );
    }
    return;
  }
  if (action === "atlas-show-all") {
    state.atlasShowAll = true;
    renderAnimated();
    return;
  }
  if (action === "redirect-edit") {
    state.formCollapsed = false;
    renderAnimated().then(() => {
      const box = document.querySelector("#symptoms");
      box?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      box?.focus({ preventScroll: true });
    });
    return;
  }
  if (action === "story-close") {
    closeStory();
    return;
  }
  if (action === "story-share") {
    shareStory();
    return;
  }
  if (action === "story-download") {
    downloadStory();
    return;
  }
  if (action === "reminders") {
    downloadReminders();
    return;
  }
  if (action === "save-my-routine") {
    saveMyRoutine();
    return;
  }
  if (action === "step-done") {
    const before = streakCount();
    const result = toggleStepDone(target.dataset.key);
    state.justTicked = result.nowDone ? target.dataset.key : null;
    state.phaseCelebrate = result.completedPhase;
    const after = streakCount();
    state.streakBumped = after > before;
    render();
    if (result.completedPhase)
      showToast(
        `${result.completedPhase === "am" ? "Morning" : "Evening"} routine done.${after ? ` ${after}-day streak.` : ""}`,
      );
    clearTimeout(state.tickTimer);
    state.tickTimer = setTimeout(() => {
      state.justTicked = null;
      state.phaseCelebrate = null;
      state.streakBumped = false;
    }, 900);
    return;
  }
  if (action === "shelf-add") {
    openShelfEditor(null, target.dataset.type || "other");
    return;
  }
  if (action === "shelf-edit") {
    const p = shelfProduct(target.dataset.id);
    if (p) openShelfEditor(p);
    return;
  }
  if (action === "shelf-cancel") {
    state.shelfEditor = null;
    renderAnimated();
    return;
  }
  if (action === "shelf-save") {
    saveShelfEditor();
    return;
  }
  if (action === "shelf-type" && state.shelfEditor) {
    state.shelfEditor.draft.type = SHELF_TYPES.some(([id]) => id === target.dataset.value)
      ? target.dataset.value
      : "other";
    render();
    return;
  }
  if (action === "shelf-remove") {
    removeShelfProduct(target.dataset.id);
    return;
  }
  if (action === "shelf-select") {
    state.shelfSelected = state.shelfSelected === target.dataset.id ? null : target.dataset.id;
    state.shelfConfirmRemove = null;
    renderAnimated().then(() => {
      if (state.shelfSelected)
        document
          .querySelector(".shelf-detail")
          ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "nearest" });
    });
    return;
  }
  if (action === "shelf-close") {
    state.shelfSelected = null;
    state.shelfConfirmRemove = null;
    renderAnimated();
    return;
  }
  if (action === "shelf-show") {
    state.shelfSelected = target.dataset.id;
    navigateView("shelf");
    return;
  }
  if (action === "products-done") {
    state.editingProducts = false;
    writeStore(MY_ROUTINE_KEY, state.myRoutine);
    renderAnimated();
    showToast("Saved.");
    return;
  }
  if (action === "clear-my-routine") {
    clearMyRoutine();
    return;
  }
  if (action === "edit-form") {
    state.formCollapsed = false;
    renderAnimated().then(() =>
      document
        .querySelector("#routine-preview")
        ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }),
    );
    return;
  }
  if (action === "pc-run") {
    runProductCheck();
    return;
  }
  if (action === "pc-focus") {
    focusProductCheck();
    return;
  }
  if (action === "pc-example") {
    state.productCheck = { text: productCheckExample() };
    runProductCheck();
    return;
  }
  if (action === "pc-clear") {
    state.productCheck = { text: "" };
    renderAnimated().then(() => document.querySelector("#pc-text")?.focus({ preventScroll: true }));
    return;
  }
  if (action === "checkin" || action === "checkin-follow") {
    const about = target.dataset.about === "yesterday" ? "yesterday" : "today";
    const draft = state.checkinDraft?.about === about ? { ...state.checkinDraft } : { about };
    if (action === "checkin") draft.rating = target.dataset.value;
    else draft.followed = target.dataset.value;
    state.checkinDraft = draft;
    if (draft.rating && draft.followed) {
      sendCheckin(about);
      return;
    }
    renderAnimated();
    return;
  }
  if (action === "presentation-start") {
    startPresentation();
    return;
  }
  if (action === "presentation-close") {
    endPresentation();
    return;
  }
  if (action === "presentation-back") {
    setPresentationStep(state.presentation.step - 1);
    return;
  }
  if (action === "presentation-next") {
    advancePresentation();
    return;
  }
  if (action === "presentation-skip") {
    advancePresentation({ skipProof: true });
    return;
  }
  if (action === "presentation-run") {
    generateRoutine();
    return;
  }
  if (action === "ingredient-guide") {
    state.knowledgeQuery = target.dataset.name || "";
    state.knowledgeSearchResult = null;
    state.atlasShowAll = false;
    navigateView("knowledge");
    // Land on the ingredient's card, not the top of the guide.
    setTimeout(() => document.querySelector(".atlas-ingredient")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }), 450);
    return;
  }
  if (action === "navigate") {
    navigateView(target.dataset.view);
    return;
  }
  if (action === "stage") {
    state.selectedStage = state.selectedStage === target.dataset.stage ? null : target.dataset.stage;
    render();
    return;
  }
  if (action === "refresh") {
    if (isLocationUpdating()) {
      showToast("Wait for the selected location's readings to finish updating.");
      return;
    }
    refreshEnvironment();
    return;
  }
  if (action === "location-search") {
    searchLocations();
    return;
  }
  if (action === "select-location") {
    selectLocation(Number(target.dataset.locationIndex));
    return;
  }
  if (action === "use-my-location") {
    useMyLocation();
    return;
  }
  if (action === "standard-routine") {
    showStandardRoutineNow();
    return;
  }
  if (action === "profile") {
    if (state.runStatus === "running") return;
    state.profile = target.dataset.profile;
    resetPreviewForInputChange();
    render();
    return;
  }
  if (action === "concern-choice") {
    if (state.runStatus === "running") return;
    if (!toggleConcern(target.dataset.concern)) return;
    resetPreviewForInputChange();
    render();
    refreshExplainability({ shouldRender: true });
    return;
  }
  if (action === "simulate") {
    generateRoutine();
    return;
  }
  if (action === "report-condition") {
    state.reportedConditions = { ...(state.reportedConditions || {}), [target.dataset.key]: target.dataset.value };
    render();
    return;
  }
  if (action === "toggle-expert") {
    state.expertView = !state.expertView;
    saveExpertView(state.expertView);
    render();
    if (state.activeView === "monitor" && !state.expertView) refreshWeatherOutlook();
    showToast(state.expertView ? "Showing the science: scores, traces and the run report." : "Science hidden.");
    return;
  }
  if (action === "toggle-why") {
    const key = target.dataset.key;
    const opening = !state.openWhy[key];
    state.openWhy = { ...state.openWhy, [key]: opening };
    state.whyJustOpened = opening ? key : "";
    renderAnimated().then(() => {
      state.whyJustOpened = "";
      document
        .querySelector(`[data-action="toggle-why"][data-key="${CSS.escape(key)}"]`)
        ?.focus({ preventScroll: true });
    });
    return;
  }
  if (action === "submit-conditions") {
    generateRoutine({ reportedConditions: state.reportedConditions });
    return;
  }
  if (action === "reason") {
    state.reasonOpen = !state.reasonOpen;
    render();
    return;
  }
  if (action === "print-research-report") {
    printResearchReport();
    return;
  }
  if (action === "export-current-run") {
    exportCurrentRun();
    return;
  }
  if (action === "export-run-history") {
    exportRunHistory();
    return;
  }
  if (action === "clear-run-history") {
    clearRunHistory();
  }
  if (action === "knowledge-refresh") {
    loadKnowledgeExplorer({ force: true });
    loadCorpusSummary();
    return;
  }
  if (action === "knowledge-search") {
    loadResearchSearch();
    return;
  }
  if (action === "knowledge-concern") {
    state.knowledgeConcern = target.dataset.concern || "all";
    state.relationshipFocus = state.knowledgeConcern;
    state.relationshipSelectedId = "";
    state.knowledgeSearchResult = null;
    loadKnowledgeExplorer({ force: true });
    return;
  }
  if (action === "relationship-filter") {
    state.relationshipFocus = target.dataset.relationshipFocus || "all";
    state.relationshipSelectedId = "";
    if (state.activeView === "knowledge") {
      const focusValue = state.relationshipFocus;
      render();
      window.requestAnimationFrame(() =>
        Array.from(document.querySelectorAll("[data-relationship-focus]"))
          .find((item) => item.dataset.relationshipFocus === focusValue)
          ?.focus(),
      );
    }
    return;
  }
  if (action === "relationship-select") {
    state.relationshipSelectedId = target.dataset.relationshipId || "";
    if (state.activeView === "knowledge") {
      const selectedId = state.relationshipSelectedId;
      render();
      window.requestAnimationFrame(() =>
        Array.from(document.querySelectorAll("[data-relationship-id]"))
          .find((item) => item.dataset.relationshipId === selectedId)
          ?.focus(),
      );
    }
    return;
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.dataset.action === "shelf-scan") {
    const file = target.files?.[0];
    target.value = "";
    if (file) scanShelfLabel(file);
    return;
  }
  if (target.dataset.action === "shelf-field" && state.shelfEditor && target.tagName === "SELECT") {
    state.shelfEditor.draft[target.dataset.field] = target.value;
    return;
  }
  if (target.dataset.action === "finish-preference") {
    state.finishPreference = ["matte", "dewy", "no-preference"].includes(target.value) ? target.value : "";
    resetPreviewForInputChange();
    render();
  }
  if (target.dataset.action === "reactivity-level") {
    state.reactivityLevel = ["low", "moderate", "high"].includes(target.value) ? target.value : "";
    resetPreviewForInputChange();
    render();
  }
  if (target.dataset.action === "exposure-context") {
    state.exposureContext = ["indoors", "mixed", "outdoors"].includes(target.value) ? target.value : "mixed";
    resetPreviewForInputChange();
    render();
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (
    target.dataset.action === "shelf-field" &&
    state.shelfEditor &&
    ["name", "brand", "type", "text"].includes(target.dataset.field)
  ) {
    state.shelfEditor.draft[target.dataset.field] = target.value;
    state.shelfEditor.error = "";
    return;
  }
  if (target.dataset.action === "symptoms") {
    state.symptoms = target.value.slice(0, 280);
    return;
  }
  if (target.dataset.action === "pc-text") {
    state.productCheck = { ...(state.productCheck || {}), text: target.value.slice(0, 4000) };
    return;
  }
  if (target.dataset.action === "my-product" && state.myRoutine) {
    const value = target.value.replace(/[\u0000-\u001f]/g, "").slice(0, 60);
    state.myRoutine.products = { ...(state.myRoutine.products || {}) };
    if (value.trim()) state.myRoutine.products[target.dataset.key] = value;
    else delete state.myRoutine.products[target.dataset.key];
    writeStore(MY_ROUTINE_KEY, state.myRoutine);
    return;
  }
  if (target.dataset.action === "location-query") {
    state.locationQuery = target.value;
    state.locationResults = [];
    state.locationSearchStatus = "idle";
    state.locationSearchNotice = "";
    cancelLocationSearch();
    document.querySelector("#location-results")?.remove();
    target.setAttribute("aria-expanded", "false");
  }
  if (target.dataset.action === "knowledge-query") {
    state.knowledgeQuery = target.value.slice(0, 100);
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target.dataset.action !== "location-query") return;
  if (event.key === "Enter") {
    event.preventDefault();
    searchLocations();
  }
  if (event.key === "Escape") {
    state.locationResults = [];
    state.locationSearchStatus = "idle";
    cancelLocationSearch();
    document.querySelector("#location-results")?.remove();
    target.setAttribute("aria-expanded", "false");
  }
});

state.myRoutine = readStore(MY_ROUTINE_KEY, null);

state.shelf = loadShelf();

if (state.activeView === "shelf") refreshShelfCheck();

state.openToggles = {};

document.addEventListener(
  "toggle",
  (event) => {
    const key = event.target?.dataset?.toggleKey;
    if (!key) return;
    state.openToggles[key] = event.target.open;
    const more = event.target.querySelector(":scope > summary .today-strip-more");
    if (more) more.textContent = event.target.open ? "Less" : "More";
  },
  true,
);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector("#story-modal")) {
    event.preventDefault();
    closeStory();
  }
  // Keep keyboard focus inside the story dialog while it is open.
  const modal = document.querySelector("#story-modal");
  if (event.key === "Tab" && modal) {
    const items = [...modal.querySelectorAll("button")];
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

if (!window.location.hash || !viewFromHash()) window.history.replaceState(null, "", viewHash(state.activeView));

window.addEventListener("hashchange", applyRoute);

window.addEventListener("popstate", applyRoute);

render();

// Prime the demonstrator with labelled server data. Every call has a safe
// local/demo fallback, so the interface remains usable without provider keys.
// Start with the last location this browser used; on a first visit, ask for
// the current location (once) and fall back to Kuala Lumpur.
{
  const saved = loadSavedLocation();
  let askedBefore = false;
  try {
    askedBefore = window.localStorage.getItem(`${LOCATION_STORAGE_KEY}.asked`) === "1";
  } catch {
    askedBefore = true;
  }
  if (saved) {
    state.selectedLocation = saved;
    state.locationQuery = saved.name;
    void refreshEnvironment(saved, { announce: false });
  } else {
    // First visit on this browser: try the current location without nagging.
    // Ask once; after a "no", only use it again if the person taps "Use my location".
    void refreshEnvironment(defaultLocation, { announce: false }).then(async () => {
      const permission = await geolocationPermission();
      if (permission === "granted" || !window.isSecureContext || (!askedBefore && permission !== "denied"))
        void useMyLocation({ silent: true });
    });
  }
}

if (state.activeView === "monitor" && !state.expertView) void refreshWeatherOutlook();

void loadKnowledgeExplorer();

void loadCorpusSummary();
