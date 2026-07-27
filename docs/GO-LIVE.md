# Go-live runbook — activating the full live pipeline

Supervisor + external examiner sign-off recorded. This is the exact, ordered
sequence to move from labelled-demo mode to the fully live system (real weather,
live RAG retrieval, LLM-composed rationale, and the named-ingredient
recommendation layer). Run on macOS (the SQLite native module and your API keys
live there).

## 0. Prerequisites (one-time)

`.env` already has the flags on and the keys set:

```
LIVE_SERVICES_ENABLED=true
INGREDIENT_DB_ENABLED=true
INGREDIENT_SELECTION_ENABLED=true
OPENAI_API_KEY / OPENWEATHER_API_KEY / IQAIR_API_KEY / PINECONE_API_KEY / PINECONE_INDEX / PINECONE_NAMESPACE
```

Rebuild the native SQLite module for your machine if you ever see
`invalid ELF header`:

```sh
npm rebuild better-sqlite3
```

## 1. Fit the environmental surrogate (learned SHAP weights)

```sh
npm run fit:environmental-default
```

## 2. Seed the knowledge base at APPROVED state (activates the named layer)

Seeding at `approved` sets `routine_selection_allowed=true` and bakes in the
curated category→ingredient membership, so named candidates can surface beneath
each safety-cleared category.

```sh
npm run db:migrate
npm run db:seed-approved      # = seed-ingredient-db.mjs --fresh --state approved
npm run verify:ingredient-db  # offline lifecycle test
```

## 3. Push approved records + evidence to Pinecone

```sh
npm run db:publish-atlas -- --upload           # publishes approved ingredient/source metadata
npm run sync:atlas-pinecone -- --upload        # Atlas research namespace
# CIR/EWG factual cards → research namespace (isolated demo- namespace):
npm run ingest:evidence -- \
  --file data/evidence/cir-ewg/cir-factual-context.verified.batch1.v1.jsonl \
  --file data/evidence/cir-ewg/cir-factual-context.verified.batch2.v1.jsonl \
  --file data/evidence/cir-ewg/cir-factual-context.verified.batch3.v1.jsonl \
  --file data/evidence/cir-ewg/cir-factual-context.verified.batch4.v1.jsonl \
  --file data/evidence/cir-ewg/cir-factual-context.verified.batch5.v1.jsonl \
  --file data/evidence/cir-ewg/regulatory-factual-context.verified.batch6.v1.jsonl \
  --file data/evidence/cir-ewg/factual-context.verified.batch7.v1.jsonl \
  --research-upload --namespace demo-cir-ewg-safety-v1
```

Do NOT ingest `cir-ewg-factual-context.scaffold-50.v1.jsonl` alongside the
verified set — it would duplicate.

## 4. Live smoke test (one real run)

```sh
npm run dev
```

Then in the UI: pick a real location → confirm live OpenWeather/IQAir readings →
run a routine preview → confirm (a) the category routine, (b) named candidate(s)
under each eligible category with an Evidence link, (c) the LLM-composed
rationale, and (d) the run report. `GET /api/health` confirms provider keys are
seen without spending a call.

## 5. EWG hazard scores (optional, item 5)

CIR is the substantive half and is verified (44/50). EWG hazard scores change
over time, so verify them with a recorded "date checked" and paraphrase (never
bulk-copy the database). Use the scaffold as the worklist:

```sh
npm run data:cir-ewg-cards    # regenerates the 100-card CIR+EWG scaffold
# then read each EWG Skin Deep entry and fill an EWG verified batch, same
# pattern as the CIR batches, setting verification_status: verified_paraphrase.
```

## Rollback

```sh
npm run db:seed-approved   # re-run to reset, or
npm run db:seed            # reseed at in_review (deactivates the named layer)
```

Everything above is reversible and local; the deterministic safety passes and
the non-clinical research-preview labelling remain in force regardless of state.
