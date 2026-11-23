// The page frame and render loop: navigation, top bar, render()/renderAnimated(), view transitions,
// toasts, routing and the after-render hooks (sky, count-ups, build progress).

import { knowledgeExplorerView, loadKnowledgeExplorer } from "./atlas.js";
import { pipeline } from "./data.js";
import { activeEnvironment, environmentModeLabel, environmentSourceLabel, locationLabel } from "./environment.js";
import { dashboardView, incorporatedIngredientRecords, presentationGuide } from "./expert.js";
import { skyPalette, skyStyle } from "./hero.js";
import { isLocationUpdating } from "./location.js";
import { BUILD_STAGES, STAGE_MS } from "./result.js";
import { cueLabel } from "./routine.js";
import { refreshShelfCheck, shelfView } from "./shelf.js";
import { attachSky, hexToRgb01 } from "../sky.js";
import { VIEW_META, state, viewFromHash, viewHash } from "./state.js";
import { simulatorView } from "./today.js";
import { escapeHtml, icon } from "./util.js";
import { monitorView, refreshWeatherOutlook } from "./weather.js";

export const app = document.querySelector("#app");

export function navItem(id, label, subtitle, iconName) {
  const isActive = state.activeView === id;
  return `<button class="nav-item ${isActive ? "is-active" : ""}" type="button" data-action="navigate" data-view="${id}" ${isActive ? 'aria-current="page"' : ""}>
    ${icon(iconName, 18)}
    <span class="nav-copy"><span>${label}</span><small>${subtitle}</small></span>
  </button>`;
}

export function mobileNavItem(id, label, iconName) {
  const isActive = state.activeView === id;
  return `<button class="mobile-nav-item ${isActive ? "is-active" : ""}" type="button" data-action="navigate" data-view="${id}" ${isActive ? 'aria-current="page"' : ""}>
    ${icon(iconName, 17)}<span>${escapeHtml(label)}</span>
  </button>`;
}

export function mobileNavigation() {
  const items = state.expertView
    ? [
        ["dashboard", "Overview", "grid"],
        ["monitor", "Environment", "activity"],
        ["simulator", "Routine", "flask"],
        ["knowledge", "Atlas", "file"],
      ]
    : [
        ["simulator", "Today", "sparkles"],
        ["monitor", "Weather", "sun"],
        ["shelf", "Shelf", "bottle"],
        ["knowledge", "Ingredients", "file"],
      ];
  return `<nav class="mobile-nav" style="--nav-items: ${items.length}" aria-label="Primary navigation">${items.map(([id, label, iconName]) => mobileNavItem(id, label, iconName)).join("")}</nav>`;
}

export function shell(view) {
  const ingredientCount =
    Number(state.knowledgeExplorer?.overview?.ingredientCount) || incorporatedIngredientRecords().length;
  const currentMeta = VIEW_META[state.activeView] || VIEW_META.dashboard;
  const CONSUMER_TITLES = {
    simulator: "Your routine",
    monitor: "Weather",
    knowledge: "Ingredients",
    shelf: "My shelf",
  };
  const title =
    !state.expertView && CONSUMER_TITLES[state.activeView] ? CONSUMER_TITLES[state.activeView] : currentMeta.title;
  const modeClass =
    activeEnvironment().mode === "live"
      ? ""
      : ["degraded", "unavailable"].includes(activeEnvironment().mode)
        ? "is-warning"
        : "is-neutral";
  const cueClass = state.routineMeta?.status === "cleared" ? "" : "is-warning";
  const locationUpdating = isLocationUpdating();
  const sky = state.expertView
    ? null
    : skyPalette((state.routineMeta?.environment || activeEnvironment())?.readings || {});
  return `<div class="app-shell ${state.expertView ? "is-expert" : "is-consumer"}" ${sky ? `data-sky-state="${sky.state}" style="${skyStyle(sky)}"` : ""}>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark"><img src="/assets/dermasynth-mark.svg" alt="" /></span><span class="brand-copy"><strong>DermaSynth</strong><small>Weather-aware skincare</small></span></div>
      <div class="sidebar-navigation">
        <div class="sidebar-navigation-group">
          ${
            state.expertView
              ? `<p class="side-section-label">Core workflow</p>
          <nav class="nav-list" aria-label="Core research workflow">
            ${navItem("dashboard", "Overview", "At a glance", "grid")}
            ${navItem("monitor", "Environment", "Live conditions", "activity")}
            ${navItem("simulator", "Routine", "Build routine", "flask")}
            ${navItem("knowledge", "Ingredient Atlas", `${ingredientCount} ingredients`, "file")}
          </nav>`
              : `<nav class="nav-list" aria-label="Primary navigation">
            ${navItem("simulator", "Today", "Your routine", "sparkles")}
            ${navItem("monitor", "Weather", "UV, humidity and haze", "sun")}
            ${navItem("shelf", "My shelf", state.shelf.length ? `${state.shelf.length} product${state.shelf.length === 1 ? "" : "s"}` : "Your products", "bottle")}
            ${navItem("knowledge", "Ingredients", `${ingredientCount} explained`, "file")}
          </nav>`
          }
        </div>
      </div>
      <section class="knowledge-card" aria-label="Knowledge base status">
        <p>Research knowledge base</p><strong>${escapeHtml(String(state.knowledgeExplorer?.overview?.ingredientCount || 50))} mapped ingredients</strong>
        <span class="source-count"><i class="source-dot"></i>${escapeHtml(String(state.knowledgeExplorer?.overview?.sourceCount || 52))} attributed source records</span>
      </section>
    </aside>
    <main class="main-content" id="main-content" tabindex="-1">
      <header class="topbar">
        <div class="page-title"><img class="topbar-mark" src="/assets/dermasynth-mark.svg" alt="" width="30" height="30" /><div class="page-title-text"><h1 id="page-title" tabindex="-1">${title}</h1><p class="location-line">${icon("pin", 15)}<span>${escapeHtml(locationLabel())}</span><span>· ${escapeHtml(environmentModeLabel())}</span></p></div></div>
        <div class="topbar-actions">
          <button class="expert-toggle-top" type="button" data-action="toggle-expert" aria-pressed="${state.expertView}">${icon("layers", 14)} <span>Show the science</span></button>
          ${
            state.expertView
              ? `<button class="presentation-button" type="button" data-action="presentation-start">${icon("sparkles", 14)} Defence walkthrough</button>
          <span class="pill ${cueClass}">${icon("sparkles", 14)} ${escapeHtml(cueLabel())}</span>
          <span class="pill ${modeClass}">${escapeHtml(environmentSourceLabel())}</span>`
              : ""
          }
          ${state.expertView ? `<button class="refresh-button" type="button" data-action="refresh" aria-label="Refresh environment readings" ${locationUpdating ? "disabled" : ""}>${icon("refresh", 16)} <span>Refresh environment</span></button>` : ""}
        </div>
      </header>
      <div class="scope-banner" role="note">${icon("shield", 14)}<span><strong>Research prototype, not medical advice.</strong> Patch-test new products first.</span></div>
      <div class="content"><div class="view" style="view-transition-name: page-view">${view}</div></div>
    </main>
    <div class="toast" role="status" aria-live="polite" id="toast"></div>
    ${presentationGuide()}
    ${mobileNavigation()}
  </div>`;
}

export const countMemory = {};

export let pipelineTimer = 0;

export function afterRender() {
  const slot = app.querySelector("[data-sky]");
  if (slot) {
    const env = state.routineMeta?.environment || activeEnvironment();
    const p = skyPalette(env?.readings || {});
    if (!attachSky(slot, env?.readings || {}, { clear: true, top: hexToRgb01(p.top), bottom: hexToRgb01(p.bottom) }))
      slot.classList.add("no-sky");
  }
  const still = prefersReducedMotion();
  for (const el of app.querySelectorAll("[data-count]")) {
    const to = Number(el.dataset.count);
    const key = el.dataset.countKey;
    if (!Number.isFinite(to) || !key) continue;
    const from = countMemory[key] ?? 0;
    countMemory[key] = to;
    if (from === to || still) continue;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 900);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (p < 1 && el.isConnected) requestAnimationFrame(tick);
    };
    el.textContent = String(from);
    requestAnimationFrame(tick);
  }
  const pipeline = app.querySelector(".build-stages");
  clearInterval(pipelineTimer);
  if (pipeline && state.runStartedAt) {
    const update = () => {
      const list = app.querySelector(".build-stages");
      if (!list) {
        clearInterval(pipelineTimer);
        return;
      }
      // The last stage keeps spinning until the server answers.
      const active = Math.min(BUILD_STAGES.length - 1, Math.floor((Date.now() - state.runStartedAt) / STAGE_MS));
      list.querySelectorAll(".build-stage").forEach((li, i) => {
        li.classList.toggle("is-done", i < active);
        li.classList.toggle("is-active", i === active);
      });
    };
    update();
    pipelineTimer = setInterval(update, 200);
  }
}

export function render() {
  const views = {
    dashboard: dashboardView,
    monitor: monitorView,
    simulator: simulatorView,
    knowledge: knowledgeExplorerView,
    shelf: shelfView,
  };
  // Keep keyboard focus on the same button across a re-render (background
  // updates such as GPT text or the forecast arriving must not drop focus).
  const active = document.activeElement;
  let focusSelector = null;
  if (
    active &&
    app.contains(active) &&
    (active.tagName === "BUTTON" || active.tagName === "A") &&
    active.dataset?.action
  ) {
    focusSelector = `[data-action="${CSS.escape(active.dataset.action)}"]`;
    for (const attr of ["key", "view", "profile", "concern", "value"])
      if (active.dataset[attr]) focusSelector += `[data-${attr}="${CSS.escape(active.dataset[attr])}"]`;
  }
  let fieldFocus = null;
  if (active && app.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && active.id) {
    fieldFocus = { id: active.id, start: active.selectionStart, end: active.selectionEnd };
  }
  app.innerHTML = views[state.activeView]();
  afterRender();
  if (focusSelector) app.querySelector(focusSelector)?.focus({ preventScroll: true });
  if (fieldFocus) {
    const field = document.getElementById(fieldFocus.id);
    if (field) {
      field.focus({ preventScroll: true });
      try {
        field.setSelectionRange(fieldFocus.start, fieldFocus.end);
      } catch {
        /* not a text field */
      }
    }
  }
  document.title = `DermaSynth | ${(VIEW_META[state.activeView] || VIEW_META.dashboard).title}`;
}

// ---- Motion ---------------------------------------------------------------
// State changes morph with the View Transitions API (spring timing in CSS);
// a new routine plays a one-off staggered entrance instead. Everything falls
// back to an instant render when the browser lacks the API or the user asks
// for reduced motion.
export let viewTransitionBusy = false;

export let deferredRender = null;

// Matches the desktop breakpoint in styles.css (@media (min-width: 1100px)).
export const WIDE_LAYOUT_QUERY = "(min-width: 1100px)";

export function isWideLayout() {
  try {
    return window.matchMedia(WIDE_LAYOUT_QUERY).matches;
  } catch {
    return false;
  }
}

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function renderAnimated({ entering = false } = {}) {
  if (entering) {
    state.animateEnter = true;
    state.enterUntil = Date.now() + 1100;
  }
  const finish = () => {
    render();
    state.animateEnter = false;
    state.gptJustArrived = false;
  };
  if (entering || prefersReducedMotion() || typeof document.startViewTransition !== "function" || viewTransitionBusy) {
    finish();
    return Promise.resolve();
  }
  viewTransitionBusy = true;
  const transition = document.startViewTransition(finish);
  transition.finished
    .finally(() => {
      viewTransitionBusy = false;
    })
    .catch(() => {});
  return transition.updateCallbackDone.catch(() => {});
}

// Background updates wait until a running entrance has finished, so it is not
// cut short by a re-render.
export function scheduleRender({ animated = false } = {}) {
  const wait = (state.enterUntil || 0) - Date.now();
  if (wait <= 0) return animated ? renderAnimated() : (render(), Promise.resolve());
  clearTimeout(deferredRender);
  return new Promise((resolve) => {
    deferredRender = setTimeout(() => {
      (animated ? renderAnimated() : (render(), Promise.resolve())).then(resolve);
    }, wait);
  });
}

export let toastTimer;

export function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.innerHTML = `${icon("check", 16, 2.2)} <span>${escapeHtml(message)}</span>`;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3000);
}

export function settleViewNavigation({ focus = true, scroll = true } = {}) {
  window.requestAnimationFrame(() => {
    if (scroll) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (focus) document.querySelector("#page-title")?.focus({ preventScroll: true });
  });
}

export function writeViewRoute(view, history = "push") {
  if (history === "none" || typeof window === "undefined") return;
  const hash = viewHash(view);
  if (window.location.hash === hash) return;
  if (history === "replace") window.history.replaceState(null, "", hash);
  else window.history.pushState(null, "", hash);
}

export function navigateView(
  view,
  { source = "user", history = source === "presentation" ? "replace" : "push", focus = true, scroll = true } = {},
) {
  if (!VIEW_META[view]) return;
  if (view === "simulator" && state.activeView !== view) state.skyFreshUntil = Date.now() + 1500;
  state.activeView = view;
  state.reasonOpen = false;
  state.mobileMoreOpen = false;
  writeViewRoute(view, history);
  renderAnimated().then(() => settleViewNavigation({ focus, scroll }));
  if (view === "knowledge") {
    loadKnowledgeExplorer();
  }
  if (view === "monitor" && !state.expertView) refreshWeatherOutlook();
  if (view === "shelf") {
    state.shelfEnterUntil = Date.now() + 1400;
    refreshShelfCheck();
  }
}

export function applyRoute() {
  const routeView = viewFromHash();
  if (!routeView || routeView === state.activeView) return;
  navigateView(routeView, { source: "route", history: "none", focus: true, scroll: true });
}
