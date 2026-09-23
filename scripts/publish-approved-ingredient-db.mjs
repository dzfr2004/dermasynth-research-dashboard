// Explicit operator command for publishing approved database records and
// synchronising their project-authored metadata cards to Pinecone.
// Usage: npm run db:publish-atlas -- --dry-run | --upload

import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { getDatabase, migrate } from "../lib/db/database.mjs";
import { createRepository } from "../lib/ingredient-repository.mjs";
import { createPineconeSync } from "../lib/pinecone-sync.mjs";

const upload = process.argv.slice(2).includes("--upload");
const dryRun = process.argv.slice(2).includes("--dry-run");
if (upload === dryRun) throw new Error("Choose exactly one mode: --dry-run or --upload.");

loadDotEnv(process.cwd());
const config = createConfig();
const db = getDatabase({ path: config.ingredientDb?.path || undefined });
migrate(db);
const sync = createPineconeSync({ config, db, dryRun: !upload });
const repo = createRepository({ db, pineconeSync: sync });
const summary = { mode: upload ? "upload" : "dry_run", sourcesPublished: 0, ingredientsPublished: 0 };

for (const source of repo.listSources({ state: "approved" })) {
  repo.publish("source", source.source_id, { actor: "atlas-publish", reason: "approved dynamic knowledge-base publication" });
  summary.sourcesPublished += 1;
}
for (const ingredient of repo.listIngredients({ state: "approved" })) {
  repo.publish("ingredient", ingredient.ingredient_id, { actor: "atlas-publish", reason: "approved dynamic knowledge-base publication" });
  summary.ingredientsPublished += 1;
}

summary.sync = await sync.flush({ repo });
console.log(JSON.stringify(summary, null, 2));
