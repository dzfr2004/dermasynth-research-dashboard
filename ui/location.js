// Choosing a location: the location picker, search, saved location and the browser's current location.

import { activeEnvironment, locationLabel, refreshEnvironment } from "./environment.js";
import { render, showToast } from "./shell.js";
import { defaultLocation, state } from "./state.js";
import { resetPreviewForInputChange } from "./today.js";
import { escapeHtml, icon } from "./util.js";

export function locationResultLabel(location) {
  return (
    location?.label ||
    [location?.name, location?.state, location?.country].filter(Boolean).join(", ") ||
    "Unnamed location"
  );
}

export function locationPicker({ label = "Weather location", compact = false } = {}) {
  const results = state.locationResults || [];
  const expanded = results.length > 0;
  const searching = state.locationSearchStatus === "searching";
  const updating = isLocationUpdating();
  const busy = searching || updating || state.runStatus === "running";
  const notice = searching
    ? "Searching OpenWeather locations…"
    : state.locationSearchNotice || `Weather for ${locationLabel()}.`;

  return `<div class="field location-picker ${compact ? "is-compact" : ""}"><label for="location-search">${escapeHtml(label)}</label><div class="location-input-row"><input id="location-search" type="search" value="${escapeHtml(state.locationQuery)}" placeholder="Search city or area" autocomplete="off" data-action="location-query" role="combobox" aria-autocomplete="list" aria-controls="location-results" aria-expanded="${expanded}" aria-busy="${busy}" ${busy ? "disabled" : ""} /><button class="location-search-button" type="button" data-action="location-search" ${busy ? "disabled" : ""}>${icon("pin", 14)} Search</button></div>${expanded ? `<div class="location-results" id="location-results" role="listbox" aria-label="Matching locations">${results.map((location, index) => `<button type="button" class="location-option" role="option" aria-selected="false" data-action="select-location" data-location-index="${index}" ${busy ? "disabled" : ""}><span>${escapeHtml(locationResultLabel(location))}</span><small>${Number(location.lat).toFixed(4)}, ${Number(location.lon).toFixed(4)}</small></button>`).join("")}</div>` : ""}<div class="location-status" role="status" aria-live="polite"><span>${escapeHtml(notice)}</span><button type="button" data-action="use-my-location" ${busy ? "disabled" : ""}>${icon("pin", 12)} Use my location</button></div>${compact ? "" : `<p class="location-privacy">Your location is only used to look up the weather. It is rounded to about 1 km and remembered in this browser.</p>`}</div>`;
}

export function isLocationUpdating() {
  return state.locationSearchStatus === "updating";
}

export function cancelLocationSearch() {
  state.locationSearchVersion += 1;
  if (state.locationSearchController) {
    state.locationSearchController.abort();
    state.locationSearchController = null;
  }
}

export function locationPayload(location = state.selectedLocation) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { ...defaultLocation };
  }
  return {
    name: String(location?.name || defaultLocation.name).trim() || defaultLocation.name,
    lat,
    lon,
  };
}

export function environmentEndpoint(location = state.selectedLocation) {
  const selected = locationPayload(location);
  const query = new URLSearchParams({
    lat: String(selected.lat),
    lon: String(selected.lon),
    location: selected.name,
  });
  return `/api/environment?${query}`;
}

export function forecastEndpoint(location = state.selectedLocation) {
  const selected = locationPayload(location);
  const query = new URLSearchParams({
    concern: state.concern,
    lat: String(selected.lat),
    lon: String(selected.lon),
    location: selected.name,
  });
  return `/api/environment/forecast?${query}`;
}

export async function refreshForecast(location = state.selectedLocation, { shouldRender = true } = {}) {
  try {
    const response = await fetch(forecastEndpoint(location));
    if (!response.ok) throw new Error("Forecast API is unavailable");
    state.forecast = await response.json();
  } catch {
    state.forecast = { status: "unavailable", next24Hours: [], next7Days: [], providerReliability: [] };
  }
  refreshForecastSynthesis();
  if (shouldRender) render();
}

export function forecastSynthesisFacts() {
  const hourly = Array.isArray(state.forecast?.next24Hours) ? state.forecast.next24Hours : [];
  const summarise = (key, digits) => {
    const values = hourly.map((period) => Number(period.environment?.readings?.[key])).filter(Number.isFinite);
    if (!values.length) return null;
    const round = (n) => Number(n.toFixed(digits));
    return {
      low: round(Math.min(...values)),
      high: round(Math.max(...values)),
      start: round(values[0]),
      end: round(values[values.length - 1]),
    };
  };
  const pm = Number(activeEnvironment().readings?.pm25);
  return {
    scope:
      "Next 24-hour environmental trend for one location. Numeric context only; not a clinical or product recommendation.",
    location: state.selectedLocation?.name || "selected location",
    concern: state.concern || "general",
    hours: hourly.length,
    uv_index: summarise("uvi", 1),
    humidity_percent: summarise("humidity", 0),
    temperature_celsius: summarise("temperature", 1),
    pm25_now_ugm3: Number.isFinite(pm) ? Number(pm.toFixed(1)) : null,
  };
}

export async function refreshForecastSynthesis() {
  const facts = forecastSynthesisFacts();
  const key = JSON.stringify(facts);
  if (!facts.hours) {
    state.forecastSynthesis = { status: "unavailable", text: "", generatedAt: "" };
    state.forecastSynthesisKey = key;
    return;
  }
  if (key === state.forecastSynthesisKey && state.forecastSynthesis?.status === "available") return;
  state.forecastSynthesisKey = key;
  state.forecastSynthesis = { status: "loading", text: "", generatedAt: "" };
  render();
  try {
    const response = await fetch("/api/ai/augment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "forecast", facts }),
    });
    if (!response.ok) throw new Error("Forecast synthesis is unavailable");
    const payload = await response.json();
    if (key !== state.forecastSynthesisKey) return;
    if (payload.status === "available" && payload.text) {
      state.forecastSynthesis = { status: "available", text: payload.text, generatedAt: payload.generatedAt || "" };
    } else {
      state.forecastSynthesis = { status: "unavailable", text: "", generatedAt: "" };
    }
  } catch {
    if (key !== state.forecastSynthesisKey) return;
    state.forecastSynthesis = { status: "unavailable", text: "", generatedAt: "" };
  }
  render();
}

export async function searchLocations() {
  if (isLocationUpdating() || state.runStatus === "running") return;
  const query = state.locationQuery.trim();
  if (query.length < 2) {
    state.locationResults = [];
    state.locationSearchStatus = "error";
    state.locationSearchNotice = "Enter at least two characters to search for a location.";
    render();
    return;
  }

  state.locationResults = [];
  state.locationSearchStatus = "searching";
  state.locationSearchNotice = "";
  if (state.locationSearchController) state.locationSearchController.abort();
  const requestVersion = ++state.locationSearchVersion;
  const controller = new AbortController();
  state.locationSearchController = controller;
  render();
  try {
    const response = await fetch(`/api/locations?q=${encodeURIComponent(query)}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Location search is unavailable");
    const payload = await response.json();
    if (requestVersion !== state.locationSearchVersion) return;
    state.locationResults = Array.isArray(payload.locations) ? payload.locations : [];
    state.locationSearchStatus = state.locationResults.length ? "ready" : "empty";
    state.locationSearchNotice = payload.notices?.[0] || "";
    render();
  } catch {
    if (requestVersion !== state.locationSearchVersion) return;
    state.locationResults = [];
    state.locationSearchStatus = "error";
    state.locationSearchNotice = "Location search is unavailable right now.";
    render();
  } finally {
    if (state.locationSearchController === controller) state.locationSearchController = null;
  }
}

export async function applyLocation(location) {
  if (isLocationUpdating() || state.runStatus === "running") return;
  const selected = locationPayload(location);
  const locationVersion = ++state.locationVersion;
  cancelLocationSearch();
  state.locationResults = [];
  state.locationSearchStatus = "updating";
  state.locationSearchNotice = `Updating readings for ${selected.name}…`;
  render();

  const refreshed = await refreshEnvironment(selected, { announce: false, locationVersion });
  if (locationVersion !== state.locationVersion) return;
  if (!refreshed) {
    state.locationSearchStatus = "error";
    state.locationSearchNotice = `Could not update readings for ${selected.name}; the previous location remains active.`;
    render();
    showToast("We couldn't get the weather for that place, so the previous readings are kept.");
    return;
  }

  state.locationQuery = state.selectedLocation.name;
  saveLocation(state.selectedLocation);
  state.locationResults = [];
  state.locationSearchStatus = "selected";
  state.locationSearchNotice = `Weather location: ${selected.name}`;
  resetPreviewForInputChange();
  render();
  showToast(`Weather readings updated for ${selected.name}.`);
}

export async function selectLocation(index) {
  const result = state.locationResults[index];
  if (!result) return;
  await applyLocation({ name: locationResultLabel(result), lat: result.lat, lon: result.lon });
}

export const LOCATION_STORAGE_KEY = "dermasynth.location.v1";

export function loadSavedLocation() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(LOCATION_STORAGE_KEY) || "null");
    if (saved && Number.isFinite(Number(saved.lat)) && Number.isFinite(Number(saved.lon)))
      return {
        name: String(saved.name || "Your location").slice(0, 80),
        lat: Number(saved.lat),
        lon: Number(saved.lon),
      };
  } catch {
    /* storage unavailable */
  }
  return null;
}

export function saveLocation(location) {
  try {
    window.localStorage.setItem(
      LOCATION_STORAGE_KEY,
      JSON.stringify({ name: location.name, lat: location.lat, lon: location.lon }),
    );
  } catch {
    /* storage unavailable */
  }
}

// Current location from the browser (it asks the user first). Coordinates are
// rounded to ~1 km; the name comes from the server's reverse lookup.
//
// Browsers only share GPS with secure pages (https or localhost). Phones in the
// user study open the app at http://192.168.x.x over the Wi-Fi, so there the
// browser refuses without asking. In that case, and when GPS times out or is
// unavailable, the app uses the approximate area of the network instead. It
// never does that after the person has said no to sharing their location.
export function gpsPosition(options) {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));
}

export async function geolocationPermission() {
  try {
    return (await navigator.permissions?.query({ name: "geolocation" }))?.state || "unknown";
  } catch {
    return "unknown";
  }
}

export async function useNetworkLocation() {
  try {
    const reply = await fetch("/api/locations/network").then((r) => r.json());
    if (!reply?.available) return false;
    await applyLocation({ name: reply.name, lat: reply.lat, lon: reply.lon });
    state.locationSearchNotice = `Using your approximate area (${reply.name}). If that's not right, search for your city.`;
    render();
    return true;
  } catch {
    return false;
  }
}

export async function useMyLocation({ silent = false } = {}) {
  if (!silent) {
    state.locationSearchNotice = "Finding your location…";
    render();
  }
  let reason = "unsupported";
  if (window.isSecureContext && "geolocation" in navigator) {
    try {
      let position;
      try {
        position = await gpsPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
      } catch (error) {
        if (error?.code !== 3) throw error;
        // Timed out: one more try that may use GPS (slower, but works indoors less often).
        position = await gpsPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      }
      const lat = Math.round(position.coords.latitude * 100) / 100;
      const lon = Math.round(position.coords.longitude * 100) / 100;
      let name = "Your location";
      try {
        const reply = await fetch(`/api/locations/reverse?lat=${lat}&lon=${lon}`).then((r) => r.json());
        if (reply?.name) name = reply.name;
      } catch {
        /* keep the generic name */
      }
      await applyLocation({ name, lat, lon });
      return true;
    } catch (error) {
      reason = error?.code === 1 ? "denied" : error?.code === 3 ? "timeout" : "unavailable";
    }
  } else if (!window.isSecureContext) {
    reason = "insecure";
  }
  if (reason === "denied") {
    try {
      window.localStorage.setItem(`${LOCATION_STORAGE_KEY}.asked`, "1");
    } catch {
      /* ignore */
    }
    if (!silent) {
      state.locationSearchNotice =
        "Location is turned off for this site. Search for your city, or allow location in your browser settings.";
      render();
    }
    return false;
  }
  if (await useNetworkLocation()) return true;
  if (!silent) {
    state.locationSearchNotice =
      reason === "timeout"
        ? "Your phone took too long to find its location. Search for your city instead."
        : reason === "insecure"
          ? "This connection can't share your phone's location. Search for your city instead."
          : "Your location isn't available right now. Search for your city instead.";
    render();
  }
  return false;
}
