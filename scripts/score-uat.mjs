import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

/**
 * Scores a small User Acceptance Test using the System Usability Scale (SUS)
 * plus project domain items. Reads a responses CSV and writes a report.
 *
 * SUS scoring (Brooke, 1996): 10 alternating items on a 1-5 scale.
 *   odd items (positive):  contribution = response - 1
 *   even items (negative): contribution = 5 - response
 *   participant SUS = (sum of contributions) * 2.5   → 0-100
 *
 * This measures perceived usability/acceptance only; it is not a clinical
 * outcome or effectiveness measure.
 */

const inputArg = process.argv[2] || "data/evaluation/uat/uat-responses.csv";
const inputUrl = new URL(`../${inputArg}`, import.meta.url);
if (!existsSync(inputUrl)) {
  console.error(`No responses file at ${inputArg}. Copy uat-responses.template.csv to uat-responses.csv and fill it in.`);
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const cells = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') { if (inQuotes && line[i + 1] === '"') { cur += '"'; i += 1; } else inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  return rows;
}

const rows = parseCsv(readFileSync(inputUrl, "utf8"));
const header = rows.shift();
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const susCols = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"];
const domainCols = ["d1", "d2", "d3", "d4"];
if (susCols.some((c) => !(c in idx))) throw new Error(`Responses CSV must include SUS columns: ${susCols.join(", ")}`);

const clampLikert = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null; };
const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
const std = (arr) => { const m = mean(arr); return m === null || arr.length < 2 ? null : Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1)); };
const round = (v, d = 2) => (v === null ? null : Number(v.toFixed(d)));

function adjective(sus) {
  if (sus === null) return "n/a";
  if (sus >= 85) return "Best imaginable / A";
  if (sus >= 72) return "Excellent / B";
  if (sus >= 68) return "Good (above average) / C";
  if (sus >= 51) return "OK (below average) / D";
  return "Poor / F";
}

const participants = [];
for (const row of rows) {
  if (!row.length || !row[idx.participant_id]) continue;
  const responses = susCols.map((c) => clampLikert(row[idx[c]]));
  if (responses.some((v) => v === null)) { participants.push({ id: row[idx.participant_id], valid: false }); continue; }
  let sum = 0;
  responses.forEach((v, i) => { sum += (i % 2 === 0) ? (v - 1) : (5 - v); }); // q1,q3,.. odd (index 0,2,..) positive
  const sus = sum * 2.5;
  const domain = Object.fromEntries(domainCols.filter((c) => c in idx).map((c) => [c, clampLikert(row[idx[c]])]));
  participants.push({ id: row[idx.participant_id], valid: true, sus: round(sus, 1), domain });
}

const valid = participants.filter((p) => p.valid);
const susScores = valid.map((p) => p.sus);
const domainSummary = {};
for (const c of domainCols) {
  const vals = valid.map((p) => p.domain?.[c]).filter((v) => v !== null && v !== undefined);
  if (vals.length) domainSummary[c] = { mean: round(mean(vals)), n: vals.length };
}

const meanSus = round(mean(susScores), 1);
const report = {
  instrument: "System Usability Scale (SUS) + domain acceptance items",
  generatedAt: new Date().toISOString(),
  participants: { total: participants.length, valid: valid.length, invalid: participants.length - valid.length },
  sus: { mean: meanSus, sd: round(std(susScores)), min: susScores.length ? Math.min(...susScores) : null, max: susScores.length ? Math.max(...susScores) : null, adjectiveRating: adjective(meanSus) },
  domainItems: domainSummary,
  scope: "Perceived usability and acceptance of a research prototype. Not a clinical, efficacy, or treatment-outcome measure. Small-sample UAT — report as indicative only.",
  perParticipant: valid.map((p) => ({ id: p.id, sus: p.sus })),
};

const reportsDir = new URL("../data/evaluation/reports/", import.meta.url);
mkdirSync(reportsDir, { recursive: true });
writeFileSync(new URL("uat.latest.json", reportsDir), `${JSON.stringify(report, null, 2)}\n`);
const md = [
  "# UAT report (SUS + domain items)",
  "",
  `Generated: ${report.generatedAt}`,
  `Participants: ${report.participants.valid} valid of ${report.participants.total}`,
  "",
  `**Mean SUS: ${meanSus ?? "n/a"}** (SD ${report.sus.sd ?? "n/a"}, range ${report.sus.min ?? "n/a"}–${report.sus.max ?? "n/a"}) — ${report.sus.adjectiveRating}`,
  "",
  "## Domain items (mean, 1–5)",
  ...domainCols.map((c) => `- ${c}: ${domainSummary[c] ? `${domainSummary[c].mean} (n=${domainSummary[c].n})` : "n/a"}`),
  "",
  "_Small-sample UAT — indicative perceived usability/acceptance only; not a clinical measure._",
  "",
].join("\n");
writeFileSync(new URL("uat.latest.md", reportsDir), md);
console.log(JSON.stringify({ meanSus, valid: valid.length, adjective: report.sus.adjectiveRating }, null, 2));
