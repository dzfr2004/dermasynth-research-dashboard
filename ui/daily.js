// Day to day: what changed since yesterday, the daily checklist and the streak.

import { currentStepKeys } from "./result.js";
import { plainStep, selectedConcerns } from "./routine.js";
import { readStore, state, writeStore } from "./state.js";
import { escapeHtml, icon } from "./util.js";

// ---- What changed today, and the daily checklist ---------------------------
export const DAYS_KEY = "dermasynth.routine-days.v1";

export const DONE_KEY = "dermasynth.done.v1";

export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function profileSignature() {
  return `${state.profile}|${selectedConcerns().join("+")}`;
}

export function routineIngredientMap(payload) {
  const out = {};
  for (const e of payload?.ingredientCandidates?.entries || []) out[`${e.phase}:${e.categoryId}`] = e.displayName;
  return out;
}

export function previousDayRoutine() {
  const days = readStore(DAYS_KEY, {});
  const today = dayKey();
  const sig = profileSignature();
  const keys = Object.keys(days)
    .filter((k) => k < today && days[k]?.sig === sig && Array.isArray(days[k]?.steps))
    .sort();
  const key = keys[keys.length - 1];
  return key ? { ...days[key], date: key } : null;
}

export function rememberRoutineDay(payload) {
  if (!payload?.routine || payload.status !== "cleared") return;
  const days = readStore(DAYS_KEY, {});
  const r = payload.environment?.readings || {};
  days[dayKey()] = {
    sig: profileSignature(),
    at: new Date().toISOString(),
    steps: currentStepKeys(payload.routine),
    ingredients: routineIngredientMap(payload),
    readings: {
      uvi: r.uvi ?? null,
      uviMaxToday: r.uviMaxToday ?? null,
      humidity: r.humidity ?? null,
      pm25: r.pm25 ?? null,
      temperature: r.temperature ?? null,
    },
  };
  const keep = Object.keys(days).sort().slice(-10);
  writeStore(DAYS_KEY, Object.fromEntries(keep.map((k) => [k, days[k]])));
}

export function computeChangeInfo(base, payload) {
  if (!base || !payload?.routine) return null;
  const keys = currentStepKeys(payload.routine);
  const today = routineIngredientMap(payload);
  const before = new Set(base.steps || []);
  const added = keys.filter((k) => !before.has(k));
  const swapped = {};
  for (const k of keys) {
    const was = base.ingredients?.[k];
    if (before.has(k) && was && today[k] && was !== today[k]) {
      const entry = (payload.ingredientCandidates?.entries || []).find((e) => `${e.phase}:${e.categoryId}` === k);
      const equal = (entry?.alternatives || []).some((alt) => alt.displayName === was);
      swapped[k] = { from: was, to: today[k], why: equal ? "equal" : "conditions" };
    }
  }
  return { date: base.date, at: base.at, added, swapped };
}

export function stepLabel(key) {
  const [phase, id] = key.split(":");
  const step = [...(state.generatedRoutine?.[phase] || [])].find((s) => s.id === id);
  return `${phase === "am" ? "Morning" : "Evening"} ${step ? plainStep(step).name.toLowerCase() : "step"}`;
}

export function changeSwapsBlock() {
  const swaps = Object.entries(state.changeInfo?.swapped || {});
  if (!swaps.length) return "";
  const reason = (s) =>
    s.why === "equal"
      ? ` Both are equally good for this step, so DermaSynth takes turns between them.`
      : ` It fits today's skin details and conditions better.`;
  return `<p class="compare-title">Ingredient swaps</p><ul class="tomorrow-changes">${swaps.map(([key, s]) => `<li class="is-changed">${escapeHtml(stepLabel(key))}: <b>${escapeHtml(s.to)}</b> instead of ${escapeHtml(s.from)}.${escapeHtml(reason(s))}</li>`).join("")}</ul>`;
}

// Daily checklist: tick each step as you do it; a day counts towards the
// streak when the whole morning or the whole evening routine is ticked.
export function doneStore() {
  return readStore(DONE_KEY, {});
}

export function doneDay(store = doneStore(), key = dayKey()) {
  return store[key] || { done: {}, totals: {} };
}

export function dayComplete(day) {
  return ["am", "pm"].some(
    (ph) =>
      (day?.totals?.[ph] || 0) > 0 &&
      Object.keys(day.done || {}).filter((k) => k.startsWith(`${ph}:`)).length >= day.totals[ph],
  );
}

export function streakCount() {
  const store = doneStore();
  const d = new Date();
  if (!dayComplete(doneDay(store, dayKey(d)))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (n < 400 && dayComplete(doneDay(store, dayKey(d)))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function isStepDone(key) {
  return Boolean(doneDay().done?.[key]);
}

export function phaseProgress(phase) {
  const keys = currentStepKeys().filter((k) => k.startsWith(`${phase}:`));
  const day = doneDay();
  return { done: keys.filter((k) => day.done?.[k]).length, total: keys.length };
}

export function toggleStepDone(key) {
  const store = doneStore();
  const today = dayKey();
  const day = doneDay(store, today);
  const keys = currentStepKeys();
  day.done = { ...(day.done || {}) };
  day.totals = {
    am: keys.filter((k) => k.startsWith("am:")).length,
    pm: keys.filter((k) => k.startsWith("pm:")).length,
  };
  if (day.done[key]) delete day.done[key];
  else day.done[key] = true;
  // Ticks for steps no longer in today's routine don't count.
  for (const k of Object.keys(day.done)) if (!keys.includes(k)) delete day.done[k];
  store[today] = day;
  const keep = Object.keys(store).sort().slice(-90);
  writeStore(DONE_KEY, Object.fromEntries(keep.map((k) => [k, store[k]])));
  const phase = key.slice(0, 2);
  const complete = Boolean(day.done[key]) && keys.filter((k) => k.startsWith(`${phase}:`)).every((k) => day.done[k]);
  return { nowDone: Boolean(day.done[key]), completedPhase: complete ? phase : null };
}

export function phaseHeading(phase, title, iconName, enabled) {
  if (!enabled) return `<h4 id="${phase}-title">${icon(iconName, 16)} ${title}</h4>`;
  const p = phaseProgress(phase);
  const all = p.total && p.done === p.total;
  return `<h4 id="${phase}-title" class="phase-head ${all ? "is-complete" : ""} ${state.phaseCelebrate === phase ? "is-celebrating" : ""}">${icon(iconName, 16)} ${title}<span class="phase-progress" aria-label="${p.done} of ${p.total} steps done"><span class="phase-bar"><span style="width: ${p.total ? Math.round((p.done / p.total) * 100) : 0}%"></span></span>${all ? `${icon("check", 13, 2.4)} Done` : `${p.done}/${p.total}`}</span></h4>`;
}

export function streakChip() {
  const n = streakCount();
  if (!n) return `<span class="streak-chip is-empty">${icon("droplet", 13)} Tick your steps to start a streak</span>`;
  return `<span class="streak-chip ${state.streakBumped ? "is-bumped" : ""}">${icon("droplet", 13)} ${n}-day streak</span>`;
}
