# DermaSynth final-review guide

Updated 2026-09-25 to match the current code (branch `feat/ui-revamp-simplified`).

## What the system does

DermaSynth builds a morning and evening skincare routine from today's weather where the user is (UV, humidity, haze and temperature), their skin type, main concern and optional preferences. Every step names an ingredient to look for and explains, in plain English, why it suits today. Safety checks run before and after the AI, and the rule-based result is always there when the AI is unavailable.

## What is complete

**Knowledge base**
- 50 ingredients and 53 source records (52 published: 9 CIR, 1 EWG, 42 journal records; 1 in review), in SQLite with an audit log.
- 50 verified safety cards (CIR, SCCS, AICIS or EU conclusions, paraphrased, never copied), read locally for the Why? panel.
- Pinecone: `demo-atlas-50-v1` (50 Atlas metadata cards, browsing only) and `demo-ingredient-evidence-v2` (50 ingredient evidence documents for the candidate retriever). `npm run kb:rebuild -- --upload` rebuilds and uploads everything in one command.

**Pipeline**
- Symptom triage in three layers: rules with word stems, typo tolerance and negation; an optional GPT second opinion that can only escalate; and "needs a pharmacist or doctor" screens that show no routine.
- Live weather from OpenWeather and IQAir, with Open-Meteo (keyless) filling gaps and giving the hourly UV and tomorrow's forecast. Sunscreen is planned on today's peak UV, not the reading at build time. If live weather fails, the app asks the user four quick questions instead of guessing.
- Routine rules plus personalisation (skin type, finish, reactivity, time outdoors), candidate retrieval (Pinecone plus local BM25), GPT ingredient choice restricted to the retrieved, safety-approved pool, a final safety rescan (incompatible pairs, morning photosensitisers, strong exfoliants for reactive skin, excluded and prescription-only ingredients).
- Explanations: rule-based reasons for every step, GPT rewrites grounded in fixed facts and checked by CUE, journal-style references, and an exact-Shapley environmental explanation in Expert view.
- Reliability: every GPT reply is checked against its output schema; any failure falls back to the rule-based result and is shown as "Reduced mode" (also in a response header and `/api/health`).

**For the user**
- Today in one line, the Today card with an hourly UV chart, what changed since the last routine, tomorrow's outlook.
- Check a product: paste a label's ingredient list to see which of today's steps it fits, clashes with today's routine, and cautions. Unknown ingredients are listed as not checked.
- My routine with product names, calendar reminders (.ics), a one-tap check-in (anonymous, `npm run report:feedback`), and a 1080 × 1920 story image.
- Phone-first layout: bottom navigation (Today / Weather / Ingredients), 44 px tap targets, no zoom on focus, installable as a home-screen app over HTTPS.
- Expert view (top-right toggle) shows scores, traces, the run report, the research Overview and the defence walkthrough.

## Suggested demo sequence

1. On a phone (hotspot, see README) or a laptop, open **Your routine**. Choose a skin type and concern, leave the skin question empty and press **Build routine**. Point out the one-line summary, the Today card and UV chart, each step's ingredient and its **Why?** panel (what it is, why today, label names, references).
2. Tap **Check a product you own**, then **Try an example** (or paste `Aqua, Glycerin, Niacinamide, Salicylic Acid`). Show the step fit, clashes and cautions.
3. Show **Share as story** (the 1080 × 1920 image) and **Add reminders**.
4. Tap **Edit my skin details**, type `my lips started swelling after a new cream` in the skin question and build again: the app refuses a routine and points to a pharmacist or doctor.
5. Open **Weather** for the readings and tomorrow's forecast, and **Ingredients** to search an ingredient (for example `niacinamide`) and open a source.
6. Turn on **Expert view** to show the scoring, safety trace, Shapley explanation, run report (Print / Save PDF) and, if wanted, the **Defence walkthrough**.

Have screenshots or a screen recording ready in case the network or the OpenAI API fails on the day.

## Architecture

```text
Symptoms ──► triage (rules + optional GPT escalation) ──► redirect, no routine
   │
Location ──► OpenWeather / IQAir / Open-Meteo (peak UV, hourly, tomorrow)
   │                     │
   ▼                     ▼
Profile + preferences ──► routine rules + safety pass 1 ──► steps (AM / PM)
                                   │
                                   ▼
          candidate retrieval (Pinecone evidence docs + local BM25)
                                   │
                                   ▼
          GPT picks one ingredient per step from the approved pool
          (schema-checked; rule-based choice if GPT fails)
                                   │
                                   ▼
          final safety rescan ──► explanations (rules, GPT + CUE, references)
                                   │
                                   ▼
          Today card · routine · product check · tomorrow · story · reminders
```

## Evidence boundary

The knowledge base stores project-authored metadata, paraphrased safety conclusions and source locators. It does not copy CIR reports, EWG content or journal text. DermaSynth is a research prototype, not medical advice: it does not diagnose, treat, or claim clinical outcomes. Human studies (independent triage set, CUE against human raters, user test) are reported separately in the dissertation once completed.

## Reproduce the checks

```sh
npm test            # all offline suites, about 3 minutes
npm run eval:live   # real GPT evaluation (needs .env keys and npm start)
```

`npm test` runs: syntax checks, knowledge-base verification, the study evaluation (113 checks), retrieval (30 queries), Safety-50, ingredient selection, category coverage, triage (148 cases), extended safety (93 tests plus an 840-run property check), input sensitivity (quick), GPT layer, GPT output schemas (50), outlook, result-impact features, and the browser smoke test (59 checks, phone and desktop, axe accessibility). Reports are written to `data/evaluation/reports/`.
