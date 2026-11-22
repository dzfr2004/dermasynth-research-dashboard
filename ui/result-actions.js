// Things to do with a result: check a product, calendar reminders, saving 'my usual routine', folding
// the form and remembering the last routine.

import { previousDayRoutine } from "./daily.js";
import { locationLabel } from "./environment.js";
import { isLocationUpdating } from "./location.js";
import { currentStepKeys, productNameFor } from "./result.js";
import { concernSummary, plainStep, selectedConcerns } from "./routine.js";
import { prefersReducedMotion, renderAnimated, showToast } from "./shell.js";
import { LAST_ROUTINE_KEY, MY_ROUTINE_KEY, readStore, state, writeStore } from "./state.js";
import { escapeHtml, hourLabel, icon } from "./util.js";

// 5. Check my product.
export function productCheckExample() {
  const entries = state.routineMeta?.ingredientCandidates?.entries || [];
  const chosen = entries.find((e) => e.phase === "am" && e.categoryId !== "daytime-photoprotection") || entries[0];
  return ["Aqua", "Glycerin", chosen?.displayName, "Butylene Glycol", "Panthenol", "Phenoxyethanol"]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");
}

export function productCheckTone(r) {
  if (!r) return "neutral";
  if (r.cautions?.some((c) => c.level === "stop")) return "stop";
  if (r.conflicts?.length || r.cautions?.some((c) => c.level === "warn")) return "warn";
  if (r.fits?.length) return "good";
  return "neutral";
}

export function productCheckCard(meta) {
  if (!meta || meta.status !== "cleared") return "";
  const pc = state.productCheck || {};
  const r = pc.result;
  const tone = productCheckTone(r);
  const toneIcon = { good: "check", warn: "info", stop: "shield", neutral: "info" }[tone];
  const group = (title, items, cls = "") =>
    items.length
      ? `<div class="pc-group"><p class="pc-group-title">${escapeHtml(title)}</p><ul class="pc-list ${cls}">${items.join("")}</ul></div>`
      : "";
  const resultHtml = r
    ? `<div class="pc-result is-${tone}" aria-live="polite"><p class="pc-verdict">${icon(toneIcon, 17)} <span>${escapeHtml(r.verdict)}</span></p>${group(
        "Fits your routine",
        (r.fits || []).map((f) => `<li>${icon("check", 13)} ${escapeHtml(f.text)}</li>`),
        "is-good",
      )}${group(
        "Clashes with today's routine",
        (r.conflicts || []).map((c) => `<li>${escapeHtml(c.text)}</li>`),
        "is-warn",
      )}${group(
        "Good to know",
        (r.cautions || []).map((c) => `<li class="is-${escapeHtml(c.level)}">${escapeHtml(c.text)}</li>`),
      )}${r.recognised?.length ? `<p class="pc-found">Recognised: ${escapeHtml(r.recognised.map((x) => x.name).join(", "))}.</p>` : ""}${r.note ? `<p class="pc-note">${escapeHtml(r.note)}</p>` : ""}</div>`
    : "";
  const busy = pc.status === "loading";
  return `<section class="product-card" id="product-check" style="view-transition-name: product-card" aria-labelledby="pc-title"><div class="pc-head"><span class="pc-badge" aria-hidden="true">${icon("layers", 20)}</span><div><h3 id="pc-title">Already have a product? Check it here</h3><p class="pc-help">Paste the ingredient list from the label. DermaSynth tells you which of today's steps it can fill, and whether it clashes with anything in your routine.</p></div></div><label class="sr-only" for="pc-text">Ingredient list from the product label</label><textarea id="pc-text" data-action="pc-text" rows="4" maxlength="4000" placeholder="Ingredients: Aqua, Glycerin, Niacinamide, Sodium Hyaluronate, …">${escapeHtml(pc.text || "")}</textarea><div class="pc-actions"><button type="button" class="primary-button" data-action="pc-run" ${busy ? "disabled" : ""}>${icon("check", 15)} ${busy ? "Checking…" : "Check this product"}</button><button type="button" class="ghost-button" data-action="pc-example" ${busy ? "disabled" : ""}>Try an example</button>${r ? `<button type="button" class="text-button" data-action="pc-clear">Check another</button>` : ""}</div><p class="pc-tip">Tip: the list is usually on the back of the box or bottle, after "Ingredients".</p>${pc.status === "error" ? `<p class="pc-note">${escapeHtml(pc.error || "The check couldn't run. Try again.")}</p>` : ""}${resultHtml}</section>`;
}

export function focusProductCheck() {
  const card = document.querySelector("#product-check");
  if (!card) return;
  card.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  setTimeout(
    () => document.querySelector("#pc-text")?.focus({ preventScroll: true }),
    prefersReducedMotion() ? 0 : 450,
  );
}

export async function runProductCheck() {
  const text = state.productCheck?.text || document.querySelector("#pc-text")?.value || "";
  if (!text.trim()) {
    state.productCheck = {
      text: "",
      status: "error",
      error: "Paste the ingredient list from the label first, or press Try an example.",
    };
    renderAnimated().then(() => document.querySelector("#pc-text")?.focus({ preventScroll: true }));
    return;
  }
  state.productCheck = { ...(state.productCheck || {}), text, status: "loading", error: "" };
  renderAnimated();
  const entries = (state.routineMeta?.ingredientCandidates?.entries || []).map((e) => ({
    ingredientId: e.ingredientId,
    displayName: e.displayName,
    phase: e.phase,
    categoryId: e.categoryId,
  }));
  try {
    const response = await fetch("/api/check-product", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        routine: {
          entries,
          steps: currentStepKeys(),
          concern: state.concern,
          reactivityLevel: state.routineMeta?.routine?.generation?.reactivityLevel || state.reactivityLevel || "low",
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "The check couldn't run.");
    state.productCheck = { text, status: "done", result: data };
  } catch (error) {
    state.productCheck = {
      text,
      status: "error",
      error: error instanceof Error ? error.message : "The check couldn't run.",
    };
  }
  renderAnimated();
}

// 8. Reminders as a calendar file.
export function icsDate(localIso) {
  // "2026-09-24T13:00" -> 20260924T130000 (floating local time)
  return String(localIso).replace(/[-:]/g, "").slice(0, 13).padEnd(13, "0") + "00";
}

export function localIsoNow(offsetDays = 0, hour = null) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour ?? d.getHours())}:${hour === null ? pad(d.getMinutes()) : "00"}`;
}

export function icsEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function downloadReminders() {
  const routine = state.generatedRoutine;
  const meta = state.routineMeta;
  if (!routine || !meta) return;
  const names = (phase) =>
    (routine[phase] || [])
      .map((step, i) => {
        const entry = (meta.ingredientCandidates?.entries || []).find(
          (e) => e.categoryId === step.id && e.phase === phase,
        );
        return `${i + 1}. ${plainStep(step).name}${entry ? ` (look for ${entry.displayName})` : ""}${productNameFor(`${phase}:${step.id}`) ? ` - ${productNameFor(`${phase}:${step.id}`)}` : ""}`;
      })
      .join("\n");
  const events = [];
  const win = state.outlook?.data?.today?.window;
  const now = localIsoNow();
  const placeNow = state.outlook?.data?.today?.now || now;
  if (
    win?.peak?.time &&
    !win.passed &&
    win.peak.time > placeNow &&
    (routine.am || []).some((s) => s.id === "daytime-photoprotection")
  ) {
    events.push({
      start: win.peak.time,
      minutes: 15,
      title: "Top up sunscreen",
      body: `UV peaks around ${hourLabel(win.peak.time)} (about ${Math.round(win.peak.uvi)}). If you're outside, top up your sunscreen.`,
    });
  }
  const evening = localIsoNow(0, 21);
  if (evening > now) events.push({ start: evening, minutes: 15, title: "Evening skincare routine", body: names("pm") });
  const tomorrow = state.outlook?.data?.tomorrow;
  events.push({
    start: localIsoNow(1, 7),
    minutes: 15,
    title: "Morning skincare routine",
    body: `${tomorrow?.summary || ""}\n${
      (tomorrow?.changes || [])
        .filter((c) => c.change !== "kept")
        .map((c) => `- ${c.text}`)
        .join("\n") || "Same routine as today."
    }\nOpen DermaSynth for today's routine.`.trim(),
  });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DermaSynth//Routine reminders//EN", "CALSCALE:GREGORIAN"];
  events.forEach((event, i) => {
    const endDate = new Date(`${event.start}:00`);
    endDate.setMinutes(endDate.getMinutes() + event.minutes);
    const pad = (n) => String(n).padStart(2, "0");
    const end = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:dermasynth-${Date.now()}-${i}@local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(event.start)}`,
      `DTEND:${end}`,
      `SUMMARY:${icsEscape(event.title)}`,
      `DESCRIPTION:${icsEscape(event.body)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(event.title)}`,
      "TRIGGER:PT0M",
      "END:VALARM",
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  // RFC 5545: fold lines longer than 75 characters.
  const folded = lines.flatMap((line) => {
    const out = [];
    let rest = line;
    while (rest.length > 74) {
      out.push(out.length ? ` ${rest.slice(0, 73)}` : rest.slice(0, 74));
      rest = rest.slice(out.length === 1 ? 74 : 73);
    }
    out.push(out.length ? ` ${rest}` : rest);
    return out;
  });
  const blob = new Blob([folded.join("\r\n")], { type: "text/calendar" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "dermasynth-reminders.ics";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  showToast(
    `${events.length} reminder${events.length === 1 ? "" : "s"} saved. Open the file to add ${events.length === 1 ? "it" : "them"} to your calendar.`,
  );
}

// 6. Saving "my routine" and the product names the user owns.
export function saveMyRoutine() {
  const steps = currentStepKeys();
  if (!steps.length) return;
  const products = {};
  for (const key of steps) if (state.myRoutine?.products?.[key]) products[key] = state.myRoutine.products[key];
  state.myRoutine = {
    steps,
    products,
    savedAt: new Date().toISOString(),
    profile: state.profile,
    concern: state.concern,
    concerns: selectedConcerns(),
  };
  writeStore(MY_ROUTINE_KEY, state.myRoutine);
  state.editingProducts = true;
  renderAnimated();
  showToast("Saved as your usual routine. Add the products you use, if you like.");
}

export function clearMyRoutine() {
  state.myRoutine = null;
  state.editingProducts = false;
  try {
    window.localStorage.removeItem(MY_ROUTINE_KEY);
  } catch {
    /* storage unavailable */
  }
  renderAnimated();
  showToast("Your usual routine was forgotten.");
}

export function productInput(key, label) {
  if (!state.editingProducts || !state.myRoutine?.steps?.includes(key)) return "";
  const id = `my-product-${key.replace(":", "-")}`;
  return `<label class="my-product-field" for="${escapeHtml(id)}"><span>Your product for this step (optional)</span><input id="${escapeHtml(id)}" type="text" maxlength="60" autocomplete="off" data-action="my-product" data-key="${escapeHtml(key)}" value="${escapeHtml(productNameFor(key))}" placeholder="e.g. the brand and name of your ${escapeHtml(label.toLowerCase())}" /></label>`;
}

// 2. After a routine, the form folds into a one-line summary.
export function collapsedFormPanel() {
  const profileWord = state.profile[0].toUpperCase() + state.profile.slice(1);
  return `<section class="panel form-panel is-collapsed" id="routine-preview"><div class="collapsed-form"><div><p class="collapsed-form-label">About your skin</p><p class="collapsed-form-value">${escapeHtml(profileWord)} skin · ${escapeHtml(concernSummary())} · ${escapeHtml(locationLabel())}</p></div><div class="collapsed-form-actions"><button type="button" class="ghost-button" data-action="edit-form">${icon("sliders", 14)} Edit my skin details</button><button type="button" class="text-button" data-action="simulate" ${state.runStatus === "running" || isLocationUpdating() ? "disabled" : ""}>${icon("refresh", 13)} Rebuild</button></div></div></section>`;
}

export function scrollToResult() {
  const target = document.querySelector("#routine-result");
  if (!target) return;
  if (window.matchMedia("(min-width: 901px)").matches) {
    // Desktop: the form folds up after a run, so a page scrolled down to the
    // button would leave the summary under the top bar. Bring the page back
    // to the top whenever the start of the result is hidden or far down.
    const header = document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
    const top = target.getBoundingClientRect().top;
    if (top < header + 8 || top > window.innerHeight * 0.5)
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    return;
  }
  const top = target.getBoundingClientRect().top;
  if (top >= 0 && top < window.innerHeight * 0.35) return;
  target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

// Previous routine (for "changed since last time" and the next-day check-in).
export function previousRoutineForCompare() {
  const day = previousDayRoutine();
  if (day) return { steps: day.steps, readings: day.readings, at: day.at };
  const last = readStore(LAST_ROUTINE_KEY, null);
  if (
    !last?.steps?.length ||
    last.profile !== state.profile ||
    last.concern !== state.concern ||
    (last.concerns || [last.concern]).join("+") !== selectedConcerns().join("+")
  )
    return null;
  const at = new Date(last.at);
  if (Number.isNaN(at.getTime())) return null;
  const sameDay = at.toDateString() === new Date().toDateString();
  if (sameDay && Date.now() - at.getTime() < 3 * 36e5) return null;
  return last;
}

export function rememberRoutine(payload) {
  if (!payload?.routine || payload.status === "medical_redirect" || payload.status === "needs_conditions") return;
  const last = readStore(LAST_ROUTINE_KEY, null);
  if (last?.at && new Date(last.at).toDateString() !== new Date().toDateString() && last.status === "cleared") {
    state.previousForCheckin = { at: last.at };
  }
  const r = payload.environment?.readings || {};
  writeStore(LAST_ROUTINE_KEY, {
    steps: currentStepKeys(payload.routine),
    readings: {
      uvi: r.uvi ?? null,
      uviMaxToday: r.uviMaxToday ?? null,
      humidity: r.humidity ?? null,
      pm25: r.pm25 ?? null,
      temperature: r.temperature ?? null,
    },
    at: new Date().toISOString(),
    profile: state.profile,
    concern: state.concern,
    concerns: selectedConcerns(),
    status: payload.status,
  });
}
