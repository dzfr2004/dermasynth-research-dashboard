import { mkdir, writeFile } from "node:fs/promises";

/**
 * Generates the blinded scenario sheet that expert raters label in the
 * labelling tool (/labelling.html). Each row is a research context plus one
 * set of environmental readings; raters never see model output.
 *
 * Scenarios are drawn per context with a Latin-hypercube design over the
 * operating ranges below, so every reading range is covered evenly. A fixed
 * seed keeps the sheet reproducible.
 *
 * Usage: node scripts/generate-labelling-sheet.mjs [--per-context 10]
 */

const CONCERNS = ["acne", "barrier", "pigment", "sensitivity", "dryness", "oil", "texture", "redness", "radiance", "pores"];
const RANGES = { uvi: [0, 11, 1], humidity: [30, 95, 0], pm25: [3, 120, 0], temperature: [14, 36, 0] };
const perIndex = process.argv.indexOf("--per-context");
const PER_CONTEXT = perIndex >= 0 ? Math.max(3, Math.min(20, Number(process.argv[perIndex + 1]) || 6)) : 10;

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(20260923);
function shuffled(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const rows = [["scenario_id", "concern", "uvi", "humidity", "pm25", "temperature"].join(",")];
let index = 1;
for (const concern of CONCERNS) {
  const strata = Object.fromEntries(Object.keys(RANGES).map((key) => [key, shuffled([...Array(PER_CONTEXT).keys()])]));
  for (let i = 0; i < PER_CONTEXT; i += 1) {
    const values = Object.fromEntries(Object.entries(RANGES).map(([key, [lo, hi, digits]]) => {
      const u = (strata[key][i] + rng()) / PER_CONTEXT;
      return [key, Number((lo + u * (hi - lo)).toFixed(digits))];
    }));
    rows.push([`S${String(index).padStart(3, "0")}`, concern, values.uvi, values.humidity, values.pm25, values.temperature].join(","));
    index += 1;
  }
}
const out = new URL("../data/models/labelling/scenario-sheet.v1.csv", import.meta.url);
await mkdir(new URL(".", out), { recursive: true });
await writeFile(out, `${rows.join("\n")}\n`);
console.log(JSON.stringify({ output: "data/models/labelling/scenario-sheet.v1.csv", scenarios: rows.length - 1, perContext: PER_CONTEXT, seed: 20260923 }, null, 2));
