// DB-backed repository for the ingredient + evidence knowledge base.
//
// Responsibilities (checklist section 3):
//   * store structured ingredient records and source records separately
//   * carry an explicit approval_state on every record
//   * version every write and support rollback to any prior version
//   * write a persistent audit-log entry for every change
//
// This module is deterministic and side-effect free apart from the database.
// Pinecone publication is handled by lib/pinecone-sync.mjs, which this module
// invokes through an injected hook so the repository stays testable offline.

import { getDatabase, migrate, isMigrated, nowIso, newId } from "./db/database.mjs";

export const APPROVAL_STATES = Object.freeze([
  "draft",
  "in_review",
  "approved",
  "published",
  "archived",
  "superseded",
  "rejected",
]);

// Allowed forward transitions. Rollback and administrative archive are handled
// as explicit operations, not table lookups.
const TRANSITIONS = Object.freeze({
  draft: ["in_review", "archived", "rejected"],
  in_review: ["approved", "rejected", "draft", "archived"],
  approved: ["published", "in_review", "archived"],
  published: ["archived", "superseded", "in_review"],
  rejected: ["draft", "archived"],
  archived: ["draft"],
  superseded: ["archived"],
});

export class RepositoryError extends Error {
  constructor(message, { code = "invalid" } = {}) {
    super(message);
    this.name = "RepositoryError";
    this.code = code;
  }
}

const INGREDIENT_ARRAY_FIELDS = [
  "inci_names",
  "aliases",
  "categories",
  "concern_contexts",
  "incompatibilities",
  "evidence_states",
  "activation_blockers",
];
const INGREDIENT_JSON_FIELDS = ["am_pm_eligibility", "environmental_rules", "extra_json"];
const SOURCE_JSON_FIELDS = ["extra_json"];

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function assertState(state) {
  if (!APPROVAL_STATES.includes(state)) {
    throw new RepositoryError(`Unknown approval state: ${state}`, { code: "bad_state" });
  }
}

// ---------------------------------------------------------------------------
// Row <-> record mapping
// ---------------------------------------------------------------------------

function rowToIngredient(row) {
  if (!row) return null;
  const record = { ...row };
  for (const field of INGREDIENT_ARRAY_FIELDS) record[field] = parseJson(row[field], []);
  for (const field of INGREDIENT_JSON_FIELDS) record[field] = parseJson(row[field], null);
  record.is_current = row.is_current === 1;
  record.routine_selection_allowed = row.routine_selection_allowed === 1;
  return record;
}

function rowToSource(row) {
  if (!row) return null;
  const record = { ...row };
  for (const field of SOURCE_JSON_FIELDS) record[field] = parseJson(row[field], null);
  record.is_current = row.is_current === 1;
  record.commercial_restriction = row.commercial_restriction === null ? null : row.commercial_restriction === 1;
  record.attribution_required = row.attribution_required === null ? null : row.attribution_required === 1;
  return record;
}

function boolInt(value) {
  if (value === undefined || value === null) return null;
  return value ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export function createRepository({ db = getDatabase(), pineconeSync = null } = {}) {
  if (!isMigrated(db)) migrate(db);

  function audit({ actor, entityType, entityId, action, fromState = null, toState = null, detail = null }) {
    db.run(
      `INSERT INTO audit_log (id, at, actor, entity_type, entity_id, action, from_state, to_state, detail_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), nowIso(), actor || "system", entityType, entityId ?? null, action, fromState, toState, toJson(detail)],
    );
  }

  function snapshot({ entityType, entityId, version, approvalState, payload, actor, reason }) {
    db.run(
      `INSERT INTO record_versions (id, entity_type, entity_id, version, approval_state, snapshot_json, actor, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), entityType, entityId, version, approvalState, toJson(payload), actor || "system", reason || null, nowIso()],
    );
  }

  function currentVersionNumber(table, idColumn, id) {
    const row = db.get(`SELECT MAX(version) AS v FROM ${table} WHERE ${idColumn} = ?`, [id]);
    return row && row.v ? Number(row.v) : 0;
  }

  // -- Sources ----------------------------------------------------------------

  function getCurrentSource(sourceId) {
    return rowToSource(
      db.get("SELECT * FROM sources WHERE source_id = ? AND is_current = 1", [sourceId]),
    );
  }

  function upsertSource(input, { actor = "system", reason = null } = {}) {
    const sourceId = String(input.source_id || input.id || "").trim();
    if (!sourceId) throw new RepositoryError("source_id is required", { code: "missing_id" });
    const approvalState = input.approval_state || "draft";
    assertState(approvalState);

    return db.transaction(() => {
      const prevVersion = currentVersionNumber("sources", "source_id", sourceId);
      const version = prevVersion + 1;
      const isFirst = prevVersion === 0;
      const now = nowIso();
      if (!isFirst) {
        db.run("UPDATE sources SET is_current = 0 WHERE source_id = ? AND is_current = 1", [sourceId]);
      }
      const createdAt = isFirst ? now : (getCurrentSourceCreatedAt(sourceId) || now);
      db.run(
        `INSERT INTO sources (
           row_id, source_id, version, is_current, approval_state, source_family, source_type,
           title, publisher, published_year, source_url, doi_or_pmid, evidence_role, evidence_type,
           use_mode, corpus_eligibility, rights_status, clinical_review_status, reuse_note,
           claim_boundary, commercial_restriction, attribution_required, extra_json, created_at, updated_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          `${sourceId}@${version}`, sourceId, version, 1, approvalState,
          input.source_family || null, input.source_type || null, input.title || null,
          input.publisher || null, input.published_year ?? null, input.source_url || null,
          input.doi_or_pmid || null, input.evidence_role || null, input.evidence_type || null,
          input.use_mode || null, input.corpus_eligibility || null, input.rights_status || null,
          input.clinical_review_status || null, input.reuse_note || null, input.claim_boundary || null,
          boolInt(input.commercial_restriction), boolInt(input.attribution_required),
          toJson(input.extra_json ?? null), createdAt, now,
        ],
      );
      const record = getCurrentSource(sourceId);
      snapshot({ entityType: "source", entityId: sourceId, version, approvalState, payload: record, actor, reason });
      audit({
        actor, entityType: "source", entityId: sourceId,
        action: isFirst ? "create" : "update", toState: approvalState,
        detail: { version, reason },
      });
      return record;
    });
  }

  function getCurrentSourceCreatedAt(sourceId) {
    const row = db.get("SELECT created_at FROM sources WHERE source_id = ? ORDER BY version ASC LIMIT 1", [sourceId]);
    return row ? row.created_at : null;
  }

  function listSources({ state = null } = {}) {
    const rows = state
      ? db.all("SELECT * FROM sources WHERE is_current = 1 AND approval_state = ? ORDER BY source_id", [state])
      : db.all("SELECT * FROM sources WHERE is_current = 1 ORDER BY source_id");
    return rows.map(rowToSource);
  }

  // -- Ingredients ------------------------------------------------------------

  function getCurrentIngredient(ingredientId) {
    return rowToIngredient(
      db.get("SELECT * FROM ingredients WHERE ingredient_id = ? AND is_current = 1", [ingredientId]),
    );
  }

  function getCurrentIngredientCreatedAt(ingredientId) {
    const row = db.get("SELECT created_at FROM ingredients WHERE ingredient_id = ? ORDER BY version ASC LIMIT 1", [ingredientId]);
    return row ? row.created_at : null;
  }

  function replaceIngredientSourceLinks(ingredientId, sourceIds) {
    db.run("DELETE FROM ingredient_sources WHERE ingredient_id = ?", [ingredientId]);
    const now = nowIso();
    for (const sourceId of new Set((sourceIds || []).filter(Boolean))) {
      db.run(
        "INSERT OR IGNORE INTO ingredient_sources (ingredient_id, source_id, created_at) VALUES (?, ?, ?)",
        [ingredientId, sourceId, now],
      );
    }
  }

  function upsertIngredient(input, { actor = "system", reason = null } = {}) {
    const ingredientId = String(input.ingredient_id || input.id || "").trim();
    if (!ingredientId) throw new RepositoryError("ingredient_id is required", { code: "missing_id" });
    if (!input.display_name) throw new RepositoryError("display_name is required", { code: "missing_field" });
    const approvalState = input.approval_state || "draft";
    assertState(approvalState);

    return db.transaction(() => {
      const prevVersion = currentVersionNumber("ingredients", "ingredient_id", ingredientId);
      const version = prevVersion + 1;
      const isFirst = prevVersion === 0;
      const now = nowIso();
      if (!isFirst) {
        db.run("UPDATE ingredients SET is_current = 0 WHERE ingredient_id = ? AND is_current = 1", [ingredientId]);
      }
      const createdAt = isFirst ? now : (getCurrentIngredientCreatedAt(ingredientId) || now);
      db.run(
        `INSERT INTO ingredients (
           row_id, ingredient_id, version, is_current, approval_state, display_name, inci_names,
           aliases, categories, concern_contexts, am_pm_eligibility, environmental_rules,
           incompatibilities, reactivity_class, normalization_status, evidence_states,
           activation_blockers, routine_selection_allowed, extra_json, created_at, updated_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          `${ingredientId}@${version}`, ingredientId, version, 1, approvalState,
          input.display_name, toJson(input.inci_names || []), toJson(input.aliases || []),
          toJson(input.categories || []), toJson(input.concern_contexts || []),
          toJson(input.am_pm_eligibility ?? null), toJson(input.environmental_rules ?? null),
          toJson(input.incompatibilities || []), input.reactivity_class || null,
          input.normalization_status || null, toJson(input.evidence_states || []),
          toJson(input.activation_blockers || []), boolInt(input.routine_selection_allowed) ?? 0,
          toJson(input.extra_json ?? null), createdAt, now,
        ],
      );
      replaceIngredientSourceLinks(ingredientId, input.source_ids || input.sourceIds || []);
      const record = getCurrentIngredient(ingredientId);
      record.source_ids = listIngredientSourceIds(ingredientId);
      snapshot({ entityType: "ingredient", entityId: ingredientId, version, approvalState, payload: record, actor, reason });
      audit({
        actor, entityType: "ingredient", entityId: ingredientId,
        action: isFirst ? "create" : "update", toState: approvalState,
        detail: { version, reason },
      });
      return record;
    });
  }

  function listIngredientSourceIds(ingredientId) {
    return db
      .all("SELECT source_id FROM ingredient_sources WHERE ingredient_id = ? ORDER BY source_id", [ingredientId])
      .map((row) => row.source_id);
  }

  function listIngredients({ state = null, concern = null, category = null } = {}) {
    const rows = state
      ? db.all("SELECT * FROM ingredients WHERE is_current = 1 AND approval_state = ? ORDER BY ingredient_id", [state])
      : db.all("SELECT * FROM ingredients WHERE is_current = 1 ORDER BY ingredient_id");
    let records = rows.map((row) => {
      const record = rowToIngredient(row);
      record.source_ids = listIngredientSourceIds(record.ingredient_id);
      return record;
    });
    if (concern) {
      const c = String(concern).toLowerCase();
      records = records.filter((r) => r.concern_contexts.map(String).map((x) => x.toLowerCase()).includes(c));
    }
    if (category) {
      const cat = String(category).toLowerCase();
      records = records.filter((r) => (r.categories || []).map(String).map((x) => x.toLowerCase()).includes(cat));
    }
    return records;
  }

  // -- Shared state transitions ----------------------------------------------

  function transition(entityType, entityId, toState, { actor = "system", reason = null, enforce = true } = {}) {
    assertState(toState);
    const table = entityType === "ingredient" ? "ingredients" : "sources";
    const idColumn = entityType === "ingredient" ? "ingredient_id" : "source_id";
    const current = entityType === "ingredient" ? getCurrentIngredient(entityId) : getCurrentSource(entityId);
    if (!current) throw new RepositoryError(`No current ${entityType} '${entityId}'`, { code: "not_found" });
    const fromState = current.approval_state;
    if (enforce && fromState !== toState && !(TRANSITIONS[fromState] || []).includes(toState)) {
      throw new RepositoryError(`Illegal transition ${fromState} -> ${toState} for ${entityType} '${entityId}'`, {
        code: "illegal_transition",
      });
    }
    return db.transaction(() => {
      const now = nowIso();
      db.run(
        `UPDATE ${table} SET approval_state = ?, updated_at = ? WHERE ${idColumn} = ? AND is_current = 1`,
        [toState, now, entityId],
      );
      const record = entityType === "ingredient" ? getCurrentIngredient(entityId) : getCurrentSource(entityId);
      if (entityType === "ingredient") record.source_ids = listIngredientSourceIds(entityId);
      snapshot({ entityType, entityId, version: current.version, approvalState: toState, payload: record, actor, reason });
      audit({
        actor, entityType, entityId,
        action: transitionAction(toState), fromState, toState,
        detail: { reason },
      });
      // Publication side-effects to Pinecone are delegated to the sync hook.
      if (pineconeSync) {
        if (toState === "published") pineconeSync.onPublish?.({ entityType, entityId, record, actor });
        if (toState === "archived" || toState === "superseded") {
          pineconeSync.onArchive?.({ entityType, entityId, record, actor });
        }
      }
      return record;
    });
  }

  function transitionAction(toState) {
    switch (toState) {
      case "approved": return "approve";
      case "published": return "publish";
      case "archived": return "archive";
      case "superseded": return "supersede";
      case "rejected": return "reject";
      case "in_review": return "submit";
      default: return "update";
    }
  }

  // -- Rollback ---------------------------------------------------------------

  function getVersions(entityType, entityId) {
    return db
      .all(
        `SELECT version, approval_state, snapshot_json, actor, reason, created_at
         FROM record_versions WHERE entity_type = ? AND entity_id = ? ORDER BY version ASC, created_at ASC`,
        [entityType, entityId],
      )
      .map((row) => ({
        version: row.version,
        approvalState: row.approval_state,
        actor: row.actor,
        reason: row.reason,
        createdAt: row.created_at,
        snapshot: parseJson(row.snapshot_json, null),
      }));
  }

  function rollback(entityType, entityId, toVersion, { actor = "system", reason = null } = {}) {
    const versions = getVersions(entityType, entityId);
    const target = versions.find((v) => v.version === Number(toVersion));
    if (!target || !target.snapshot) {
      throw new RepositoryError(`No snapshot for ${entityType} '${entityId}' version ${toVersion}`, {
        code: "not_found",
      });
    }
    const payload = target.snapshot;
    const rolled = entityType === "ingredient"
      ? upsertIngredient({ ...payload, id: entityId, approval_state: payload.approval_state }, { actor, reason: reason || `rollback to v${toVersion}` })
      : upsertSource({ ...payload, id: entityId, approval_state: payload.approval_state }, { actor, reason: reason || `rollback to v${toVersion}` });
    audit({
      actor, entityType, entityId, action: "rollback",
      toState: rolled.approval_state, detail: { rolledFromVersion: toVersion, newVersion: rolled.version },
    });
    return rolled;
  }

  // -- Audit / stats ----------------------------------------------------------

  function getAuditLog({ entityType = null, entityId = null, limit = 200 } = {}) {
    let sql = "SELECT * FROM audit_log";
    const params = [];
    const clauses = [];
    if (entityType) { clauses.push("entity_type = ?"); params.push(entityType); }
    if (entityId) { clauses.push("entity_id = ?"); params.push(entityId); }
    if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
    sql += " ORDER BY at DESC LIMIT ?";
    params.push(Math.max(1, Math.min(Number(limit) || 200, 1000)));
    return db.all(sql, params).map((row) => ({ ...row, detail: parseJson(row.detail_json, null) }));
  }

  function counts() {
    const byState = (table) =>
      Object.fromEntries(
        db
          .all(`SELECT approval_state AS s, COUNT(*) AS n FROM ${table} WHERE is_current = 1 GROUP BY approval_state`)
          .map((row) => [row.s, row.n]),
      );
    return {
      ingredients: {
        total: db.get("SELECT COUNT(*) AS n FROM ingredients WHERE is_current = 1").n,
        byState: byState("ingredients"),
      },
      sources: {
        total: db.get("SELECT COUNT(*) AS n FROM sources WHERE is_current = 1").n,
        byState: byState("sources"),
      },
    };
  }

  return {
    db,
    // sources
    upsertSource,
    getCurrentSource,
    listSources,
    // ingredients
    upsertIngredient,
    getCurrentIngredient,
    listIngredients,
    listIngredientSourceIds,
    // workflow
    transition,
    submit: (t, id, opts) => transition(t, id, "in_review", opts),
    approve: (t, id, opts) => transition(t, id, "approved", opts),
    reject: (t, id, opts) => transition(t, id, "rejected", opts),
    publish: (t, id, opts) => transition(t, id, "published", opts),
    archive: (t, id, opts) => transition(t, id, "archived", opts),
    supersede: (t, id, opts) => transition(t, id, "superseded", opts),
    rollback,
    getVersions,
    // reporting
    getAuditLog,
    counts,
  };
}
