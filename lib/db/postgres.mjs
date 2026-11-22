import pg from "pg";

/**
 * Postgres for everything the app writes at runtime: the selection, context
 * and feedback logs, the GPT explanation facts per run, the rotation memory
 * and the user-study store. Enabled when DATABASE_URL (or POSTGRES_URL, which
 * the Vercel/Neon integration sets) is present; otherwise the app keeps its
 * local files and SQLite, so local runs and the offline evaluations are
 * unchanged.
 *
 * The read-only knowledge base stays in SQLite: it is rebuilt from the
 * versioned JSON in the repository on every deploy (docs/DEPLOYMENT.md).
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS selection_log (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), run_id TEXT, record JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS context_log (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), run_id TEXT, record JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS feedback (id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), record JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS routine_context (run_id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), payload JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS rotation_recent (slot_key TEXT PRIMARY KEY, ids JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS study_consents (
  code TEXT PRIMARY KEY, created_at TEXT NOT NULL, name TEXT NOT NULL, signature TEXT NOT NULL, signed_date TEXT NOT NULL,
  credit_opt_in INTEGER NOT NULL DEFAULT 0, session_key TEXT, round INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS study_responses (
  code TEXT PRIMARY KEY REFERENCES study_consents(code) ON DELETE CASCADE,
  submitted_at TEXT NOT NULL, skin_type TEXT, concern TEXT, app_use TEXT, asked_chatbot INTEGER, multi_day INTEGER, days_used INTEGER,
  sus TEXT NOT NULL, sus_score DOUBLE PRECISION NOT NULL, items TEXT NOT NULL, most_useful TEXT, confusing TEXT
);
CREATE TABLE IF NOT EXISTS study_task_results (
  code TEXT NOT NULL REFERENCES study_consents(code) ON DELETE CASCADE, task_id TEXT NOT NULL, outcome TEXT NOT NULL,
  seconds DOUBLE PRECISION, notes TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (code, task_id)
);
CREATE TABLE IF NOT EXISTS study_case_sets (
  id BIGSERIAL PRIMARY KEY, submitted_at TEXT NOT NULL, author TEXT NOT NULL, role TEXT, cases TEXT NOT NULL, pairs TEXT NOT NULL, sha256 TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS study_code_counter (id INTEGER PRIMARY KEY CHECK (id = 1), last INTEGER NOT NULL);
INSERT INTO study_code_counter (id, last) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
CREATE INDEX IF NOT EXISTS routine_context_created ON routine_context (created_at);
`;

export function postgresUrl(env = process.env) {
  return env.DATABASE_URL || env.POSTGRES_URL || "";
}

export function postgresEnabled(env = process.env) {
  return Boolean(postgresUrl(env));
}

let pool = null;
let ready = null;

function sslFor(url) {
  // Hosted Postgres (Neon, Supabase, Railway) needs TLS; a local server does not.
  if (/sslmode=disable/.test(url) || /@(localhost|127\.0\.0\.1)[:/]/.test(url)) return false;
  return { rejectUnauthorized: false };
}

export function getPool(env = process.env) {
  const url = postgresUrl(env);
  if (!url) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString: url, ssl: sslFor(url), max: Number(env.PG_POOL_MAX || 3), idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 });
    pool.on("error", () => { /* an idle client dropped; the pool reconnects on next use */ });
  }
  return pool;
}

/** Runs the schema once per process; every helper awaits it. */
export async function pgReady(env = process.env) {
  const p = getPool(env);
  if (!p) return null;
  ready ??= p.query(SCHEMA).then(() => p).catch((error) => { ready = null; throw error; });
  return ready;
}

export async function pgQuery(text, params = [], env = process.env) {
  const p = await pgReady(env);
  if (!p) throw new Error("Postgres is not configured.");
  return p.query(text, params);
}

/** Runs fn(client) inside a transaction. */
export async function pgTransaction(fn, env = process.env) {
  const p = await pgReady(env);
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closePostgres() {
  const p = pool;
  pool = null;
  ready = null;
  if (p) await p.end();
}
