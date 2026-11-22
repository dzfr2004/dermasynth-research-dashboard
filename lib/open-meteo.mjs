import { fetchJson } from "./http-client.mjs";

/**
 * Open-Meteo (https://open-meteo.com): free weather and air-quality data that
 * needs no API key. Used in live mode
 *   - to fill readings when OpenWeather or IQAir are missing or fail, so a
 *     tester without paid keys still sees real readings for their location;
 *   - for the hourly UV and next-day forecast behind the "UV window" and
 *     "Tomorrow" features (OpenWeather's free tier has no hourly UV).
 * Data is CC BY 4.0: the app credits "Weather data by Open-Meteo.com".
 * Only rounded coordinates are sent; nothing about the user.
 */

const CACHE = new Map();
const CACHE_MS = 10 * 60 * 1000;
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

async function cachedJson(url, service, timeoutMs) {
  const key = String(url);
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await fetchJson(url, { service, timeoutMs });
  CACHE.set(key, { at: Date.now(), value });
  while (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value);
  return value;
}

/**
 * Weather + air quality for one place: current readings plus `days` days of
 * hourly and daily forecast (2 for today and tomorrow, 7 for the weekly
 * planner; the air-quality forecast may stop earlier and then reads null).
 */
export async function fetchOpenMeteo(location, { timeoutMs = 9000, baseUrl = "https://api.open-meteo.com", airBaseUrl = "https://air-quality-api.open-meteo.com", days = 2 } = {}) {
  const forecastDays = String(Math.min(Math.max(Math.round(Number(days) || 2), 1), 7));
  const lat = round2(location.lat);
  const lon = round2(location.lon);
  const weatherUrl = new URL(`${baseUrl}/v1/forecast`);
  weatherUrl.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,relative_humidity_2m,uv_index,is_day,weather_code",
    hourly: "uv_index,temperature_2m,relative_humidity_2m,precipitation_probability,weather_code",
    daily: "uv_index_max,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_probability_max,weather_code",
    timezone: "auto",
    forecast_days: forecastDays,
  }).toString();
  const airUrl = new URL(`${airBaseUrl}/v1/air-quality`);
  airUrl.search = new URLSearchParams({ latitude: String(lat), longitude: String(lon), current: "pm2_5", hourly: "pm2_5", timezone: "auto", forecast_days: forecastDays }).toString();
  const [weather, air] = await Promise.all([
    cachedJson(weatherUrl, "Open-Meteo weather", timeoutMs),
    cachedJson(airUrl, "Open-Meteo air quality", timeoutMs).catch(() => null),
  ]);
  return parseOpenMeteo(weather, air);
}

/** Exported for tests: turns the two JSON payloads into one plain structure. */
export function parseOpenMeteo(weather, air) {
  const c = weather?.current || {};
  const h = weather?.hourly || {};
  const d = weather?.daily || {};
  const pmByTime = new Map((air?.hourly?.time || []).map((t, i) => [t, num(air.hourly.pm2_5?.[i])]));
  const hourly = (h.time || []).map((time, i) => ({
    time, // local time, "2026-09-24T13:00"
    uvi: num(h.uv_index?.[i]),
    temperature: num(h.temperature_2m?.[i]),
    humidity: num(h.relative_humidity_2m?.[i]),
    precipitation: num(h.precipitation_probability?.[i]),
    weatherCode: num(h.weather_code?.[i]),
    pm25: pmByTime.get(time) ?? null,
  }));
  const daily = (d.time || []).map((date, i) => {
    const dayPm = hourly.filter((p) => p.time.startsWith(date) && p.pm25 !== null).map((p) => p.pm25);
    return {
      date,
      uviMax: num(d.uv_index_max?.[i]),
      temperatureMax: num(d.temperature_2m_max?.[i]),
      temperatureMin: num(d.temperature_2m_min?.[i]),
      humidityMean: num(d.relative_humidity_2m_mean?.[i]),
      precipitationMax: num(d.precipitation_probability_max?.[i]),
      weatherCode: num(d.weather_code?.[i]),
      pm25Mean: dayPm.length ? Math.round((dayPm.reduce((a, b) => a + b, 0) / dayPm.length) * 10) / 10 : null,
    };
  });
  return {
    provider: "Open-Meteo",
    timezone: weather?.timezone || null,
    utcOffsetSeconds: num(weather?.utc_offset_seconds) ?? 0,
    currentTime: c.time || null,
    current: {
      uvi: num(c.uv_index),
      temperature: num(c.temperature_2m),
      humidity: num(c.relative_humidity_2m),
      pm25: num(air?.current?.pm2_5),
      isDay: c.is_day === undefined ? null : Boolean(c.is_day),
      weatherCode: num(c.weather_code),
    },
    hourly,
    daily,
  };
}

// WMO weather codes in everyday words.
export function weatherWords(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return null;
  if (c === 0) return "clear skies";
  if (c <= 2) return "partly cloudy";
  if (c === 3) return "overcast";
  if (c === 45 || c === 48) return "foggy";
  if (c >= 51 && c <= 57) return "drizzle";
  if (c >= 61 && c <= 67) return "rain";
  if (c >= 71 && c <= 77) return "snow";
  if (c >= 80 && c <= 82) return "rain showers";
  if (c >= 85 && c <= 86) return "snow showers";
  if (c >= 95) return "thunderstorms";
  return null;
}

export function hourWords(time) {
  const hour = Number(String(time || "").slice(11, 13));
  if (!Number.isFinite(hour)) return "";
  if (hour === 0) return "midnight";
  if (hour === 12) return "noon";
  return hour < 12 ? `${hour} am` : `${hour - 12} pm`;
}

/**
 * Today's UV window: the hours of the current local day with UV at or above
 * `threshold` (the same threshold the routine uses to add sun protection).
 */
export function uvWindow(data, threshold = 3, date = null) {
  const now = data.currentTime || "";
  const today = date || now.slice(0, 10);
  const hours = data.hourly.filter((p) => p.time.startsWith(today) && p.uvi !== null);
  if (!hours.length) return null;
  const above = hours.filter((p) => p.uvi >= threshold);
  const peak = hours.reduce((best, p) => (p.uvi > best.uvi ? p : best), hours[0]);
  if (!above.length) return { threshold, start: null, end: null, peak: { uvi: peak.uvi, time: peak.time }, allDayBelow: true, passed: false };
  const start = above[0].time;
  const lastAbove = above[above.length - 1].time;
  const endHour = Number(lastAbove.slice(11, 13)) + 1;
  const end = `${today}T${String(Math.min(endHour, 23)).padStart(2, "0")}:00`;
  return { threshold, start, end, peak: { uvi: peak.uvi, time: peak.time }, allDayBelow: false, passed: today === now.slice(0, 10) && now >= end };
}
