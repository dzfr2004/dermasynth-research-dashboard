// The Weather page and weather cards: today's readings, the UV curve, sunscreen timing and tomorrow.

import {
  activeEnvironment,
  environmentModeLabel,
  environmentValue,
  hazeBand,
  hazeWords,
  humidityBand,
  locationLabel,
  planningUv,
  temperatureBand,
  uvBand,
} from "./environment.js";
import { environmentPanel, forecastRoutinePanel, insightPanel } from "./expert.js";
import { isLocationUpdating, locationPayload, locationPicker } from "./location.js";
import { currentStepKeys } from "./result.js";
import { selectedConcerns } from "./routine.js";
import { prefersReducedMotion, scheduleRender, shell } from "./shell.js";
import { state } from "./state.js";
import { escapeHtml, hourLabel, icon } from "./util.js";

export function weatherView() {
  const wo = state.weatherOutlook;
  const tomorrow = wo?.data?.tomorrow;
  const hasRoutine = Boolean(state.routineMeta?.status === "cleared" && state.generatedRoutine);
  const tomorrowHtml =
    hasRoutine && state.outlook?.data?.tomorrow
      ? tomorrowCard()
      : tomorrow
        ? `<section class="tomorrow-card" aria-labelledby="w-tomorrow"><h3 id="w-tomorrow">${icon("activity", 15)} Tomorrow</h3>${tomorrowChips(tomorrow)}<p class="tomorrow-source">${escapeHtml(wo.data?.source || "")}</p></section>`
        : wo?.status === "loading"
          ? `<section class="tomorrow-card is-loading" aria-live="polite"><h3>${icon("activity", 15)} Tomorrow</h3><p class="shimmer-text">Checking tomorrow's forecast…</p></section>`
          : "";
  const cta = `<section class="weather-cta"><p>${hasRoutine ? "Your routine already uses these readings." : "DermaSynth turns today's weather into a morning and evening routine for your skin."}</p><button type="button" class="primary-button" data-action="navigate" data-view="simulator">${icon("sparkles", 15)} ${hasRoutine ? "See my routine" : "Build today's routine"}</button></section>`;
  return shell(
    `<div class="view-heading"><div><h2>Today's weather for your skin</h2><p>UV, humidity, haze and temperature where you are, and what tomorrow looks like.</p></div><button type="button" class="ghost-button" data-action="refresh" ${isLocationUpdating() ? "disabled" : ""}>${icon("refresh", 15)} Refresh</button></div><div class="weather-layout"><section class="panel monitor-location-panel" id="monitor-location">${locationPicker({ label: "Location", compact: true })}</section><div class="weather-stack">${conditionsSummaryCard(null, wo)}${tomorrowHtml}${cta}</div></div>`,
  );
}

export async function refreshWeatherOutlook() {
  const key = `${locationPayload().lat},${locationPayload().lon}`;
  if (state.weatherOutlook?.key === key && ["loading", "available"].includes(state.weatherOutlook.status)) return;
  state.weatherOutlook = { status: "loading", key };
  const todaySteps = currentStepKeys();
  try {
    const response = await fetch("/api/outlook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profile: state.profile,
        concern: state.concern,
        concerns: selectedConcerns(),
        location: locationPayload(),
        todaySteps,
        exposureContext: state.exposureContext || "mixed",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (state.weatherOutlook?.key !== key) return;
    state.weatherOutlook = data?.available ? { status: "available", key, data } : { status: "idle", key };
  } catch {
    if (state.weatherOutlook?.key === key) state.weatherOutlook = { status: "idle", key };
  }
  if (state.activeView === "monitor" && !state.expertView) scheduleRender({ animated: true });
}

export function monitorView() {
  if (!state.expertView) return weatherView();
  const env = activeEnvironment();
  const uvi = environmentValue(env.readings?.uvi);
  const weatherStatus = env.sources?.weather?.status || "demo";
  const notice = env.notices?.[0] || "Refresh readings to check the current source state.";
  const locationLabelText =
    state.presentation.active && state.presentation.step === 0
      ? "Choose or confirm weather location"
      : "Weather location";
  return shell(
    `<div class="view-heading"><div><h2>Live environmental context.</h2><p>Weather and air-quality inputs update the routine view.</p></div><button type="button" class="primary-button" data-action="refresh" ${isLocationUpdating() ? "disabled" : ""}>${icon("refresh", 15)} Refresh</button></div><section class="panel monitor-location-panel" id="monitor-location">${locationPicker({ label: locationLabelText, compact: true })}</section><div class="module-hero" id="monitor-readings"><section class="panel monitor-card"><div class="panel-header"><h3 class="panel-title">${icon("sun", 17)} UV index</h3><p class="panel-note">${escapeHtml(environmentModeLabel())}</p></div><div class="monitor-readout"><strong>${escapeHtml(uvi)}</strong><span>${uvi === "—" ? "Unavailable" : "Current reading"}<br />${escapeHtml(state.lastUpdated)}</span></div><div class="monitor-chip-row"><span class="monitor-chip">${escapeHtml(locationLabel())}</span><span class="monitor-chip">OpenWeather ${escapeHtml(weatherStatus)}</span></div></section><section class="panel guidance-panel"><div class="panel-header"><h3 class="panel-title">${icon("sparkles", 17)} Active signals</h3><p class="panel-note">Routine inputs</p></div><div class="guidance-list"><div class="guidance"><span class="guidance-icon">${icon("sun", 16)}</span><div><strong>UV</strong><p>Daytime protection category.</p></div></div><div class="guidance"><span class="guidance-icon">${icon("droplet", 16)}</span><div><strong>Humidity</strong><p>Finish and hydration context.</p></div></div><div class="guidance"><span class="guidance-icon">${icon("wind", 16)}</span><div><strong>PM2.5</strong><p>Antioxidant context when available.</p></div></div></div></section></div>${forecastRoutinePanel()}<div class="dashboard-grid">${environmentPanel()}${insightPanel()}</div>`,
  );
}

export function todayChips(readings = {}) {
  const uv = planningUv(readings);
  const chips = [];
  // Only the sun gets colour: UV from "high" upwards, and the sunscreen window.
  if (uv !== null)
    chips.push([
      `UV ${Math.round(uv)}`,
      uvBand(uv)?.label || "",
      ["warn", "alert"].includes(uvBand(uv)?.tone) ? "uv" : "",
    ]);
  if (Number.isFinite(Number(readings.humidity)) && readings.humidity !== null)
    chips.push([
      `${Math.round(readings.humidity)}%`,
      humidityBand(readings.humidity)?.label || "",
      humidityBand(readings.humidity)?.tone || "",
    ]);
  if (Number.isFinite(Number(readings.pm25)) && readings.pm25 !== null)
    chips.push([hazeWords(readings.pm25) || "Haze", "", hazeBand(readings.pm25)?.tone || ""]);
  if (Number.isFinite(Number(readings.temperature)) && readings.temperature !== null)
    chips.push([
      `${Math.round(readings.temperature)} °C`,
      temperatureBand(readings.temperature)?.label || "",
      temperatureBand(readings.temperature)?.tone || "",
    ]);
  const sunWindow = sunscreenWindowShort();
  if (sunWindow) chips.push([`Sunscreen ${sunWindow}`, "", "sun-window"]);
  return chips
    .map(
      ([main, sub, tone]) =>
        `<span class="today-chip ${tone ? `is-${escapeHtml(tone)}` : ""}"><b>${escapeHtml(main)}</b>${sub ? ` ${escapeHtml(sub)}` : ""}</span>`,
    )
    .join("");
}

// Result page: one row of chips; the full card (tiles, UV chart, timing) opens on tap.
export function todayStrip(meta) {
  const readings = (meta?.environment || activeEnvironment())?.readings || {};
  const open = Boolean(state.openToggles?.today);
  return `<section class="today-strip" style="view-transition-name: today-card"><details data-toggle-key="today" ${open ? "open" : ""}><summary><span class="today-strip-title">${icon("pin", 14)} Today</span><span class="today-chips">${todayChips(readings)}</span><span class="today-strip-more" aria-hidden="true">${open ? "Less" : "More"}</span></summary>${conditionsSummaryCard(meta)}</details></section>`;
}

export function conditionsSummaryCard(meta, outlook = state.outlook) {
  const environment = meta?.environment || activeEnvironment();
  const r = environment?.readings || {};
  const fmt = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : "—");
  const items = [
    [
      "UV now",
      fmt(r.uvi, 1),
      "",
      Number(r.uviMaxToday) > Number(r.uvi)
        ? { ...uvBand(r.uviMaxToday), label: `peaks at ${Math.round(Number(r.uviMaxToday))} today` }
        : uvBand(r.uvi),
    ],
    ["Humidity", fmt(r.humidity), "%", humidityBand(r.humidity)],
    ["Haze (PM2.5)", fmt(r.pm25), "µg/m³", hazeBand(r.pm25)],
    ["Temperature", fmt(r.temperature), "°C", temperatureBand(r.temperature)],
  ];
  const source =
    environment?.mode === "live"
      ? "Live readings"
      : environment?.mode === "user_reported"
        ? "Conditions you reported"
        : environment?.mode === "degraded"
          ? "Some live readings missing"
          : "Sample weather (not live)";
  const outlookToday = outlook?.data?.today;
  const timingLine = outlookToday?.text
    ? `<p class="today-timing">${icon("sun", 13)} ${escapeHtml(outlookToday.text)}${outlookToday.sunTip ? ` ${escapeHtml(outlookToday.sunTip)}` : ""}</p>`
    : "";
  return `<section class="today-card" style="view-transition-name: today-card" aria-labelledby="today-title"><div class="today-head"><h3 id="today-title">${icon("sun", 15)} Today's readings</h3><span>${escapeHtml(source)}</span></div><dl class="today-grid">${items.map(([label, value, unit, band]) => `<div class="today-item ${band ? `is-${band.tone}` : ""}"><dt>${escapeHtml(label)}</dt><dd><strong>${escapeHtml(value)}</strong>${unit && value !== "—" ? `<small>${escapeHtml(unit)}</small>` : ""}${band ? `<span>${escapeHtml(band.label)}</span>` : ""}</dd></div>`).join("")}</dl>${uvTimeline(outlook)}${timingLine}</section>`;
}

// ---- Timing and tomorrow (forecast, /api/outlook) ----------------------------
export function sunscreenWindowShort() {
  const w = state.outlook?.data?.today?.window;
  if (!w || w.allDayBelow || w.passed || !w.start) return "";
  const hour = (time) => {
    const h = Number(String(time).slice(11, 13));
    return h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`;
  };
  return `${hour(w.start)} to ${hour(w.end)}`;
}

export function sunscreenTiming() {
  const w = state.outlook?.data?.today?.window;
  if (!w || w.allDayBelow || w.passed || !w.start) return "";
  const hour = (time) => {
    const h = Number(String(time).slice(11, 13));
    return h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`;
  };
  return `Most important from ${hour(w.start)} to ${hour(w.end)} today. If you're outside for long, top it up during the day.`;
}

export function tomorrowChips(tomorrow) {
  const r = tomorrow?.readings || {};
  const chips = [];
  const rain = Number(tomorrow?.precipitation);
  if (Number.isFinite(rain) && rain >= 50) chips.push(`Rain likely (${Math.round(rain)}%)`);
  else if (tomorrow?.sky) chips.push(tomorrow.sky[0].toUpperCase() + tomorrow.sky.slice(1));
  if (Number.isFinite(Number(r.uvi)) && r.uvi !== null) chips.push(`UV up to ${Math.round(r.uvi)}`);
  if (Number.isFinite(Number(r.temperature)) && r.temperature !== null)
    chips.push(`Up to ${Math.round(r.temperature)} °C`);
  if (humidityBand(r.humidity))
    chips.push(
      { "dry air": "Dry air", humid: "Humid", comfortable: "Comfortable humidity" }[humidityBand(r.humidity).label] ||
        humidityBand(r.humidity).label,
    );
  if (hazeBand(r.pm25)) chips.push(hazeWords(r.pm25));
  return chips.length
    ? `<div class="tomorrow-chips">${chips.map((c) => `<span>${escapeHtml(c)}</span>`).join("")}</div>`
    : `<p class="tomorrow-summary">${escapeHtml(tomorrow?.summary || "")}</p>`;
}

export function tomorrowCard() {
  const outlook = state.outlook;
  if (!outlook || outlook.status === "idle") return "";
  if (outlook.status === "loading")
    return `<section class="tomorrow-card is-loading" style="view-transition-name: tomorrow-card" aria-live="polite"><h3>${icon("activity", 15)} Tomorrow</h3><p class="shimmer-text">Checking tomorrow's forecast…</p></section>`;
  const tomorrow = outlook.data?.tomorrow;
  if (!tomorrow) return "";
  const changes = (tomorrow.changes || []).filter((c) => c.change !== "kept");
  const kept = (tomorrow.changes || []).filter((c) => c.change === "kept");
  return `<section class="tomorrow-card" style="view-transition-name: tomorrow-card" aria-labelledby="tomorrow-title"><h3 id="tomorrow-title">${icon("activity", 15)} Tomorrow</h3>${tomorrowChips(tomorrow)}${tomorrow.sameAsToday ? `<p class="tomorrow-same">${icon("check", 14)} Same routine as today.</p>` : `<ul class="tomorrow-changes">${changes.map((c) => `<li class="is-${escapeHtml(c.change)}">${escapeHtml(c.text)}</li>`).join("")}</ul>`}${kept.length ? `<p class="tomorrow-kept">${kept.map((c) => escapeHtml(c.text)).join(" ")}</p>` : ""}<p class="tomorrow-source">${escapeHtml(outlook.data?.source || "")}</p></section>`;
}

// 4. UV timeline: today's hourly UV with the sunscreen window shaded.
export function uvTimeline(outlook = state.outlook) {
  const today = outlook?.data?.today;
  const hours = Array.isArray(today?.hourly) ? today.hourly : [];
  if (hours.length < 6) return "";
  // Drawn in a 0-100 box stretched to the card's width; labels are HTML
  // placed by percentage, so the chart fills the card and text stays crisp.
  const maxUv = Math.max(11, ...hours.map((p) => p.uvi));
  const hourOf = (time) => Number(String(time).slice(11, 13)) + Number(String(time).slice(14, 16) || 0) / 60;
  const x = (time) => (hourOf(time) / 23) * 100;
  const y = (uvi) => 100 - (uvi / maxUv) * 92;
  const pct = (v) => `${Math.max(0, Math.min(100, v)).toFixed(2)}%`;
  // A gently smoothed line (Catmull-Rom to Bezier) reads as a sky, not a graph.
  const pts = hours.map((p) => [x(p.time), y(p.uvi)]);
  let line = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(100, p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(100, p2[1] - (p3[1] - p1[1]) / 6)];
    line += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  const area = `${line} L${pts.at(-1)[0].toFixed(2)},100 L${pts[0][0].toFixed(2)},100 Z`;
  const win = today.window;
  const hasWindow = Boolean(win && win.start && win.end);
  const threshold = Number.isFinite(Number(win?.threshold)) ? y(win.threshold) : null;
  const nowX = today.now ? x(today.now) : null;
  // UV right now, read off the hourly curve.
  let nowUv = null;
  if (today.now) {
    const h = hourOf(today.now);
    const after = hours.findIndex((p) => hourOf(p.time) >= h);
    if (after > 0) {
      const a = hours[after - 1],
        b = hours[after];
      const t = (h - hourOf(a.time)) / Math.max(0.01, hourOf(b.time) - hourOf(a.time));
      nowUv = a.uvi + (b.uvi - a.uvi) * t;
    } else if (after === 0) nowUv = hours[0].uvi;
  }
  const peak = win?.peak;
  const label = hasWindow
    ? `UV today: ${win.threshold} or higher from ${hourLabel(win.start)} to ${hourLabel(win.end)}, peaking at ${Math.round(peak?.uvi ?? 0)} around ${hourLabel(peak?.time)}.`
    : peak
      ? `UV today peaks at ${Math.round(peak.uvi)} around ${hourLabel(peak.time)}.`
      : "UV today stays low.";
  const ticks = [
    ["00", "12 am"],
    ["06", "6 am"],
    ["12", "Noon"],
    ["18", "6 pm"],
    ["23", "11 pm"],
  ];
  const drawKey = `${today.now || ""}|${hours.length}`;
  const draw = state.uvDrawn !== drawKey && !prefersReducedMotion();
  if (draw)
    setTimeout(() => {
      state.uvDrawn = drawKey;
    }, 1600);
  const winX1 = hasWindow ? x(win.start) : 0,
    winX2 = hasWindow ? x(win.end) : 0;
  return `<figure class="uv-timeline ${draw ? "is-drawing" : ""}" role="img" aria-label="${escapeHtml(label)}">
  <div class="uv-plot">
    ${hasWindow ? `<div class="uv-window-band" style="left: ${pct(winX1)}; width: ${pct(winX2 - winX1)}"></div>` : ""}
    <svg class="uv-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="uvStroke" x1="0" y1="100" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" class="uv-s0"/><stop offset=".45" class="uv-s1"/><stop offset=".8" class="uv-s2"/><stop offset="1" class="uv-s3"/></linearGradient>
        <linearGradient id="uvFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="uv-f0"/><stop offset="1" class="uv-f1"/></linearGradient>
        ${nowX !== null ? `<clipPath id="uvPast"><rect x="0" y="-10" width="${nowX.toFixed(2)}" height="120"/></clipPath><clipPath id="uvFuture"><rect x="${nowX.toFixed(2)}" y="-10" width="${(100 - nowX).toFixed(2)}" height="120"/></clipPath>` : ""}
      </defs>
      <line class="uv-grid" x1="${x("2000-01-01T06:00").toFixed(2)}" x2="${x("2000-01-01T06:00").toFixed(2)}" y1="0" y2="100"/><line class="uv-grid" x1="${x("2000-01-01T12:00").toFixed(2)}" x2="${x("2000-01-01T12:00").toFixed(2)}" y1="0" y2="100"/><line class="uv-grid" x1="${x("2000-01-01T18:00").toFixed(2)}" x2="${x("2000-01-01T18:00").toFixed(2)}" y1="0" y2="100"/>
      <path class="uv-area" d="${area}"/>
      ${threshold !== null ? `<line class="uv-threshold" x1="0" x2="100" y1="${threshold.toFixed(2)}" y2="${threshold.toFixed(2)}"/>` : ""}
      ${
        nowX !== null
          ? `<path class="uv-line is-past" d="${line}" pathLength="1" clip-path="url(#uvPast)"/><path class="uv-line is-future" d="${line}" pathLength="1" clip-path="url(#uvFuture)"/>`
          : `<path class="uv-line is-past" d="${line}" pathLength="1"/>`
      }
      ${nowX !== null ? `<line class="uv-now" x1="${nowX.toFixed(2)}" x2="${nowX.toFixed(2)}" y1="0" y2="100"/>` : ""}
    </svg>
    ${peak ? `<span class="uv-peak" style="left: ${pct(x(peak.time))}; top: ${pct(y(peak.uvi))}"></span><span class="uv-peak-label" style="left: ${pct(x(peak.time))}; top: ${pct(y(peak.uvi))}"><b>UV ${Math.round(peak.uvi)}</b> ${escapeHtml(hourLabel(peak.time))}</span>` : ""}
    ${nowX !== null && nowUv !== null ? `<span class="uv-now-dot" style="left: ${pct(nowX)}; top: ${pct(y(nowUv))}"></span>` : ""}
    ${nowX !== null ? `<span class="uv-now-label ${nowUv !== null && y(nowUv) < 40 ? "is-below" : nowX > 62 ? "is-left" : "is-right"}${nowX > 85 ? " is-edge-end" : nowX < 15 ? " is-edge-start" : ""}" style="left: ${pct(nowX)}; top: ${pct(nowUv !== null ? Math.min(82, y(nowUv)) : 50)}">Now${nowUv !== null ? ` · UV ${Math.round(nowUv)}` : ""}</span>` : ""}
    ${threshold !== null ? `<span class="uv-threshold-label" style="top: ${pct(threshold)}">Sunscreen from UV ${escapeHtml(String(win.threshold))}</span>` : ""}
  </div>
  <div class="uv-axis" aria-hidden="true">${ticks.map(([hh, t], i) => `<span class="${i === 0 ? "is-start" : i === ticks.length - 1 ? "is-end" : ""}" style="left: ${pct(x(`2000-01-01T${hh}:00`))}">${t}</span>`).join("")}</div>
  <figcaption><span class="uv-legend"><span class="uv-key is-line"></span>UV through the day</span>${hasWindow ? `<span class="uv-legend"><span class="uv-key is-window"></span>Sunscreen ${escapeHtml(hourLabel(win.start))} to ${escapeHtml(hourLabel(win.end))}</span>` : ""}${threshold !== null ? `<span class="uv-legend"><span class="uv-key is-threshold"></span>Sunscreen level</span>` : ""}</figcaption></figure>`;
}
