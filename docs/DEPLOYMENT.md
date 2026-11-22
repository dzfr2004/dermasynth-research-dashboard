# Deploying DermaSynth (single instance)

DermaSynth is built to run as **one Node process with one SQLite file**. That is a deliberate choice for the FYP: it keeps the system simple, cheap and fully traceable. This page lists what that means and how to deploy it safely.

## What lives inside the one process

| State | Where | What happens with two instances |
| --- | --- | --- |
| Routine and location rate limits | memory (`server.mjs`) | Each instance counts separately, so limits double |
| Weather, air-quality and forecast caches | memory (`lib/environment.mjs`, `lib/open-meteo.mjs`) | Extra provider calls, no wrong answers |
| GPT explanation cache (`/api/ai/routine-context`) | memory, keyed by run id | An explanation request that lands on the other instance gets "run no longer available" |
| Model fallback memory (which GPT model works) | memory (`lib/openai.mjs`) | Each instance re-discovers it |
| Run counters (`/api/health` → `runOutcomes`) | memory | Each instance reports only its own runs |
| Knowledge base, audit log, reviewer queue | `data/db/dermasynth.sqlite` | Each instance has its own copy unless the file is on a shared disk; SQLite must not be shared between machines |
| Selection and context logs | `data/logs/*.jsonl` | Split across instances |

Only the explanation cache would give a user a visible error, and only with more than one instance. Everything else degrades to extra calls or split statistics.

`GET /api/health` shows `safeguards.instance.id`. If repeated calls to the same URL show different ids, more than one instance is running. The server also prints a warning at start if `WEB_CONCURRENCY` or `INSTANCE_COUNT` is above 1.

## Deploying on Vercel with Neon Postgres (current setup)

Vercel runs the app as one serverless function (`api/index.mjs`, which calls the same `handleRequest` the local server uses). Every path is rewritten to it in `vercel.json`, so only the files listed in `publicFiles` in `server.mjs` are ever served.

What changes on Vercel:

| State | Where on Vercel |
| --- | --- |
| Knowledge base (SQLite) | Built by `npm run build` (`kb:rebuild` then the sign-off promotion), bundled, copied to `/tmp` on a cold start. Read-only at runtime; change it in the repo and redeploy. |
| Study answers, feedback, selection and context logs | Postgres (`DATABASE_URL`) |
| GPT explanation facts per run | Postgres for 1 hour, so `/api/ai/routine-context` works whichever instance answers |
| Rotation memory (recently shown ingredients) | Postgres |
| Rate limits, weather caches | Each instance's memory; `TRUST_PROXY_HOPS` is set to 1 automatically |

Steps:

1. On vercel.com, **Add New > Project**, import `dzfr2004/dermasynth-research-dashboard` and pick the production branch. Keep the settings from `vercel.json`. Do not change the framework, build command or output directory.
2. **Storage > Create Database > Neon (Postgres)**, free plan, connect it to the project. This sets `DATABASE_URL` and `POSTGRES_URL`. Tables are created on first use.
3. **Settings > Environment Variables**: everything from `.env.example` that you use locally. That means `LIVE_SERVICES_ENABLED`, `INGREDIENT_DB_ENABLED`, `INGREDIENT_SELECTION_ENABLED` and the OpenAI, OpenWeather, IQAir and Pinecone keys, plus `STUDY_ADMIN_TOKEN` if the study pages are used. Do not set `HOST` or `PORT`.
4. Deploy, then open `/api/health` and check the providers show as configured.
5. Optional uptime alert: add the repository variable `SITE_URL` (the Vercel address). `.github/workflows/uptime.yml` then checks `/api/health`, the home page and a routine every 2 hours, and GitHub emails you if a check fails.

To analyse hosted data locally: `vercel env pull .env.production.local`, set `DATABASE_URL` from it, then `npm run db:export-logs` and the usual `npm run report:selection-log` / `report:feedback`.

The researcher "install case set" button writes a file, which Vercel cannot do. Download the case set and run it locally instead.

## Deploying on Railway or Render

1. **One instance, no autoscaling.** Set the instance count to 1 and turn autoscaling off.
2. **A persistent disk** mounted at `data/` (or set `INGREDIENT_DB_PATH`, `SELECTION_LOG_PATH` and `CONTEXT_LOG_PATH` to paths on the disk), so the database and logs survive restarts and redeploys.
3. **Environment variables** in the host's settings, never in the repository: everything in `.env.example`, plus
   - `HOST=0.0.0.0` (the server listens only on `127.0.0.1` otherwise);
   - `PORT` is usually set by the host.
4. **Build and start:** `npm install` (builds `better-sqlite3` for the host's Linux), then `npm run kb:rebuild` once to create and check the database, then `npm start`.
5. **After the first deploy:** open `/api/health` and check the keys are seen, the model is available and `instance.id` stays the same across refreshes.

Set `TRUST_PROXY_HOPS=1` on the host (E3, fixed in `lib/client-address.mjs`): behind the host's proxy every user shares one connection address, so without it the per-client rate limit would apply to all users together.

## If more than one instance is ever needed

This is future work, not needed for the FYP:

- move the rate limits and the explanation cache to a shared store (for example Redis);
- move the knowledge base from SQLite to Postgres; only two modules query the database directly (`lib/ingredient-repository.mjs` and the sync log in `lib/pinecone-sync.mjs`), both through the small adapter in `lib/db/database.mjs`, so the change is contained;
- write the selection and context logs to the database instead of local files.

## Knowledge-base rebuild

`npm run kb:rebuild` runs every knowledge-base step in order (migrate, seed if empty, apply updates, verify, corpus inventory, Pinecone dry runs). Add `-- --upload` to write to Pinecone, `-- --fresh` to wipe and reseed the database first, or `-- --plan` to list the steps without running them.
