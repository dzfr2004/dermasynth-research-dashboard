# Viva / dissertation deck — word-by-word replacements

Each item is a literal FIND (text on the current slide) → REPLACE. The FIND text is from the
original deck; the REPLACE text is checked against the code on 2026-09-25 (branch
`feat/ui-revamp-simplified`). This replaces the July version of this file.

Where a result needs a human study, there is an `[INSERT ...]` placeholder. Fill it only with a
real result; if the study is not done by the viva, use the "if not done" wording instead. No
numbers are invented here.

Legend: **[fix]** = slide contradicts the code; **[soften]** = true but overstated;
**[add]** = new content.

---

## ⚠️ Read first — what is measured and what is not

Measured by the software (reproducible with `npm test`): retrieval, Safety-50, extended safety,
triage on 148 labelled cases, GPT output schemas, the browser checks, and the before/after
comparison with the pre-September version.

Needs people (tools are ready; results only if you have run them):
- **Independent triage set** — someone other than you writes the cases (`npm run eval:independent`).
- **CUE vs human ratings** — `npm run cue:sheet`, raters fill it, `npm run eval:cue-human` (Cohen's κ).
- **User test** — check-ins summarised by `npm run report:feedback`, plus your questionnaire.
- **Live GPT evaluation** — `npm run eval:live` with your keys.

The July version of this file assumed a dermatologist audit, UAT and CUE calibration were
complete. If any of these were not run, do not claim them: use the "if not done" lines below,
and list them under limitations and future work.

---

## Slide 1 — Title

> FIND: `Proposal Defense with Ts. Faizal Fadzil (DC/UTP)`
> REPLACE: `Final Viva / Dissertation Defence with Ts. Faizal Fadzil (DC/UTP)`

**[add]** under the subtitle:

> ADD: `A working, tested, weather-aware skincare routine system with safety checks and plain-English explanations`

---

## Slide 3 — Project Background (RQ / OBJ table)

**OBJ1 — [fix] corpus size**

> FIND: `over a CIR/EWG knowledge base ranging from 18 ingredients for contextually adaptive skincare synthesis`
> REPLACE: `over a source-linked knowledge base of 50 ingredients and 52 published source records (9 CIR, 1 EWG, 42 journal) with 50 verified safety cards, for contextually adaptive skincare synthesis`

---

## Slide 4 — Comparative Analysis ("Proposed Framework" column)

**Clinical Grounding — [fix]**

> FIND: `✓ CIR + EWG vector store`
> REPLACE: `✓ 50 verified safety cards (CIR/SCCS/AICIS/EU, paraphrased) + journal references`

**Dynamic AM/PM Routine — [fix] it now names ingredients**

> FIND: `✓ Adapts per env. context`
> REPLACE: `✓ AM/PM steps with a named ingredient per step, adapted to today's UV peak, humidity, haze, temperature and skin profile`

**Hallucination Mitigation — [add] the schema contract**

> FIND: `✓ CUE-gated RAG ≥ 0.80`
> REPLACE: `✓ GPT restricted to a retrieved, safety-approved pool; outputs schema-checked and CUE-checked (≥ 0.80); rule-based fallback`

---

## Slide 5 — Methodology, Tech Stack & Gantt

### 5a. Tech stack — [fix]

**REMOVE (not in the delivered system):**
`React.js · Recharts · Tailwind CSS · Express · LangChain · ChromaDB · RAGAS · scikit-learn · Python 3.11 · PyMuPDF · Axios · text-embedding-3-small · Firebase · Railway`

**REPLACE with the delivered stack:**
`OpenAI GPT (Responses API, strict structured outputs, model fallback) · Pinecone (integrated embedding) + local BM25 · SQLite (better-sqlite3) knowledge base with audit log · Node.js built-in HTTP server · framework-free JavaScript web app (installable on phones) · OpenWeather + IQAir + Open-Meteo · self-implemented CUE, exact Shapley + PEG · Playwright + axe-core for browser and accessibility tests · GitHub`

> FIND: `Node.js + Express`
> REPLACE: `Node.js (built-in HTTP)`

> FIND: `RAGAS`
> REPLACE: `CUE (self-implemented, LLM judge + lexical fallback)`

> FIND: `React.js`
> REPLACE: `Framework-free JS web app`

### 5b. P5 milestone card — [fix]

> FIND: `Build React dashboard, connect to Express backend, deploy frontend to Firebase and backend to Railway.`
> REPLACE: `Built the framework-free web app on a Node built-in-HTTP backend; runs locally and on a phone over Wi-Fi or a hotspot; single-instance deployment documented for Railway/Render.`

### 5c. Gantt

> Mark the phases you have completed. If the human studies are still running, show them as in progress rather than complete.

---

## Slide 6 — System Implementation

**[add] proof-points strip** under the architecture row:

> ADD: `Tested: 30/30 retrieval (MRR 0.98) · 50/50 safety cases · 93 extended safety tests + 840-run property check · triage 148 cases · 50 GPT schema checks · 59 browser checks (phone + desktop, 0 serious accessibility issues)`

**CUE Score cell**

> FIND: `An independent evaluator assesses whether system outputs are grounded in retrieved documents or contain hallucinated content not traceable to any source.`
> REPLACE (if done): `GPT explanations were scored for grounding with CUE against the supplied facts; agreement with human raters: Cohen's κ = [INSERT], n = [INSERT].`
> REPLACE (if not done): `GPT explanations are scored for grounding with CUE (≥ 0.80, one rewrite, otherwise withheld). Agreement with human raters is set up (rating sheet + κ script) and is future work.`

**Dermatology Audit cell**

> FIND: `Board-certified dermatologist(/s) independently rate blinded routine outputs on clinical appropriateness, ingredient safety, environmental relevance, and explanation quality. Inter-rater agreement is reported via Cohen's κ.`
> REPLACE (if done): `[INSERT who] rated blinded outputs on appropriateness, safety, environmental relevance and explanation quality. κ = [INSERT], n = [INSERT].`
> REPLACE (if not done): `An expert review of blinded outputs is future work; the safety rules were instead tested on 148 labelled symptom cases and 93 extended safety tests.`

**User Acceptance Test cell**

> FIND: `Participants interact with the live system using their own skin profiles and complete a structured survey assessing usability, explanation clarity, and recommendation trust. Response latency is logged throughout each session.`
> REPLACE (if done): `[INSERT n] participants used the system with their own profiles. Usability [INSERT], clarity [INSERT], trust [INSERT]; in-app check-ins: [INSERT]% good, followed the routine [INSERT]%. Median latency [INSERT] s.`
> REPLACE (if not done): `The user test is set up (consent, in-app check-ins, feedback report) and is being run; results are reported in the dissertation.`

---

## Slide 7 — Outcome

**Slide title — [fix]**

> FIND: `Expected Outcome: One dashboard. Three modules. Real-time skincare intelligence.`
> REPLACE: `Delivered: one app, three everyday tools and an expert view — weather-aware skincare you can act on today.`

**Module 1**

> FIND: `Module 1 - Live Weather Monitor`
> REPLACE: `Weather — today's UV (with peak and hourly chart), humidity, haze and temperature, and tomorrow's forecast`

**Module 2**

> FIND: `Module 2 - Dynamic Routine Simulator`
> REPLACE: `Your routine — AM/PM steps with a named ingredient each, a one-line summary, and what changed since last time`

> FIND: `Every ingredient comes with a plain-English card explaining why it was chosen — citing the environmental reading`
> REPLACE: `Every ingredient comes with a plain-English "Why?" card — what it is, why it suits today's reading, how it appears on labels, and journal-style references`

**Module 3**

> FIND: `Module 3 - Bulk Analysis Suite`
> REPLACE: `Check my product — paste a label's ingredient list; DermaSynth shows which of today's steps it fits, any clash with today's routine, and safety cautions`

**[add] footer row:**

> ADD: `Also: Ingredient guide (50 ingredients, source-linked) · reminders · shareable story image · Expert view with scores, safety trace, Shapley explanation and run report`

---

## Slide 8 — Conclusion

**Obj 1**

> FIND: `Pipeline scaffolded; full corpus ingestion occurs at the integration phase (P5).`
> REPLACE: `Full pipeline built and running on the 50-ingredient, 52-source knowledge base, with one-command rebuild and Pinecone upload.`

**Obj 2**

> FIND: `RAG pipeline evaluated with at CUE, grounded in a CIR/EWG vector store. Dual-pass safety filter targets 100% block rate on the independent test set. PEG + SHAP-on-surrogate produce auditable rationales.`
> REPLACE: `GPT choices are restricted to a retrieved, safety-approved pool and schema-checked; explanations are CUE-checked. Safety: 50/50 Safety-50 cases, 93/93 extended tests, triage [INSERT independent-set sensitivity, or "148/148 on the development sets (tuned on them)"]. Exact Shapley + PEG explain the environmental drivers.`

**Obj 3**

> FIND: `Multi-instrument evaluation: CIR/EWG benchmark match, CUE scoring, blinded dermatologist audit, case safety suite, and median-latency budget — each mapped to RQ3 with zero unanswered gaps.`
> REPLACE: `Evaluated with reproducible suites (retrieval, safety, triage, schemas, browser/accessibility), a before/after comparison, [INSERT completed human studies], each mapped to RQ3.`

---

## New slide — Results & Evaluation Findings (insert between 6 and 7)

- `Retrieval — Recall@5 30/30, MRR 0.98`
- `Safety — Safety-50 50/50; extended 93/93; 840 pipeline runs with no unsafe output`
- `Triage — keyword baseline caught 22% of cases needing care; rules catch 148/148 on the development sets; fresh blind set 13/15 before fixes; independent set [INSERT or "pending"]`
- `Before vs after (same inputs, old vs current version) — fresh triage cases caught 3/15 → 13/15; skin type changes the routine in 0/24 → 8/24 cases; result readability (Flesch) −8 → 56; serious accessibility issues 24 → 0`
- `GPT reliability — 50 schema checks; every failure falls back to the rule-based routine and is shown as Reduced mode`
- `Live GPT — [INSERT from npm run eval:live, or "pending"]`
- `CUE vs humans — [INSERT κ, or "pending"]`
- `User test — [INSERT n and findings, or "in progress"]`

---

## Opening line for the defence

> "I built and tested a weather-aware skincare system that turns today's conditions into a
> morning and evening routine, checks it for safety before and after the AI, and explains every
> choice in plain English — and I can show you exactly what was measured and what still needs
> people to evaluate."
