import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

/**
 * CUE against human ratings (C3).
 *
 * Reads every filled rating sheet in data/evaluation/cue-rating/ratings/
 * (one CSV per rater, a copy of cue-rating-sheet.csv with the "supported"
 * column filled with yes or no) and the hidden key, then reports:
 *   - agreement between raters (Cohen's kappa for each pair);
 *   - CUE's verdict against the raters' majority: agreement, Cohen's kappa,
 *     and a confusion table;
 *   - the number that matters most for safety: drafts CUE PASSED that the
 *     raters judged unsupported (would have been shown to a user).
 *
 * Usage: npm run eval:cue-human
 * Output: data/evaluation/reports/cue-human-agreement.latest.{md,json}
 */

const dir = new URL("../data/evaluation/cue-rating/", import.meta.url);
const keyUrl = new URL("cue-rating-key.json", dir);
if (!existsSync(keyUrl)) { console.error("No cue-rating-key.json. Run npm run cue:sheet first."); process.exit(1); }
const key = JSON.parse(await readFile(keyUrl, "utf8"));
const ratingDir = new URL("ratings/", dir);
const files = existsSync(ratingDir) ? readdirSync(ratingDir).filter((name) => name.toLowerCase().endsWith(".csv")) : [];
if (!files.length) { console.error("No rating files in data/evaluation/cue-rating/ratings/. Save each rater's filled sheet there as <rater>.csv."); process.exit(1); }

// Minimal RFC 4180 CSV parser (quoted cells may contain commas and newlines).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
const normalise = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (["yes", "y", "1", "true", "supported"].includes(v)) return "supported";
  if (["no", "n", "0", "false", "unsupported"].includes(v)) return "unsupported";
  return null;
};

const raters = {};
for (const file of files) {
  const rows = parseCsv((await readFile(new URL(file, ratingDir), "utf8")).replace(/^\uFEFF/, "")); // Excel adds a byte-order mark
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  const iId = header.indexOf("item_id");
  const iSup = header.indexOf("supported");
  if (iId < 0 || iSup < 0) throw new Error(`${file} needs item_id and supported columns.`);
  raters[file.replace(/\.csv$/i, "")] = Object.fromEntries(rows.map((r) => [r[iId]?.trim(), normalise(r[iSup])]).filter(([id, label]) => id && label));
}
const raterNames = Object.keys(raters);

function cohen(pairs) {
  if (pairs.length < 2) return null;
  const labels = ["supported", "unsupported"];
  const n = pairs.length;
  const po = pairs.filter(([a, b]) => a === b).length / n;
  const pe = labels.reduce((sum, label) => sum + (pairs.filter(([a]) => a === label).length / n) * (pairs.filter(([, b]) => b === label).length / n), 0);
  return { n, observed: po, expected: pe, kappa: pe === 1 ? null : (po - pe) / (1 - pe) };
}

const interRater = [];
for (let i = 0; i < raterNames.length; i += 1) for (let j = i + 1; j < raterNames.length; j += 1) {
  const a = raters[raterNames[i]];
  const b = raters[raterNames[j]];
  const pairs = Object.keys(a).filter((id) => b[id]).map((id) => [a[id], b[id]]);
  interRater.push({ raters: [raterNames[i], raterNames[j]], ...cohen(pairs) });
}

// Majority label per item (ties count as unsupported: the cautious reading).
const items = Object.entries(key.items).map(([id, info]) => {
  const labels = raterNames.map((name) => raters[name][id]).filter(Boolean);
  if (!labels.length) return null;
  const unsupported = labels.filter((l) => l === "unsupported").length;
  const human = unsupported * 2 >= labels.length ? "unsupported" : "supported";
  return { id, human, raters: labels.length, cue: info.cueVerdict, cueScore: info.cueScore };
}).filter(Boolean);
const vsCue = cohen(items.map((item) => [item.cue, item.human]));
const count = (cue, human) => items.filter((item) => item.cue === cue && item.human === human).length;
const confusion = { cueSupported_humanSupported: count("supported", "supported"), cueSupported_humanUnsupported: count("supported", "unsupported"), cueUnsupported_humanSupported: count("unsupported", "supported"), cueUnsupported_humanUnsupported: count("unsupported", "unsupported") };
const humanUnsupported = confusion.cueSupported_humanUnsupported + confusion.cueUnsupported_humanUnsupported;
const summary = {
  generatedAt: new Date().toISOString(),
  raters: raterNames,
  items: items.length,
  interRater,
  cueVsHumans: vsCue,
  confusion,
  cueRecallOfUnsupported: humanUnsupported ? confusion.cueUnsupported_humanUnsupported / humanUnsupported : null,
  unsupportedShownRate: items.length ? confusion.cueSupported_humanUnsupported / items.length : null,
};

const f = (v, d = 3) => (v === null || v === undefined || Number.isNaN(v) ? "n/a" : Number(v).toFixed(d));
const pct = (v) => (v === null || v === undefined ? "n/a" : `${(100 * v).toFixed(1)}%`);
const md = [
  "# CUE against human ratings",
  "",
  `Generated ${summary.generatedAt.slice(0, 10)} by \`npm run eval:cue-human\`. ${items.length} GPT-written explanation drafts, rated blind by ${raterNames.length} rater(s) (${raterNames.join(", ")}) for whether every statement is supported by the facts the model was given. Ties count as unsupported.`,
  "",
  "## Agreement between raters",
  "",
  interRater.length ? "| Raters | Items | Observed agreement | Cohen's kappa |\n| --- | ---: | ---: | ---: |\n" + interRater.map((r) => `| ${r.raters.join(" vs ")} | ${r.n ?? 0} | ${pct(r.observed)} | ${f(r.kappa)} |`).join("\n") : "Only one rater, so inter-rater agreement cannot be computed. Two or more raters are recommended.",
  "",
  "## CUE verdict against the raters",
  "",
  `Agreement ${pct(vsCue?.observed)}, Cohen's kappa **${f(vsCue?.kappa)}** (threshold ${key.threshold}).`,
  "",
  "| | Raters: supported | Raters: unsupported |",
  "| --- | ---: | ---: |",
  `| CUE passed (shown to the user) | ${confusion.cueSupported_humanSupported} | **${confusion.cueSupported_humanUnsupported}** |`,
  `| CUE rejected (withheld or regenerated) | ${confusion.cueUnsupported_humanSupported} | ${confusion.cueUnsupported_humanUnsupported} |`,
  "",
  `CUE caught ${pct(summary.cueRecallOfUnsupported)} of the drafts the raters judged unsupported. Drafts CUE passed that the raters judged unsupported: ${confusion.cueSupported_humanUnsupported} of ${items.length} (${pct(summary.unsupportedShownRate)}); these are the ones a user would have seen.`,
  "",
  "Note: the sheet over-samples drafts CUE rejected (up to half the sheet), so the agreement figures describe this sheet, not the live pass rate. The live pass rate is in the selection-log report.",
  "",
];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("cue-human-agreement.latest.md", out), `${md.join("\n")}\n`);
await writeFile(new URL("cue-human-agreement.latest.json", out), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
