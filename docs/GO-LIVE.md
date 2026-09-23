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
npm run fit:environmental-default   # constructed dataset; see data/models/README.md for the expert-label workflow
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
# Candidate-pool retrieval uses its own namespace of ingredient evidence documents:
npm run sync:evidence-pinecone -- --upload
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

## 5. September 2026 update (run once on the Mac)

The knowledge-base database in `data/db/` was already updated in the session
that made these changes. If you restore an older database, re-apply it:

```sh
npm rebuild better-sqlite3                         # only if you see "invalid ELF header"
npm run check:openai                               # key + model + structured output
npm run db:apply-kb-update                         # AICIS retinal source, retinal blocked (idempotent)
npm run sync:evidence-pinecone                     # dry run: 50 ingredient evidence documents
npm run sync:evidence-pinecone -- --upload         # dense half of the candidate retriever
npm run report:corpus-inventory                    # regenerate the corpus counts
```

Then run a few routines (different locations, concerns and reactivity levels)
and summarise them:

```sh
npm run report:selection-log
```

EWG scores are already recorded (checked 2026-09-23) in
`data/ingredients/ewg-hazard-reference.v1.json` and
`data/evidence/cir-ewg/ewg-reference-context.verified.batch8.v1.jsonl`.
Re-check them before citing individual values.

## Rollback

```sh
npm run db:seed-approved   # re-run to reset, or
npm run db:seed            # reseed at in_review (deactivates the named layer)
```

Everything above is reversible and local; the deterministic safety passes and
the non-clinical research-preview labelling remain in force regardless of state.
