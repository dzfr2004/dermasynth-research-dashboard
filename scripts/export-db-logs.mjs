import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { closePostgres, pgQuery, postgresEnabled } from "../lib/db/postgres.mjs";

/**
 * Copies the hosted app's logs from Postgres into the local JSONL files the
 * reports read (selection log, context log, feedback), so
 * `npm run report:selection-log` and `npm run report:feedback` work unchanged
 * on a deployed app's data. Needs DATABASE_URL (e.g. from `vercel env pull`).
 *
 * Usage: npm run db:export-logs [-- --out=data/logs]
 */

loadDotEnv(process.cwd());
const config = createConfig();
if (!postgresEnabled()) throw new Error("Set DATABASE_URL (or POSTGRES_URL) to the hosted database first.");
const outArg = (process.argv.find((a) => a.startsWith("--out=")) || "").slice(6);
const target = (file, fallback) => resolve(process.cwd(), outArg ? `${outArg}/${fallback.split("/").pop()}` : file || fallback);
const jobs = [
  ["selection_log", target(config.selectionLog.path, "data/logs/selection-log.jsonl")],
  ["context_log", target(config.selectionLog.contextPath, "data/logs/context-log.jsonl")],
  ["feedback", target(process.env.FEEDBACK_LOG_PATH, "data/logs/feedback.jsonl")],
];
for (const [table, path] of jobs) {
  const { rows } = await pgQuery(`SELECT record FROM ${table} ORDER BY id`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, rows.map((row) => JSON.stringify(row.record)).join("\n") + (rows.length ? "\n" : ""));
  console.log(`${table}: ${rows.length} record(s) → ${path}`);
}
await closePostgres();
