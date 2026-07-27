# DermaSynth research dashboard

An interactive prototype for the *Hybrid LLM Framework for Dynamic Skincare Synthesis* proposal. The app is intentionally research-only: it does not diagnose, prescribe, or replace a dermatologist.

## Run locally

```sh
npm run dev
```

Then open `http://localhost:4173`. The project is dependency-free: a framework-free ES-module SPA with DOM/SVG visualisations, served by Node's built-in HTTP server.

## Enable live providers deliberately

Your `.env` is already ignored by Git. Keep API keys there and never in frontend files. Add this non-secret flag when you are ready for UI actions to make external requests:

```dotenv
LIVE_SERVICES_ENABLED=true
```

Use [.env.example](.env.example) as the complete configuration reference. Without the flag, the UI stays in clearly labelled demo mode and never calls OpenAI, OpenWeather, IQAir, or Pinecone.

## Choose a weather location

In **Routine Simulator**, search for a city or area, select one of the returned places, then run the preview. The server resolves the search with OpenWeather, refreshes weather and air-quality readings for the chosen coordinates, and includes the same location in the routine request. Search text is sent to OpenWeather; after selection, coordinates are sent to the enabled OpenWeather and IQAir services. The browser never receives either provider key. `LOCATION_SEARCH_CACHE_SECONDS` controls the server-side lookup cache (15 minutes by default).

## Research concern options

The simulator supports ten non-medical research contexts: breakout-prone appearance, barrier comfort, uneven-tone context, dry-feeling comfort, oil/shine context, sensitivity context, texture appearance, redness-prone appearance, dullness/radiance appearance, and visible-pore appearance. They are category-selection contexts, not diagnoses or treatment indications. `GET /api/concerns` exposes the canonical catalog for future clients; the legacy `oiliness` input is accepted as an alias for `oil`.

## Complete ingredient research atlas

The final-review build exposes a **50-ingredient research Atlas** through the in-app **Ingredient Atlas**, `GET /api/knowledge-explorer`, and `GET /api/research-search`. It contains **52 attributed source records**: 9 CIR safety-provenance links, 1 EWG external link, and 42 medical-journal metadata records, across all seven research contexts.

The live Atlas research namespace is `demo-atlas-50-v1`. It contains project-authored metadata-only cards for all **50 ingredients**, plus the separately uploaded non-clinical category-source cards. CIR remains citation/link-only and EWG remains external-link-only; no restricted source text is uploaded.

After project approval is recorded, set both `INGREDIENT_DB_ENABLED=true` and `INGREDIENT_SELECTION_ENABLED=true`, then restart the server. The selector queries only database records that are `approved` or `published`, explicitly marked eligible, source-linked to approved/published records, and mapped to an already-safe category. It does not alter the AM/PM routine steps, accept model-generated ingredient names, provide products/doses/frequencies, or bypass either safety pass.

CIR remains citation/link-only and EWG remains external-link-only. The Atlas stores project-authored metadata and source locators rather than copied restricted source data. Inspect [the base registry](data/ingredients/knowledge-base.v1.json), [the initial demo extension](data/ingredients/demo-extension.v1.json), [the staged 50-ingredient extension](data/ingredients/atlas-extension-50.v1.json), and [the existing supplemental source cards](data/evidence/ingredient-source-supplement.v1.jsonl).

```sh
npm run verify:ingredient-kb
npm run verify:demo-kb
npm run sync:atlas-pinecone -- --upload
npm run ingest:evidence -- --file data/evidence/ingredient-demo.v1.jsonl --demo-upload --namespace demo-ingredient-kb-v1
npm run ingest:evidence -- --file data/evidence/ingredient-source-supplement.v1.jsonl --demo-upload --namespace demo-ingredient-kb-v1
npm run verify:demo-pinecone
```

`--demo-upload` is separate from the ordinary corpus upload: it accepts explicit `research_demo_only` metadata cards in a `demo-*` namespace with recorded reuse metadata. It does not represent a source as a clinical finding or use the card to make individual-use claims.

## If live synthesis is unavailable

`GET /api/health` confirms whether a key is configured; it deliberately does not spend a request to test account balance or billing. If `POST /api/routine` returns `synthesisStatus: "quota_unavailable"`, add available API billing or credits to the configured account, then restart `npm run dev`. The server temporarily pauses further synthesis calls after that result so repeated clicks do not keep sending failed requests. The interface remains usable with a clearly labelled generic research preview.

## Current pipeline

`profile + concern + location → urgent-symptom redirect → environment → Pinecone retrieval + local BM25 fusion → CUE trace → deterministic safety passes → category-only routine → approved category-first research candidates (when enabled) → ingredient research context + Shapley/PEG explanation → exportable run report`

- Live environmental adapter: OpenWeather One Call 3.0, with Current Weather fallback, plus IQAir PM2.5 when the plan returns it.
- Retrieval: the Atlas uses the live `demo-atlas-50-v1` Pinecone metadata namespace, fused with local BM25 metadata. The generic category-only routine retains a separate conservative CUE coverage proxy. The 30-query fixture documents local retrieval behaviour, not effectiveness or calibrated performance.
- Synthesis: the server-only OpenAI Responses call uses `store: false`. It can only choose an optional hydration category and already-eligible evidence IDs; all visible AM/PM category wording is locally allowlisted. Its optional **AI category rationale** returns allowlisted rationale tags only, and deterministic safety remains the final authority.
- Safety: explicit urgent-symptom redirect plus two deterministic passes enforce the AM/PM category contract, restricted medical/ingredient content scans, evidence-link validation, high-UV visibility, and barrier-comfort exclusions. If a gate fails, the UI receives a marked deterministic research preview rather than a live synthesis.
- Ingredient evidence: all 50 named ingredients are searchable through the live Atlas metadata index. With `INGREDIENT_SELECTION_ENABLED=true`, approved registry entries may appear as separate evidence-linked research candidates only after a cleared safety result; the AM/PM display remains category-only.
- Explainability: each routine response includes `grounding`, a compact trace, an exact Shapley decomposition of a versioned additive surrogate artifact, a PEG-style plain-language explanation, and a detailed `runReport`. It responds to live environmental readings; its current coefficients are transparent configured study parameters, not learned or published clinical coefficients. The browser's local history/export excludes free-text symptoms, source excerpts, and identifiers.
- Bulk analysis: the deterministic batch path runs the same environment, retrieval/CUE, research-atlas, safety, and explanation paths for up to 100 de-identified profiles, with CSV and audit-JSON export. It does not fan out paid LLM requests.

## Dynamic ingredient & evidence knowledge base (database-backed)

Checklist section 3 is implemented as an additive, feature-flagged layer. When `INGREDIENT_DB_ENABLED=true`, the Atlas, `GET /api/knowledge-explorer`, and `GET /api/ingredient-knowledge` read from a versioned database instead of the static JSON files; when the flag is off (the default), the original JSON path is used unchanged. The local store uses `better-sqlite3`, which supports the project's Node 20 runtime, and the schema/queries use only the SQLite/Postgres common subset so the same data-access layer ports to Supabase Postgres for production ([lib/db/schema.sql](lib/db/schema.sql), [lib/db/database.mjs](lib/db/database.mjs)).

Structured **ingredient** records (INCI, aliases, categories, concern contexts, AM/PM eligibility, environmental rules, incompatibilities, reactivity, source IDs, selection eligibility, approval state) and **source** records (family, DOI/URL, use rights, review status, evidence type, version) are stored in separate tables. Every write is versioned with a full snapshot, every change is recorded in a persistent `audit_log`, and any prior version can be restored via rollback.

```sh
npm run db:migrate            # create tables (idempotent)
npm run db:seed               # import the 50 ingredients + 52 sources from JSON
npm run db:publish-atlas -- --dry-run # prove the publish/sync workflow without network writes
npm run db:publish-atlas -- --upload  # publish approved records and synchronise Pinecone metadata cards
npm run verify:ingredient-db  # offline lifecycle test (create/version/approve/publish/rollback/audit)
```

Set a 24+ character `GOVERNANCE_ADMIN_TOKEN` and send it as `x-governance-token` to use the local-only admin workflow:

| Route | Purpose |
| --- | --- |
| `GET /api/admin/knowledge-base` | Counts + full ingredient/source lists across all approval states. |
| `GET/POST /api/admin/ingredients` | List by `?state=`, or create/edit (each edit creates a new version). |
| `GET/POST /api/admin/sources` | List by `?state=`, or create/edit source records. |
| `POST /api/admin/transition` | Run the approval state machine: `submit`/`approve`/`reject`/`publish`/`archive`/`supersede`. |
| `POST /api/admin/rollback` | Restore an ingredient/source to a prior `version`. |
| `GET /api/admin/versions` | Version history with snapshots for one record. |
| `GET /api/admin/audit` | Persistent audit log, optionally filtered by entity. |
| `POST /api/admin/pinecone/flush` | Push published records to the research namespace and delete archived/superseded vectors. |
| `GET /api/admin/pinecone/log` | Pinecone sync ledger. |

Publication is wired to Pinecone: approving then publishing an ingredient enqueues a metadata-only upsert, and archiving/superseding enqueues a vector delete, in the `pinecone_sync_log` ledger. `POST /api/admin/pinecone/flush` performs the real upserts/deletes when live services are configured, and is a safe no-op dry run otherwise. Candidate selection requires the independent database eligibility flag *and* an `approved`/`published` state; state changes alone never add a record to the routine.

## Runtime policy registry

The environmental trigger thresholds, category eligibility, and reactivity guardrail categories are loaded at runtime from [policy.seed.json](data/governance/policy.seed.json). Ingredient-to-category membership lives on the versioned database ingredient records. A local, ignored policy override can be written through `POST /api/governance/policy` after setting a 24+ character `GOVERNANCE_ADMIN_TOKEN`; `GET /api/governance/policy` exposes the active, non-secret policy. The policy is re-read when the local override changes, so threshold or category-policy updates take effect on the next request without changing application code. Urgent triage and the final output safety checks intentionally remain code-controlled.

## Run the offline safety regression

```sh
npm run eval:safety
```

This no-cost suite checks the implemented triage phrases, restricted output terms, incompatible-active detection, high-UV photoprotection requirement, barrier-exfoliation exclusion, and category-only fallback templates. It is a regression check for this implementation, not clinical validation or evidence of real-world safety.

## Run the location regression

```sh
npm run eval:location
```

This mocked suite checks geocoding sanitisation and caching, disabled/unavailable states, strict coordinate validation, routine location propagation, and the local lookup throttle. It starts an isolated demo server and makes no live provider calls.

## Run the offline study evaluation

```sh
npm run eval:study
```

This deterministic, synthetic suite starts an isolated server with live services and credentials explicitly disabled. It checks the API contract across the four profile types and seven concern contexts, location propagation, triage, output guardrails, AM/PM structure, provenance fields, and the concern catalog. It writes JSON, CSV, and Markdown exports to [data/evaluation/reports](data/evaluation/reports). It is implementation regression only—not clinical validation, a dermatologist audit, or UAT.

## Run final-review retrieval and safety packs

```sh
npm run eval:retrieval
npm run eval:safety-50
```

The retrieval pack contains 30 source-discovery queries over the local registry and reports Recall@5, MRR, source coverage, and latency. The safety pack contains 50 deterministic routing and output-contract cases. Their current exports are [retrieval-evaluation.latest.md](data/evaluation/reports/retrieval-evaluation.latest.md) and [safety-50-case.latest.md](data/evaluation/reports/safety-50-case.latest.md).

## Verify and populate the Pinecone index

After creating the index, run this read-only verification:

```sh
npm run verify:index
```

The result should show `ready: true`, `integratedEmbedding: true`, and a field map that includes `chunk_text`. The server discovers the data-plane host automatically.

Place only reviewed, authorised source material in [data/evidence](data/evidence/README.md) as JSONL. An upload requires clinical approval plus documented research/non-commercial or commercial-safe reuse metadata; a dry run remains available for review-pending batches. Validate it locally first, then opt in to an external write:

```sh
npm run ingest:evidence
npm run ingest:evidence -- --upload
```

Integrated Pinecone indexes accept text records in batches of up to 96; this project defaults to 50. Records use `_id`, `chunk_text`, `document_id`, `title`, and `source`, plus optional flat metadata. The ingestion script does not add any evidence automatically.

## API contract

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Safe configuration status; never returns secret values. |
| `GET /api/concerns` | Canonical non-medical research concern catalog. |
| `GET /api/ingredients` | Versioned audit-only ingredient catalogue with source limitations; it exposes no selector or recommendation path. |
| `GET /api/ingredient-knowledge` | Full research-only ingredient registry with source-role, review, and reuse metadata; it exposes no selector or recommendation path. |
| `GET /api/knowledge-explorer` | Complete 50-ingredient, 52-source Atlas payload; accepts optional `concern`. It labels the existing 31-card Pinecone segment separately from local, review-pending Atlas records. |
| `GET /api/research-search` | Source-attributed research search using Pinecone dense retrieval fused with local BM25; accepts optional `concern` and `q`. |
| `GET /api/explainability` | Environmental telemetry plus the final-review Shapley/PEG explanation for an optional concern and location. |
| `GET /api/evaluation` | Latest implementation, 30-query retrieval, and 50-case safety report snapshots. |
| `GET /api/reviewer-queue` | Token-protected, local-only review queue of Atlas source cards and their local annotations. Disabled by default; never changes Atlas/evidence/retrieval/synthesis data. |
| `POST /api/reviewer-queue` | Appends one bounded local annotation: `sourceId`, `action` (`approve`, `reject`, `annotate`, or `needs_changes`), optional `note`, and optional pseudonymous `reviewerLabel`. Requires `x-reviewer-token`. |
| `GET /api/locations?q=...` | Server-side city/area lookup. Returns at most five sanitised location candidates, applies a local 20-searches-per-minute guard, and never exposes the OpenWeather key. |
| `GET /api/environment` | Live/degraded/demo environmental telemetry. Optional `lat`, `lon`, and `location` query values are bounded. |
| `POST /api/routine` | Safety-gated routine preview with `profile`, `concern`, optional `symptoms`, and an optional bounded `location` object (`name`, `lat`, `lon`). The routine contains structured category-only `am`/`pm` steps and backward-compatible `steps`, plus `ingredientCandidates` when the approved registry is enabled and the result clears safety, `grounding`, `ingredientResearch`, `runReport`, `outputMode`, and safe `synthesisStatus` fields. |
| `POST /api/bulk` | Deterministic cohort-preview processing with up to 100 profiles. |

Static serving is allowlisted to the public frontend files, so configuration, server source, and `.env` are not web-accessible.

## Local reviewer workflow (instrument-ready only)

The reviewer queue is a future-review instrument, not evidence of a completed clinical audit. It is disabled by default and is intentionally refused when `NODE_ENV=production`. To use it during a local, controlled session, add the following values only to `.env`:

```dotenv
REVIEWER_QUEUE_ENABLED=true
REVIEWER_QUEUE_TOKEN=use-a-private-random-token-of-at-least-24-characters
```

Then use **Reviewer Queue** in the dashboard or call the endpoint locally with the token in an `x-reviewer-token` header. The browser field is session-memory only; it is not saved to local storage. For example:

```sh
curl -H 'x-reviewer-token: YOUR_PRIVATE_TOKEN' http://127.0.0.1:4173/api/reviewer-queue
curl -X POST -H 'content-type: application/json' -H 'x-reviewer-token: YOUR_PRIVATE_TOKEN' \
  --data '{"sourceId":"cir-niacinamide-niacin-2005","action":"annotate","note":"Local source-card note only.","reviewerLabel":"reviewer-01"}' \
  http://127.0.0.1:4173/api/reviewer-queue
```

Annotations are written atomically to the ignored local file described in [data/reviewer-queue/README.md](data/reviewer-queue/README.md). Every response repeats the boundary: no annotation can activate an ingredient, alter `clinicalReviewStatus`, change a Pinecone record, raise CUE, or enter the routine/safety path.

## Final-review presentation features

- **Guided presentation** walks through location, measured environment, gated category preview, Atlas evidence, and evaluation in one click-through sequence.
- **Context Coverage Map** makes the seven source-mapped, non-clinical contexts inspectable without presenting them as CUE validation.
- **Location comparison** places UV, humidity, PM2.5, and the configured Shapley contribution view side by side without calling GPT.
- **Research report export** opens a print-ready, PDF-style document with labelled inputs, category-only output, source links, guardrail trace, and contribution view.
- **Ingredient Relationship Explorer** is a bounded interactive provenance graph for contexts, ingredient records, and source families. Its lines are metadata relationships, not compatibility or safety claims.

## As-built architecture and remaining validation

This implementation intentionally uses a framework-free SPA, CSS, DOM/SVG visualisations, and a Node core HTTP server. It does not claim React, Recharts, Tailwind, Express, Firebase, Railway deployment, cloud authentication, or server-side participant persistence. Run history and exports are browser-local; the reviewer queue is a local, protected instrument only.

Before a human study or production deployment, complete qualified source review and upload governance, CUE calibration against a held-out judged set, a blinded expert-rating workflow with pre-specified agreement analysis, consent/persistence design, accessibility/mobile testing with users, and deployment hardening.

## Not claimed by this final-review demo

- Obtain permission before any CIR report text or EWG Skin Deep data is copied, embedded, or made machine-readable; they currently remain citation/direct-link sources.
- A clinical trial, treatment decision, product recommendation, or real-world safety/effectiveness claim.
- A copied/embedded CIR report or EWG Skin Deep database; both are linked as provenance only.
- An independent human-domain audit or formal UAT; the supplied evaluation packs are reproducible software tests.
- A BYO-vector Pinecone adapter; the current demo index is integrated-embedding.
- Calibration of the generic CUE proxy against a separate held-out dataset.
- A calibrated or learned environmental model; the Shapley view is exact only for the configured study-demo surrogate.
- Cloud persistence, authentication, consent/data-retention rules, and audit logs before handling real participant data.
