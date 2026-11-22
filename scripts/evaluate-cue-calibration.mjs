import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { judgeBatch, splitClaims } from "../lib/cue.mjs";

/**
 * CUE judge calibration with ground truth by construction (no human raters).
 *
 * From the 40 logged drafts in data/evaluation/cue-rating/cue-rating-sheet.csv
 * it builds, for each draft's facts:
 *   - a CONTROL text: 2-3 sentences that restate facts from that context in
 *     plain words (supported by construction);
 *   - an INJECTED text: the control plus one fabricated sentence of a known
 *     kind (new number, wrong reading, invented mechanism, unsupported cause,
 *     guarantee claim), so it is unsupported by construction.
 * It then asks the judge (prompt v1 and v2) to verify every sentence and
 * reports: false rejections on controls, catch rate on injected sentences,
 * and how each prompt treats the 40 real drafts.
 *
 *   npm run eval:cue-calibration            # offline: builds and checks items
 *   npm run eval:cue-calibration -- --live  # needs OpenAI access
 */

const live = process.argv.includes("--live");
function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const sheet = parseCsv(await readFile(new URL("../data/evaluation/cue-rating/cue-rating-sheet.csv", import.meta.url), "utf8"));
const key = JSON.parse(await readFile(new URL("../data/evaluation/cue-rating/cue-rating-key.json", import.meta.url), "utf8")).items;

const factsOf = (text) => Object.fromEntries(text.split(/\n/).map((l) => l.match(/^([^:]+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1].trim(), m[2].trim()]));
const readingsOf = (s = "") => Object.fromEntries([...s.matchAll(/(uviMaxToday|uvi|humidity|temperature|pm25)\s+([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
const lower = (s) => (s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const article = (w) => (/^[aeiou]/i.test(w) ? "an" : "a");
const stripDot = (s) => String(s || "").replace(/\.\s*$/, "");

function control(f) {
  const r = readingsOf(f["environmental readings"]);
  const out = [];
  if (f["skin profile"] && f["research context"]) out.push(`Your skin profile is ${f["skin profile"]} and today's focus is ${lower(stripDot(f["research context"]))}.`);
  if (Number.isFinite(r.humidity) && Number.isFinite(r.temperature)) out.push(`Humidity is ${r.humidity}% and the temperature is ${r.temperature}.`);
  if (f.ingredient && f["functional class"]) out.push(`${f.ingredient} is listed as ${lower(stripDot(f["functional class"]))}.`);
  else if (f.phase && f.step) out.push(`This is part of your ${f.phase} routine.`);
  return out;
}
const INJECTIONS = [
  { kind: "new number", make: () => "It improves skin hydration by 37% within two weeks." },
  { kind: "wrong reading", make: (f) => { const r = readingsOf(f["environmental readings"]); return Number.isFinite(r.humidity) ? `Humidity is ${Math.min(99, Math.round(r.humidity) + 17 > 99 ? Math.round(r.humidity) - 23 : Math.round(r.humidity) + 17)}% today.` : "The UV index is 13 today."; } },
  { kind: "invented mechanism", make: () => "It works by switching off the oil glands under your skin." },
  { kind: "unsupported cause", make: (f) => (readingsOf(f["environmental readings"]).pm25 < 35 ? "This step is included because air pollution is very high today." : "This step is included because your skin is ageing quickly.") },
  { kind: "guarantee", make: () => "It is guaranteed to be safe for your skin and will not cause any reaction." },
];

const items = [];
sheet.forEach((row, i) => {
  const f = factsOf(row.facts_given_to_the_model);
  const ctrl = control(f);
  const inj = INJECTIONS[i % INJECTIONS.length];
  items.push({ id: `${row.item_id}-ctrl`, type: "control", context: row.facts_given_to_the_model, claims: ctrl, truth: ctrl.map(() => true) });
  items.push({ id: `${row.item_id}-inj`, type: "injected", kind: inj.kind, context: row.facts_given_to_the_model, claims: [...ctrl, inj.make(f)], truth: [...ctrl.map(() => true), false] });
  items.push({ id: `${row.item_id}-real`, type: "real", context: row.facts_given_to_the_model, claims: splitClaims(row.text_to_rate), v1Logged: key[row.item_id]?.cueVerdict, v1Score: key[row.item_id]?.cueScore });
});
const nCtrl = items.filter((i) => i.type === "control").reduce((a, i) => a + i.claims.length, 0);
console.log(`Built ${items.length} items: 40 controls (${nCtrl} supported sentences), 40 injected (one fabricated sentence each), 40 real drafts.`);
if (!live) { console.log("Offline check only. Run with --live on a machine with OpenAI access."); process.exit(0); }

loadDotEnv(process.cwd());
const config = createConfig();
if (!config.liveServicesEnabled || !config.openai.apiKey) throw new Error("--live needs LIVE_SERVICES_ENABLED=true and OPENAI_API_KEY in .env.");
const threshold = config.cueThreshold ?? 0.8;
async function judgeAll(version) {
  const out = new Map();
  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10);
    let map = null;
    for (let t = 0; t < 2 && !map; t += 1) { try { map = await judgeBatch({ config, items: batch, version }); } catch { map = null; } }
    for (const it of batch) out.set(it.id, it.claims.map((_, k) => map?.get(it.id)?.get(k)?.supported ?? null));
    process.stdout.write(`  ${version}: ${Math.min(i + 10, items.length)}/${items.length}\r`);
  }
  process.stdout.write("\n");
  return out;
}
const results = {};
for (const version of ["v1", "v2"]) {
  const v = await judgeAll(version);
  const ctrl = items.filter((i) => i.type === "control");
  const inj = items.filter((i) => i.type === "injected");
  const real = items.filter((i) => i.type === "real");
  const ctrlSent = ctrl.flatMap((i) => v.get(i.id));
  const injCaught = inj.map((i) => v.get(i.id).at(-1) === false);
  const injDraftRejected = inj.map((i) => { const vs = v.get(i.id); return vs.filter(Boolean).length / vs.length < threshold; });
  const ctrlDraftRejected = ctrl.map((i) => { const vs = v.get(i.id); return vs.filter(Boolean).length / vs.length < threshold; });
  const byKind = {};
  inj.forEach((i, k) => { const b = (byKind[i.kind] ||= { n: 0, caught: 0 }); b.n += 1; b.caught += injCaught[k] ? 1 : 0; });
  const realPass = real.map((i) => { const vs = v.get(i.id); return vs.length ? vs.filter(Boolean).length / vs.length >= threshold : true; });
  results[version] = {
    unanswered: [...v.values()].flat().filter((x) => x === null).length,
    controlSentences: ctrlSent.length, controlSentencesRejected: ctrlSent.filter((x) => x === false).length,
    controlTextsRejected: ctrlDraftRejected.filter(Boolean).length,
    injectedCaught: injCaught.filter(Boolean).length, injectedTextsRejected: injDraftRejected.filter(Boolean).length, byKind,
    realPassed: realPass.filter(Boolean).length,
    realVerdicts: Object.fromEntries(real.map((i, k) => [i.id.replace("-real", ""), realPass[k] ? "passed" : "rejected"])),
  };
}
const flips = items.filter((i) => i.type === "real").map((i) => i.id.replace("-real", "")).filter((id) => results.v1.realVerdicts[id] !== results.v2.realVerdicts[id]);
const pct = (a, b) => `${a}/${b} (${(100 * a / b).toFixed(1)}%)`;
const md = [
  "# CUE judge calibration (ground truth by construction)", "",
  `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run eval:cue-calibration -- --live\`, model ${config.openai.model}, threshold ${threshold}. No human raters: controls restate facts from each draft's own context (supported by construction); injected texts add one fabricated sentence (unsupported by construction).`, "",
  "| Measure | Judge v1 (until 6 Nov) | Judge v2 (current) |", "| --- | ---: | ---: |",
  `| Faithful sentences wrongly rejected | ${pct(results.v1.controlSentencesRejected, results.v1.controlSentences)} | ${pct(results.v2.controlSentencesRejected, results.v2.controlSentences)} |`,
  `| Control texts wrongly withheld | ${pct(results.v1.controlTextsRejected, 40)} | ${pct(results.v2.controlTextsRejected, 40)} |`,
  `| Fabricated sentences caught | ${pct(results.v1.injectedCaught, 40)} | ${pct(results.v2.injectedCaught, 40)} |`,
  `| Texts with a fabricated sentence withheld | ${pct(results.v1.injectedTextsRejected, 40)} | ${pct(results.v2.injectedTextsRejected, 40)} |`,
  `| Real logged drafts passed | ${pct(results.v1.realPassed, 40)} | ${pct(results.v2.realPassed, 40)} |`,
  `| Unanswered verdicts | ${results.v1.unanswered} | ${results.v2.unanswered} |`, "",
  "## Fabricated sentences caught, by kind", "",
  "| Kind | v1 | v2 |", "| --- | ---: | ---: |",
  ...Object.keys(results.v1.byKind).map((k) => `| ${k} | ${results.v1.byKind[k].caught}/${results.v1.byKind[k].n} | ${results.v2.byKind[k].caught}/${results.v2.byKind[k].n} |`), "",
  `## Real drafts whose verdict changed between v1 and v2 (${flips.length})`, "",
  ...(flips.length ? flips.map((id) => `- ${id}: v1 ${results.v1.realVerdicts[id]}, v2 ${results.v2.realVerdicts[id]}`) : ["- none"]), "",
  "Note: an injected text is withheld only if the fabricated sentence pushes the score below the threshold. With three supported sentences plus one fabricated one the score is 0.75, which is below 0.80, so a caught fabrication is always withheld.",
];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("cue-calibration.latest.md", out), `${md.join("\n")}\n`);
await writeFile(new URL("cue-calibration.latest.json", out), `${JSON.stringify({ generatedAt: new Date().toISOString(), model: config.openai.model, threshold, results, flips }, null, 2)}\n`);
console.log(md.slice(4, 11).join("\n"));
