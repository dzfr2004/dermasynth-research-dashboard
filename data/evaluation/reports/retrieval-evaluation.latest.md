# DermaSynth research-atlas retrieval evaluation

Fixture: `data/evaluation/fixtures/retrieval-evaluation.v1.json`

Result: **30/30 Recall@5 passes**; MRR **0.9833**; provenance coverage **100.0%**; median local retrieval latency **0.541 ms**.

## Scope and limitations

- This deterministic fixture evaluates whether the final-demo research atlas retrieves its expected source-mapped ingredient record. It does not establish clinical relevance, treatment effectiveness, or individual suitability.
- Offline evaluation uses the versioned local registry and BM25 path. The live Pinecone dense-plus-BM25 fusion is demonstrated separately in the application and must be measured against a judged corpus before any production claim.
- CIR and EWG remain source-link metadata; their protected source text is not evaluated as embedded corpus content.
