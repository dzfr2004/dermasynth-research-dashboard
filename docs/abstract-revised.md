# Revised project abstract

Two versions are provided: a **drop-in revised abstract** that matches the
implemented system, and a **change log** explaining each edit against your
original wording.

---

## Revised abstract (recommended)

The skin is a dynamic biological organ continuously reshaped by environmental
exposure, yet most skincare recommendation tools remain context-blind: they
rely on static skin-type labels and ignore real-time exposome factors such as
UV irradiance, humidity, temperature, and particulate pollution. Compounding
this, general-purpose large language models (LLMs) used for skincare advice
generate suggestions from parametric memory alone, producing unverifiable,
sometimes hallucinated outputs with no guarantees against clinically
contraindicated ingredient pairings (for example, Benzoyl Peroxide with
Retinol) and no explanation for their outputs. This project presents
**GenAI-RAG_Env**, a hybrid framework that integrates live environmental
telemetry (via the OpenWeather and IQAir APIs) with retrieval-augmented
generation (RAG) over a curated knowledge base of CIR safety provenance, EWG
references, and peer-reviewed dermatological literature metadata, to assemble
**dynamic, environment-adaptive skincare *category* routines** as a research
preview. Rather than allowing free-form LLM generation, the framework confines
the LLM to a safety-gated role — selecting among allowlisted categories and
composing a grounded plain-language rationale — while all user-facing routine
structure is produced deterministically. A **dual-pass deterministic safety
filter**, preceded by an urgent-symptom triage redirect, blocks contraindicated
ingredient pairings and out-of-scope clinical content. An explainability layer
combines **exact Shapley attribution over a fitted additive environmental
surrogate** with Personalised Explanation Generation (PEG) to provide
source-traceable, clinically-informed justification for each preview. Developed
using the CRISP-DM methodology across eight structured milestones, the system
is evaluated through a multi-instrument protocol: **completed** automated
evaluation comprising CUE-based retrieval-grounding scoring (≥0.80 threshold)
and adversarial case-safety testing, alongside a small-sample user-acceptance
test; and a **provided-but-pending** protocol for blinded dermatologist review
with inter-rater agreement (Cohen's κ). This work contributes an open,
reproducible framework unifying real-time exposome data, hard-coded clinical
safety guardrails, and interpretable AI reasoning for personalised, non-clinical
skincare-category synthesis.

---

## Change log (original → revised, and why)

1. **"synthesise dynamic skincare routines" → "assemble dynamic,
   environment-adaptive skincare *category* routines (research preview)."**
   The implementation is deliberately category-only and non-clinical; it never
   emits named-ingredient routines to users. This is the core safety design, so
   the wording is aligned to it rather than the code being changed.

2. **Added the LLM-role sentence.** The LLM is fenced: it selects among
   allowlisted categories and now *composes a grounded rationale* (added in this
   iteration via a guardrailed generation path with deterministic fallback).
   "Confines the LLM to a safety-gated role" is accurate; "free-form synthesis"
   would not be.

3. **"CIR/EWG clinical knowledge base" → "curated knowledge base of CIR safety
   provenance, EWG references, and peer-reviewed dermatological literature
   metadata."** CIR is citation/paraphrase-with-attribution and EWG is
   reference-with-attribution (rights constraints prevent ingesting the source
   corpora). A rights-safe factual-card pipeline was added to strengthen this
   grounding.

4. **"SHAP feature attribution" → "exact Shapley attribution over a *fitted*
   additive environmental surrogate."** The surrogate is now fitted to a
   documented labelled dataset (weights learned, not hand-configured); exact
   Shapley on an additive model is legitimate and analytic. Kept honest: the
   dataset is a constructed research dataset, not clinical-outcome data.

5. **Evaluation reworded to separate *completed* from *pending*.** CUE ≥0.80 and
   adversarial safety testing are implemented and passing; a UAT instrument was
   added and a small UAT is planned/runnable; the dermatologist κ review is now
   a *provided instrument* (Cohen's κ scorer) with data collection pending. Your
   original future tense ("will be evaluated") is preserved but made specific.

6. **"clinically traceable justification" → "source-traceable,
   clinically-informed justification"** and **added "non-clinical" to the closing
   contribution.** Keeps the interpretability claim while not implying clinical
   validation the system does not claim.

---

## What is now literally true in code (traceability)

- Environmental telemetry: `lib/environment.mjs` (OpenWeather + IQAir).
- RAG + BM25/RRF fusion: `lib/retrieval.mjs`; CIR/EWG factual cards under
  `data/evidence/cir-ewg/`.
- Dual-pass safety + BPO/Retinoid block: `lib/safety.mjs`
  (`firstSafetyPass`, `secondSafetyPass`).
- Fitted Shapley surrogate + PEG: `lib/explainability.mjs`,
  `data/models/environmental-surrogate.fitted.v1.json`
  (reproduce: `npm run fit:environmental-default`).
- LLM-composed grounded rationale: `lib/synthesis.mjs`
  (`composeRoutineRationale`).
- CUE ≥0.80 gate: `lib/retrieval.mjs`.
- Adversarial safety pack: `npm run eval:safety-50` (50/50).
- UAT instrument: `npm run eval:uat` (`data/evaluation/uat/`).
- Inter-rater κ instrument: `npm run eval:inter-rater`
  (`data/evaluation/review/`).
