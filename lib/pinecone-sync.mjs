// Pinecone publication sync for the dynamic knowledge base.
//
// Design: the repository's approval workflow is transactional and synchronous
// (node:sqlite). Network IO cannot happen inside that transaction, so the
// publish/archive hooks only *record intent* into pinecone_sync_log with a
// `pending` result. An async flush() then performs the real upsert/delete when
// live services are configured, and updates the ledger row. When live services
// are off (or dryRun is forced) the pending rows are resolved as `skipped`
// (dry_run) — nothing leaves the machine. This keeps the repository fully
// testable offline while still driving real vector state in production.

import { nowIso, newId } from "./db/database.mjs";
import {
  assertIntegratedTextIndex,
  describePineconeIndex,
  upsertTextRecords,
  deleteVectorsByIds,
} from "./pinecone.mjs";

export function ingredientVectorId(ingredientId) {
  return `atlas-ingredient-${ingredientId}-v1`;
}

/**
 * Build a project-authored, metadata-only research card. It contains no copied
 * journal/CIR/EWG source text; it records identifiers and normalisation state
 * for final-review inspection only, and cannot become a routine instruction.
 */
export function buildIngredientCard(record) {
  const contexts = (record.concern_contexts || []).join(", ");
  return {
    _id: ingredientVectorId(record.ingredient_id),
    chunk_text: [
      `Project-authored research metadata card for ${record.display_name}.`,
      `Mapped non-clinical research contexts: ${contexts || "none"}.`,
      "This card records source identifiers and normalisation metadata for final-review inspection only.",
      "It does not copy source text, select a product or ingredient, infer a result, specify an amount or frequency, or create an individual routine instruction.",
    ].join(" "),
    document_id: ingredientVectorId(record.ingredient_id),
    title: `${record.display_name} — source-attributed research metadata`,
    source: "DermaSynth project-authored research Atlas",
    document_type: "project-authored-category-only-atlas-card",
    approval_state: record.approval_state,
    record_version: record.version,
    normalization_status: record.normalization_status || "",
    research_card_status: "category_only_research_context",
    demo_use_status: "research_demo_only",
    product_specific: false,
  };
}

export function createPineconeSync({ config, db, dryRun = false } = {}) {
  const namespace = config?.pinecone?.researchNamespace || "demo-atlas-50-v1";
  const liveConfigured = Boolean(
    !dryRun && config?.liveServicesEnabled && config?.pinecone?.apiKey && config?.pinecone?.index,
  );

  function record({ entityType, entityId, vectorId, operation, result, detail }) {
    db.run(
      `INSERT INTO pinecone_sync_log (id, at, entity_type, entity_id, vector_id, namespace, operation, mode, result, detail)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        newId(), nowIso(), entityType, entityId, vectorId, namespace, operation,
        liveConfigured ? "live" : "dry_run", result, detail || null,
      ],
    );
  }

  // Synchronous hooks — safe to call inside the repository transaction. Only
  // ingredients currently map to Pinecone cards; source rows are provenance
  // metadata and are represented through their ingredient cards.
  function onPublish({ entityType, entityId }) {
    if (entityType !== "ingredient") return;
    record({ entityType, entityId, vectorId: ingredientVectorId(entityId), operation: "upsert", result: "pending" });
  }

  function onArchive({ entityType, entityId }) {
    if (entityType !== "ingredient") return;
    record({ entityType, entityId, vectorId: ingredientVectorId(entityId), operation: "delete", result: "pending" });
  }

  function pending() {
    return db.all("SELECT * FROM pinecone_sync_log WHERE result = 'pending' ORDER BY at ASC");
  }

  function resolve(id, result, detail) {
    db.run("UPDATE pinecone_sync_log SET result = ?, detail = ?, at = ? WHERE id = ?", [
      result, detail || null, nowIso(), id,
    ]);
  }

  /**
   * Process all pending ledger rows. Returns a summary. When live services are
   * not configured, pending rows are marked `skipped` (no network IO).
   */
  async function flush({ repo } = {}) {
    const rows = pending();
    if (!rows.length) return { processed: 0, upserted: 0, deleted: 0, skipped: 0, mode: liveConfigured ? "live" : "dry_run" };

    if (!liveConfigured) {
      for (const row of rows) resolve(row.id, "skipped", "live services disabled — dry run");
      return { processed: rows.length, upserted: 0, deleted: 0, skipped: rows.length, mode: "dry_run" };
    }

    let descriptor;
    try {
      descriptor = await describePineconeIndex(config);
      assertIntegratedTextIndex(descriptor, config.pinecone.textField);
    } catch (error) {
      for (const row of rows) resolve(row.id, "error", `index unavailable: ${error.message}`);
      return { processed: rows.length, upserted: 0, deleted: 0, skipped: 0, mode: "live", error: error.message };
    }

    const upserts = rows.filter((r) => r.operation === "upsert");
    const deletes = rows.filter((r) => r.operation === "delete");
    let upserted = 0;
    let deleted = 0;

    // Upserts: build a fresh card from the current DB record if still published.
    for (const row of upserts) {
      try {
        const current = repo ? repo.getCurrentIngredient(row.entity_id) : null;
        if (!current || current.approval_state !== "published") {
          resolve(row.id, "skipped", "record no longer published at flush time");
          continue;
        }
        await upsertTextRecords({ config, descriptor, records: [buildIngredientCard(current)], namespace });
        upserted += 1;
        resolve(row.id, "ok", `upserted ${row.vector_id}`);
      } catch (error) {
        resolve(row.id, "error", error.message);
      }
    }

    for (const row of deletes) {
      try {
        await deleteVectorsByIds({ config, descriptor, ids: [row.vector_id], namespace });
        deleted += 1;
        resolve(row.id, "ok", `deleted ${row.vector_id}`);
      } catch (error) {
        resolve(row.id, "error", error.message);
      }
    }

    return { processed: rows.length, upserted, deleted, skipped: 0, mode: "live" };
  }

  function log({ limit = 100 } = {}) {
    return db.all("SELECT * FROM pinecone_sync_log ORDER BY at DESC LIMIT ?", [Math.min(Number(limit) || 100, 500)]);
  }

  return { namespace, liveConfigured, onPublish, onArchive, flush, pending, log };
}
