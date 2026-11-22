import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vercel entry point. Every request is rewritten here (vercel.json) and handed
 * to the same handler the local server uses.
 *
 * The deployment's files are read-only, so the knowledge base built during
 * `npm run build` is copied to /tmp on a cold start and opened from there,
 * and local log files go to /tmp too (with Postgres configured, the logs,
 * study data and explanation facts go to Postgres instead).
 */

const bundled = resolve(process.cwd(), "data/db/dermasynth.sqlite");
const writable = "/tmp/dermasynth.sqlite";
if (!process.env.INGREDIENT_DB_PATH) {
  if (!existsSync(writable) && existsSync(bundled)) copyFileSync(bundled, writable);
  process.env.INGREDIENT_DB_PATH = writable;
}
process.env.OPENAI_ERROR_LOG_PATH ||= "/tmp/provider-errors.jsonl";
process.env.SELECTION_LOG_PATH ||= "/tmp/selection-log.jsonl";
process.env.CONTEXT_LOG_PATH ||= "/tmp/context-log.jsonl";
process.env.FEEDBACK_LOG_PATH ||= "/tmp/feedback.jsonl";
process.env.STUDY_DB_PATH ||= "/tmp/study.sqlite";
process.env.TRUST_PROXY_HOPS ||= "1";

const { handleRequest } = await import("../server.mjs");
export default handleRequest;
