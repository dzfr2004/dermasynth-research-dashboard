// The weekly planner (Today / This week) and its landscape image.

import { hazeBand, hazeWords, humidityBand, locationLabel } from "./environment.js";
import { locationPayload } from "./location.js";
import { concernSummary, plainStep, selectedConcerns } from "./routine.js";
import { scheduleRender } from "./shell.js";
import { state } from "./state.js";
import { STORY, storyGlass, storyRoundRect } from "./story.js";
import { escapeHtml, icon } from "./util.js";

// ---- Weekly planner (Today / This week) ----------------------------------
// Today plus six forecast days, from /api/outlook when the server has the
// planner switched on. Future days use the same routine rules on each day's
// forecast; the table shows which steps change and when sunscreen matters.
export const WEEK_GROUPS = Object.freeze({
  hydration: {
    label: "Hydrating layer",
    short: { "comfort-hydration": "Comfort", "light-hydration": "Light", "supportive-hydration": "Everyday" },
  },
  moisturiser: {
    label: "Moisturiser",
    short: {
      "barrier-support-moisturising": "Rich",
      "lightweight-moisturising": "Light",
      "supportive-moisturising": "Everyday",
    },
  },
});

export const WEEK_ORDER = Object.freeze({
  am: ["low-irritation-cleansing", "hydration", "antioxidant-context", "daytime-photoprotection"],
  pm: ["low-irritation-cleansing", "moisturiser", "texture-renewal", "hydration", "overnight-comfort"],
});

export const WEEK_LABEL = Object.freeze({
  "low-irritation-cleansing": "Gentle cleanse",
  "antioxidant-context": "Antioxidant",
  "daytime-photoprotection": "Sunscreen",
  "texture-renewal": "Gentle exfoliant",
  "overnight-comfort": "Night moisturiser",
});

export function weekGroupOf(id) {
  for (const [key, group] of Object.entries(WEEK_GROUPS)) if (group.short[id]) return key;
  return id;
}

export function shortHour(time) {
  const h = Number(String(time || "").slice(11, 13));
  if (!Number.isFinite(h)) return "";
  return h === 0 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function weekDayLabel(date, isToday) {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { day: isToday ? "Today" : date, date: "" };
  return {
    day: isToday ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" }),
    date: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
  };
}

export function weekWeather(day) {
  const r = day.readings || {};
  const lines = [];
  const rain = Number(day.precipitation);
  if (Number.isFinite(rain) && day.precipitation !== null && rain >= 50) lines.push(`Rain ${Math.round(rain)}%`);
  else if (day.sky) lines.push(day.sky[0].toUpperCase() + day.sky.slice(1));
  if (r.uvi !== null && Number.isFinite(Number(r.uvi))) lines.push(`UV ${Math.round(r.uvi)}`);
  if (r.temperature !== null && Number.isFinite(Number(r.temperature)))
    lines.push(
      `${r.temperatureMin !== null && Number.isFinite(Number(r.temperatureMin)) ? `${Math.round(r.temperatureMin)}–` : ""}${Math.round(r.temperature)} °C`,
    );
  const hum = humidityBand(r.humidity);
  if (hum) lines.push({ "dry air": "Dry air", humid: "Humid", comfortable: "Comfortable" }[hum.label] || hum.label);
  if (hazeBand(r.pm25)) lines.push(hazeWords(r.pm25));
  return lines;
}

export function weekModel() {
  const week = state.week?.data?.week;
  const days = Array.isArray(week?.days) ? week.days : [];
  if (!days.length) return null;
  const phases = ["am", "pm"].map((phase) => {
    const groups = [];
    for (const day of days)
      for (const id of day.steps?.[phase] || []) {
        const g = weekGroupOf(id);
        if (!groups.includes(g)) groups.push(g);
      }
    const rank = (g) => {
      const i = WEEK_ORDER[phase].indexOf(g);
      return i === -1 ? 99 : i;
    };
    groups.sort((a, b) => rank(a) - rank(b));
    // Each cell names the ingredient to look for that day; steps with no named
    // ingredient (cleansing, for example) show a tick, and sunscreen adds its hours.
    const cell = (day, g) => {
      const id = (day.steps?.[phase] || []).find((x) => weekGroupOf(x) === g);
      if (!id && (day.unknown || []).includes(g))
        return { on: false, unknown: true, text: "No forecast", key: "unknown" };
      if (!id) return { on: false, text: "", key: "off" };
      const ingredient = day.ingredients?.[`${phase}:${id}`] || null;
      const hours =
        id === "daytime-photoprotection" && day.uvWindow?.start
          ? `${shortHour(day.uvWindow.start)}–${shortHour(day.uvWindow.end)}`
          : "";
      const stepName = plainStep({ id }).name;
      if (ingredient)
        return { on: true, text: ingredient.name, sub: hours, title: stepName, key: `${id}|${ingredient.id}` };
      if (WEEK_GROUPS[g]) return { on: true, text: WEEK_GROUPS[g].short[id], title: stepName, key: id };
      return { on: true, text: hours, title: stepName, key: id };
    };
    const rows = groups.map((g) => {
      const cells = days.map((day) => cell(day, g));
      return {
        label: WEEK_GROUPS[g]?.label || WEEK_LABEL[g] || plainStep({ id: g }).name,
        cells: cells.map((c) => ({ ...c, changed: !c.unknown && c.key !== cells[0].key })),
      };
    });
    return { phase, title: phase === "am" ? "Morning" : "Evening", rows };
  });
  return {
    days: days.map((day) => ({
      ...weekDayLabel(day.date, day.isToday),
      weather: weekWeather(day),
      same: day.sameAsToday,
    })),
    phases,
    note: week.note || "",
    changedDays: days.filter((d) => !d.isToday && !d.sameAsToday).length,
  };
}

export function resultSwitch() {
  if (!state.week?.data?.week?.days?.length) return "";
  const view = state.resultView === "week" ? "week" : "today";
  const button = (id, label, iconName) =>
    `<button type="button" data-action="result-view" data-view="${id}" aria-pressed="${view === id}" class="${view === id ? "is-active" : ""}">${icon(iconName, 14)} ${label}</button>`;
  return `<div class="result-switch" role="group" aria-label="Show the routine for">${button("today", "Today", "sun")}${button("week", "This week", "grid")}</div>`;
}

export function weekCard() {
  const model = weekModel();
  if (!model) return "";
  const cellHtml = (c) => {
    if (c.unknown)
      return `<td class="is-off is-unknown"><span aria-hidden="true">?</span><span class="sr-only">No air forecast yet</span></td>`;
    if (!c.on)
      return `<td class="is-off${c.changed ? " is-changed" : ""}"><span aria-hidden="true">–</span><span class="sr-only">Skip</span></td>`;
    return `<td class="is-on${c.changed ? " is-changed" : ""}"${c.title ? ` title="${escapeHtml(c.title)}"` : ""}>${c.text ? `<span class="week-ing">${escapeHtml(c.text)}</span>` : `${icon("check", 14)}<span class="sr-only">Yes</span>`}${c.sub ? `<span class="week-hours">${escapeHtml(c.sub)}</span>` : ""}${c.changed ? `<span class="sr-only"> (changes from today)</span>` : ""}</td>`;
  };
  const head = `<tr><th scope="col" class="week-corner"><span class="sr-only">Step</span></th>${model.days.map((d) => `<th scope="col"><span class="week-day">${escapeHtml(d.day)}</span><span class="week-date">${escapeHtml(d.date)}</span></th>`).join("")}</tr><tr class="week-weather"><th scope="row">Weather</th>${model.days.map((d) => `<td>${d.weather.map((w) => `<span>${escapeHtml(w)}</span>`).join("")}</td>`).join("")}</tr>`;
  const body = model.phases
    .filter((p) => p.rows.length)
    .map(
      (p) =>
        `<tbody><tr class="week-phase"><th scope="colgroup" colspan="${model.days.length + 1}">${icon(p.phase === "am" ? "sun" : "sparkles", 14)} ${p.title}</th></tr>${p.rows.map((row) => `<tr><th scope="row">${escapeHtml(row.label)}</th>${row.cells.map(cellHtml).join("")}</tr>`).join("")}</tbody>`,
    )
    .join("");
  const unknown = model.phases.some((p) => p.rows.some((r) => r.cells.some((c) => c.unknown)));
  const summary = `${model.changedDays ? `${model.changedDays} of the next 6 days need a change from today. Highlighted cells show what changes.` : "The forecast keeps the same routine all week."}${unknown ? " ? means the air-quality forecast does not reach that day yet." : ""}`;
  return `<section class="week-card" aria-labelledby="week-title"><div class="week-head"><h3 id="week-title">${icon("grid", 15)} This week</h3><button type="button" class="pill-button" data-action="week-export">${icon("share", 14)} Save as image</button></div><p class="week-sub">${escapeHtml(summary)} Each cell is the ingredient to look for that day; sunscreen also shows the hours it matters most.</p><div class="week-scroll" role="region" aria-label="Weekly planner (scrolls sideways)" tabindex="0"><table class="week-table"><caption class="sr-only">Skincare steps for today and the next six days</caption><thead>${head}</thead>${body}</table></div><p class="week-note">${icon("info", 13)} ${escapeHtml(model.note)}</p><p class="tomorrow-source">${escapeHtml(state.week?.data?.source || "")}</p></section>`;
}

// Landscape export (1920 x 1080), drawn like the story image.
export const WEEK_IMAGE = Object.freeze({ w: 1920, h: 1080, x: 80 });

export function drawCheck(ctx, cx, cy, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, size / 6);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - size / 2, cy);
  ctx.lineTo(cx - size / 8, cy + size / 3);
  ctx.lineTo(cx + size / 2, cy - size / 3);
  ctx.stroke();
  ctx.restore();
}

export function drawWeek(ctx, model, info) {
  const S = STORY;
  const { w: W, h: H, x: X } = WEEK_IMAGE;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, S.bgTop);
  bg.addColorStop(1, S.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 140, 120, 20, W - 140, 120, 560);
  glow.addColorStop(0, "rgba(159,227,207,0.24)");
  glow.addColorStop(1, "rgba(159,227,207,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  // Header
  ctx.fillStyle = S.gold;
  ctx.font = `600 22px ${S.sans}`;
  ctx.letterSpacing = "7px";
  ctx.fillText("DERMASYNTH", X, 78);
  ctx.letterSpacing = "0px";
  ctx.font = `italic 500 60px ${S.serif}`;
  ctx.fillText("This week's", X, 150);
  const lead = ctx.measureText("This week's ").width;
  ctx.font = `500 60px ${S.serif}`;
  ctx.fillStyle = S.cream;
  ctx.fillText("skin plan", X + lead, 150);
  ctx.font = `500 24px ${S.sans}`;
  ctx.fillStyle = "rgba(245,238,220,0.78)";
  const sub = `${info.range} · ${info.place} · ${info.profile}`;
  ctx.fillText(sub, W - X - ctx.measureText(sub).width, 150);

  // Grid
  const labelW = 260;
  const top = 196;
  const colGap = 12;
  const colW = (W - X * 2 - labelW - colGap * (model.days.length - 1)) / model.days.length;
  const colX = (i) => X + labelW + i * (colW + colGap);
  const headH = 214;
  model.days.forEach((d, i) => {
    storyGlass(ctx, colX(i), top, colW, headH, 22);
    if (i === 0) {
      ctx.save();
      storyRoundRect(ctx, colX(i), top, colW, headH, 22);
      ctx.strokeStyle = "rgba(232,199,122,0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = i === 0 ? S.gold : S.cream;
    ctx.font = `600 28px ${S.sans}`;
    ctx.fillText(d.day, colX(i) + 18, top + 42);
    ctx.fillStyle = "rgba(245,238,220,0.7)";
    ctx.font = `500 20px ${S.sans}`;
    ctx.fillText(d.date, colX(i) + 18, top + 70);
    ctx.fillStyle = "rgba(245,238,220,0.88)";
    ctx.font = `500 19px ${S.sans}`;
    d.weather.slice(0, 5).forEach((line, k) => {
      let text = line;
      while (ctx.measureText(text).width > colW - 30 && text.length > 3) text = `${text.slice(0, -2)}…`;
      ctx.fillText(text, colX(i) + 18, top + 104 + k * 24);
    });
  });
  const rowsTotal = model.phases.reduce((n, p) => n + p.rows.length, 0);
  const sections = model.phases.filter((p) => p.rows.length).length;
  let y = top + headH + 18;
  const bottom = H - 70;
  const rowH = Math.min(58, Math.floor((bottom - y - sections * 44) / Math.max(rowsTotal, 1)));
  for (const p of model.phases) {
    if (!p.rows.length) continue;
    ctx.fillStyle = S.gold;
    ctx.font = `600 19px ${S.sans}`;
    ctx.letterSpacing = "4px";
    ctx.fillText(p.title.toUpperCase(), X, y + 28);
    ctx.letterSpacing = "0px";
    ctx.strokeStyle = "rgba(245,238,220,0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X + 160, y + 21);
    ctx.lineTo(W - X, y + 21);
    ctx.stroke();
    y += 44;
    for (const row of p.rows) {
      ctx.fillStyle = S.cream;
      ctx.font = `500 ${Math.round(rowH * 0.42)}px ${S.sans}`;
      ctx.fillText(row.label, X, y + rowH * 0.62);
      row.cells.forEach((c, i) => {
        const cx = colX(i);
        const ph = rowH - 12;
        if (c.on) {
          ctx.save();
          storyRoundRect(ctx, cx, y + 4, colW, ph, ph / 2);
          ctx.fillStyle = c.changed ? "rgba(232,199,122,0.92)" : "rgba(159,227,207,0.88)";
          ctx.fill();
          ctx.restore();
          if (c.text) {
            ctx.fillStyle = S.deep;
            let size = Math.round(rowH * (c.sub ? 0.3 : 0.34));
            ctx.font = `600 ${size}px ${S.sans}`;
            while (ctx.measureText(c.text).width > colW - 20 && size > 13) {
              size -= 1;
              ctx.font = `600 ${size}px ${S.sans}`;
            }
            const tw = ctx.measureText(c.text).width;
            ctx.fillText(c.text, cx + (colW - tw) / 2, y + 4 + ph * (c.sub ? 0.47 : 0.64));
            if (c.sub) {
              ctx.font = `500 ${Math.round(rowH * 0.24)}px ${S.sans}`;
              const sw = ctx.measureText(c.sub).width;
              ctx.fillText(c.sub, cx + (colW - sw) / 2, y + 4 + ph * 0.84);
            }
          } else {
            drawCheck(ctx, cx + colW / 2, y + 4 + ph / 2, Math.round(ph * 0.42), S.deep);
          }
        } else {
          ctx.save();
          storyRoundRect(ctx, cx, y + 4, colW, ph, ph / 2);
          ctx.strokeStyle = c.changed ? "rgba(232,199,122,0.75)" : "rgba(245,238,220,0.16)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = "rgba(245,238,220,0.45)";
          ctx.font = `500 ${Math.round(rowH * 0.34)}px ${S.sans}`;
          const word = c.unknown ? "No data yet" : "Skip";
          const tw = ctx.measureText(word).width;
          ctx.fillText(word, cx + (colW - tw) / 2, y + 4 + ph * 0.64);
        }
      });
      y += rowH;
    }
  }
  // Legend and footer
  ctx.font = `500 20px ${S.sans}`;
  const legendY = H - 34;
  ctx.save();
  storyRoundRect(ctx, X, legendY - 18, 34, 22, 11);
  ctx.fillStyle = "rgba(232,199,122,0.92)";
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(245,238,220,0.8)";
  ctx.fillText("Changes from today", X + 46, legendY);
  const foot =
    "Sunscreen hours: when UV matters most · Forecasts further ahead are less certain · Research prototype, not medical advice";
  ctx.fillStyle = "rgba(245,238,220,0.6)";
  ctx.font = `500 18px ${S.sans}`;
  ctx.fillText(foot, W - X - ctx.measureText(foot).width, legendY);
}

export async function buildWeekImage() {
  const model = weekModel();
  if (!model) return null;
  try {
    await document.fonts?.ready;
  } catch {
    /* fonts API unavailable */
  }
  const canvas = document.createElement("canvas");
  canvas.width = WEEK_IMAGE.w;
  canvas.height = WEEK_IMAGE.h;
  const first = model.days[0];
  const last = model.days[model.days.length - 1];
  drawWeek(canvas.getContext("2d"), model, {
    range: `${first.date} to ${last.date}`,
    place: locationLabel() === "Your location" ? "Near you" : locationLabel(),
    profile: `${state.profile[0].toUpperCase()}${state.profile.slice(1)} skin · ${concernSummary()}`,
  });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? { blob, width: canvas.width, height: canvas.height } : null;
}

export async function refreshOutlook() {
  const meta = state.routineMeta;
  const routine = state.generatedRoutine;
  if (!meta || meta.status !== "cleared" || !routine) {
    state.outlook = { status: "idle" };
    return;
  }
  const runId = meta.routineContext?.runId || meta.requestId || "";
  state.outlook = { status: "loading", runId };
  const todaySteps = [...(routine.am || []).map((s) => `am:${s.id}`), ...(routine.pm || []).map((s) => `pm:${s.id}`)];
  try {
    const body = {
      profile: state.profile,
      concern: state.concern,
      concerns: selectedConcerns(),
      location: locationPayload(),
      todaySteps,
      exposureContext: state.exposureContext || "mixed",
    };
    if (state.finishPreference) body.finishPreference = state.finishPreference;
    if (state.reactivityLevel) body.reactivityLevel = state.reactivityLevel;
    const response = await fetch("/api/outlook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (state.outlook.runId !== runId) return;
    state.outlook = data?.available ? { status: "available", runId, data } : { status: "idle", runId };
  } catch {
    if (state.outlook.runId !== runId) return;
    state.outlook = { status: "idle", runId };
  }
  scheduleRender({ animated: true });
}

export async function refreshWeek() {
  const meta = state.routineMeta;
  const routine = state.generatedRoutine;
  if (!meta || meta.status !== "cleared" || !routine) {
    state.week = { status: "idle" };
    return;
  }
  const runId = meta.routineContext?.runId || meta.requestId || "";
  state.week = { status: "loading", runId };
  const todaySteps = [...(routine.am || []).map((s) => `am:${s.id}`), ...(routine.pm || []).map((s) => `pm:${s.id}`)];
  const todayIngredients = Object.fromEntries(
    (meta.ingredientCandidates?.entries || []).map((e) => [`${e.phase}:${e.categoryId}`, e.ingredientId]),
  );
  try {
    const body = {
      profile: state.profile,
      concern: state.concern,
      concerns: selectedConcerns(),
      location: locationPayload(),
      todaySteps,
      todayIngredients,
      exposureContext: state.exposureContext || "mixed",
    };
    if (state.finishPreference) body.finishPreference = state.finishPreference;
    if (state.reactivityLevel) body.reactivityLevel = state.reactivityLevel;
    const response = await fetch("/api/week", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (state.week.runId !== runId) return;
    state.week = data?.available ? { status: "available", runId, data } : { status: "idle", runId };
  } catch {
    if (state.week.runId !== runId) return;
    state.week = { status: "idle", runId };
  }
  scheduleRender({ animated: true });
}
