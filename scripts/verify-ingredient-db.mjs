// Offline verification of the dynamic knowledge-base repository. Exercises the
// full lifecycle against an in-memory database: create, edit (versioning),
// approval state machine, rollback, audit logging, and the Pinecone sync
// ledger (dry run). Exits non-zero on the first failed assertion.

import { getDatabase } from "../lib/db/database.mjs";
import { createRepository } from "../lib/ingredient-repository.mjs";
import { createPineconeSync } from "../lib/pinecone-sync.mjs";
import { buildExplorerFromDb } from "../lib/ingredient-db-explorer.mjs";

let passed = 0;
const failures = [];
function check(label, condition) {
  if (condition) {
    passed += 1;
  } else {
    failures.push(label);
    console.error(`FAIL: ${label}`);
  }
}

const db = getDatabase({ path: ":memory:" });
const config = { liveServicesEnabled: false, pinecone: { researchNamespace: "test-ns" } };
const sync = createPineconeSync({ config, db });
const repo = createRepository({ db, pineconeSync: sync });

// 1. Create a source and an ingredient.
const src = repo.upsertSource({
  source_id: "journal-test-2025",
  approval_state: "in_review",
  source_family: "medical_journal",
  title: "Test evidence review",
  source_url: "https://example.org/test",
  clinical_review_status: "pending_qualified_review",
}, { actor: "tester" });
check("source created at version 1", src.version === 1 && src.approval_state === "in_review");

const ing = repo.upsertIngredient({
  ingredient_id: "test-acid",
  approval_state: "in_review",
  display_name: "Test Acid",
  inci_names: ["Testic Acid"],
  concern_contexts: ["texture", "pigment"],
  categories: ["exfoliant"],
  incompatibilities: ["retinol"],
  source_ids: ["journal-test-2025"],
}, { actor: "tester" });
check("ingredient created at version 1", ing.version === 1);
check("ingredient source link resolved", repo.listIngredientSourceIds("test-acid").length === 1);

// 2. Edit -> new version, prior version retained.
const edited = repo.upsertIngredient({
  ingredient_id: "test-acid",
  approval_state: "in_review",
  display_name: "Test Acid (revised)",
  inci_names: ["Testic Acid"],
  concern_contexts: ["texture"],
  source_ids: ["journal-test-2025"],
}, { actor: "tester", reason: "narrow contexts" });
check("edit bumps to version 2", edited.version === 2);
check("only one current row", repo.listIngredients().filter((i) => i.ingredient_id === "test-acid").length === 1);
check("two versions retained", repo.getVersions("ingredient", "test-acid").length === 2);

// 3. Approval state machine: approve -> publish (enqueues pinecone upsert).
repo.approve("ingredient", "test-acid", { actor: "reviewer" });
check("approved state", repo.getCurrentIngredient("test-acid").approval_state === "approved");
repo.publish("ingredient", "test-acid", { actor: "admin" });
check("published state", repo.getCurrentIngredient("test-acid").approval_state === "published");
check("publish enqueued pinecone upsert", sync.pending().some((r) => r.operation === "upsert"));

// 4. Illegal transition rejected.
let illegalRejected = false;
try {
  repo.publish("source", "journal-test-2025", { actor: "admin" }); // in_review -> published is illegal
} catch {
  illegalRejected = true;
}
check("illegal transition blocked", illegalRejected);

// 5. Archive published record -> enqueues delete.
repo.archive("ingredient", "test-acid", { actor: "admin" });
check("archived state", repo.getCurrentIngredient("test-acid").approval_state === "archived");
check("archive enqueued pinecone delete", sync.pending().some((r) => r.operation === "delete"));

// 6. Rollback to version 1 payload.
const rolled = repo.rollback("ingredient", "test-acid", 1, { actor: "admin" });
check("rollback creates new version", rolled.version === 3);
check("rollback restores display name", rolled.display_name === "Test Acid");
check("rollback restores contexts", JSON.stringify(rolled.concern_contexts.sort()) === JSON.stringify(["pigment", "texture"]));
check("rollback restores prior approval state", rolled.approval_state === "in_review");

// 7. Audit log captured each change.
const audit = repo.getAuditLog({ entityType: "ingredient", entityId: "test-acid" });
const actions = new Set(audit.map((a) => a.action));
check("audit records create/update", actions.has("create") && actions.has("update"));
check("audit records approve/publish/archive/rollback", ["approve", "publish", "archive", "rollback"].every((a) => actions.has(a)));

// 8. Pinecone flush in dry-run marks pending rows skipped (no network IO).
const summary = await sync.flush({ repo });
check("dry-run flush processed rows", summary.mode === "dry_run" && summary.processed >= 2);
check("no pending rows after flush", sync.pending().length === 0);

// 9. Public explorer reflects current (rolled-back) state and hides archived.
const rolledArchived = repo.upsertSource({ source_id: "archived-src", approval_state: "in_review", source_family: "EWG", title: "Archived", source_url: "https://example.org/a" }, { actor: "tester" });
repo.archive("source", "archived-src", { actor: "admin", reason: "test hide" });
check("source archive recorded", rolledArchived.version === 1 && repo.getCurrentSource("archived-src").approval_state === "archived");
const explorer = buildExplorerFromDb(repo, {});
check("rolled-back ingredient visible again", explorer.ingredients.some((i) => i.id === "test-acid"));
check("archived source hidden from explorer", !explorer.sourceRecords.some((s) => s.id === "archived-src"));
check("explorer reports database source", explorer.dataSource === "database");

console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  process.exit(1);
}
