import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { retrieveResearchEvidence } from "../lib/retrieval.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRelativePath = "data/evaluation/fixtures/retrieval-evaluation.v1.json";
const fixturePath = join(root, fixtureRelativePath);
const reportsDirectory = join(root, "data/evaluation/reports");
const output = {
  json: join(reportsDirectory, "retrieval-evaluation.latest.json"),
  csv: join(reportsDirectory, "retrieval-evaluation.latest.csv"),
  markdown: join(reportsDirectory, "retrieval-evaluation.latest.md"),
};

const rawFixture = await readFile(fixturePath, "utf8");
const fixture = JSON.parse(rawFixture);

assert.equal(fixture?.schemaVersion, "1.0", "Retrieval fixture must use schemaVersion 1.0.");
assert.ok(Array.isArray(fixture?.queries) && fixture.queries.length === 30, "Retrieval fixture must contain exactly 30 queries.");
assert.equal(new Set(fixture.queries.map((item) => item.id)).size, fixture.queries.length, "Retrieval query IDs must be unique.");

const config = {
  liveServicesEnabled: false,
  cueThreshold: 0.8,
  requestTimeoutMs: 1_000,
  pinecone: {
    apiKey: "",
    index: "",
    indexHost: "",
    namespace: "__offline_evaluation__",
    researchNamespace: "demo-ingredient-kb-v1",
    textField: "chunk_text",
    titleField: "title",
    sourceField: "source",
  },
};

function median(values) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

const cases = [];
for (const query of fixture.queries) {
  assert.ok(typeof query?.id === "string" && query.id, "Every retrieval query needs an id.");
  assert.ok(typeof query?.concern === "string" && query.concern, `${query.id} needs a concern.`);
  assert.ok(typeof query?.query === "string" && query.query, `${query.id} needs a query string.`);
  assert.ok(typeof query?.expectedIngredientId === "string" && query.expectedIngredientId, `${query.id} needs expectedIngredientId.`);
  const started = process.hrtime.bigint();
  const result = await retrieveResearchEvidence({ config, concern: query.concern, search: query.query });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  const rankings = (result.evidence || []).map((item) => Array.isArray(item.ingredientIds) ? item.ingredientIds : []);
  const rank = rankings.findIndex((ingredientIds) => ingredientIds.includes(query.expectedIngredientId)) + 1;
  const provenanceLinked = (result.evidence || []).every((item) => Boolean(item.sourceUrl || item.sourceRecordIds?.length));
  cases.push({
    id: query.id,
    concern: query.concern,
    query: query.query,
    expectedIngredientId: query.expectedIngredientId,
    rank: rank || null,
    recallAt5: rank > 0 && rank <= 5,
    reciprocalRank: rank ? Number((1 / rank).toFixed(4)) : 0,
    latencyMs: Number(elapsedMs.toFixed(3)),
    provenanceLinked,
    retrievalMode: result.mode,
    strategy: result.strategy,
    topIngredientIds: rankings.slice(0, 5).flat(),
  });
}

const passed = cases.filter((item) => item.recallAt5).length;
const report = {
  schemaVersion: "1.0",
  suite: "dermasynth-research-atlas-retrieval-evaluation",
  fixture: {
    path: fixtureRelativePath,
    version: fixture.fixtureVersion,
    sha256: createHash("sha256").update(rawFixture).digest("hex"),
  },
  execution: {
    mode: "offline deterministic local BM25 evaluation",
    liveProvidersCalled: false,
    vectorProviderCalled: false,
    retrievalStrategy: "local BM25 over the versioned source-linked ingredient registry",
  },
  summary: {
    total: cases.length,
    passed,
    failed: cases.length - passed,
    recallAt5: Number((passed / cases.length).toFixed(4)),
    meanReciprocalRank: Number((cases.reduce((sum, item) => sum + item.reciprocalRank, 0) / cases.length).toFixed(4)),
    provenanceCoverage: Number((cases.filter((item) => item.provenanceLinked).length / cases.length).toFixed(4)),
    medianLatencyMs: Number(median(cases.map((item) => item.latencyMs)).toFixed(3)),
  },
  limitations: [
    "This deterministic fixture evaluates whether the final-demo research atlas retrieves its expected source-mapped ingredient record. It does not establish clinical relevance, treatment effectiveness, or individual suitability.",
    "Offline evaluation uses the versioned local registry and BM25 path. The live Pinecone dense-plus-BM25 fusion is demonstrated separately in the application and must be measured against a judged corpus before any production claim.",
    "CIR and EWG remain source-link metadata; their protected source text is not evaluated as embedded corpus content.",
  ],
  cases,
};

await mkdir(reportsDirectory, { recursive: true });
await writeFile(output.json, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(output.csv, [
  "id,concern,query,expected_ingredient_id,rank,recall_at_5,reciprocal_rank,latency_ms,provenance_linked,retrieval_mode",
  ...cases.map((item) => [item.id, item.concern, item.query, item.expectedIngredientId, item.rank ?? "", item.recallAt5, item.reciprocalRank, item.latencyMs, item.provenanceLinked, item.retrievalMode].map(csvCell).join(",")),
].join("\n") + "\n", "utf8");
await writeFile(output.markdown, [
  "# DermaSynth research-atlas retrieval evaluation",
  "",
  `Fixture: \`${fixtureRelativePath}\``,
  "",
  `Result: **${passed}/${cases.length} Recall@5 passes**; MRR **${report.summary.meanReciprocalRank.toFixed(4)}**; provenance coverage **${(report.summary.provenanceCoverage * 100).toFixed(1)}%**; median local retrieval latency **${report.summary.medianLatencyMs.toFixed(3)} ms**.`,
  "",
  "## Scope and limitations",
  "",
  ...report.limitations.map((item) => `- ${item}`),
  "",
].join("\n"), "utf8");

console.log(JSON.stringify({
  total: report.summary.total,
  passed: report.summary.passed,
  failed: report.summary.failed,
  recallAt5: report.summary.recallAt5,
  meanReciprocalRank: report.summary.meanReciprocalRank,
  provenanceCoverage: report.summary.provenanceCoverage,
  medianLatencyMs: report.summary.medianLatencyMs,
  status: report.summary.failed ? "review-needed" : "retrieval-evaluation-passed",
}, null, 2));

if (report.summary.failed) process.exitCode = 1;
