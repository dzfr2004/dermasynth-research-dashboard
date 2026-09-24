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

## Current pipeline (September 2026)

`profile + concern + location → urgent-symptom triage → environment → first safety pass → evidence retrieval → evidence-sufficiency gate → model category selection + composed rationale (CUE-gated) → second safety pass → per-slot hybrid retrieval of candidate ingredients → model picks within each retrieved pool → re-validation → post-selection safety pass → two-level Shapley/PEG explanation → run report + selection log`

- **Environment:** OpenWeather One Call 3.0 (Current Weather fallback) and IQAir PM2.5 (OpenWeather air-pollution fallback). Keys stay on the server.
- **Evidence-sufficiency gate** (was called the "CUE gate"): before the model is called, retrieval must return at least 3 eligible records from 2 documents, 2 of them direct to the concern, all above the relevance threshold. With the database enabled, relevance is a real BM25 score over the published sources' metadata, and review status is reported as governance sign-off (not clinical review).
- **CUE** (Context Utilisation Evaluation, `lib/cue.mjs`): any text the model writes (the routine rationale and each ingredient rationale) is split into statements and checked against the facts and evidence the model was given. CUE = supported statements / statements. Below 0.80 the text is regenerated once with feedback, then withheld and replaced by local text. `CUE_METHOD=llm_judge` asks the model to verify each statement (RAGAS-style faithfulness) and falls back to a deterministic lexical check.
- **Candidate pools** (`lib/candidate-retrieval.mjs`): for each safety-cleared step a query is built from the category and the reading that triggered it, and run over one evidence document per ingredient (`lib/ingredient-evidence-corpus.mjs`) with local BM25 plus Pinecone dense search (`PINECONE_EVIDENCE_NAMESPACE`), fused with reciprocal rank fusion. Only approved ingredients the retriever surfaces for that step enter its pool.
- **Selection:** each candidate gets a transparent additive score (environmental driver 0.40, retrieval relevance 0.30, evidence strength 0.20, EWG reference 0.10). The model chooses within each pool without seeing the score; an invented or misplaced pick is rejected and the top-scored candidate is used instead.
- **Safety:** triage, first pass, second pass over the model's routine text, and a **post-selection pass** over the final named ingredients (excluded ingredients such as retinal, prescription-only actives, incompatible pairs, photosensitisers in a morning step, exfoliants under the barrier guardrail, restricted claims in model text). A failing ingredient is removed and reported.
- **Explainability:** level 1 is the environmental Shapley surrogate (weights now fitted by non-negative least squares; see `data/models/README.md`). Level 2 explains each step (the rule and reading that added it) and each ingredient (Shapley values of the candidate score, including the contrast with the runner-up in the same pool). The text is template-generated from computed values only.
- **GPT context for every step and ingredient:** after a routine is shown, the browser asks `/api/ai/routine-context` for plain-language context. The server writes it with GPT from that run's own facts (readings, the rule behind each step, the retrieved pool and score comparison, the verified safety card, the EWG reference), checks every item with CUE, regenerates failing items once and keeps the score-based text for anything still below the threshold.
- **OpenAI client (`lib/openai.mjs`):** every GPT call falls back through `OPENAI_FALLBACK_MODELS` when `OPENAI_MODEL` is not available to the key, retries without the reasoning setting if a model rejects it, uses `OPENAI_TIMEOUT_MS`, and logs failures to `data/logs/provider-errors.jsonl`. `GET /api/health` shows the model in use and the last error.
- **Selection log:** every run appends a JSONL record (`data/logs/selection-log.jsonl`, not committed). `npm run report:selection-log` reports acceptance, rejection and fallback rates, agreement between the model and the candidate score, whether picks change with the environment, safety removals and CUE outcomes.
- **Bulk analysis:** the deterministic batch path (up to 100 profiles) runs environment, evidence-sufficiency, research-atlas, safety and environmental explanation. It does not call the model, so it has no CUE.

### Commands added in September 2026

| Command | What it does |
| --- | --- |
| `npm run check:openai` | Confirms the OpenAI key and model in `.env` work (run on the machine with `.env`). |
| `npm run sync:evidence-pinecone -- --upload` | Uploads the 50 ingredient evidence documents to the Pinecone evidence namespace (dry run without `--upload`). |
| `npm run db:apply-kb-update` | Applies the 2026-09-23 knowledge-base update (AICIS retinal source, retinal blocked). Idempotent. |
| `npm run report:selection-log` | Summarises the selection log into `data/evaluation/reports/selection-log.latest.md`. |
| `npm run report:corpus-inventory` | Regenerates `data/source-manifests/corpus-inventory.md` (source, paper and card counts). |
| `npm run labelling:sheet` / `labelling:import` / `fit:environmental-expert` | Expert labelling workflow for the environmental surrogate (tool at `/labelling`). |

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

## Run the triage, extended safety and independent sets

```sh
npm run eval:triage              # 117 labelled symptom texts, v1 keywords vs v2 rules
npm run eval:triage -- --llm     # also v2 rules + GPT second opinion (needs .env keys)
npm run eval:safety-extended     # 88 cases incl. all incompatible pairs and 210 pipeline runs
npm run eval:independent         # cases written by the supervisor or a dermatologist
```

The triage report gives sensitivity and specificity per method and records the honest first blind run of the held-out set. The independent set lives in [data/evaluation/independent](data/evaluation/independent/README.md) and is reported separately. `npm test` runs the triage and extended suites.

## How the user's inputs shape the routine

- **Sensitive skin profile**: raises a low or missing reactivity level to moderate, so the barrier guardrail applies (no texture-renewal step, conservative variants). It never lowers a stated level.
- **Texture vote**: skin profile (dry +1, oily -1), finish preference (dewy +1, matte -1), concern (dryness, barrier, sensitivity, redness +1; oil, acne, pores -1), humidity (50% or less +1, 75% or more -1) and temperature (15 °C or less +1, 30 °C or more -1) each vote. A positive sum picks the comfort and barrier-support variants, a negative sum the lightweight variants, zero the supportive variants. A dry profile or a sum of +2 or more also adds the morning hydration step.
- **User fit**: a fifth factor in the candidate score (weight 0.25) rates each candidate on its recorded concern contexts, its texture against the vote, and gentleness for reactive skin. Texture and gentleness labels are in [ingredient-texture.v1.json](data/ingredients/ingredient-texture.v1.json) and are developer-authored, pending expert review.
- The GPT ingredient picker receives the same user context and fit scores, and the explanation names the texture vote and the fit reasons.

`npm run eval:input-sensitivity` measures how much each input changes the output (full grid, about 2 minutes). `npm test` runs a 720-run quick version and fails if any input stops mattering.

## Consumer view and Expert view

The app opens on the routine page in the **consumer view**: today's conditions (UV, humidity, haze, temperature in plain bands), then the morning and evening routine as short steps with the ingredient to look for, one plain reason, and a **Why?** button. The **Expert view** button in the top bar (remembered in this browser) adds everything an examiner needs: ingredient scores and Shapley bars, selection traces, run progress, the run report, evidence grounding, the defence walkthrough, and the rule-based and GPT versions of each explanation side by side.

Technical failures are shown to consumers in plain words; configuration details stay in Expert view and the server log.

`npm run test:browser` (part of `npm test`) opens the app in headless Chromium at phone and desktop widths and checks for JavaScript errors, sideways scrolling, serious accessibility violations (axe-core, WCAG 2.1 AA), the safety question, the Why? buttons, the check-up redirect and Expert view. First time only: `npm install` then `npx playwright install chromium`. Without them the test reports that it was skipped.

## Reliability and deployment

- **Reduced answers are visible (F1):** a routine that fell back on rules (GPT failed, the user chose the standard routine, weather was reported by the user) still returns HTTP 200 with a safe routine, but carries `degraded` in the body, an `x-dermasynth-degraded` header, a line in the selection log, and a running count in `/api/health` (`safeguards.runOutcomes`). `npm run report:selection-log` reports the share and reasons.
- **The page never waits silently (F2):** after 25 s the loading card offers "Show the standard routine now". It cancels the slow request (the server stops making GPT calls for it) and shows the rule-based routine with the same safety checks. Explanations that take longer than 25 s say so while the standard reasons stay on screen.
- **Single instance (F3):** see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Set `HOST=0.0.0.0` on a hosting platform.
- **One knowledge-base command (F4):** `npm run kb:rebuild` (add `-- --upload` to write Pinecone, `-- --fresh` to reseed, `-- --plan` to list the steps).

## Consumer explanations, timing and tomorrow

- **Why? panel:** each ingredient shows *What it is*, *Why today*, *Is it safe?* and *On labels*. The rule-based version is built from fixed plain-language facts (`lib/plain-language.mjs`: class definitions, the verified safety card, INCI names). With GPT on, GPT rewrites the first three fields in friendlier words using only those facts, and CUE checks the result against them; anything below the threshold falls back to the rule-based text.
- **Timing:** the Today card and the sunscreen step show when UV is at or above the level that adds sun protection today, and the peak.
- **Tomorrow:** the forecast in plain words and how tomorrow's routine differs from today's (same routine rules run on tomorrow's forecast).
- **Location:** on a first visit the browser asks for the current location (rounded to about 1 km, remembered in the browser); Kuala Lumpur is used if the user declines. With an OpenWeather key the place is named; otherwise it shows as "Your location".
- **Keyless data:** in live mode, Open-Meteo (open-meteo.com, CC BY 4.0) fills any reading OpenWeather or IQAir cannot supply and provides the hourly UV and next-day forecast. `OPEN_METEO_ENABLED=false` turns it off.
- **Motion:** state changes morph with the View Transitions API and spring easing; a new routine plays a staggered entrance; everything is instant for users who ask for reduced motion.

## GPT layer: live evidence, budget and fallbacks

- `npm run eval:live` (with `npm start` running and live keys in `.env`) sends 20 routine requests across 10 cities and 4 profiles, asks for the GPT explanations of each, and reports GPT success, invented or out-of-pool picks, agreement with the candidate score, degraded runs, CUE results and latency (`data/evaluation/reports/live-gpt-evaluation.latest.md`). `npm run report:selection-log` summarises everything logged, including explanation drafts from `data/logs/context-log.jsonl`.
- The ingredient picker is never shown the candidate score, retrieval rank, fit factor or EWG reference, and options are listed alphabetically, so agreement with the score is an independent result. The report gives agreement expected by chance and kappa.
- GPT has no overall time limit by default; each call has a 90 s safety timeout (`OPENAI_TIMEOUT_MS`) so a dropped connection cannot hang a request. An optional cap per routine (`GPT_ROUTINE_BUDGET_MS`) and per explanation request (`GPT_CONTEXT_BUDGET_MS`) can be set in `.env`. When GPT fails, times out or reaches a cap, the rule-based result is used and the response carries `degraded` with plain-language reasons, shown in the app as "Reduced mode".
- Every step always has a rule-based reason. The Expert view toggle on the routine card shows the rule-based and GPT versions side by side, with CUE scores.
- CUE against people: `npm run cue:sheet` builds a blinded rating sheet from logged drafts; raters fill it; `npm run eval:cue-human` reports agreement and Cohen's kappa. Steps are in [data/evaluation/cue-rating](data/evaluation/cue-rating/README.md).
- `npm run eval:gpt-layer` (part of `npm test`) checks these contracts offline against a mock of the OpenAI API.

## When live weather is unavailable

With `LIVE_SERVICES_ENABLED=true`, the app never falls back to demo weather. If the weather or air-quality lookup fails, the routine request returns `status: "needs_conditions"` and the app asks the user four quick questions (sun, air, haze, temperature). The routine is then built from those answers and labelled "Your reported conditions". Demo readings are used only when live services are switched off.

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

- Obtain permission before any CIR report text or EWG Skin Deep data is copied or embedded. The knowledge base stores only paraphrased CIR/SCCS/AICIS conclusions and one attributed EWG score per ingredient with a check date.
- A clinical trial, treatment decision, product recommendation, or real-world safety/effectiveness claim.
- A copied/embedded CIR report or EWG Skin Deep database; CIR conclusions are paraphrased with attribution and EWG is recorded as one dated score per ingredient.
- An independent human-domain audit or formal UAT; the supplied evaluation packs are reproducible software tests.
- A BYO-vector Pinecone adapter; the current demo index is integrated-embedding.
- Calibration of CUE (either method) against human faithfulness judgements; this is planned alongside the expert audit.
- A clinically validated environmental model: the surrogate is fitted to a constructed dataset until the expert labels are collected, and the Shapley view is exact for whichever fitted surrogate is loaded.
- Cloud persistence, authentication, consent/data-retention rules, and audit logs before handling real participant data.
