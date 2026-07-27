# Environmental surrogate model

The explainability layer computes **exact Shapley values** for a small additive
environmental surrogate:

```
f(x) = baseline + Σ ( weight_i × (normalised_feature_i − feature_baseline_i) )
```

For an additive model, each feature's Shapley value is exactly its additive
term, so the attribution is analytic and reproducible.

## Files

- `environmental-surrogate.v1.json` — original **configured** weights
  (`weightStatus: configured_study_demo_parameters`). Kept as a fallback.
- `environmental-context-training.v1.csv` — the **labelled training dataset**
  (140 rows, 10 research contexts) produced by
  `scripts/generate-environmental-training.mjs`.
- `environmental-surrogate.fitted.v1.json` — the **fitted** weights
  (`weightStatus: fitted_to_documented_labelled_context_dataset`) produced by
  `scripts/fit-environmental-surrogate.mjs`. When present,
  `lib/explainability.mjs` loads this in preference to the configured file.

## Reproduce

```sh
npm run fit:environmental-default   # generate dataset + fit in one step
```

## Honest scope of the training data

The dataset is a **constructed research dataset**, not clinical-outcome data.
Each row's `target_context_score` is derived from transparent, domain-reasoned
prior sensitivities (how strongly each environmental signal is expected to shape
a given cosmetic research context), sampled across realistic environmental
ranges with a fixed random seed and bounded variation. Fitting estimates the
relative feature importances from these labelled rows via normalised covariance
weighting.

This makes the surrogate weights genuinely *fitted to data* and fully
reproducible, but it does **not** represent measured skin outcomes, efficacy, or
a clinically validated model. The surrogate remains an explainability artifact
for a non-clinical research demonstrator.
