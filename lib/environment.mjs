import { ExternalServiceError, fetchJson } from "./http-client.mjs";
import { fetchOpenMeteo } from "./open-meteo.mjs";

export const DEFAULT_LOCATION = Object.freeze({
  name: "Kuala Lumpur, MY",
  lat: 3.139,
  lon: 101.6869,
});

const DEMO_READINGS = Object.freeze({
  uvi: 9,
  humidity: 84,
  temperature: 32,
  pm25: 58,
});

const weatherCache = new Map();
const airQualityCache = new Map();
const forecastCache = new Map();
const locationSearchCache = new Map();
const inFlightCacheLoads = new WeakMap();
const providerReliabilityLog = new Map();
const LOCATION_SEARCH_LIMIT = 5;
const LOCATION_SEARCH_CACHE_MAX = 200;
const TELEMETRY_CACHE_MAX = 200;

function recordProviderResult(provider, { ok, cached = false, latencyMs = null, status = "unknown" } = {}) {
  const prior = providerReliabilityLog.get(provider) || { attempts: 0, successes: 0, failures: 0, cached: 0, latencyTotal: 0, latencyCount: 0, lastStatus: "unknown", updatedAt: null };
  const next = {
    attempts: prior.attempts + 1,
    successes: prior.successes + (ok ? 1 : 0),
    failures: prior.failures + (ok ? 0 : 1),
    cached: prior.cached + (cached ? 1 : 0),
    latencyTotal: prior.latencyTotal + (Number.isFinite(latencyMs) ? latencyMs : 0),
    latencyCount: prior.latencyCount + (Number.isFinite(latencyMs) ? 1 : 0),
    lastStatus: status,
    updatedAt: new Date().toISOString(),
  };
  providerReliabilityLog.set(provider, next);
  return providerReliability(provider);
}

function providerReliability(provider) {
  const value = providerReliabilityLog.get(provider);
  if (!value) return { provider, attempts: 0, successRate: null, averageLatencyMs: null, lastStatus: "not_observed", updatedAt: null };
  return {
    provider,
    attempts: value.attempts,
    successRate: value.attempts ? Math.round((value.successes / value.attempts) * 1000) / 10 : null,
    averageLatencyMs: value.latencyCount ? Math.round(value.latencyTotal / value.latencyCount) : null,
    cachedResponses: value.cached,
    lastStatus: value.lastStatus,
    updatedAt: value.updatedAt,
  };
}

export function providerReliabilitySnapshot() {
  return ["OpenWeather", "IQAir", "OpenWeather Air Pollution"].map(providerReliability);
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rounded(value, digits = 0) {
  const parsed = numeric(value);
  if (parsed === null) return null;
  const multiplier = 10 ** digits;
  return Math.round(parsed * multiplier) / multiplier;
}

function cacheKey(location) {
  return `${location.lat.toFixed(3)},${location.lon.toFixed(3)}`;
}

async function cached(cache, key, seconds, loader, maximumEntries = Infinity) {
  const existing = cache.get(key);
  if (existing && Date.now() - existing.savedAt < seconds * 1_000) {
    return { value: existing.value, cached: true };
  }

  let loads = inFlightCacheLoads.get(cache);
  if (!loads) {
    loads = new Map();
    inFlightCacheLoads.set(cache, loads);
  }

  const pending = loads.get(key);
  if (pending) return pending;

  const load = (async () => {
    const value = await loader();
    if (!cache.has(key) && cache.size >= maximumEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
    cache.set(key, { value, savedAt: Date.now() });
    return { value, cached: false };
  })();
  loads.set(key, load);

  try {
    return await load;
  } finally {
    if (loads.get(key) === load) loads.delete(key);
  }
}

function locationText(value, maximum = 80) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function normaliseLocationCandidate(value) {
  const name = locationText(value?.name);
  const lat = numeric(value?.lat);
  const lon = numeric(value?.lon);
  if (!name || lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const state = locationText(value?.state);
  const country = locationText(value?.country, 12);
  const label = [name, state, country].filter(Boolean).join(", ");
  return {
    name,
    state: state || null,
    country: country || null,
    label,
    lat: rounded(lat, 4),
    lon: rounded(lon, 4),
  };
}

export async function searchLocations(config, query) {
  if (!config.liveServicesEnabled) {
    return {
      mode: "disabled",
      locations: [],
      cached: false,
      notices: ["Location search is unavailable while live services are disabled."],
    };
  }
  if (!config.openWeather.apiKey) {
    return {
      mode: "not_configured",
      locations: [],
      cached: false,
      notices: ["Location search needs an OpenWeather API key."],
    };
  }

  const cleanedQuery = locationText(query, 80);
  const cacheKey = cleanedQuery.toLowerCase();
  try {
    const result = await cached(locationSearchCache, cacheKey, config.locationSearchCacheSeconds, async () => {
      const url = new URL("https://api.openweathermap.org/geo/1.0/direct");
      url.search = new URLSearchParams({
        q: cleanedQuery,
        limit: String(LOCATION_SEARCH_LIMIT),
        appid: config.openWeather.apiKey,
      }).toString();
      const payload = await fetchJson(url, {
        service: "OpenWeather location search",
        timeoutMs: config.requestTimeoutMs,
      });
      if (!Array.isArray(payload)) return [];
      return payload.map(normaliseLocationCandidate).filter(Boolean).slice(0, LOCATION_SEARCH_LIMIT);
    }, LOCATION_SEARCH_CACHE_MAX);

    return {
      mode: "live",
      locations: result.value,
      cached: result.cached,
      notices: result.value.length ? [] : ["No matching city or area was found."],
    };
  } catch {
    return {
      mode: "unavailable",
      locations: [],
      cached: false,
      notices: ["Location search is unavailable right now."],
    };
  }
}

async function getWeather(location, config) {
  const key = cacheKey(location);
  return cached(weatherCache, key, config.environmentCacheSeconds, async () => {
    const oneCallUrl = new URL("https://api.openweathermap.org/data/3.0/onecall");
    oneCallUrl.search = new URLSearchParams({
      lat: String(location.lat),
      lon: String(location.lon),
      exclude: "minutely,hourly,daily,alerts",
      units: "metric",
      appid: config.openWeather.apiKey,
    }).toString();

    try {
      const payload = await fetchJson(oneCallUrl, {
        service: "OpenWeather telemetry",
        timeoutMs: config.requestTimeoutMs,
      });
      const current = payload?.current;
      const temperature = rounded(current?.temp, 1);
      const humidity = rounded(current?.humidity);
      const uvi = rounded(current?.uvi, 1);

      if (temperature === null || humidity === null) {
        throw new ExternalServiceError("OpenWeather telemetry did not include current weather.", {
          code: "missing_weather_data",
        });
      }

      return {
        readings: { temperature, humidity, uvi },
        variant: "One Call 3.0",
        status: uvi === null ? "partial" : "live",
      };
    } catch {
      // One Call 3.0 needs a separate subscription. The current-weather endpoint
      // still provides temperature and humidity, but deliberately not a fake UVI.
      const currentUrl = new URL("https://api.openweathermap.org/data/2.5/weather");
      currentUrl.search = new URLSearchParams({
        lat: String(location.lat),
        lon: String(location.lon),
        units: "metric",
        appid: config.openWeather.apiKey,
      }).toString();

      const payload = await fetchJson(currentUrl, {
        service: "OpenWeather telemetry",
        timeoutMs: config.requestTimeoutMs,
      });
      const temperature = rounded(payload?.main?.temp, 1);
      const humidity = rounded(payload?.main?.humidity);

      if (temperature === null || humidity === null) {
        throw new ExternalServiceError("OpenWeather telemetry did not include current weather.", {
          code: "missing_weather_data",
        });
      }

      return {
        readings: { temperature, humidity, uvi: null },
        variant: "Current Weather 2.5",
        status: "partial",
      };
    }
  }, TELEMETRY_CACHE_MAX);
}

async function getAirQuality(location, config) {
  const key = cacheKey(location);
  return cached(airQualityCache, key, config.airQualityCacheSeconds, async () => {
    let aqiUs = null;
    let iqAirPm25 = null;
    try {
      const url = new URL("https://api.airvisual.com/v2/nearest_city");
      url.search = new URLSearchParams({
        lat: String(location.lat),
        lon: String(location.lon),
        key: config.iqAir.apiKey,
      }).toString();
      const payload = await fetchJson(url, {
        service: "IQAir telemetry",
        timeoutMs: config.requestTimeoutMs,
      });
      const pollution = payload?.data?.current?.pollution;
      iqAirPm25 = rounded(pollution?.p2?.conc ?? pollution?.p2?.value ?? pollution?.p2, 1);
      aqiUs = rounded(pollution?.aqius);
    } catch {
      // OpenWeather remains a real concentration fallback when IQAir is down.
    }

    if (iqAirPm25 !== null) {
      return { readings: { pm25: iqAirPm25 }, aqiUs, status: "live", provider: "IQAir" };
    }

    const fallbackUrl = new URL("https://api.openweathermap.org/data/2.5/air_pollution");
    fallbackUrl.search = new URLSearchParams({
      lat: String(location.lat),
      lon: String(location.lon),
      appid: config.openWeather.apiKey,
    }).toString();
    const fallbackPayload = await fetchJson(fallbackUrl, {
      service: "OpenWeather air-pollution telemetry",
      timeoutMs: config.requestTimeoutMs,
    });
    const pm25 = rounded(fallbackPayload?.list?.[0]?.components?.pm2_5, 1);
    if (pm25 === null) {
      throw new ExternalServiceError("Air-quality providers did not include a PM2.5 concentration.", {
        code: "missing_air_quality_data",
      });
    }
    return {
      readings: { pm25 },
      aqiUs,
      status: "live",
      provider: "OpenWeather Air Pollution",
      fallbackFrom: aqiUs === null ? "IQAir unavailable" : "IQAir AQI-only response",
    };
  }, TELEMETRY_CACHE_MAX);
}

function forecastPoint({ at, temperature, humidity, uvi, source }) {
  if (!at || temperature === null || humidity === null) return null;
  return { at, readings: { temperature, humidity, uvi, pm25: null }, source };
}

async function getWeatherForecast(location, config) {
  const key = cacheKey(location);
  return cached(forecastCache, key, config.environmentCacheSeconds, async () => {
    const oneCallUrl = new URL("https://api.openweathermap.org/data/3.0/onecall");
    oneCallUrl.search = new URLSearchParams({ lat: String(location.lat), lon: String(location.lon), exclude: "minutely,current,alerts", units: "metric", appid: config.openWeather.apiKey }).toString();
    try {
      const payload = await fetchJson(oneCallUrl, { service: "OpenWeather forecast", timeoutMs: config.requestTimeoutMs });
      const hourly = (payload?.hourly || []).slice(0, 24).map((entry) => forecastPoint({
        at: new Date(Number(entry.dt) * 1000).toISOString(), temperature: rounded(entry.temp, 1), humidity: rounded(entry.humidity), uvi: rounded(entry.uvi, 1), source: "OpenWeather One Call 3.0",
      })).filter(Boolean);
      const daily = (payload?.daily || []).slice(0, 7).map((entry) => forecastPoint({
        at: new Date(Number(entry.dt) * 1000).toISOString(), temperature: rounded(entry.temp?.day, 1), humidity: rounded(entry.humidity), uvi: rounded(entry.uvi, 1), source: "OpenWeather One Call 3.0",
      })).filter(Boolean);
      if (!hourly.length && !daily.length) throw new ExternalServiceError("OpenWeather forecast did not include usable weather points.", { code: "missing_forecast_data" });
      return { status: "live", provider: "OpenWeather", endpoint: "One Call 3.0", hourly, daily };
    } catch {
      const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
      url.search = new URLSearchParams({ lat: String(location.lat), lon: String(location.lon), units: "metric", appid: config.openWeather.apiKey }).toString();
      const payload = await fetchJson(url, { service: "OpenWeather forecast", timeoutMs: config.requestTimeoutMs });
      const hourly = (payload?.list || []).slice(0, 8).map((entry) => forecastPoint({
        at: new Date(Number(entry.dt) * 1000).toISOString(), temperature: rounded(entry.main?.temp, 1), humidity: rounded(entry.main?.humidity), uvi: null, source: "OpenWeather 5-day / 3-hour",
      })).filter(Boolean);
      const dailyByDate = new Map();
      for (const point of (payload?.list || [])) {
        const date = String(point.dt_txt || "").slice(0, 10);
        if (!date || dailyByDate.has(date)) continue;
        const mapped = forecastPoint({ at: new Date(Number(point.dt) * 1000).toISOString(), temperature: rounded(point.main?.temp, 1), humidity: rounded(point.main?.humidity), uvi: null, source: "OpenWeather 5-day / 3-hour" });
        if (mapped) dailyByDate.set(date, mapped);
        if (dailyByDate.size >= 5) break;
      }
      if (!hourly.length) throw new ExternalServiceError("OpenWeather forecast did not include usable weather points.", { code: "missing_forecast_data" });
      return { status: "partial", provider: "OpenWeather", endpoint: "5-day / 3-hour", hourly, daily: [...dailyByDate.values()] };
    }
  }, TELEMETRY_CACHE_MAX);
}

function demoEnvironment(location, notices, sourceStatuses = {}) {
  return {
    mode: "demo",
    location,
    observedAt: new Date().toISOString(),
    updatedAt: "just now",
    readings: { ...DEMO_READINGS },
    sources: {
      weather: { provider: "OpenWeather", status: sourceStatuses.weather || "demo" },
      airQuality: { provider: "IQAir", status: sourceStatuses.airQuality || "demo" },
    },
    notices,
  };
}

/**
 * Live readings could not be fetched. No readings are invented: the routine
 * endpoint asks the user to describe today's conditions instead
 * (see reportedConditionsEnvironment). Demo readings are only ever used when
 * live services are switched off (development and offline tests).
 */
function unavailableEnvironment(location, notices, sourceStatuses = {}) {
  return {
    mode: "unavailable",
    location,
    observedAt: new Date().toISOString(),
    updatedAt: "unavailable",
    readings: { uvi: null, humidity: null, temperature: null, pm25: null },
    needsUserConditions: true,
    sources: {
      weather: { provider: "OpenWeather", status: sourceStatuses.weather || "unavailable" },
      airQuality: { provider: "IQAir", status: sourceStatuses.airQuality || "unavailable" },
    },
    notices,
  };
}

// What the user can report, and the approximate reading each choice stands
// for. The routine rules only need to know which side of each threshold the
// day is on (UV 3 and 8, humidity 50% and 75%, PM2.5 55), so coarse choices
// are enough; the values sit safely inside each band.
export const REPORTED_CONDITION_OPTIONS = Object.freeze({
  sky: Object.freeze({ strong_sun: { label: "Strong sun", uvi: 9 }, some_sun: { label: "Some sun / hazy sun", uvi: 5 }, overcast: { label: "Overcast or rainy", uvi: 2 }, night: { label: "Night / indoors all day", uvi: 0 } }),
  air: Object.freeze({ dry: { label: "Dry", humidity: 40 }, comfortable: { label: "Comfortable", humidity: 62 }, humid: { label: "Humid / sticky", humidity: 82 } }),
  haze: Object.freeze({ clear: { label: "Clear air", pm25: 15 }, hazy: { label: "Hazy", pm25: 70 }, smoky: { label: "Smoke or heavy haze", pm25: 130 } }),
  temperature: Object.freeze({ cold: { label: "Cold", temperature: 8 }, mild: { label: "Mild", temperature: 22 }, hot: { label: "Hot", temperature: 33 } }),
});

export function parseReportedConditions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const chosen = {};
  for (const key of Object.keys(REPORTED_CONDITION_OPTIONS)) {
    const option = String(value[key] || "").trim();
    if (!Object.hasOwn(REPORTED_CONDITION_OPTIONS[key], option)) return null;
    chosen[key] = option;
  }
  return chosen;
}

export function reportedConditionsEnvironment(location, conditions) {
  const o = REPORTED_CONDITION_OPTIONS;
  return {
    mode: "user_reported",
    location,
    observedAt: new Date().toISOString(),
    updatedAt: "reported by you",
    readings: {
      uvi: o.sky[conditions.sky].uvi,
      humidity: o.air[conditions.air].humidity,
      temperature: o.temperature[conditions.temperature].temperature,
      pm25: o.haze[conditions.haze].pm25,
    },
    reportedConditions: conditions,
    sources: {
      weather: { provider: "You", status: "user_reported" },
      airQuality: { provider: "You", status: "user_reported" },
    },
    notices: [`Live readings were unavailable, so this routine uses the conditions you reported: ${o.sky[conditions.sky].label.toLowerCase()}, ${o.air[conditions.air].label.toLowerCase()} air, ${o.haze[conditions.haze].label.toLowerCase()}, ${o.temperature[conditions.temperature].label.toLowerCase()}. Readings shown are approximate values for those choices.`],
  };
}

export async function getEnvironment(config, location = DEFAULT_LOCATION) {
  if (!config.liveServicesEnabled) {
    return demoEnvironment(location, ["Live services are disabled; the dashboard is showing labelled demo readings."], {
      weather: config.openWeather.apiKey ? "disabled" : "not_configured",
      airQuality: config.iqAir.apiKey ? "disabled" : "not_configured",
    });
  }

  const startedAt = Date.now();
  const weatherRequest = config.openWeather.apiKey ? getWeather(location, config) : null;
  const airRequest = config.iqAir.apiKey ? getAirQuality(location, config) : null;
  const [weatherResult, airResult] = await Promise.all([
    weatherRequest ? weatherRequest.then((value) => ({ ok: true, value })).catch(() => ({ ok: false })) : Promise.resolve({ ok: false, skipped: true }),
    airRequest ? airRequest.then((value) => ({ ok: true, value })).catch(() => ({ ok: false })) : Promise.resolve({ ok: false, skipped: true }),
  ]);
  const latencyMs = Date.now() - startedAt;
  const weatherReliability = recordProviderResult("OpenWeather", { ok: weatherResult.ok, cached: Boolean(weatherResult.value?.cached), latencyMs, status: weatherResult.value?.value?.status || (weatherResult.skipped ? "not_configured" : "unavailable") });
  const airProvider = airResult.value?.value?.provider || "IQAir";
  const airReliability = recordProviderResult(airProvider, { ok: airResult.ok, cached: Boolean(airResult.value?.cached), latencyMs, status: airResult.value?.value?.status || (airResult.skipped ? "not_configured" : "unavailable") });

  // Keyless fallback: fill any reading the keyed providers could not supply
  // from Open-Meteo, so real readings are used instead of asking the user.
  let openMeteo = null;
  const missingAny = !weatherResult.ok || !airResult.ok || weatherResult.value?.value?.readings?.uvi === null;
  if (missingAny && config.openMeteo?.enabled) {
    try { openMeteo = await fetchOpenMeteo(location, { timeoutMs: config.requestTimeoutMs, baseUrl: config.openMeteo.baseUrl, airBaseUrl: config.openMeteo.airBaseUrl }); } catch { openMeteo = null; }
  }

  const noLiveData = !weatherResult.ok && !airResult.ok && !openMeteo;
  if (noLiveData) {
    return unavailableEnvironment(location, ["Live environmental readings are unavailable right now, so no readings are shown. Describe today's conditions to get a routine."], {
      weather: weatherResult.skipped ? "not_configured" : "unavailable",
      airQuality: airResult.skipped ? "not_configured" : "unavailable",
    });
  }

  const readings = { uvi: null, humidity: null, temperature: null, pm25: null };
  const notices = [];
  const sources = {
    weather: { provider: "OpenWeather", status: weatherResult.skipped ? "not_configured" : "unavailable" },
    airQuality: { provider: "IQAir", status: airResult.skipped ? "not_configured" : "unavailable" },
  };

  if (weatherResult.ok) {
    const { value, cached: isCached } = weatherResult.value;
    Object.assign(readings, value.readings);
    sources.weather = { provider: "OpenWeather", status: value.status, endpoint: value.variant, cached: isCached, reliability: weatherReliability };
    if (value.readings.uvi === null) {
      notices.push("OpenWeather returned current weather without a UV index, so UVI is intentionally unavailable.");
    }
  } else if (!weatherResult.skipped) {
    notices.push("OpenWeather data is unavailable right now.");
  }

  if (airResult.ok) {
    const { value, cached: isCached } = airResult.value;
    readings.pm25 = value.readings.pm25;
    sources.airQuality = { provider: value.provider || "IQAir", status: value.status, cached: isCached, aqiUs: value.aqiUs, fallbackFrom: value.fallbackFrom || null, reliability: airReliability };
    if (value.fallbackFrom) notices.push(`PM2.5 is supplied by OpenWeather Air Pollution because ${value.fallbackFrom}.`);
  } else if (!airResult.skipped) {
    notices.push("IQAir data is unavailable right now.");
  }

  if (openMeteo) {
    const om = openMeteo.current;
    const filled = [];
    for (const key of ["uvi", "humidity", "temperature"]) if (readings[key] === null && om[key] !== null) { readings[key] = om[key]; filled.push(key); }
    if (filled.length) sources.weather = { ...(weatherResult.ok ? sources.weather : {}), provider: weatherResult.ok ? `OpenWeather + Open-Meteo (${filled.join(", ")})` : "Open-Meteo", status: "live" };
    if (readings.pm25 === null && om.pm25 !== null) { readings.pm25 = om.pm25; sources.airQuality = { provider: "Open-Meteo", status: "live" }; filled.push("pm25"); }
    if (filled.length) notices.push(`Weather data by Open-Meteo.com (${filled.join(", ")}).`);
  }

  const complete = Object.values(readings).every((value) => value !== null);
  return {
    mode: complete ? "live" : "degraded",
    location,
    observedAt: new Date().toISOString(),
    updatedAt: "just now",
    readings,
    sources,
    notices,
  };
}

/** Returns labelled weather forecast contexts. PM2.5 remains unavailable for
 * future periods unless a provider supplies an actual forecast value. */
export async function getEnvironmentForecast(config, location = DEFAULT_LOCATION) {
  const current = await getEnvironment(config, location);
  if (!config.liveServicesEnabled || !config.openWeather.apiKey) {
    return { location, generatedAt: new Date().toISOString(), status: "not_configured", current, periods: [], providers: providerReliabilitySnapshot() };
  }
  const startedAt = Date.now();
  try {
    const result = await getWeatherForecast(location, config);
    const reliability = recordProviderResult("OpenWeather", { ok: true, cached: result.cached, latencyMs: Date.now() - startedAt, status: result.value.status });
    const toPeriod = (point, horizon) => ({
      horizon,
      at: point.at,
      environment: {
        mode: point.readings.uvi === null ? "degraded" : "live",
        location,
        observedAt: point.at,
        readings: point.readings,
        sources: { weather: { provider: result.value.provider, status: result.value.status, endpoint: result.value.endpoint, cached: result.cached, reliability }, airQuality: { provider: "No forecast provider", status: "unavailable" } },
        notices: point.readings.uvi === null ? ["This forecast provider did not return UV values for this period."] : [],
      },
    });
    return {
      location,
      generatedAt: new Date().toISOString(),
      status: result.value.status,
      current,
      next24Hours: result.value.hourly.map((point) => toPeriod(point, "24h")),
      next7Days: result.value.daily.map((point) => toPeriod(point, "7d")),
      providers: providerReliabilitySnapshot(),
    };
  } catch {
    recordProviderResult("OpenWeather", { ok: false, latencyMs: Date.now() - startedAt, status: "unavailable" });
    return { location, generatedAt: new Date().toISOString(), status: "unavailable", current, next24Hours: [], next7Days: [], providers: providerReliabilitySnapshot() };
  }
}

/** Name for a coordinate the browser supplied ("Use my location"). */
export async function reverseLocation(config, lat, lon) {
  if (!config.liveServicesEnabled || !config.openWeather.apiKey) return null;
  try {
    const url = new URL("https://api.openweathermap.org/geo/1.0/reverse");
    url.search = new URLSearchParams({ lat: String(lat), lon: String(lon), limit: "1", appid: config.openWeather.apiKey }).toString();
    const payload = await fetchJson(url, { service: "OpenWeather reverse geocoding", timeoutMs: config.requestTimeoutMs });
    const place = Array.isArray(payload) ? payload[0] : null;
    if (!place?.name) return null;
    return [locationText(place.name, 60), locationText(place.country || "", 4)].filter(Boolean).join(", ");
  } catch {
    return null;
  }
}
