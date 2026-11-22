import { parseOpenMeteo, uvWindow, hourWords, weatherWords } from "../lib/open-meteo.mjs";
import { tomorrowChanges, weekPlan } from "../lib/outlook.mjs";
import { createConfig } from "../lib/config.mjs";
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

// Weekly planner: a 7-day payload (air-quality forecast stops after 5 days).
const days7 = Array.from({ length: 7 }, (_, i) => `2026-09-${String(24 + i).padStart(2, "0")}`);
const WK = [
  { uv: 11, hum: 78, t: 33, pm: 60, rain: 10, code: 1 }, { uv: 4.4, hum: 88, t: 27, pm: 18, rain: 85, code: 63 }, { uv: 9, hum: 72, t: 32, pm: 40, rain: 30, code: 2 },
  { uv: 2.5, hum: 92, t: 26, pm: 12, rain: 95, code: 95 }, { uv: 10, hum: 48, t: 34, pm: 70, rain: 5, code: 0 }, { uv: 8, hum: 70, t: 33, pm: null, rain: 40, code: 2 }, { uv: 7, hum: 80, t: 31, pm: null, rain: 60, code: 80 },
];
const hours7 = days7.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`));
const wkAt = (i) => WK[Math.floor(i / 24)];
const week = parseOpenMeteo({
  timezone: "Asia/Kuala_Lumpur", utc_offset_seconds: 28800,
  current: { time: "2026-09-24T09:00", temperature_2m: 30, relative_humidity_2m: 78, uv_index: 4.2, is_day: 1, weather_code: 1 },
  hourly: { time: hours7, uv_index: hours7.map((t, i) => Math.max(0, Math.round(wkAt(i).uv * Math.sin((((i % 24) - 7) / 11) * Math.PI) * 10) / 10)), temperature_2m: hours7.map((t, i) => wkAt(i).t - 3), relative_humidity_2m: hours7.map((t, i) => wkAt(i).hum), precipitation_probability: hours7.map((t, i) => wkAt(i).rain), weather_code: hours7.map((t, i) => wkAt(i).code) },
  daily: { time: days7, uv_index_max: WK.map((d) => d.uv), temperature_2m_max: WK.map((d) => d.t), temperature_2m_min: WK.map((d) => d.t - 8), relative_humidity_2m_mean: WK.map((d) => d.hum), precipitation_probability_max: WK.map((d) => d.rain), weather_code: WK.map((d) => d.code) },
}, { current: { pm2_5: 60 }, hourly: { time: hours7.slice(0, 120), pm2_5: hours7.slice(0, 120).map((t, i) => wkAt(i).pm) } });
const wkToday = templateRoutine("acne", { environment: { readings: { uvi: 11, humidity: 78, temperature: 33, pm25: 60 } }, profile: "combination", includeHydration: true });
const wkSteps = [...wkToday.am.map((s) => `am:${s.id}`), ...wkToday.pm.map((s) => `pm:${s.id}`)];
const plan = weekPlan({ data: week, todaySteps: wkSteps, profile: "combination", concern: "acne", exposureContext: "mixed" });
test("Week: seven days, and today's column is the routine the user got", () => {
  expect(plan.length === 7 && plan[0].isToday && plan[0].sameAsToday, `days ${plan.length}`);
  expect(JSON.stringify([...plan[0].steps.am.map((id) => `am:${id}`), ...plan[0].steps.pm.map((id) => `pm:${id}`)]) === JSON.stringify(wkSteps), "Today's steps differ.");
});
test("Week: a low-UV rainy day drops sunscreen; a high-UV day keeps it with that day's hours", () => {
  expect(!plan[3].steps.am.includes("daytime-photoprotection") && plan[3].uvWindow === null, JSON.stringify(plan[3].steps.am));
  expect(plan[4].steps.am.includes("daytime-photoprotection") && plan[4].uvWindow?.start?.startsWith(days7[4]), JSON.stringify(plan[4].uvWindow));
});
test("Week: hazy days add the antioxidant; days past the air forecast mark it unknown, not skipped", () => {
  expect(plan[4].steps.am.includes("antioxidant-context") && !plan[1].steps.am.includes("antioxidant-context"), "Antioxidant follows haze.");
  expect(plan[5].unknown.includes("antioxidant-context") && plan[6].unknown.includes("antioxidant-context") && !plan[4].unknown.length, JSON.stringify(plan.map((d) => d.unknown)));
});
test("Week: the optional hydrating layer follows today's choice", () => {
  const has = (d) => d.steps.am.some((id) => /hydration/.test(id));
  expect(plan.every(has), JSON.stringify(plan.map((d) => d.steps.am)));
  const noLayer = wkSteps.filter((k) => !/hydration/.test(k));
  const plan2 = weekPlan({ data: week, todaySteps: noLayer, profile: "combination", concern: "acne", exposureContext: "mixed" });
  // Low UV forces the layer on (the rules add hydration when sunscreen drops), so only compare high-UV days.
  expect([1, 2, 4, 5, 6].every((i) => !has(plan2[i])), JSON.stringify(plan2.map((d) => d.steps.am)));
});
test("Week planner setting: off by default in study mode, on otherwise, and can be overridden", () => {
  const saved = { mode: process.env.STUDY_MODE, flag: process.env.WEEKLY_PLANNER_ENABLED };
  try {
    delete process.env.WEEKLY_PLANNER_ENABLED;
    process.env.STUDY_MODE = "on"; expect(createConfig().weeklyPlannerEnabled === false, "should be off in study mode");
    process.env.STUDY_MODE = "off"; expect(createConfig().weeklyPlannerEnabled === true, "should be on outside the study");
    process.env.STUDY_MODE = "on"; process.env.WEEKLY_PLANNER_ENABLED = "true"; expect(createConfig().weeklyPlannerEnabled === true, "override");
  } finally {
    for (const [k, v] of [["STUDY_MODE", saved.mode], ["WEEKLY_PLANNER_ENABLED", saved.flag]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

const passed = results.filter((r) => r.ok).length;
console.log(JSON.stringify({ suite: "outlook", total: results.length, passed, failures: results.filter((r) => !r.ok) }, null, 2));
if (passed !== results.length) process.exitCode = 1;
