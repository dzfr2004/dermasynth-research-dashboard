import { ExternalServiceError, fetchJson } from "./http-client.mjs";

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
const locationSearchCache = new Map();
const inFlightCacheLoads = new WeakMap();
const LOCATION_SEARCH_LIMIT = 5;
const LOCATION_SEARCH_CACHE_MAX = 200;
const TELEMETRY_CACHE_MAX = 200;

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
    const pm25 = rounded(pollution?.p2?.conc ?? pollution?.p2?.value ?? pollution?.p2, 1);
    const aqiUs = rounded(pollution?.aqius);

    if (aqiUs === null && pm25 === null) {
      throw new ExternalServiceError("IQAir telemetry did not include air-quality data.", {
        code: "missing_air_quality_data",
      });
    }

    return {
      readings: { pm25 },
      aqiUs,
      status: pm25 === null ? "partial" : "live",
    };
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

export async function getEnvironment(config, location = DEFAULT_LOCATION) {
  if (!config.liveServicesEnabled) {
    return demoEnvironment(location, ["Live services are disabled; the dashboard is showing labelled demo readings."], {
      weather: config.openWeather.apiKey ? "disabled" : "not_configured",
      airQuality: config.iqAir.apiKey ? "disabled" : "not_configured",
    });
  }

  const weatherRequest = config.openWeather.apiKey ? getWeather(location, config) : null;
  const airRequest = config.iqAir.apiKey ? getAirQuality(location, config) : null;
  const [weatherResult, airResult] = await Promise.all([
    weatherRequest ? weatherRequest.then((value) => ({ ok: true, value })).catch(() => ({ ok: false })) : Promise.resolve({ ok: false, skipped: true }),
    airRequest ? airRequest.then((value) => ({ ok: true, value })).catch(() => ({ ok: false })) : Promise.resolve({ ok: false, skipped: true }),
  ]);

  const noLiveData = !weatherResult.ok && !airResult.ok;
  if (noLiveData) {
    return demoEnvironment(location, ["Live environmental sources were unavailable; the dashboard is showing labelled demo readings."], {
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
    sources.weather = { provider: "OpenWeather", status: value.status, endpoint: value.variant, cached: isCached };
    if (value.readings.uvi === null) {
      notices.push("OpenWeather returned current weather without a UV index, so UVI is intentionally unavailable.");
    }
  } else if (!weatherResult.skipped) {
    notices.push("OpenWeather data is unavailable right now.");
  }

  if (airResult.ok) {
    const { value, cached: isCached } = airResult.value;
    readings.pm25 = value.readings.pm25;
    sources.airQuality = { provider: "IQAir", status: value.status, cached: isCached, aqiUs: value.aqiUs };
    if (value.readings.pm25 === null) {
      notices.push("IQAir returned AQI without a PM2.5 concentration, so PM2.5 is intentionally unavailable.");
    }
  } else if (!airResult.skipped) {
    notices.push("IQAir data is unavailable right now.");
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
