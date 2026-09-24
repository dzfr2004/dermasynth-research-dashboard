import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Summarises the one-tap check-ins (data/logs/feedback.jsonl) for the user
 * study: how skin felt after the routine, and whether people followed it.
 *
 * Usage: npm run report:feedback [-- path/to/feedback.jsonl] [--since=2026-10-01]
 */

const args = process.argv.slice(2);
const since = (args.find((a) => a.startsWith("--since=")) || "").slice(8) || null;
const path = resolve(process.cwd(), args.find((a) => !a.startsWith("--")) || process.env.FEEDBACK_LOG_PATH || "data/logs/feedback.jsonl");
let text = "";
try { text = await readFile(path, "utf8"); } catch { console.error(`No feedback yet at ${path}.`); process.exit(1); }
const rows = text.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).filter((r) => !since || String(r.at) >= since);
if (!rows.length) { console.error("No check-ins in range."); process.exit(1); }

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
const count = (list, key, value) => list.filter((r) => r[key] === value).length;
const followedKnown = rows.filter((r) => r.followed);
const byConcern = [...new Set(rows.map((r) => r.concern || "unknown"))].map((concern) => {
  const list = rows.filter((r) => (r.concern || "unknown") === concern);
  return { concern, n: list.length, good: count(list, "rating", "good"), ok: count(list, "rating", "ok"), bad: count(list, "rating", "bad") };
});
const summary = {
  generatedAt: new Date().toISOString(),
  checkIns: rows.length,
  rating: { good: count(rows, "rating", "good"), ok: count(rows, "rating", "ok"), bad: count(rows, "rating", "bad") },
  followed: { yes: count(followedKnown, "followed", "yes"), partly: count(followedKnown, "followed", "partly"), no: count(followedKnown, "followed", "no"), answered: followedKnown.length },
  aboutYesterday: count(rows, "about", "yesterday"),
  byConcern,
};
const md = [
  "# Check-in summary",
  "",
  `Generated ${summary.generatedAt.slice(0, 10)} by \`npm run report:feedback\` from ${rows.length} anonymous check-ins (${summary.aboutYesterday} asked the next day about the previous routine).`,
  "",
  "| How skin felt | Count | Share |",
  "| --- | ---: | ---: |",
  `| 🙂 Good | ${summary.rating.good} | ${pct(summary.rating.good, rows.length)} |`,
  `| 😐 Okay | ${summary.rating.ok} | ${pct(summary.rating.ok, rows.length)} |`,
  `| 🙁 Not good | ${summary.rating.bad} | ${pct(summary.rating.bad, rows.length)} |`,
  "",
  `Followed the routine: yes ${pct(summary.followed.yes, summary.followed.answered)}, partly ${pct(summary.followed.partly, summary.followed.answered)}, no ${pct(summary.followed.no, summary.followed.answered)} (${summary.followed.answered} answered).`,
  "",
  "| Concern | Check-ins | Good | Okay | Not good |",
  "| --- | ---: | ---: | ---: | ---: |",
  ...byConcern.map((c) => `| ${c.concern} | ${c.n} | ${c.good} | ${c.ok} | ${c.bad} |`),
  "",
  "Self-reported and uncontrolled: this shows acceptability and adherence in the user test, not effectiveness.",
  "",
];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("feedback.latest.md", out), `${md.join("\n")}\n`);
await writeFile(new URL("feedback.latest.json", out), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
