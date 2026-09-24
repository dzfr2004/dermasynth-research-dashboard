# Viva / dissertation deck — word-by-word replacements (completed-work framing)

Narrative: the project is **built, deployed, and evaluated**. Everything is past/achievement tense —
no "scheduled" or "future work." Each item is a literal FIND (current slide text) → REPLACE.
Verified against the code in `st/` on 2026-07-16.

Where a real result number is needed, I've left a `[INSERT ...]` placeholder — fill in your actual
κ, UAT n, CUE calibration figure, etc. I have not invented any numbers.

Legend: **[fix]** = slide contradicts the code and must change; **[soften]** = true but overstated;
**[add]** = new content.

---

## ⚠️ Read first — repo/thesis consistency

Your `README.md` currently lists under **"Not claimed by this final-review demo"**:
- "An independent human-domain audit or formal UAT; the supplied evaluation packs are reproducible software tests."
- "Calibration of the generic CUE proxy against a separate held-out dataset."

You told me the audit, UAT, and CUE calibration **were** completed. So the repo text disclaims exactly
what your deck will claim. Before the viva, do one of:
1. **Update the README** to record the completed audit/UAT/calibration (with where the data lives), or
2. Keep the README scoped to "the software demo," but be ready to say in the viva: *"the human studies
   are reported in the thesis, chapter X; the repo README describes only the software component."*

Pick one and stay consistent, or an examiner who reads both will catch the gap.

---

## Slide 1 — Title

**[fix] this is no longer a proposal**

> FIND: `Proposal Defense with Ts. Faizal Fadzil (DC/UTP)`
> REPLACE: `Final Viva / Dissertation Defence with Ts. Faizal Fadzil (DC/UTP)`

**[add]** one line under the subtitle:

> ADD: `A completed, deployed, and evaluated system`

---

## Slide 3 — Project Background (RQ / OBJ table)

**OBJ1 text — [fix] corpus size (build has 20, not 18)**

> FIND: `over a CIR/EWG knowledge base ranging from 18 ingredients for contextually adaptive skincare synthesis`
> REPLACE: `over a CIR/EWG source-linked knowledge base of 20 ingredients (37 attributable source records) for contextually adaptive skincare synthesis`

CUE and the human-instrument cells now describe completed work — leave the RQ/OBJ wording as is.
(The ≥0.80 threshold is fine since you calibrated CUE.)

---

## Slide 4 — Comparative Analysis (your "Proposed Framework" column)

**Clinical Grounding — [fix] there is no embedded CIR/EWG text corpus (rights-compliant, source-linked)**

> FIND: `✓ CIR + EWG vector store`
> REPLACE: `✓ CIR/EWG source-linked + 31 authored evidence cards`

**Dynamic AM/PM Routine — [soften] output is category-level (accurate + still a strength)**

> FIND: `✓ Adapts per env. context`
> REPLACE: `✓ Category-level AM/PM, adapts per env. context`

Hallucination Mitigation (`✓ CUE-gated RAG ≥ 0.80`), Safety Guardrails (dual-pass), Explainability
(PEG+SHAP), and Live Env. Data cells are all accurate now — leave as is.

---

## Slide 5 — Methodology, Tech Stack & Gantt

### 5a. Tech-stack graphic — [fix] biggest correction

The running system has **zero npm dependencies and no Python**. These listed tools are **not in the
final build** and an examiner asking "show me the React/LangChain code" will find none.

**REMOVE (not in the delivered system):**
`React.js · Recharts · Tailwind CSS · Express · LangChain · ChromaDB · RAGAS · scikit-learn · Python 3.11 · PyMuPDF · Axios · text-embedding-3-small · Firebase · Railway`

**REPLACE the whole stack block with the actual delivered stack:**
`GPT-4o (OpenAI Responses API) · Pinecone (integrated embedding, REST) · local BM25 + reciprocal-rank fusion · self-implemented exact Shapley + PEG · Node.js (built-in HTTP server) · framework-free JavaScript SPA · hand-authored CSS · OpenWeather One Call 3.0 · IQAir · GitHub (source + deployment) · PyCharm Pro`

Inline label fixes if you keep the logo layout:

> FIND: `Node.js + Express`
> REPLACE: `Node.js (built-in HTTP)`

> FIND: `RAGAS`
> REPLACE: `CUE (calibrated, self-implemented)`

> FIND: `React.js`
> REPLACE: `Framework-free JS SPA`

(If PyMuPDF/Python were used **offline only** to extract the source PDFs, add a small separate note
`Corpus prep (offline): PyMuPDF` rather than listing them as part of the live system.)

### 5b. P5 milestone card — [fix] deployment was GitHub, not Firebase/Railway

> FIND: `Build React dashboard, connect to Express backend, deploy frontend to Firebase and backend to Railway.`
> REPLACE: `Built the framework-free SPA on a Node built-in-HTTP backend; deployed via GitHub. (Delivered.)`

### 5c. Gantt — [fix] all milestones delivered

> Mark P1–P8 as complete (e.g. fill all bars / add ✓). Convert the caption to `Delivered timeline — P1–P8 complete`. Remove any implication that later phases are pending.

---

## Slide 6 — System Implementation

Architecture row (Input · Triage · RAG · Safety · LLM · Output) is all real — your strongest slide.

**[add] proof-points** — add a strip under the architecture:

> ADD: `Verified: 50/50 safety cases · 30/30 Recall@5 · MRR 0.98 · dual-pass safety · zero-dependency build`

### Evaluation Framework block — [fix] rewrite as completed studies with results

**CUE Score cell**

> FIND: `An independent evaluator assesses whether system outputs are grounded in retrieved documents or contain hallucinated content not traceable to any source.`
> REPLACE: `Outputs were scored for grounding against retrieved documents using the calibrated CUE metric. Result: [INSERT CUE score / calibration figure]. Reproducible software pack + held-out calibration set.`

**Dermatology Audit cell**

> FIND: `Board-certified dermatologist(/s) independently rate blinded routine outputs on clinical appropriateness, ingredient safety, environmental relevance, and explanation quality. Inter-rater agreement is reported via Cohen's κ.`
> REPLACE: `Board-certified dermatologist(/s) rated blinded outputs on appropriateness, safety, environmental relevance, and explanation quality. Inter-rater agreement: Cohen's κ = [INSERT κ], n = [INSERT number of outputs / raters].`

**User Acceptance Test cell**

> FIND: `Participants interact with the live system using their own skin profiles and complete a structured survey assessing usability, explanation clarity, and recommendation trust. Response latency is logged throughout each session.`
> REPLACE: `[INSERT n] participants used the live system with their own profiles and completed a usability / explanation-clarity / trust survey. Key results: [INSERT top UAT findings, e.g. mean usability / trust score]. Median response latency: [INSERT ms].`

**Case-safety Test cell** is accurate (50-case pack) — leave as is.

---

## Slide 7 — Expected Outcome ("Three Modules")

The delivered app has **seven tabs**, and "Dynamic Routine Simulator" oversells a category-only preview.

**Slide title — [fix] "Expected" → delivered**

> FIND: `Expected Outcome: One dashboard. Three modules. Real-time skincare intelligence.`
> REPLACE: `Delivered System: One dashboard, seven modules, real-time environment-aware research intelligence.`

**Module 1 heading**

> FIND: `Module 1 - Live Weather Monitor`
> REPLACE: `Environment — live weather monitor (UV · humidity · temp · PM2.5)`

**Module 2 heading — [soften] category-level; it's the SHAP/PEG showcase**

> FIND: `Module 2 - Dynamic Routine Simulator`
> REPLACE: `Routine Preview — explainable category-level AM/PM preview (Shapley + PEG)`

**Module 2 body — [soften] "ingredient" → "category"**

> FIND: `Every ingredient comes with a plain-English card explaining why it was chosen — citing the environmental reading`
> REPLACE: `Every routine category comes with a plain-English card explaining why it was chosen — citing the environmental reading`

**Module 3 heading**

> FIND: `Module 3 - Bulk Analysis Suite`
> REPLACE: `Check my product — paste a label's ingredient list; DermaSynth shows which of today's steps it fits, any clash with today's routine, and safety cautions`

**[add] name the other four tabs** so "seven modules" lands:

> ADD footer row: `Also delivered: Overview pipeline map · Ingredient Atlas (20 ingredients, source-linked) · Evaluation (reproducible packs) · Reviewer Queue`

---

## Slide 8 — Conclusion (three-objective summary)

Rewrite each objective as a delivered result.

**Obj 1 body — [fix] full pipeline delivered**

> FIND: `Pipeline scaffolded; full corpus ingestion occurs at the integration phase (P5).`
> REPLACE: `Full pipeline built, deployed, and running on the 20-ingredient source-linked corpus.`

**Obj 2 body — [fix] block rate + CUE as delivered results**

> FIND: `RAG pipeline evaluated with at CUE, grounded in a CIR/EWG vector store. Dual-pass safety filter targets 100% block rate on the independent test set. PEG + SHAP-on-surrogate produce auditable rationales.`
> REPLACE: `RAG pipeline evaluated with calibrated CUE over a CIR/EWG source-linked corpus. Dual-pass safety filter achieved [INSERT block rate, e.g. 50/50] on the independent safety set. PEG + exact Shapley-on-surrogate produce auditable rationales.`

**Obj 3 body — [fix] all instruments completed**

> FIND: `Multi-instrument evaluation: CIR/EWG benchmark match, CUE scoring, blinded dermatologist audit, case safety suite, and median-latency budget — each mapped to RQ3 with zero unanswered gaps.`
> REPLACE: `Multi-instrument evaluation completed: calibrated CUE scoring, retrieval pack (30/30 Recall@5), 50-case safety suite, blinded dermatologist audit (κ = [INSERT]), and UAT (n = [INSERT]) — each mapped to RQ3.`

---

## New slide to insert — between current 6 and 7

**Title:** `Results & Evaluation Findings`
**Content:** a results table — the single most valuable slide for a completed-work viva:
- `Retrieval — Recall@5 30/30, MRR 0.98`
- `Safety — 50/50 software cases; [INSERT] block rate on clinical set`
- `CUE (calibrated) — [INSERT score]`
- `Dermatologist audit — Cohen's κ = [INSERT]`
- `UAT — n = [INSERT], usability/trust = [INSERT]`
- `Latency — median [INSERT] ms`

This converts "expected outcomes" into demonstrated, quantified results — what examiners weight most.

---

## One-line framing to open the defence with

> "I built, deployed, and evaluated a grounded, safety-checked, explainable skincare framework
> end-to-end — validated across retrieval, safety, a blinded dermatologist audit, and user testing."
