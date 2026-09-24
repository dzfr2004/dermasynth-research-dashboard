import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createConfig, loadDotEnv } from "../lib/config.mjs";

/**
 * One command for the whole knowledge base (F4).
 *
 * Runs, in order, the steps that were previously run by hand
 * (docs/GO-LIVE.md sections 2, 3 and 5):
 *   1. migrate the SQLite schema;
 *   2. seed the approved knowledge base - only when the database is empty,
 *      or when --fresh is passed (seeding replaces reviewer changes);
 *   3. apply the September 2026 knowledge-base update (idempotent);
 *   4. verify the database and the knowledge base offline;
 *   5. regenerate the corpus inventory;
 *   6. Pinecone: publish approved records, the Atlas research namespace and
 *      the ingredient evidence documents; the verified CIR/regulatory cards are
 *      validated locally (the app reads them from disk, not from Pinecone).
 *      Dry runs unless --upload is passed; with --upload it ends with
 *      verify:index.
 * It stops at the first failing step.
 *
 * Usage:
 *   npm run kb:rebuild                 # local steps + Pinecone dry runs
 *   npm run kb:rebuild -- --upload     # ... and write to Pinecone
 *   npm run kb:rebuild -- --fresh      # also wipe and reseed the database first
 *   npm run kb:rebuild -- --plan       # print the steps without running them
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const args = new Set(process.argv.slice(2));
for (const arg of args) if (!["--upload", "--fresh", "--plan"].includes(arg)) { console.error(`Unknown option: ${arg}`); process.exit(2); }
const upload = args.has("--upload");
const fresh = args.has("--fresh");
const planOnly = args.has("--plan");
loadDotEnv(fileURLToPath(new URL("..", import.meta.url)));
const config = createConfig();
const pineconeReady = Boolean(config.pinecone?.apiKey && config.pinecone?.index);
if (upload && !pineconeReady) { console.error("--upload needs PINECONE_API_KEY and PINECONE_INDEX in .env."); process.exit(2); }

async function databaseIsEmpty() {
  try {
    const { createRepository } = await import("../lib/ingredient-repository.mjs");
    return createRepository({}).listIngredients().length === 0;
  } catch {
    return true;
  }
}

const evidenceDir = new URL("../data/evidence/cir-ewg/", import.meta.url);
const verifiedCards = readdirSync(evidenceDir)
  .filter((name) => /\.verified\.batch\d+\.v1\.jsonl$/.test(name) && !name.startsWith("ewg-reference"))
  .sort((a, b) => Number(a.match(/batch(\d+)/)[1]) - Number(b.match(/batch(\d+)/)[1]))
  .map((name) => `data/evidence/cir-ewg/${name}`);

const seed = fresh || (!planOnly && await databaseIsEmpty());
const steps = [
  { name: "Migrate the database schema", script: "migrate-db.mjs" },
  ...(seed ? [{ name: fresh ? "Wipe and reseed the approved knowledge base (--fresh)" : "Seed the approved knowledge base (database was empty)", script: "seed-ingredient-db.mjs", args: ["--fresh", "--state", "approved"] }] : []),
  { name: "Apply the September 2026 knowledge-base update", script: "apply-kb-update-2026-09.mjs" },
  { name: "Verify the ingredient database (offline)", script: "verify-ingredient-db.mjs" },
  { name: "Verify the ingredient knowledge base", script: "verify-ingredient-knowledge.mjs" },
  { name: "Regenerate the corpus inventory", script: "corpus-inventory.mjs" },
  { name: `Publish approved records to Pinecone (${upload ? "upload" : "dry run"})`, script: "publish-approved-ingredient-db.mjs", args: [upload ? "--upload" : "--dry-run"] },
  { name: `Atlas research namespace (${upload ? "upload" : "dry run"})`, script: "sync-atlas-research.mjs", args: upload ? ["--upload"] : [], needsPinecone: true },
  // Validation only, even with --upload: the app reads these cards from the
  // local files (Why? panel, safety summaries), and no runtime code queries a
  // Pinecone namespace for them. Their labels also do not meet the research-
  // upload contract in ingest-evidence.mjs, which is deliberately strict.
  { name: `Validate the verified CIR and regulatory cards, ${verifiedCards.length} files (local only; not uploaded)`, script: "ingest-evidence.mjs", args: verifiedCards.flatMap((file) => ["--file", file]) },
  { name: `Ingredient evidence documents for the candidate retriever (${upload ? "upload" : "dry run"})`, script: "sync-ingredient-evidence-pinecone.mjs", args: upload ? ["--upload"] : [] },
  ...(upload ? [{ name: "Verify the Pinecone index", script: "verify-pinecone.mjs" }] : []),
];

console.log(`Knowledge-base rebuild: ${steps.length} steps${upload ? " (writes to Pinecone)" : " (Pinecone dry runs)"}${fresh ? ", fresh database" : ""}.\n`);
if (planOnly) {
  steps.forEach((step, i) => console.log(`${String(i + 1).padStart(2)}. ${step.name}\n    node scripts/${step.script} ${(step.args || []).join(" ")}`));
  if (!fresh) console.log("\nSeeding runs only if the database is empty (or with --fresh).");
  process.exit(0);
}

const results = [];
for (const [i, step] of steps.entries()) {
  const scriptPath = `scripts/${step.script}`;
  if (step.needsPinecone && !pineconeReady) {
    console.log(`\n── ${i + 1}/${steps.length} ${step.name}: skipped (no Pinecone key in .env; even its dry run reads the index)`);
    results.push({ step: step.name, ok: true, skipped: true, seconds: "0.0" });
    continue;
  }
  if (!existsSync(new URL(`../${scriptPath}`, import.meta.url))) { console.error(`Missing ${scriptPath}`); process.exit(1); }
  console.log(`\n── ${i + 1}/${steps.length} ${step.name}`);
  const started = Date.now();
  const run = spawnSync(process.execPath, [scriptPath, ...(step.args || [])], { cwd: root, stdio: "inherit", env: process.env });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  results.push({ step: step.name, ok: run.status === 0, seconds });
  if (run.status !== 0) {
    console.error(`\nStopped: step ${i + 1} failed (exit ${run.status}). Fix it and run npm run kb:rebuild again; finished steps are safe to repeat.`);
    break;
  }
}
console.log("\nSummary");
for (const r of results) console.log(`  ${r.skipped ? "–" : r.ok ? "✓" : "✗"} ${r.step} (${r.skipped ? "skipped" : `${r.seconds} s`})`);
if (results.some((r) => !r.ok)) process.exitCode = 1;
else if (!upload) console.log("\nPinecone was not changed. Run npm run kb:rebuild -- --upload to write it.");
