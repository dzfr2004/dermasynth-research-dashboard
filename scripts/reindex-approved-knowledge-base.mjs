import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { createRepository } from "../lib/ingredient-repository.mjs";
import { buildIngredientCard } from "../lib/pinecone-sync.mjs";
import { assertIntegratedTextIndex, describePineconeIndex, upsertTextRecords } from "../lib/pinecone.mjs";

loadDotEnv(process.cwd());
const config = createConfig();
if (!config.pinecone.apiKey || !config.pinecone.index) throw new Error("Pinecone configuration is required.");
const repo = createRepository({});
const records = repo.listIngredients({ state: "published" }).map(buildIngredientCard);
const descriptor = await describePineconeIndex(config, { force: true });
assertIntegratedTextIndex(descriptor, config.pinecone.textField);
for (let index = 0; index < records.length; index += config.pinecone.ingestBatchSize) {
  await upsertTextRecords({ config, descriptor, records: records.slice(index, index + config.pinecone.ingestBatchSize), namespace: config.pinecone.researchNamespace });
}
console.log(JSON.stringify({ namespace: config.pinecone.researchNamespace, reindexed: records.length, recordVersions: records.map((record) => record.record_version) }, null, 2));
