-- DermaSynth dynamic knowledge-base schema.
--
-- Portability note: this schema is written to run on both SQLite (better-sqlite3,
-- used locally) and PostgreSQL (Supabase, for production). It intentionally uses
-- only the common subset of types:
--   * TEXT   -> TEXT on both engines. JSON payloads are stored as TEXT here; on
--              Postgres these columns can be migrated to JSONB with a cast.
--   * INTEGER-> INTEGER on both engines. Boolean flags use 0/1 integers so the
--              same DDL runs unchanged on SQLite (which has no BOOLEAN type).
-- Timestamps are ISO-8601 strings in UTC, written by the application layer, so
-- the DDL needs no engine-specific DEFAULT now() function.

-- ---------------------------------------------------------------------------
-- Sources: one row per attributed source record (journal, CIR, EWG, ...).
-- Versioned by (source_id, version); the currently active row has is_current=1.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
  row_id              TEXT PRIMARY KEY,          -- surrogate key: source_id + '@' + version
  source_id           TEXT NOT NULL,             -- stable business id (e.g. cir-hyaluronates-2023)
  version             INTEGER NOT NULL,          -- monotonically increasing per source_id
  is_current          INTEGER NOT NULL DEFAULT 1,-- 1 for the active version, 0 for history
  approval_state      TEXT NOT NULL,             -- draft|in_review|approved|published|archived|superseded|rejected
  source_family       TEXT NOT NULL,             -- CIR|EWG|medical_journal
  source_type         TEXT,
  title               TEXT NOT NULL,
  publisher           TEXT,
  published_year      INTEGER,
  source_url          TEXT NOT NULL,
  doi_or_pmid         TEXT,
  evidence_role       TEXT,
  evidence_type       TEXT,                      -- checklist: "evidence type"
  use_mode            TEXT,
  corpus_eligibility  TEXT,
  rights_status       TEXT,                      -- checklist: "use rights"
  clinical_review_status TEXT,                   -- checklist: "review status"
  reuse_note          TEXT,
  claim_boundary      TEXT,
  commercial_restriction INTEGER,                -- 0/1
  attribution_required   INTEGER,                -- 0/1
  extra_json          TEXT,                      -- forward-compatible catch-all (JSON)
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sources_id_version ON sources (source_id, version);
CREATE INDEX IF NOT EXISTS ix_sources_current ON sources (source_id, is_current);
CREATE INDEX IF NOT EXISTS ix_sources_state ON sources (approval_state);

-- ---------------------------------------------------------------------------
-- Ingredients: one row per Atlas ingredient record. Versioned like sources.
-- Array/list fields (INCI names, aliases, contexts, ...) are stored as JSON
-- text arrays so the record round-trips losslessly on both engines.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredients (
  row_id              TEXT PRIMARY KEY,          -- ingredient_id + '@' + version
  ingredient_id       TEXT NOT NULL,             -- stable business id (e.g. retinol)
  version             INTEGER NOT NULL,
  is_current          INTEGER NOT NULL DEFAULT 1,
  approval_state      TEXT NOT NULL,             -- draft|in_review|approved|published|archived|superseded|rejected
  display_name        TEXT NOT NULL,
  inci_names          TEXT NOT NULL,             -- JSON array
  aliases             TEXT,                      -- JSON array
  categories          TEXT,                      -- JSON array (ingredient categories)
  concern_contexts    TEXT NOT NULL,             -- JSON array
  am_pm_eligibility   TEXT,                      -- JSON object {am:bool, pm:bool} or array
  environmental_rules TEXT,                      -- JSON object/array (UV/PM eligibility rules)
  incompatibilities   TEXT,                      -- JSON array of ingredient_ids
  reactivity_class    TEXT,                      -- e.g. low|moderate|high (nullable)
  normalization_status TEXT,
  evidence_states     TEXT,                      -- JSON array
  activation_blockers TEXT,                      -- JSON array
  routine_selection_allowed INTEGER NOT NULL DEFAULT 0, -- 0/1 code-controlled gate
  extra_json          TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ingredients_id_version ON ingredients (ingredient_id, version);
CREATE INDEX IF NOT EXISTS ix_ingredients_current ON ingredients (ingredient_id, is_current);
CREATE INDEX IF NOT EXISTS ix_ingredients_state ON ingredients (approval_state);

-- ---------------------------------------------------------------------------
-- Ingredient <-> source links, resolved against the *current* rows. Kept as a
-- separate table so provenance is queryable and a source can be shared.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredient_sources (
  ingredient_id       TEXT NOT NULL,
  source_id           TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  PRIMARY KEY (ingredient_id, source_id)
);

CREATE INDEX IF NOT EXISTS ix_ingredient_sources_source ON ingredient_sources (source_id);

-- ---------------------------------------------------------------------------
-- Immutable version snapshots for rollback. Every write records the full JSON
-- payload of the record as it was after the change.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS record_versions (
  id                  TEXT PRIMARY KEY,          -- uuid
  entity_type         TEXT NOT NULL,             -- ingredient|source
  entity_id           TEXT NOT NULL,             -- business id
  version             INTEGER NOT NULL,
  approval_state      TEXT NOT NULL,
  snapshot_json       TEXT NOT NULL,             -- full record payload at this version
  actor               TEXT,                      -- who made the change (role/label)
  reason              TEXT,                      -- optional change note
  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_record_versions_entity ON record_versions (entity_type, entity_id, version);

-- ---------------------------------------------------------------------------
-- Persistent audit log for every policy, ingredient, source, and review change.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id                  TEXT PRIMARY KEY,          -- uuid
  at                  TEXT NOT NULL,             -- ISO timestamp
  actor               TEXT,                      -- role/label of who acted
  entity_type         TEXT NOT NULL,             -- ingredient|source|policy|review|pinecone
  entity_id           TEXT,                      -- business id (nullable for bulk)
  action              TEXT NOT NULL,             -- import|create|update|approve|reject|archive|publish|rollback|supersede|sync|delete
  from_state          TEXT,
  to_state            TEXT,
  detail_json         TEXT                       -- structured detail (JSON)
);

CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_audit_at ON audit_log (at);

-- ---------------------------------------------------------------------------
-- Pinecone sync ledger: records every publication push and archival delete so
-- vector state can be reconciled and superseded vectors removed reliably.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pinecone_sync_log (
  id                  TEXT PRIMARY KEY,
  at                  TEXT NOT NULL,
  entity_type         TEXT NOT NULL,             -- ingredient|source
  entity_id           TEXT NOT NULL,
  vector_id           TEXT NOT NULL,
  namespace           TEXT NOT NULL,
  operation           TEXT NOT NULL,             -- upsert|delete
  mode                TEXT NOT NULL,             -- live|dry_run
  result              TEXT NOT NULL,             -- ok|error|skipped
  detail              TEXT
);

CREATE INDEX IF NOT EXISTS ix_pinecone_entity ON pinecone_sync_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Schema bookkeeping.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_meta (
  key                 TEXT PRIMARY KEY,
  value               TEXT NOT NULL
);
