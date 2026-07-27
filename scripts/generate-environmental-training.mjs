import { writeFile } from "node:fs/promises";

/**
 * Generates a documented, reproducible labelled environmental-context dataset
 * for fitting the environmental surrogate (see fit-environmental-surrogate.mjs).
 *
 * IMPORTANT / HONEST SCOPE:
 * This is a CONSTRUCTED research dataset, not clinical-outcome data. Each row's
 * `target_context_score` is derived from transparent, domain-reasoned prior
 * sensitivities (how strongly each environmental signal is expected to shape a
 * given cosmetic research context) sampled across realistic environmental
 * ranges with deterministic variation. Fitting recovers the relative feature
 * importances from these labelled rows via normalised covariance weighting.
 * It does not represent measured skin outcomes or a validated clinical model.
 *
 * Determinism: a fixed seed makes the CSV fully reproducible.
 */

// Domain-reasoned relative sensitivities per research context.
// Values are prior magnitudes only; the fitter estimates weights from the data.
const PRIORS = {
  acne:        { uvi: 0.10, humidity: 0.28, pm25: 0.40, temperature: 0.22 },
  barrier:     { uvi: 0.22, humidity: 0.40, pm25: 0.24, temperature: 0.14 },
  pigment:     { uvi: 0.50, humidity: 0.10, pm25: 0.28, temperature: 0.12 },
  dryness:     { uvi: 0.12, humidity: 0.52, pm25: 0.14, temperature: 0.22 },
  oil:         { uvi: 0.12, humidity: 0.32, pm25: 0.20, temperature: 0.36 },
  sensitivity: { uvi: 0.24, humidity: 0.36, pm25: 0.26, temperature: 0.14 },
  texture:     { uvi: 0.30, humidity: 0.16, pm25: 0.34, temperature: 0.20 },
  redness:     { uvi: 0.26, humidity: 0.22, pm25: 0.16, temperature: 0.36 },
  radiance:    { uvi: 0.40, humidity: 0.12, pm25: 0.36, temperature: 0.12 },
  pores:       { uvi: 0.12, humidity: 0.34, pm25: 0.24, temperature: 0.30 },
};

const FEATURE_BASELINE = { uvi: 0.36, humidity: 0.5, pm25: 0.2, temperature: 0.25 };
const ROWS_PER_CONCERN = 14; // 10 concerns x 14 = 140 labelled rows

// Deterministic pseudo-random generator (mulberry32) for reproducibility.
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 2) => Number(v.toFixed(d));

function normalise(row) {
  return {
    uvi: clamp(row.uvi / 11),
    humidity: clamp((100 - row.humidity) / 100),
    pm25: clamp(row.pm25 / 75),
    temperature: clamp(Math.abs(row.temperature - 24) / 16),
  };
}

const rng = makeRng(20260727);
const header = ["concern", "uvi", "humidity", "pm25", "temperature", "target_context_score"];
const lines = [header.join(",")];

for (const [concern, priors] of Object.entries(PRIORS)) {
  for (let i = 0; i < ROWS_PER_CONCERN; i += 1) {
    // Sample realistic environmental readings across their operating ranges.
    const row = {
      uvi: round(rng() * 11, 1),
      humidity: round(30 + rng() * 65),
      pm25: round(3 + rng() * 117, 1),
      temperature: round(12 + rng() * 24, 1),
    };
    const n = normalise(row);
    // Target = neutral baseline + weighted signed deviations from feature
    // baselines, plus small deterministic variation, clamped to [0,1].
    let target = 0.5;
    for (const f of ["uvi", "humidity", "pm25", "temperature"]) {
      target += priors[f] * (n[f] - FEATURE_BASELINE[f]);
    }
    target += (rng() - 0.5) * 0.06; // bounded reproducible noise
    row.target_context_score = round(clamp(target), 3);
    lines.push([concern, row.uvi, row.humidity, row.pm25, row.temperature, row.target_context_score].join(","));
  }
}

const outUrl = new URL("../data/models/environmental-context-training.v1.csv", import.meta.url);
await writeFile(outUrl, `${lines.join("\n")}\n`);
console.log(JSON.stringify({
  output: "data/models/environmental-context-training.v1.csv",
  rows: lines.length - 1,
  concerns: Object.keys(PRIORS).length,
  seed: 20260727,
}, null, 2));
