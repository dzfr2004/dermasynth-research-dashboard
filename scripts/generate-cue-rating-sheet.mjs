import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createConfig, loadDotEnv } from "../lib/config.mjs";

/**
 * CUE rating sheet (C3).
 *
 * Builds a blinded sheet of GPT-written explanation drafts from the context
 * log (data/logs/context-log.jsonl), for human raters to judge whether every
 * statement is supported by the facts the model was given. CUE's own verdict
 * is kept in a separate key file so raters do not see it.
 *
 * Drafts CUE rejected are rare, so they are over-sampled: up to --rejected
 * of them (default half of --size), filled with a random sample of drafts
 * CUE passed, up to --size (default 60). Without the cap a large log would
 * give a sheet of rejected drafts only, and agreement could not be measured.
 *
 * Usage: npm run cue:sheet [-- --size=60 --rejected=30 --log=path/to/context-log.jsonl]
 * Output: data/evaluation/cue-rating/cue-rating-sheet.csv  (give to raters)
 *         data/evaluation/cue-rating/cue-rating-key.json   (do not share)
 * Then:   npm run eval:cue-human
 */

loadDotEnv(process.cwd());
const config = createConfig();
const args = process.argv.slice(2);
const option = (name, fallback) => (args.find((a) => a.startsWith(`--${name}=`)) || "").slice(name.length + 3) || fallback;
const size = Number(option("size", "60"));
const rejectedCap = Math.min(size, Number(option("rejected", String(Math.ceil(size / 2)))));
const logPath = resolve(process.cwd(), option("log", config.selectionLog.contextPath));

let text;
try { text = await readFile(logPath, "utf8"); } catch { throw new Error(`No context log at ${logPath}. Run routines with GPT explanations first (npm run eval:live).`); }
const drafts = text.split(/\r?\n/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean)
  .flatMap((run) => (run.drafts || []).map((draft) => ({ ...draft, runId: run.runId })))
  .filter((draft) => draft.cue && Number.isFinite(draft.cue.score) && draft.facts);

// De-duplicate identical texts.
const unique = [...new Map(drafts.map((draft) => [draft.text, draft])).values()];
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20260924);
const shuffle = (list) => { const out = [...list]; for (let i = out.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
const rejected = shuffle(unique.filter((draft) => draft.verdict !== "passed")).slice(0, rejectedCap);
const passed = shuffle(unique.filter((draft) => draft.verdict === "passed")).slice(0, Math.max(0, size - rejected.length));
const chosen = shuffle([...rejected, ...passed]).slice(0, size);
if (!chosen.length) throw new Error("No CUE-scored drafts in the context log yet.");

const factsText = (facts, passages = []) => {
  const lines = Object.entries(facts || {}).map(([key, value]) => `${key.replaceAll("_", " ")}: ${Array.isArray(value) ? value.join("; ") : value && typeof value === "object" ? Object.entries(value).map(([k, v]) => `${k} ${v}`).join(", ") : value}`);
  for (const passage of passages || []) lines.push(`source (${passage.title}): ${passage.text}`);
  return lines.join("\n");
};
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const rows = chosen.map((draft, index) => ({ itemId: `CUE${String(index + 1).padStart(3, "0")}`, draft }));
const csv = [
  ["item_id", "kind", "facts_given_to_the_model", "text_to_rate", "supported", "notes"].join(","),
  ...rows.map(({ itemId, draft }) => [itemId, draft.kind, factsText(draft.facts, draft.passages), draft.text, "", ""].map(csvCell).join(",")),
];
const key = {
  generatedAt: new Date().toISOString(),
  log: logPath,
  threshold: config.cueThreshold,
  items: Object.fromEntries(rows.map(({ itemId, draft }) => [itemId, { cueScore: draft.cue.score, cueVerdict: draft.verdict === "passed" ? "supported" : "unsupported", method: draft.cue.method, unsupportedClaims: draft.cue.unsupported || [], runId: draft.runId, key: draft.key, attempt: draft.attempt }])),
};
const outDir = new URL("../data/evaluation/cue-rating/", import.meta.url);
await mkdir(new URL("ratings/", outDir), { recursive: true });
await writeFile(new URL("cue-rating-sheet.csv", outDir), `${csv.join("\n")}\n`);
await writeFile(new URL("cue-rating-key.json", outDir), `${JSON.stringify(key, null, 2)}\n`);
console.log(JSON.stringify({ items: rows.length, poolPassed: unique.filter((d) => d.verdict === "passed").length, poolRejected: unique.length - unique.filter((d) => d.verdict === "passed").length, cueRejectedIncluded: rows.filter(({ draft }) => draft.verdict !== "passed").length, sheet: "data/evaluation/cue-rating/cue-rating-sheet.csv" }, null, 2));
