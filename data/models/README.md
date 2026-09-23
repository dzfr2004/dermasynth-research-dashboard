# Environmental surrogate model

The environment-level explanation computes **exact Shapley values** for a small
additive surrogate, per research context:

```
f(x) = b0 + Σ_f  w_f × x_f           x_f = normalised reading (UV, low humidity, PM2.5, temperature distance from 24 °C)
φ_f  = w_f × (x_f − baseline_f)      exact Shapley value of feature f
```

For an additive model the Shapley value of each feature is exactly its term, so
the attribution is analytic and reproducible. Schema 1.2 also stores a
per-context baseline score (the fitted model evaluated at the feature
baselines), so `baseline + Σ φ_f` equals the fitted model's output.

## Fitting (September 2026 change)

`scripts/fit-environmental-surrogate.mjs` now fits the weights by
**non-negative least squares with an intercept**: every subset of the four
features is solved by ordinary least squares and the lowest-error solution with
all weights ≥ 0 is kept. It writes a fit report
(`environmental-surrogate.fit-report.md`) with R², RMSE and, for the
constructed dataset, the error against the weights that generated the data.

The previous method ("normalised covariance weighting") did not recover those
generating weights. On the same 140-row constructed dataset:

| Method | Max abs. error vs generating weights | Mean abs. error |
| --- | ---: | ---: |
| Normalised covariance weighting (July 2026) | 0.324 | 0.128 |
| Non-negative least squares (September 2026) | 0.065 | 0.017 |

For example, the old fit gave humidity a weight of 0.03 for the breakout-prone
context although the data were generated with 0.28.

## Files

- `environmental-surrogate.v1.json` — original configured weights, kept as a
  fallback.
- `environmental-context-training.v1.csv` — constructed labelled dataset (140
  rows, 10 contexts) from `scripts/generate-environmental-training.mjs`.
- `environmental-surrogate.fitted.v1.json` — the weights the app loads.
  `weightStatus` says what they were fitted to:
  `fitted_to_constructed_labelled_dataset` or
  `fitted_to_expert_labelled_scenarios`.
- `environmental-surrogate.fit-report.md` — fit quality of the current weights.
- `labelling/scenario-sheet.v1.csv` — 100 blinded scenarios (10 per context,
  Latin-hypercube design) for expert raters.
- `labelling/responses/` — raters' downloaded label files go here.

## Honest scope of the constructed data

The constructed dataset is not clinical-outcome data. Each row's target is
derived from transparent, domain-reasoned prior sensitivities plus bounded
noise. Fitting it shows that the method recovers known weights; it does not
show that the weights are clinically right. That is what the expert labels are
for.

## Replacing it with expert-labelled data

1. `npm run labelling:sheet` (already done; regenerate only if you change the
   design, because raters must all label the same sheet).
2. Start the app and send each rater to `http://127.0.0.1:4173/labelling`.
   They enter a rater code (not their name), rate every scenario 1–5 and
   download `labels-<code>.csv`. Ratings are blinded: raters never see the
   system's output.
3. Put every file in `data/models/labelling/responses/`.
4. `npm run labelling:import` validates the files, reports inter-rater
   agreement (quadratic-weighted Cohen's kappa per rater pair and the mean) and
   writes `environmental-context-training.expert.v1.csv` (target = mean rating
   mapped to 0–1).
5. `npm run fit:environmental-expert` refits the surrogate on the expert labels.
   Restart the server; the Environment view then reports "fitted to
   expert-labelled scenarios".

With 10 scenarios per context and 5 fitted parameters per context, use at
least two raters and treat per-context R² below about 0.5 as a sign that the
context needs more scenarios.

## Reproduce the constructed fit

```sh
npm run fit:environmental-default   # generate dataset + fit in one step
```
