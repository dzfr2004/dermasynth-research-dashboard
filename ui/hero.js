// The Living Sky hero: today's headline, the sky palette by hour, UV and haze, and the hero markup.

import { activeEnvironment, hazeBand, humidityBand, temperatureBand, uvBand } from "./environment.js";
import { todayOneLine } from "./result.js";
import { normaliseRoutine } from "./routine.js";
import { skyHeadline } from "./sky-headline.js";
import { state } from "./state.js";
import { escapeHtml, icon, mixHex } from "./util.js";

// ---- Design: living sky header, build pipeline, safety seal, count-ups -----
export { skyHeadline };

export function skyPalette(readings = {}, date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  const uv = Math.min(1, Math.max(Number(readings.uvi) || 0, Number(readings.uviMaxToday) || 0) / 11);
  const pm = Number(readings.pm25);
  const haze = Number.isFinite(pm) ? Math.max(0, Math.min(1, (pm - 25) / 60)) : 0;
  if (h >= 19.5 || h < 5.5) {
    return {
      state: "night",
      top: "#0c1a1f",
      mid: "#143029",
      bottom: mixHex("#2d4233", "#5b5133", haze),
      glow: "rgb(214 226 255 / 32%)",
      glowAt: "22% 8%",
      ink: "#f6eedb",
      inkSoft: "#d6d0be",
      band: "#f2c879",
      line: "rgb(246 238 219 / 20%)",
      chip: "rgb(246 238 219 / 10%)",
    };
  }
  if (h >= 17.5) {
    return {
      state: "dusk",
      top: "#1c2639",
      mid: mixHex("#46303d", "#4a392e", haze),
      bottom: "#9c5a39",
      glow: "rgb(255 170 110 / 30%)",
      glowAt: "80% 70%",
      ink: "#f8efdc",
      inkSoft: "#ece1cb",
      band: "#ffdaa3",
      line: "rgb(248 239 220 / 22%)",
      chip: "rgb(248 239 220 / 12%)",
    };
  }
  if (h < 8) {
    return {
      state: "dawn",
      top: mixHex("#a9b8cf", "#c4b8a8", haze),
      mid: "#f0c29b",
      bottom: "#f7e2c2",
      glow: "rgb(255 200 140 / 70%)",
      glowAt: "18% 30%",
      ink: "#2a1c10",
      inkSoft: "#4a3622",
      band: "#8a3b00",
      line: "rgb(42 28 16 / 22%)",
      chip: "rgb(255 255 255 / 34%)",
    };
  }
  const top = mixHex(mixHex("#93bccb", "#eea766", uv), "#d2a27c", haze * 0.7);
  const mid = mixHex(mixHex("#d3e4dc", "#f2cb98", uv), "#d9c3a3", haze * 0.7);
  const bottom = mixHex(mixHex("#eaeedb", "#d3dbc2", uv), "#bcc1a9", haze * 0.7);
  return {
    state: "day",
    top,
    mid,
    bottom,
    glow: `rgb(255 214 140 / ${Math.round(40 + uv * 55)}%)`,
    glowAt: "80% 6%",
    ink: "#2b1b0c",
    inkSoft: "#432f17",
    band: "#8a3b00",
    line: "rgb(43 27 12 / 22%)",
    chip: "rgb(255 255 255 / 36%)",
  };
}

export function skyStyle(p) {
  return `--sky-top: ${p.top}; --sky-mid: ${p.mid}; --sky-bottom: ${p.bottom}; --sky-glow: ${p.glow}; --sky-glow-at: ${p.glowAt}; --sky-ink: ${p.ink}; --sky-ink-soft: ${p.inkSoft}; --sky-band: ${p.band}; --sky-line: ${p.line}; --sky-chip: ${p.chip};`;
}

export function skyHero(meta) {
  const env = meta?.environment || activeEnvironment();
  const r = env?.readings || {};
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.round(Number(v)) : null);
  const uvPeak = Math.max(Number(r.uvi) || 0, Number(r.uviMaxToday) || 0);
  const items = [
    [
      "uv",
      Number(r.uviMaxToday) > Number(r.uvi) || new Date().getHours() >= 17 ? "UV peak" : "UV",
      num(uvPeak || r.uvi),
      "",
      uvBand(uvPeak || r.uvi),
    ],
    ["pm", "Haze", num(r.pm25), "PM2.5", hazeBand(r.pm25)],
    ["hum", "Humidity", num(r.humidity), "%", humidityBand(r.humidity)],
    ["temp", "Heat", num(r.temperature), "°C", temperatureBand(r.temperature)],
  ];
  const date = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const source =
    env?.mode === "live"
      ? "Live readings"
      : env?.mode === "user_reported"
        ? "Conditions you reported"
        : env?.mode === "degraded"
          ? "Some live readings missing"
          : "Sample weather (not live)";
  if (state.skyFreshUntil === undefined) state.skyFreshUntil = Date.now() + 1500;
  const fresh = Date.now() < state.skyFreshUntil;
  const plan =
    meta?.status === "cleared" && state.runStatus !== "running" ? todayOneLine(meta, normaliseRoutine()) : "";
  return `<section class="sky-hero ${plan ? "has-plan" : ""} ${fresh ? "is-fresh" : ""}" aria-labelledby="sky-title"><div class="sky-slot" data-sky aria-hidden="true"></div><div class="sky-scrim" aria-hidden="true"></div><div class="sky-content"><p class="sky-kicker">${icon("sun", 13)} <span>${escapeHtml(date)}</span></p><h2 id="sky-title" class="sky-title">${escapeHtml(skyHeadline(r))}</h2>${plan ? `<p class="hero-text">${escapeHtml(plan)}</p>` : ""}<dl class="sky-readings">${items.map(([key, label, value, unit, band]) => `<div class="sky-reading is-${band?.tone || "calm"}"><dt>${escapeHtml(label)}</dt><dd><strong ${value === null ? "" : `data-count="${value}" data-count-key="sky-${key}"`}>${value === null ? "—" : value}</strong>${unit && value !== null ? `<small>${escapeHtml(unit)}</small>` : ""}${band ? `<span class="sky-band">${escapeHtml(band.label)}</span>` : ""}</dd></div>`).join("")}</dl><div class="sky-foot"><p class="sky-source">${escapeHtml(source)}</p><button type="button" class="sky-more" data-action="navigate" data-view="monitor">Today's weather ${icon("arrow", 13)}</button></div></div></section>`;
}
