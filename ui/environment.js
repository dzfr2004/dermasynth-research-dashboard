// Weather readings: the active environment, plain-language bands for UV, humidity, haze and heat, and
// refreshing readings from the server.

import { refreshExplainability } from "./expert.js";
import { environmentEndpoint, locationPayload, refreshForecast } from "./location.js";
import { render, showToast } from "./shell.js";
import { defaultLocation, demoEnvironment, state } from "./state.js";
import { refreshWeatherOutlook } from "./weather.js";

export function activeEnvironment() {
  return state.environment || demoEnvironment;
}

export function environmentValue(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function severityFor(key, value) {
  if (value === null || value === undefined) return { severity: "low", severityLabel: "Unavailable" };
  const thresholds = {
    uvi: [8, 6],
    humidity: [90, 75],
    temperature: [35, 30],
    pm25: [35, 15],
  };
  const [high, medium] = thresholds[key] || [Infinity, Infinity];
  if (Number(value) >= high) return { severity: "high", severityLabel: "High" };
  if (Number(value) >= medium) return { severity: "medium", severityLabel: "Moderate" };
  return { severity: "low", severityLabel: "Lower" };
}

export function environmentCardsFor(environment = activeEnvironment()) {
  const readings = environment?.readings || {};
  return [
    { key: "uvi", icon: "sun", value: environmentValue(readings.uvi), unit: "UVI", label: "UV Index" },
    { key: "humidity", icon: "droplet", value: environmentValue(readings.humidity), unit: "%", label: "Humidity" },
    {
      key: "temperature",
      icon: "thermometer",
      value: environmentValue(readings.temperature),
      unit: "°C",
      label: "Temperature",
    },
    { key: "pm25", icon: "wind", value: environmentValue(readings.pm25), unit: "µg/m³", label: "PM2.5 Pollution" },
  ].map((item) => ({ ...item, ...severityFor(item.key, readings[item.key]) }));
}

export function environmentCards() {
  return environmentCardsFor(activeEnvironment());
}

export function environmentModeLabel() {
  const mode = activeEnvironment().mode;
  if (mode === "live") return "Live environment";
  if (mode === "degraded") return "Degraded environment";
  if (mode === "unavailable") return "Readings unavailable";
  if (mode === "user_reported") return "Your reported conditions";
  return "Sample weather (not live)";
}

export const SOURCE_STATUS_WORDS = Object.freeze({
  live: "live",
  demo: "sample data",
  not_configured: "not set up",
  unavailable: "unavailable",
  error: "unavailable",
  degraded: "partial",
  cached: "recent",
  user_reported: "reported by you",
  stale: "not recent",
});

export function sourceStatusWord(status) {
  return SOURCE_STATUS_WORDS[status] || String(status || "unknown").replaceAll("_", " ");
}

export function environmentSourceLabel() {
  const sources = activeEnvironment().sources || {};
  const weather = sources.weather?.status || "demo";
  const air = sources.airQuality?.status || "demo";
  if (weather === "user_reported" && air === "user_reported") return "Conditions reported by you";
  if (weather === air) return `Weather and air: ${sourceStatusWord(weather)}`;
  return `Weather ${sourceStatusWord(weather)} · Air ${sourceStatusWord(air)}`;
}

export function locationLabel() {
  return tidyPlaceName(state.selectedLocation?.name || activeEnvironment().location?.name || defaultLocation.name);
}

// "Kuala Lumpur, Kuala Lumpur, MY" reads as "Kuala Lumpur, MY".
export function tidyPlaceName(name) {
  const parts = String(name || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.filter((part, i) => i === 0 || part.toLowerCase() !== parts[i - 1].toLowerCase()).join(", ");
}

// Everyday bands: WHO UV index categories; US EPA 24-hour PM2.5 breakpoints.
export function uvBand(uvi) {
  if (uvi === null || uvi === undefined || uvi === "") return null;
  const v = Number(uvi);
  if (!Number.isFinite(v)) return null;
  if (v < 3) return { label: "low", tone: "calm" };
  if (v < 6) return { label: "moderate", tone: "mild" };
  if (v < 8) return { label: "high", tone: "warn" };
  if (v < 11) return { label: "very high", tone: "alert" };
  return { label: "extreme", tone: "alert" };
}

export function humidityBand(h) {
  if (h === null || h === undefined || h === "") return null;
  const v = Number(h);
  if (!Number.isFinite(v)) return null;
  if (v <= 50) return { label: "dry air", tone: "mild" };
  if (v >= 75) return { label: "humid", tone: "mild" };
  return { label: "comfortable", tone: "calm" };
}

export function hazeBand(pm) {
  if (pm === null || pm === undefined || pm === "") return null;
  const v = Number(pm);
  if (!Number.isFinite(v)) return null;
  if (v <= 12) return { label: "clean air", tone: "calm" };
  if (v <= 35.4) return { label: "moderate", tone: "mild" };
  if (v <= 55.4) return { label: "hazy", tone: "warn" };
  return { label: "very hazy", tone: "alert" };
}

export function temperatureBand(c) {
  if (c === null || c === undefined || c === "") return null;
  const v = Number(c);
  if (!Number.isFinite(v)) return null;
  if (v <= 15) return { label: "cold", tone: "mild" };
  if (v >= 30) return { label: "hot", tone: "warn" };
  return { label: "mild", tone: "calm" };
}

export function hazeWords(pm25) {
  const band = hazeBand(pm25);
  if (!band) return "";
  return band.label === "clean air"
    ? "Clean air"
    : band.label === "moderate"
      ? "Slightly hazy"
      : band.label[0].toUpperCase() + band.label.slice(1);
}

// 1. Today in one line: the day's decisions, from facts the run computed.
export function planningUv(readings = {}) {
  const now = Number(readings.uvi);
  const peak = Number(readings.uviMaxToday);
  const values = [now, peak].filter((v) => Number.isFinite(v));
  return values.length ? Math.max(...values) : null;
}

export async function refreshEnvironment(
  location = state.selectedLocation,
  { announce = true, locationVersion = state.locationVersion } = {},
) {
  const selected = locationPayload(location);
  const requestVersion = ++state.environmentRequestVersion;
  try {
    const response = await fetch(environmentEndpoint(selected));
    if (!response.ok) throw new Error("Environment API is unavailable");
    const payload = await response.json();
    if (requestVersion !== state.environmentRequestVersion || locationVersion !== state.locationVersion) return false;
    state.environment = payload;
    state.selectedLocation = locationPayload(payload.location || selected);
    state.lastUpdated = payload.updatedAt || "just now";
    await refreshExplainability({ shouldRender: false });
    await refreshForecast(state.selectedLocation, { shouldRender: false });
    render();
    if (state.activeView === "monitor" && !state.expertView) refreshWeatherOutlook();
    if (announce) showToast(`${environmentModeLabel()} refreshed for ${state.selectedLocation.name}.`);
    return true;
  } catch {
    if (requestVersion !== state.environmentRequestVersion || locationVersion !== state.locationVersion) return false;
    render();
    if (announce) showToast("We couldn't refresh the weather, so the last readings are shown.");
    return false;
  }
}
