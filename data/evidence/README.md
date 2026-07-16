# Curated evidence input

Place curated `.jsonl` files in this folder. Each non-empty line is one source document or already-prepared chunk. The ingestion script will preserve a supplied `chunk_text` or split a longer `text` field into conservative chunks before uploading it to the configured Pinecone integrated-embedding index.

```json
{"document_id":"cir-example-2024","title":"Exact source title","source":"CIR","source_url":"https://authoritative.example/source","published_year":2024,"document_type":"safety-assessment","evidence_tier":"reference","chunk_text":"A vetted source excerpt goes here."}
```

Required fields: `document_id`, `title`, `source`, and either `chunk_text` or `text`.

Optional metadata: `source_url`, `published_year`, `document_type`, `evidence_tier`, `chunk_number`, `_id`, `doi_or_pmid`, `source_locator`, `citation_text`, `source_card_review_status`, `review_scope`, legacy `clinical_review_status`, `document_version`, `sha256`, `license_or_access`, `reuse_rights_status`, `reuse_rights_basis`, `reuse_rights_reviewed_at`, `claim_category`, `ingredient_evidence_role`, `source_use_mode`, `normalization_status`, `retrieved_at`, `jurisdiction`, `evidence_scope`, and `conflict_disclosure`. Flat string-list metadata is also supported for `authors`, `ingredient_ids`, `ingredient_names`, `inci_names`, `source_record_ids`, and `env_tags`; boolean metadata is supported for `conflict_flag`, `product_specific`, `industry_sponsored`, `commercial_restriction`, and `attribution_required`.

Only ingest sources you are allowed to use and have reviewed. The project proposal, presentation slides, and generated summaries are implementation background—not clinical evidence—and should not be ingested as evidence. If you later ingest project context, use a separate namespace so it cannot be retrieved for recommendation synthesis.

`--upload` is reserved for an ordinary corpus: it requires a documented qualified-review `clinical_review_status` (for example, `approved: qualified reviewer-name 2026-07-16`) and a cleared reuse basis. A user-confirmed or anonymous approval cannot activate the strict gate. The final-review demonstrator uses the separate `--demo-upload` path below instead. A `source_card_review_status` is display metadata only and cannot activate the strict CUE/synthesis gate.

For new records, document reuse with all three fields below. `cleared_research_noncommercial` requires `commercial_restriction: true`; `cleared_commercial` must not be combined with `commercial_restriction: true`.

```json
{
  "reuse_rights_status": "cleared_research_noncommercial",
  "reuse_rights_basis": "Free use is permitted for this non-commercial academic study under the recorded source terms.",
  "reuse_rights_reviewed_at": "2026-07-16",
  "commercial_restriction": true
}
```

The legacy `license_or_access` field remains accepted for clearly commercial-safe `CC BY`, `CC0`, or public-domain records, provided it does not conflict with `commercial_restriction`. The gate records the stated basis; it does not independently establish legal rights. Keep the source URL, terms or permission record, and any attribution requirement with the source record.

When an ingredient mapping is ready, use canonical `ingredient_ids` from [data/ingredients/knowledge-base.v1.json](../ingredients/knowledge-base.v1.json). Keep the corresponding `source_record_ids`, `ingredient_evidence_role`, and `normalization_status` with the record. This metadata supports audit and retrieval filtering; it does not make a named ingredient eligible for routine selection.

This ordinary upload gate records provenance for a research prototype; it is not relevant to the non-clinical, isolated final-demo source-metadata corpus.

Validate without uploading:

```sh
npm run ingest:evidence
```

Upload only after reviewing the dry-run summary:

```sh
npm run ingest:evidence -- --upload
```

## Isolated final-demo upload

The existing 31-card final-demo corpus is split across `ingredient-demo.v1.jsonl` (20 ingredient cards) and `ingredient-source-supplement.v1.jsonl` (11 source-mapping cards). Every record is marked `demo_only: true`, `demo_use_status: "research_demo_only"`, and `routine_selection_allowed: false`. The corpus may be uploaded only to an explicit isolated namespace beginning with `demo-`; it provides research retrieval and source inspection, not a treatment or individual-use decision. The later 30-ingredient Atlas extension is local, citation-metadata-only, and review-pending; it has no upload command until a separate qualified-review and rights decision is documented.

```sh
npm run verify:demo-kb
npm run ingest:evidence -- --file data/evidence/ingredient-demo.v1.jsonl --demo-upload --namespace demo-ingredient-kb-v1
npm run ingest:evidence -- --file data/evidence/ingredient-source-supplement.v1.jsonl --demo-upload --namespace demo-ingredient-kb-v1
npm run verify:demo-pinecone
```

Never use `--demo-upload` with the default namespace. The demo namespace is scoped to technology-review retrieval; generic AM/PM wording remains category-only so the app does not turn source metadata into a personalised routine.

## Isolated category-source coverage upload

`category-source-cards.research.v1.jsonl` is a separate source-mapped, non-clinical coverage corpus for the seven generic research contexts. It is deliberately excluded from strict CUE and live category synthesis: its purpose is transparent source coverage in the final-review demonstrator, not clinical validation or a recommendation.

```sh
npm run eval:category-coverage
npm run ingest:evidence -- --file data/evidence/category-source-cards.research.v1.jsonl --research-upload --namespace demo-category-cue-v1
npm run verify:category-coverage
```

Every card must remain `pending` clinical review, have `category_only_card: true`, `routine_selection_allowed: false`, and no ingredient-selection metadata. Never upload it to the ordinary namespace or treat its source-card coverage status as an approval to call GPT.
