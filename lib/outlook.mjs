import { fetchOpenMeteo, hourWords, uvWindow, weatherWords } from "./open-meteo.mjs";
import { templateRoutine } from "./safety.mjs";
import { getRuntimePolicy } from "./policy-store.mjs";
import { planningUvi } from "./uv.mjs";

/**
 * Timing and tomorrow outlook for the consumer view (no GPT, no user data
 * stored). Built from the Open-Meteo hourly and next-day forecast:
 *   - today: the hours when UV is at or above the level that adds sun
 *     protection, and the peak;
 *   - tomorrow: the forecast day in plain words, and how tomorrow's routine
 *     differs from today's, computed by running the same deterministic routine
 *     rules on tomorrow's forecast readings.
 */

const STEP_NAMES = {
  "daytime-photoprotection": "Sunscreen",
  "antioxidant-context": "Antioxidant",
  "comfort-hydration": "Hydrating layer",
  "light-hydration": "Light hydrating layer",
  "supportive-hydration": "Hydrating layer",
  "barrier-support-moisturising": "Rich moisturiser",
  "lightweight-moisturising": "Light moisturiser",
  "supportive-moisturising": "Everyday moisturiser",
  "texture-renewal": "Evening exfoliant",
};
const HYDRATION = new Set(["comfort-hydration", "light-hydration", "supportive-hydration"]);
const MOISTURISER = new Set(["barrier-support-moisturising", "lightweight-moisturising", "supportive-moisturising"]);

function uvThreshold(exposureContext) {
  const policy = getRuntimePolicy();
  return exposureContext === "outdoors" ? 1 : exposureContext === "indoors" ? policy.environment.highUvThreshold : 3;
}

function timingText(window) {
  if (!window) return null;
  const t = window.threshold;
  if (window.allDayBelow) return { text: `UV stays below ${t} all day today, so sun protection matters less.`, sunTip: null };
  if (window.passed) return { text: `UV has dropped below ${t} for the rest of today.`, sunTip: null };
  const text = `UV is ${t} or higher from ${hourWords(window.start)} to ${hourWords(window.end)} today, peaking at ${Math.round(window.peak.uvi)} around ${hourWords(window.peak.time)}.`;
  const sunTip = window.peak.uvi >= 8 ? `Around ${hourWords(window.peak.time)}, shade, a hat and sunglasses help too.` : null;
  return { text, sunTip };
}

function describeDay(day, locationName) {
  const bits = [];
  const sky = weatherWords(day.weatherCode);
  if (day.precipitationMax !== null && day.precipitationMax >= 50) bits.push(`${sky && /rain|drizzle|shower|thunder/.test(sky) ? sky : "rain"} likely (${Math.round(day.precipitationMax)}%)`);
  else if (sky) bits.push(sky);
  if (day.uviMax !== null) bits.push(`UV up to ${Math.round(day.uviMax)}`);
  if (day.temperatureMin !== null && day.temperatureMax !== null) bits.push(`${Math.round(day.temperatureMin)} to ${Math.round(day.temperatureMax)} °C`);
  if (day.humidityMean !== null) bits.push(`humidity around ${Math.round(day.humidityMean)}%`);
  if (day.pm25Mean !== null) bits.push(`haze (PM2.5) around ${Math.round(day.pm25Mean)}`);
  return `${locationName === "Your location" ? "Tomorrow near you" : `Tomorrow in ${locationName}`}: ${bits.join(", ")}.`;
}

function stepIds(routine) {
  return [...routine.am.map((s) => `am:${s.id}`), ...routine.pm.map((s) => `pm:${s.id}`)];
}

// Also used to compare today's routine with the user's usual one or with the
// last one they saw (improvements 6 and 7): `when` only changes the wording.
export function tomorrowChanges({ todaySteps, tomorrowRoutine, readings, when = "tomorrow" }) {
  const future = when === "tomorrow";
  const today = new Set(todaySteps);
  const tomorrow = new Set(stepIds(tomorrowRoutine));
  const changes = [];
  const has = (set, id) => set.has(`am:${id}`) || set.has(`pm:${id}`);
  // Sunscreen
  const uv = planningUvi(readings);
  if (has(tomorrow, "daytime-photoprotection")) changes.push({ step: "daytime-photoprotection", change: has(today, "daytime-photoprotection") ? "kept" : "added", text: has(today, "daytime-photoprotection") ? `Sunscreen: still needed (UV up to ${Math.round(uv)}).` : `Add sunscreen: UV reaches ${Math.round(uv)}.` });
  else if (has(today, "daytime-photoprotection") && uv !== null) changes.push({ step: "daytime-photoprotection", change: "removed", text: `Sunscreen matters less: UV stays low (up to ${Math.round(uv)}). Keep it if you'll be outside for long.` });
  // Antioxidant (only when the air-quality forecast exists)
  if (readings.pm25 !== null) {
    if (has(tomorrow, "antioxidant-context") && !has(today, "antioxidant-context")) changes.push({ step: "antioxidant-context", change: "added", text: future ? `Add the antioxidant: hazy air is forecast.` : `Add the antioxidant: the air is hazy today.` });
    if (!has(tomorrow, "antioxidant-context") && has(today, "antioxidant-context")) changes.push({ step: "antioxidant-context", change: "removed", text: future ? `Skip the antioxidant: cleaner air is forecast.` : `Skip the antioxidant: the air is cleaner today.` });
  }
  // Moisturiser and hydrating layer variants
  for (const group of [MOISTURISER, HYDRATION]) {
    const was = [...today].map((k) => k.split(":")[1]).find((id) => group.has(id)) || null;
    const will = [...tomorrow].map((k) => k.split(":")[1]).find((id) => group.has(id)) || null;
    if (was && will && was !== will) changes.push({ step: will, change: "swapped", text: `Swap the ${STEP_NAMES[was].toLowerCase()} for the ${STEP_NAMES[will].toLowerCase()}${tomorrowRoutine.generation?.textureVote?.votes?.length ? ` (${tomorrowRoutine.generation.textureVote.direction === "richer" ? "richer" : tomorrowRoutine.generation.textureVote.direction === "lighter" ? "lighter" : "balanced"} conditions)` : ""}.` });
    // Whether the optional morning hydrating layer is used can also be the
    // model's choice on the day, so only variant swaps are reported.
  }
  const differences = changes.filter((c) => c.change !== "kept");
  return { changes, same: differences.length === 0 };
}

export async function buildOutlook({ config, location, profile, concern, finishPreference, reactivityLevel, exposureContext, todaySteps = [] }) {
  if (!config.liveServicesEnabled || !config.openMeteo?.enabled) return { available: false, reason: "forecast_not_enabled" };
  const data = await fetchOpenMeteo(location, { timeoutMs: config.requestTimeoutMs, baseUrl: config.openMeteo.baseUrl, airBaseUrl: config.openMeteo.airBaseUrl });
  const window = uvWindow(data, uvThreshold(exposureContext));
  const timing = timingText(window);
  const day = data.daily[1] || null;
  let tomorrow = null;
  if (day) {
    const readings = { uvi: day.uviMax, humidity: day.humidityMean, temperature: day.temperatureMax, pm25: day.pm25Mean };
    const routine = templateRoutine(concern, { environment: { readings }, evidence: [], profile, finishPreference, reactivityLevel, exposureContext });
    const diff = tomorrowChanges({ todaySteps, tomorrowRoutine: routine, readings });
    tomorrow = {
      date: day.date,
      summary: describeDay(day, location.name || "your area"),
      readings,
      precipitation: day.precipitationMax,
      sky: weatherWords(day.weatherCode),
      steps: stepIds(routine),
      changes: diff.changes,
      sameAsToday: diff.same,
    };
  }
  return {
    available: true,
    source: "Weather data by Open-Meteo.com",
    timezone: data.timezone,
    today: window ? {
      window,
      text: timing?.text || null,
      sunTip: timing?.sunTip || null,
      // For the UV timeline chart (improvement 4).
      now: data.currentTime,
      hourly: data.hourly.filter((p) => p.time.startsWith(String(data.currentTime || "").slice(0, 10)) && p.uvi !== null).map((p) => ({ time: p.time, uvi: p.uvi })),
    } : null,
    tomorrow,
  };
}

/** What moved between two sets of readings, in everyday words (improvement 7). */
export function readingChanges(before = {}, after = {}) {
  const out = [];
  const pair = (key) => [planningOr(before, key), planningOr(after, key)];
  const describe = (label, [a, b], minStep, unit = "") => {
    if (a === null || b === null || Math.abs(b - a) < minStep) return;
    out.push(`${label} ${b > a ? "rose" : "fell"} from ${Math.round(a)}${unit} to ${Math.round(b)}${unit}`);
  };
  describe("UV", pair("uvi"), 2);
  describe("Humidity", pair("humidity"), 10, "%");
  describe("Haze", pair("pm25"), 10);
  describe("Temperature", pair("temperature"), 4, " °C");
  return out;
}
function planningOr(readings, key) {
  const v = key === "uvi" ? planningUvi(readings) : readings?.[key];
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
}
