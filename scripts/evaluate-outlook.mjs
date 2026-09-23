import { parseOpenMeteo, uvWindow, hourWords, weatherWords } from "../lib/open-meteo.mjs";
import { tomorrowChanges } from "../lib/outlook.mjs";
import { templateRoutine } from "../lib/safety.mjs";

/**
 * Offline tests for the UV window and tomorrow outlook, using payloads in
 * Open-Meteo's documented response format (no network).
 */

const hours = Array.from({ length: 48 }, (_, i) => `2026-09-${i < 24 ? "24" : "25"}T${String(i % 24).padStart(2, "0")}:00`);
// A clear tropical day: UV 3+ from 8 am to 6 pm, peaking near 11 around noon.
const uvCurve = (h) => Math.max(0, Math.round(11 * Math.sin(((h - 7) / 11) * Math.PI) * 10) / 10);
const weather = {
  timezone: "Asia/Kuala_Lumpur",
  utc_offset_seconds: 28800,
  current: { time: "2026-09-24T09:00", temperature_2m: 30.1, relative_humidity_2m: 78, uv_index: 4.2, is_day: 1, weather_code: 1 },
  hourly: {
    time: hours,
    uv_index: hours.map((t, i) => (i < 24 ? uvCurve(i % 24) : uvCurve(i % 24) * 0.4)),
    temperature_2m: hours.map(() => 29),
    relative_humidity_2m: hours.map(() => 80),
    precipitation_probability: hours.map((t, i) => (i < 24 ? 10 : 85)),
    weather_code: hours.map((t, i) => (i < 24 ? 1 : 63)),
  },
  daily: { time: ["2026-09-24", "2026-09-25"], uv_index_max: [11, 4.4], temperature_2m_max: [33, 27], temperature_2m_min: [25, 23], relative_humidity_2m_mean: [78, 88], precipitation_probability_max: [10, 85], weather_code: [1, 63] },
};
const air = { current: { pm2_5: 62 }, hourly: { time: hours, pm2_5: hours.map((t, i) => (i < 24 ? 60 : 18)) } };

const results = [];
const test = (title, fn) => { try { fn(); results.push({ title, ok: true }); } catch (error) { results.push({ title, ok: false, detail: error.message }); } };
const expect = (cond, message) => { if (!cond) throw new Error(message); };

const data = parseOpenMeteo(weather, air);
test("Parses current readings including PM2.5 from the air-quality payload", () => {
  expect(data.current.uvi === 4.2 && data.current.humidity === 78 && data.current.pm25 === 62, JSON.stringify(data.current));
});
test("Daily PM2.5 is the mean of that day's hourly values", () => {
  expect(data.daily[1].pm25Mean === 18, `Got ${data.daily[1].pm25Mean}`);
});
test("UV window covers the hours at or above the threshold, with the peak", () => {
  const w = uvWindow(data, 3);
  expect(hourWords(w.start) === "8 am" && hourWords(w.end) === "6 pm", `${w.start} to ${w.end}`);
  expect(w.peak.uvi >= 10.5 && hourWords(w.peak.time) === "noon", JSON.stringify(w.peak));
  expect(!w.passed, "Window should not have passed at 9 am.");
});
test("A later clock time marks the window as passed", () => {
  const w = uvWindow({ ...data, currentTime: "2026-09-24T19:00" }, 3);
  expect(w.passed, "Window should have passed at 7 pm.");
});
test("Weather codes are put into words", () => {
  expect(weatherWords(63) === "rain" && weatherWords(0) === "clear skies" && weatherWords(95) === "thunderstorms", "Wrong words.");
});
test("Tomorrow: rain and cleaner air drop the antioxidant and keep sunscreen", () => {
  const todayRoutine = templateRoutine("acne", { environment: { readings: { uvi: 11, humidity: 78, temperature: 33, pm25: 62 } }, profile: "oily" });
  const todaySteps = [...todayRoutine.am.map((s) => `am:${s.id}`), ...todayRoutine.pm.map((s) => `pm:${s.id}`)];
  const d = data.daily[1];
  const readings = { uvi: d.uviMax, humidity: d.humidityMean, temperature: d.temperatureMax, pm25: d.pm25Mean };
  const tomorrow = templateRoutine("acne", { environment: { readings }, profile: "oily" });
  const { changes } = tomorrowChanges({ todaySteps, tomorrowRoutine: tomorrow, readings });
  const byStep = Object.fromEntries(changes.map((c) => [c.step, c.change]));
  expect(byStep["antioxidant-context"] === "removed", JSON.stringify(changes));
  expect(byStep["daytime-photoprotection"] === "kept", JSON.stringify(changes));
});
test("Tomorrow: a cold, dry day swaps to the richer moisturiser", () => {
  const todayRoutine = templateRoutine("pigment", { environment: { readings: { uvi: 6, humidity: 80, temperature: 32, pm25: 20 } }, profile: "combination" });
  const todaySteps = [...todayRoutine.am.map((s) => `am:${s.id}`), ...todayRoutine.pm.map((s) => `pm:${s.id}`)];
  const readings = { uvi: 2, humidity: 35, temperature: 8, pm25: 15 };
  const tomorrow = templateRoutine("pigment", { environment: { readings }, profile: "combination" });
  const { changes } = tomorrowChanges({ todaySteps, tomorrowRoutine: tomorrow, readings });
  expect(changes.some((c) => c.change === "swapped" && c.step === "barrier-support-moisturising"), JSON.stringify(changes));
});
test("No air-quality forecast: the antioxidant is not changed on a guess", () => {
  const todayRoutine = templateRoutine("acne", { environment: { readings: { uvi: 9, humidity: 80, temperature: 32, pm25: 70 } } });
  const todaySteps = [...todayRoutine.am.map((s) => `am:${s.id}`), ...todayRoutine.pm.map((s) => `pm:${s.id}`)];
  const readings = { uvi: 9, humidity: 80, temperature: 32, pm25: null };
  const tomorrow = templateRoutine("acne", { environment: { readings } });
  const { changes } = tomorrowChanges({ todaySteps, tomorrowRoutine: tomorrow, readings });
  expect(!changes.some((c) => c.step === "antioxidant-context"), JSON.stringify(changes));
});

const passed = results.filter((r) => r.ok).length;
console.log(JSON.stringify({ suite: "outlook", total: results.length, passed, failures: results.filter((r) => !r.ok) }, null, 2));
if (passed !== results.length) process.exitCode = 1;
