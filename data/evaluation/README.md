# Offline study evaluation fixtures

`fixtures/study-evaluation.v1.json` is a deterministic, synthetic test matrix for implementation regression. It contains no live-provider data, participant data, clinical records, or copied corpus text.

Run the suite from the repository root:

```sh
npm run eval:study
npm run eval:retrieval
npm run eval:safety-50
npm run eval:category-coverage
```

It writes stable JSON, CSV, and Markdown exports to `data/evaluation/reports/`. The implementation suite verifies concern coverage, generic routine-response shape, triage/guardrail routing, and preservation of retrieval provenance fields. The retrieval suite has 30 source-discovery queries and reports Recall@5/MRR; the safety suite has 50 deterministic output-contract cases. The category-coverage suite verifies 21 isolated source-mapped cards across seven contexts, while ensuring they remain pending clinical review and outside strict CUE/routine synthesis. These are reproducible software checks only, not clinical validation, a dermatologist audit, a UAT study, or an assessment of medical effectiveness.
