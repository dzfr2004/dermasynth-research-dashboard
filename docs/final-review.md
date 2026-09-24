# DermaSynth final-review guide

## What is complete

- 50 held, source-mapped ingredient records across seven research contexts.
- 52 source records: 9 CIR provenance links, 1 EWG external link, and 42 journal metadata records.
- The existing 31 source-attributed metadata cards remain in the isolated Pinecone namespace `demo-ingredient-kb-v1`; the added 30 ingredients and 15 source records are local, review-pending Atlas metadata and are not uploaded.
- 21 source-mapped, category-only cards covering all seven research contexts in the separate `demo-category-cue-v1` namespace; they remain pending clinical review and cannot activate strict CUE, GPT synthesis, ingredient selection, or a routine.
- Research Atlas search using Pinecone dense retrieval fused with local BM25 reciprocal-rank fusion.
- Location-aware environmental context, exact Shapley contributions for the additive environmental surrogate, and a PEG-style explanation.
- "Check a product": paste a label's ingredient list and see which of today's steps it fits, any clash with today's routine, and safety cautions (the bulk/cohort batch path was removed in September 2026).
- Reproducible implementation, retrieval, and safety regression reports.

## Suggested demo sequence

1. Select **Presentation** for the one-click defence walkthrough: location → environment → routine → Atlas → evaluation.
2. Open **Environment**, select a location, then add a second location to compare weather, UV, PM2.5, and the configured contribution view without calling GPT.
3. Open **Ingredient Atlas**, filter a research context, then search `ceramide`, `urea`, or `retinol`. Use the bounded relationship explorer to trace a source family and open a source link from a result.
4. In **Routine Studio**, choose a profile and context, run the preview, and point out:
   - the highlighted **Synthesised routine** card;
   - the source-linked **Synthesised ingredient research context** card;
   - the labelled AI category rationale surface, if the strict gate and API billing allow it, with deterministic safety remaining final authority;
   - the environmental contribution/PEG explanation;
   - the explainable run report, then choose **Print / Save PDF**.
5. Under the routine, open **Check a product you own**, paste an ingredient list (for example `Aqua, Glycerin, Niacinamide, Salicylic Acid`) and show the step fit, clash and caution results.
6. Open **Evaluation** to show the implementation suite, the 30-query retrieval and 50-case safety packs, and the 7/7 non-clinical Context Coverage Map.
7. Optionally open **Reviewer Queue** only in a locally configured session to demonstrate bounded annotations; it is not proof of a completed clinical audit.

## Architecture

```text
Location selection
        │
        ▼
Environmental adapters ──► Environmental surrogate ──► Shapley / PEG explanation
        │
        ▼
Routine request ──► urgent-symptom redirect ──► category-only AM/PM view
        │
        ├──► generic evidence / CUE trace
        │
        └──► Pinecone 31-card segment + local BM25 Atlas RRF ──► 50-ingredient research context
```

## Evidence boundary

The Atlas stores project-authored metadata, normalisation information, source locators, and stated boundaries. It does not copy CIR reports or EWG database content. Journal cards are source mappings, not adapted outcome summaries. The dashboard is an academic technology demonstrator: it does not claim a clinical trial, treatment result, individual suitability decision, product recommendation, human-subject outcome, CUE calibration, learned environmental model, or completed expert agreement study.

## Reproduce the final checks

```sh
npm run check
npm run verify:ingredient-kb
npm run verify:demo-kb
npm run verify:demo-pinecone
npm run eval:category-coverage
npm run verify:category-coverage
npm run eval:evidence-rights
npm run eval:safety
npm run eval:safety-50
npm run eval:location
npm run eval:study
npm run eval:retrieval
```

The generated reports are kept in `data/evaluation/reports/` for review.
