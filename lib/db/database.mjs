// Thin database access layer.
//
// The application talks to this module through a tiny, engine-agnostic surface
// (`run`, `get`, `all`, `exec`, `transaction`). Today it is backed by Node's
// better-sqlite3 (compatible with the project's Node 20 runtime) so the
// project runs with no external service. Because the query
// surface and the schema use only the SQLite/Postgres common subset, a
// PostgreSQL adapter (Supabase, for production) can be dropped in later by
// implementing the same four methods and translating `?` placeholders to `$n`.

import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_URL = new URL("./schema.sql", import.meta.url);

export const DEFAULT_DB_PATH = resolve(here, "../../data/db/dermasynth.sqlite");
const SCHEMA_VERSION = "1";

const handles = new Map();
function createHandle(dbPath) {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  // Pragmatic durability + concurrency defaults. These are no-ops on Postgres,
  // which is why they live in the adapter, not schema.sql. WAL is preferred but
  // some filesystems (e.g. certain network mounts) reject it, so fall back to
  // the rollback journal rather than failing to open the database.
  try {
    db.exec("PRAGMA journal_mode = WAL;");
  } catch {
    try {
      db.exec("PRAGMA journal_mode = TRUNCATE;");
    } catch {
      // last resort: keep the SQLite default journal mode
    }
  }
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA busy_timeout = 5000;");
  } catch {
    // non-fatal tuning pragmas
  }

  const handle = {
    engine: "sqlite",
    raw: db,
    run(sql, params = []) {
      const stmt = db.prepare(sql);
      return stmt.run(...params);
    },
    get(sql, params = []) {
      const stmt = db.prepare(sql);
      return stmt.get(...params) ?? null;
    },
    all(sql, params = []) {
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    },
    exec(sql) {
      db.exec(sql);
    },
    transaction(fn) {
      return db.transaction(() => fn(handle))();
    },
    close() {
      db.close();
      handles.delete(dbPath);
    },
  };
  return handle;
}

/**
 * Return a cached database handle for the given path (default: local SQLite
 * file). Pass ":memory:" for ephemeral test databases.
 */
export function getDatabase({ path = process.env.INGREDIENT_DB_PATH || DEFAULT_DB_PATH } = {}) {
  const key = path || DEFAULT_DB_PATH;
  if (!handles.has(key)) {
    handles.set(key, createHandle(key));
  }
  return handles.get(key);
}

/** Create all tables/indexes if they do not yet exist. Idempotent. */
export function migrate(db = getDatabase()) {
  const schema = readFileSync(SCHEMA_URL, "utf8");
  db.exec(schema);
  db.run(
    "INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ["schema_version", SCHEMA_VERSION],
  );
  return { schemaVersion: SCHEMA_VERSION };
}

/** True when the core tables exist (used to decide DB vs JSON fallback). */
export function isMigrated(db = getDatabase()) {
  const row = db.get(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ingredients'",
  );
  return Boolean(row);
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId() {
  return randomUUID();
}
