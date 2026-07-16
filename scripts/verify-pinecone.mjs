import { resolve } from "node:path";
import { createConfig, loadDotEnv } from "../lib/config.mjs";
import { configuredTextFields, describePineconeIndex, isIntegratedTextIndex } from "../lib/pinecone.mjs";

const root = resolve(process.cwd());
loadDotEnv(root);
const config = createConfig();

try {
  const descriptor = await describePineconeIndex(config, { force: true });
  const textFields = configuredTextFields(descriptor);
  const compatible = isIntegratedTextIndex(descriptor, config.pinecone.textField);

  console.log(JSON.stringify({
    name: descriptor.name || config.pinecone.index,
    ready: descriptor.status?.ready === true,
    host: descriptor.host,
    integratedEmbedding: Boolean(descriptor.embed),
    embeddingModel: descriptor.embed?.model || null,
    fieldMap: descriptor.embed?.field_map || descriptor.embed?.fieldMap || null,
    expectedTextField: config.pinecone.textField,
    configuredTextFields: textFields,
    compatible,
    namespace: config.pinecone.namespace,
  }, null, 2));

  if (!compatible) {
    console.error("The index is not compatible with the current integrated-text retrieval adapter. Check its embedding model and field map.");
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`Pinecone verification failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
}
