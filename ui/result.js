// The result screen: the routine card, steps with 'Why this?', the build progress, the ready and error
// states and the safety seal.

import { changeSwapsBlock, isStepDone, phaseHeading, streakChip } from "./daily.js";
import { locationLabel, planningUv } from "./environment.js";
import { approvedIngredientCandidatePanel, safeEvidenceUrl } from "./expert.js";
import { productCheckCard, productInput } from "./result-actions.js";
import { concernSummary, isQuotaFallback, plainStep, routineStatusLabel, routineStepList } from "./routine.js";
import { shelfDisplayName, shelfStepFor, shelfTodayCard } from "./shelf.js";
import { renderAnimated, showToast } from "./shell.js";
import { CHECKIN_KEY, readStore, state, writeStore } from "./state.js";
import { conditionsCard } from "./today.js";
import { escapeHtml, icon, plainMessage, relativeDay, sameText, shortPublisher } from "./util.js";
import { sunscreenTiming, todayStrip, tomorrowCard } from "./weather.js";
import { resultSwitch, weekCard } from "./week.js";

export function degradedBanner(meta) {
  const reasons = meta?.degraded?.status === "degraded" ? meta.degraded.reasons || [] : [];
  if (!reasons.length) return "";
  return `<div class="degraded-banner" role="status">${icon("info", 14)}<div><strong>${state.expertView ? "Reduced mode for this run" : "Some parts are simpler today"}</strong><ul>${reasons.map((reason) => `<li>${escapeHtml(reason.text)}</li>`).join("")}</ul></div></div>`;
}

export function consumerWhy(entry, stepLine = "") {
  const gpt = state.routineContext?.ingredients?.[`${entry.phase}:${entry.categoryId}`] || null;
  const rule = entry.explanation?.consumer || {};
  const useGpt = Boolean(gpt?.whatItIs && gpt?.whyToday);
  const fields = useGpt
    ? { whatItIs: gpt.whatItIs, whyToday: gpt.whyToday }
    : { whatItIs: rule.whatItIs, whyToday: rule.whyToday };
  const labels = rule.labels || { names: [entry.displayName], note: null };
  const references = Array.isArray(rule.references) ? rule.references : [];
  const rows = [
    ["What it is", escapeHtml(fields.whatItIs || "")],
    ["Why today", sameText(fields.whyToday, stepLine) ? "" : escapeHtml(fields.whyToday || "")],
    [
      "On labels",
      escapeHtml(
        `Look for ${labels.names.map((name) => `“${name}”`).join(" or ")} in the ingredient list.${labels.note ? ` ${labels.note}` : ""}`,
      ),
    ],
    [
      "References",
      references.length
        ? `<ol class="reference-list">${references
            .map((ref) => {
              const url = safeEvidenceUrl(ref.url);
              return `<li><span class="reference-type">${escapeHtml(ref.studyType)}</span> <span class="reference-where">${escapeHtml(shortPublisher(ref.publisher))}${ref.year ? `, ${escapeHtml(String(ref.year))}` : ""}</span>${url ? ` · <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open<span class="sr-only"> ${escapeHtml(ref.studyType)} (opens in a new tab)</span></a>` : ""}<details class="reference-more"><summary>Full citation</summary><p>${escapeHtml(ref.title)}. <i>${escapeHtml(ref.publisher || "")}</i>${ref.year ? ` ${escapeHtml(String(ref.year))}` : ""}.${ref.doi ? ` doi:${escapeHtml(ref.doi)}` : ref.pmid ? ` PMID: ${escapeHtml(ref.pmid)}` : ""}</p></details></li>`;
            })
            .join("")}</ol>`
        : "",
    ],
  ].filter(([, html]) => html);
  const loading = !useGpt && state.routineContext?.status === "loading";
  return `<dl class="why-grid ${useGpt ? "is-gpt" : ""} ${useGpt && state.gptJustArrived ? "is-arriving" : ""}">${rows.map(([label, html]) => `<div class="why-row"><dt>${escapeHtml(label)}</dt><dd>${html}</dd></div>`).join("")}</dl><p class="why-foot">${useGpt ? `${icon("sparkles", 12)} Written by AI from DermaSynth's checked facts, then checked again against them.` : loading ? `${icon("sparkles", 12)} <span class="shimmer-text">Writing a friendlier version…</span>` : ""}</p>`;
}

export function consumerStepItem(step, phase, entries, meta) {
  const key = `${phase}:${step.id}`;
  const plain = plainStep(step);
  const entry = entries.find((item) => item.categoryId === step.id && item.phase === phase) || null;
  const gptStep = state.routineContext?.steps?.[key]?.text || "";
  const serverPlain =
    (state.routineMeta?.explanation?.steps || []).find((item) => item.phase === phase && item.categoryId === step.id)
      ?.plain || "";
  const line = gptStep || serverPlain || consumerStepLine(step, phase, meta) || plain.what;
  const timing = step.id === "daytime-photoprotection" ? sunscreenTiming() : "";
  const open = Boolean(state.openWhy?.[key]);
  const panelId = `why-${phase}-${step.id}`;
  const stepIndex = (state.stepCounter = (state.stepCounter || 0) + 1);
  const fromShelf = state.editingProducts ? null : shelfStepFor(key);
  const mine = state.editingProducts || fromShelf ? "" : productNameFor(key);
  const checklist = meta?.status === "cleared";
  const done = checklist && isStepDone(key);
  const isNew = Boolean(state.changeInfo?.added?.includes(key));
  const swap = state.changeInfo?.swapped?.[key] || null;
  const tags = `${isNew ? `<span class="change-tag is-new">New today</span>` : ""}${swap ? `<span class="change-tag">Changed</span>` : ""}`;
  const tick = checklist
    ? `<button type="button" class="step-tick ${done ? "is-done" : ""} ${state.justTicked === key ? "is-popping" : ""}" data-action="step-done" data-key="${escapeHtml(key)}" aria-pressed="${done}" aria-label="${escapeHtml(`${done ? "Done" : "Mark done"}: ${plain.name}`)}"><span class="step-tick-dot">${done ? icon("check", 14, 2.6) : ""}</span></button>`
    : "";
  return `<li class="consumer-step ${checklist ? "has-check" : ""} ${done ? "is-done" : ""} ${isNew || swap ? "is-changed" : ""}" style="view-transition-name: step-${escapeHtml(phase)}-${escapeHtml(step.id)}; --i: ${stepIndex}" data-n="${stepIndex}"><div class="consumer-step-main"><strong>${escapeHtml(plain.name)}${tags}</strong>${entry ? `<span class="consumer-ingredient">Look for: <b>${escapeHtml(entry.displayName)}</b>${swap ? ` <span class="swap-was">(was ${escapeHtml(swap.from)})</span>` : ""}</span>` : ""}${fromShelf?.product ? `<button type="button" class="my-product is-shelf" data-action="shelf-show" data-id="${escapeHtml(fromShelf.product.id)}">${icon("bottle", 13)}<span>From your shelf: <b>${escapeHtml(shelfDisplayName(fromShelf.product))}</b></span></button>` : ""}${mine ? `<span class="my-product">Your product: <b>${escapeHtml(mine)}</b></span>` : ""}<p class="step-line ${gptStep ? "is-gpt" : ""} ${gptStep && state.gptJustArrived ? "is-arriving" : ""}">${escapeHtml(line)}</p>${timing ? `<p class="step-timing is-key">${icon("sun", 14)} <span>${escapeHtml(timing)}</span></p>` : ""}${productInput(key, plain.name)}</div>${tick}${entry ? `<button type="button" class="why-button" data-action="toggle-why" data-key="${escapeHtml(key)}" aria-expanded="${open}" aria-controls="${escapeHtml(panelId)}">${open ? "Hide" : `${icon("sparkles", 13)} Why this?`}<span class="sr-only"> ${escapeHtml(entry.displayName)} for ${escapeHtml(plain.name)}</span></button><div class="consumer-why ${state.whyJustOpened === key ? "is-opening" : ""}" id="${escapeHtml(panelId)}" ${open ? "" : "hidden"}>${open ? consumerWhy(entry, line) : ""}</div>` : ""}</li>`;
}

export function currentStepKeys(routine = state.generatedRoutine) {
  return [...(routine?.am || []).map((s) => `am:${s.id}`), ...(routine?.pm || []).map((s) => `pm:${s.id}`)];
}

export function todayOneLine(meta, routine) {
  const readings = meta?.environment?.readings || {};
  const steps = new Set(currentStepKeys(routine).map((k) => k.split(":")[1]));
  const parts = [];
  const uv = planningUv(readings);
  const peakTime = state.outlook?.data?.today?.window?.peak?.time;
  const hour = (time) => {
    const h = Number(String(time || "").slice(11, 13));
    return Number.isFinite(h) ? (h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`) : "";
  };
  if (steps.has("daytime-photoprotection")) {
    const when = peakTime ? ` around ${hour(peakTime)}` : "";
    parts.push(
      uv !== null && uv >= 6
        ? `sunscreen is a must (UV ${Math.round(uv)}${when})`
        : `wear sunscreen when you go out (UV up to ${uv === null ? "?" : Math.round(uv)})`,
    );
  } else if (uv !== null) {
    parts.push(`UV stays low today (up to ${Math.round(uv)})`);
  }
  if (steps.has("antioxidant-context")) parts.push("add an antioxidant (hazy air)");
  const guarded = [...(routine?.am || []), ...(routine?.pm || [])].some((s) =>
    (s.ruleIds || []).includes("low-irritation-barrier-guardrail"),
  );
  const direction = routine?.generation?.textureVote?.direction;
  if (guarded) parts.push("keep everything extra gentle");
  else if (direction === "lighter") parts.push("keep your moisturiser light");
  else if (direction === "richer") parts.push("use your richer moisturiser");
  if (parts.length < 3 && steps.has("texture-renewal")) parts.push("exfoliate tonight only");
  if (!parts.length) return "";
  const text = parts.join(" · ");
  return text[0].toUpperCase() + text.slice(1) + ".";
}

// Round 1 of the user study: 6 of 10 people needed a hint to find where to
// report a skin problem, so the entry point is shown on the result itself.
export function skinProblemPrompt() {
  return `<section class="skin-problem-prompt" aria-label="Report a skin problem"><p>${icon("shield", 15)} <span>Skin reacting badly today, such as swelling, burning or a rash?</span></p><button type="button" class="text-button" data-action="redirect-edit">Tell us first</button></section>`;
}

// 6 and 7. Compared with your usual routine / since your last routine.
export function compareCard(meta) {
  const cmp = meta?.compare;
  const my = state.myRoutine;
  const blocks = [];
  if (cmp?.vsUsual && my?.steps?.length) {
    blocks.push(
      cmp.vsUsual.sameAsUsual
        ? `<p class="compare-same">${icon("check", 14)} Same as your usual routine today.</p>`
        : `<p class="compare-title">Today's changes to your usual routine</p><ul class="tomorrow-changes">${cmp.vsUsual.changes.map((c) => `<li class="is-${escapeHtml(c.change)}">${escapeHtml(c.text)}</li>`).join("")}</ul>`,
    );
  }
  if (
    cmp?.vsPrevious &&
    !(
      cmp.vsPrevious.same &&
      !cmp.vsPrevious.readingChanges?.length &&
      !Object.keys(state.changeInfo?.swapped || {}).length
    )
  ) {
    const when = cmp.vsPrevious.at ? relativeDay(cmp.vsPrevious.at) : "last time";
    const readings = cmp.vsPrevious.readingChanges?.length
      ? `<p class="compare-readings">${escapeHtml(cmp.vsPrevious.readingChanges.join(" · "))}.</p>`
      : "";
    const swaps = changeSwapsBlock();
    blocks.push(
      `<p class="compare-title">${icon("refresh", 14)} What changed since ${escapeHtml(when)}</p>${readings}${cmp.vsPrevious.same ? (swaps ? "" : `<p class="compare-same">${icon("check", 14)} The steps are the same as ${escapeHtml(when)}.</p>`) : `<ul class="tomorrow-changes">${cmp.vsPrevious.changes.map((c) => `<li class="is-${escapeHtml(c.change)}">${escapeHtml(c.text)}</li>`).join("")}</ul>`}${swaps}`,
    );
  }
  if (!blocks.length) return "";
  return `<section class="compare-card" style="view-transition-name: compare-card" aria-label="What changed">${blocks.join("")}</section>`;
}

export function myRoutineControls() {
  const my = state.myRoutine;
  const saved = my?.steps?.length;
  const same = saved && currentStepKeys().join(",") === my.steps.join(",");
  if (state.editingProducts && saved)
    return `<div class="my-routine-bar is-editing"><span>Type the product you use for each step (optional). It stays in this browser.</span><button type="button" class="pill-button is-selected" data-action="products-done">${icon("check", 13)} Done</button></div>`;
  const primaryLabel =
    saved && !same ? "Make this my usual routine" : saved ? "Edit my products" : "Save as my usual routine";
  const note = saved
    ? `${icon("check", 13)} Your usual routine is saved${same ? " (this one)" : ""}.`
    : "Save it and tomorrow you'll only see what changes.";
  const open = Boolean(state.openToggles?.more);
  return `<div class="result-actions"><button type="button" class="share-card" data-action="story-open"><span class="share-thumb" aria-hidden="true"><span class="share-thumb-line"></span><span class="share-thumb-line is-short"></span><span class="share-thumb-sheet"></span></span><span class="share-copy"><strong>Share today's skin plan</strong><small>A story image of today's sky and your steps, ready for Instagram or WhatsApp</small></span><span class="share-go" aria-hidden="true">${icon("share", 20)}</span></button><div class="result-actions-row"><button type="button" class="primary-button" data-action="save-my-routine">${icon(saved && same ? "sliders" : "check", 15)} ${primaryLabel}</button><details class="more-actions" data-toggle-key="more" ${open ? "open" : ""}><summary class="ghost-button">More<span class="sr-only"> actions</span> ${icon("arrow", 13)}</summary><div class="more-menu"><button type="button" class="menu-item" data-action="reminders">${icon("bell", 15)} Add reminders to my calendar</button><button type="button" class="menu-item" data-action="pc-focus">${icon("layers", 15)} Check a product I own</button>${saved ? `<button type="button" class="menu-item" data-action="clear-my-routine">${icon("close", 15)} Forget my usual routine</button>` : ""}</div></details></div><p class="result-actions-note">${note}</p></div>`;
}

export function productNameFor(key) {
  return state.myRoutine?.products?.[key] || "";
}

// 9. One-tap check-in.
export function checkinCard(meta) {
  if (!meta || meta.status !== "cleared") return "";
  const store = readStore(CHECKIN_KEY, {});
  const runId = meta.routineContext?.runId || meta.requestId || "";
  const askYesterday = state.previousForCheckin && !store[`y:${state.previousForCheckin.at}`];
  const done = store[runId];
  // Only ask about a routine the user has had time to try (the previous day's).
  if (!askYesterday && !state.checkinThanks) return "";
  if (!askYesterday || done)
    return `<section class="checkin-card is-done" aria-live="polite"><p>${icon("check", 14)} Thanks. Your check-in helps test DermaSynth.</p></section>`;
  const about = askYesterday ? "yesterday" : "today";
  const title = askYesterday
    ? `How did your skin feel after your routine ${escapeHtml(relativeDay(state.previousForCheckin.at))}?`
    : "How does your skin feel with today's routine?";
  const chosen = state.checkinDraft?.about === about ? state.checkinDraft : {};
  return `<section class="checkin-card" aria-labelledby="checkin-title"><p class="checkin-title" id="checkin-title">${title}</p><div class="checkin-options" role="group" aria-label="How your skin felt">${[
    ["good", "🙂", "Good"],
    ["ok", "😐", "Okay"],
    ["bad", "🙁", "Not good"],
  ]
    .map(
      ([value, face, label]) =>
        `<button type="button" class="checkin-face ${chosen.rating === value ? "is-selected" : ""}" data-action="checkin" data-about="${about}" data-value="${value}" aria-pressed="${chosen.rating === value}"><span aria-hidden="true">${face}</span>${label}</button>`,
    )
    .join("")}</div>${
    chosen.rating
      ? `<div class="checkin-follow" role="group" aria-label="Did you follow the routine"><span>Did you follow it?</span>${[
          ["yes", "Yes"],
          ["partly", "Partly"],
          ["no", "No"],
        ]
          .map(
            ([value, label]) =>
              `<button type="button" class="pill-button ${chosen.followed === value ? "is-selected" : ""}" data-action="checkin-follow" data-about="${about}" data-value="${value}" aria-pressed="${chosen.followed === value}">${label}</button>`,
          )
          .join("")}</div>`
      : ""
  }<p class="checkin-note">Anonymous: only your answer, skin type and concern are sent.</p></section>`;
}

export async function sendCheckin(about) {
  const draft = state.checkinDraft;
  if (!draft?.rating) return;
  const meta = state.routineMeta;
  const runId = meta?.routineContext?.runId || meta?.requestId || "";
  try {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId,
        about,
        rating: draft.rating,
        followed: draft.followed || null,
        profile: state.profile,
        concern: state.concern,
      }),
    });
  } catch {
    /* offline: still thank the user */
  }
  const store = readStore(CHECKIN_KEY, {});
  if (about === "yesterday" && state.previousForCheckin) store[`y:${state.previousForCheckin.at}`] = draft.rating;
  else store[runId] = draft.rating;
  writeStore(CHECKIN_KEY, store);
  state.checkinDraft = null;
  if (about === "yesterday") state.previousForCheckin = null;
  state.checkinThanks = true;
  renderAnimated();
  showToast("Thanks for checking in.");
}

export const BUILD_STAGES = [
  ["Checking your skin notes", "Anything that needs a doctor stops here"],
  ["Reading today's weather", "UV, haze, humidity and heat"],
  ["Searching the ingredient library", "Up to four safe options for each step"],
  ["Choosing one per step", "The AI picks only from that shortlist"],
  ["Running the safety checks", "Clashes, sun-sensitising actives, your skin details"],
];

export const STAGE_MS = 900;

export function buildPipeline(slow) {
  return `<ol class="build-stages" aria-label="What DermaSynth is doing">${BUILD_STAGES.map(([title, detail], i) => `<li class="build-stage" data-build-stage="${i}"><span class="build-stage-dot" aria-hidden="true"><svg class="build-stage-spin" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="10.5" fill="none" stroke-width="2.4"/><path d="M13 2.5a10.5 10.5 0 0 1 10.5 10.5" fill="none" stroke-width="2.4" stroke-linecap="round"/></svg><svg class="build-stage-tick" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="12"/><path d="m8 13.4 3.3 3.3 6.6-6.9" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></li>`).join("")}</ol>${slow ? "" : ""}`;
}

export function safetySeal() {
  return `<div class="safety-seal"><svg class="safety-seal-mark" width="42" height="42" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3.5 33 8.4v9.4c0 8.2-5.4 15.2-13 18.2-7.6-3-13-10-13-18.2V8.4L20 3.5Z" class="seal-fill"/><path d="M20 6.6 30.2 10.4v7.4c0 6.5-4.2 12.2-10.2 14.8-6-2.6-10.2-8.3-10.2-14.8v-7.4L20 6.6Z" class="seal-line"/><path d="m14.6 19.6 3.8 3.8 7.2-7.6" class="seal-tick"/></svg><div><strong>Safety checks passed</strong><span>Every step and ingredient was checked against DermaSynth's safety rules before you saw it.</span></div></div>`;
}

export function consumerResult(routine, meta, running) {
  if (running) {
    const slow = state.runSlow;
    return `<section class="consumer-card is-loading build-card" aria-live="polite" aria-busy="true"><h3>${slow ? "This is taking longer than usual" : "Building your routine…"}</h3>${slow ? `<p>The AI is still choosing and checking. You can keep waiting, or see the standard routine now: it uses the same safety checks and rules, without the AI's choices.</p>` : ""}${buildPipeline(slow)}${slow ? `<div class="form-actions"><button class="primary-button" type="button" data-action="standard-routine">Show the standard routine now</button><span class="consumer-wait shimmer-text">Still waiting for the AI…</span></div>` : ""}</section>`;
  }
  if (!meta) {
    return `<section class="consumer-card is-ready" aria-live="polite"><h3>Your routine will appear here</h3><p>Choose your skin type and main concern, answer the skin question, then press <b>Build routine</b>.</p><ul class="ready-list"><li>${icon("sun", 15)} A morning and evening routine for today's weather</li><li>${icon("sparkles", 15)} The ingredient to look for in each step, and why</li><li>${icon("layers", 15)} A check for products you already own</li></ul>${readyPreview()}</section>`;
  }
  if (meta.mode === "local") {
    const busy = meta.errorKind === "busy";
    return `<section class="consumer-card is-error" role="alert"><h3>${busy ? "Too many requests just now" : "We couldn't build your routine"}</h3><p>${busy ? "Please wait a minute, then try again." : "DermaSynth couldn't be reached. Check your connection and try again. No routine is shown, because the safety checks could not run."}</p><button class="primary-button" type="button" data-action="simulate">Try again</button></section>`;
  }
  const entries = Array.isArray(meta?.ingredientCandidates?.entries) ? meta.ingredientCandidates.entries : [];
  const removed = Array.isArray(meta?.ingredientCandidates?.removedBySafety)
    ? meta.ingredientCandidates.removedBySafety
    : [];
  const contextStatus = state.routineContext?.status;
  const contextNote =
    contextStatus === "loading"
      ? `<p class="consumer-status" aria-live="polite">${icon("sparkles", 13)} ${state.routineContext.slow ? "Friendlier explanations are taking a while. The standard reasons are shown meanwhile, and nothing else is waiting on them." : "Writing friendlier explanations…"}</p>`
      : contextStatus === "error"
        ? `<p class="consumer-status">${icon("info", 13)} ${escapeHtml(plainMessage(state.routineContext.error))}</p>`
        : "";
  const profileWord = state.profile[0].toUpperCase() + state.profile.slice(1);
  const reviewNote =
    meta.status === "cleared"
      ? ""
      : `<p class="consumer-status is-warn" role="status">${icon("info", 13)} Some checks asked for review, so treat this routine with extra care.</p>`;
  state.stepCounter = 0;
  const heroHtml = meta.status === "cleared" ? skinProblemPrompt() : "";
  const topSide = `${todayStrip(meta)}${compareCard(meta)}`;
  const routineHtml = `<section class="consumer-card" style="view-transition-name: routine-card" aria-labelledby="consumer-routine-title"><div class="consumer-head"><h3 id="consumer-routine-title">Your routine for today</h3>${meta.status === "cleared" ? streakChip() : ""}<p>${escapeHtml(profileWord)} skin · ${escapeHtml(concernSummary())}</p></div>${meta.status === "cleared" ? safetySeal() : ""}${degradedBanner(meta)}${reviewNote}${contextNote}<div class="consumer-phases"><section class="phase is-am" aria-labelledby="am-title">${phaseHeading("am", "Morning", "sun", meta.status === "cleared")}<ol class="consumer-steps">${routine.am.map((step) => consumerStepItem(step, "am", entries, meta)).join("")}</ol></section><section class="phase is-pm" aria-labelledby="pm-title">${phaseHeading("pm", "Evening", "sparkles", meta.status === "cleared")}<ol class="consumer-steps">${routine.pm.map((step) => consumerStepItem(step, "pm", entries, meta)).join("")}</ol></section></div>${removed.length ? `<p class="consumer-status">${icon("shield", 13)} The final safety check removed ${escapeHtml(removed.map((item) => item.displayName).join(", "))}. Use a plain product for that step.</p>` : ""}${meta.status === "cleared" ? myRoutineControls() : ""}</section>`;
  const bottomSide = `${shelfTodayCard(meta)}${tomorrowCard()}${productCheckCard(meta)}${checkinCard(meta)}`;
  const enter = state.animateEnter ? "is-entering" : "";
  const switcher = meta.status === "cleared" ? resultSwitch() : "";
  if (switcher && state.resultView === "week")
    return `<div class="consumer-result ${enter}">${switcher}${weekCard()}</div>`;
  return `<div class="consumer-result ${enter}">${switcher}${routineHtml}${heroHtml}${topSide}${bottomSide}</div>`;
}

// Before a build: the shape of the result, faded, so the empty column shows what is coming.
export function readyPreview() {
  const rows = (n) =>
    Array.from(
      { length: n },
      (_, i) =>
        `<li><span class="rp-num">${i + 1}</span><span class="rp-lines"><i style="width: ${[62, 48, 70, 54][i]}%"></i><i style="width: ${[38, 52, 30, 44][i]}%"></i></span><span class="rp-tick"></span></li>`,
    ).join("");
  return `<div class="ready-preview" aria-hidden="true"><div class="rp-phase is-am"><p>${icon("sun", 15)} Morning</p><ol>${rows(3)}</ol></div><div class="rp-phase is-pm"><p>${icon("sparkles", 15)} Evening</p><ol>${rows(4)}</ol></div></div>`;
}

export const REDIRECT_PLAIN = [
  [/urgent/i, "something that needs urgent attention"],
  [/allergic/i, "an allergic reaction"],
  [/reaction to a product/i, "a reaction to a product"],
  [/infection/i, "an infection"],
  [/acute skin reaction/i, "a skin reaction that should be checked"],
  [/clinical assessment/i, "something a professional should look at"],
];

export function redirectPlain(notices) {
  const text = String(notices || "");
  const found = [
    ...new Set(
      REDIRECT_PLAIN.filter(([pattern]) => pattern.test(text.replace(/may require clinical assessment/i, ""))).map(
        ([, words]) => words,
      ),
    ),
  ].slice(0, 2);
  return found.length
    ? `<p class="redirect-plain">It sounds like it could be ${escapeHtml(found.join(" or "))}.</p>`
    : "";
}

export function synthesizedRoutineCard(routine, meta) {
  const redirect = meta?.status === "medical_redirect";
  const cleared = meta?.status === "cleared";
  const running = state.runStatus === "running";
  if (!meta && !running && !state.expertView) return consumerResult(routine, meta, running);
  if (!meta && !running) {
    return `<section class="synthesized-routine-card is-ready" aria-live="polite"><div class="synth-card-top"><div><p class="routine-eyebrow">${icon("sparkles", 14)} Ready to run</p><h3>Your category preview will appear here</h3><p>${escapeHtml(state.profile[0].toUpperCase() + state.profile.slice(1))} profile · ${escapeHtml(concernSummary())} · ${escapeHtml(locationLabel())}</p></div><span class="synth-status is-review">Awaiting run</span></div><div class="synth-ready-content"><span>${icon("flask", 24)}</span><div><strong>One gated request, then an inspectable result.</strong><p>Choose a research context and run the preview to see the category output, evidence grounding, safety trace, and environmental explanation together.</p></div></div><div class="synth-card-footer"><p>${icon("shield", 15)} <span>No routine categories are shown before a gated research run.</span></p></div></section>`;
  }
  const notices = Array.isArray(meta?.safety?.flags) && meta.safety.flags.length ? meta.safety.flags.join(" ") : "";
  const variant = redirect ? "is-redirect" : cleared ? "is-cleared" : "is-review";
  if (meta?.status === "needs_conditions" && !running) return conditionsCard(meta);
  if (!state.expertView && !redirect) return consumerResult(routine, meta, running);
  if (redirect) {
    return `<section class="clinical-redirect" role="alert"><span class="clinical-redirect-icon">${icon("shield", 23)}</span><div><p class="routine-eyebrow">Please get this checked</p><h3>We won't suggest a routine today</h3><p>What you described may need a pharmacist or doctor to look at it. Please don't start new products until then.</p>${state.expertView ? `<p class="redirect-flags">${escapeHtml(notices)}</p>` : redirectPlain(notices)}<div class="form-actions"><button type="button" class="ghost-button" data-action="redirect-edit">Change my answer</button></div><small>If you have swelling of the face, lips or throat, or trouble breathing, get urgent medical help now.</small></div></section>`;
  }
  const statusMessage = running
    ? "Building your routine…"
    : cleared
      ? "Safety checks cleared. Approved database ingredients are shown in the matching AM/PM steps."
      : isQuotaFallback()
        ? "Live synthesis is unavailable; this is a generic research preview, not a personalised result."
        : notices || "Routine ready.";
  const aiRationale = meta?.aiCategoryRationale;
  const aiRationaleAvailable = Boolean(aiRationale?.status && aiRationale?.text);
  const aiRationaleMarkup = aiRationaleAvailable
    ? `<section class="ai-category-rationale"><div><span>${icon("sparkles", 14)} AI category rationale</span><small>${escapeHtml(aiRationale.cue && aiRationale.cue.score !== null && aiRationale.cue.score !== undefined ? `CUE ${Number(aiRationale.cue.score).toFixed(2)} · ${String(aiRationale.cue.status || "").replaceAll("_", " ")}` : aiRationale.label || String(aiRationale.status).replaceAll("_", " "))}</small></div><p>${escapeHtml(aiRationale.text)}</p><strong>${escapeHtml(aiRationale.boundary || "Deterministic safety checks remain the final authority for every displayed category.")}</strong></section>`
    : `<section class="ai-category-rationale is-unavailable"><div><span>${icon("info", 14)} AI category rationale</span><small>Not available</small></div><p>No AI category rationale is shown because the configured gate did not permit it or the GPT billing/provider connection is unavailable.</p><strong>Deterministic safety checks remain the final authority for every displayed category.</strong></section>`;
  const candidates = Array.isArray(meta?.ingredientCandidates?.entries) ? meta.ingredientCandidates.entries : [];
  return `<section class="synthesized-routine-card ${variant}" aria-live="polite" aria-busy="${running}"><div class="synth-card-top"><div><p class="routine-eyebrow">${icon("sparkles", 14)} Routine recommendations</p><h3>${escapeHtml(routine.label)}</h3><p>${escapeHtml(state.profile[0].toUpperCase() + state.profile.slice(1))} profile · ${escapeHtml(concernSummary())} · ${escapeHtml(locationLabel())}</p></div><div class="synth-top-actions"><span class="synth-status ${variant}">${escapeHtml(routineStatusLabel())}</span></div></div>${degradedBanner(meta)}${approvedIngredientCandidatePanel(meta)}<div class="synth-structure-label">${icon("layers", 13)} Routine structure by category</div><div class="synth-time-grid"><section class="synth-time-slot"><div class="synth-time-heading">${icon("sun", 16)}<span>Morning</span></div>${routineStepList(routine.am, { dark: true, ingredientCandidates: candidates, phase: "am" })}</section><section class="synth-time-slot"><div class="synth-time-heading">${icon("sparkles", 16)}<span>Evening</span></div>${routineStepList(routine.pm, { dark: true, ingredientCandidates: candidates, phase: "pm" })}</section></div><div class="synth-card-footer"><p>${icon("shield", 15)} <span>${escapeHtml(statusMessage)}</span></p><button class="reason-button is-dark" type="button" data-action="reason">${state.reasonOpen ? "Hide rationale" : "Why these recommendations?"}</button></div>${state.reasonOpen ? `<div class="synth-rationale"><strong>Result rationale</strong><p>${escapeHtml(routine.reason)}</p>${meta?.explanation?.level1?.text ? `<p class="peg-level1"><b>Environment (level 1):</b> ${escapeHtml(meta.explanation.level1.text)}</p>` : ""}${aiRationaleMarkup}</div>` : ""}</section>`;
}
