# Input-sensitivity evaluation

Generated 2026-09-23 12:16 UTC by `npm run eval:input-sensitivity` in 123.5 s.

Full-factorial grid: 7 environments × 10 concerns × 4 profiles × 3 reactivity levels × 3 finish preferences × 3 exposure contexts = **7560 runs** of the deterministic pipeline (routine, safety passes, retrieved candidate pools, rule-based ingredient choice, post-selection safety, two-level explanation). GPT is not called.

Output distance measures (0 = identical, 1 = nothing in common): routine = Jaccard distance between the sets of AM/PM steps; ingredients = Jaccard distance between the sets of step→ingredient picks; text = Jaccard distance between the word sets of the explanations.

## 1. Change one input, keep the rest

| Input changed | Pairs | Routine changed | Ingredients changed | Main driver changed | Mean routine distance | Mean ingredient distance | Mean explanation-text distance |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Environment (7 weather scenarios) | 22680 | 77.1% | 58.1% | 76.2% | 0.19 | 0.23 | 0.28 |
| Concern (10) | 34020 | 20.2% | 70.3% | 32.7% | 0.07 | 0.38 | 0.24 |
| Skin profile (4) | 11340 | 0.0% | 0.0% | 0.0% | 0.00 | 0.00 | 0.00 |
| Reactivity (3) | 7560 | 45.4% | 51.5% | 0.0% | 0.19 | 0.31 | 0.20 |
| Finish preference (3) | 7560 | 5.4% | 5.4% | 0.0% | 0.02 | 0.03 | 0.01 |
| Exposure context (3) | 7560 | 38.1% | 38.1% | 0.0% | 0.07 | 0.12 | 0.08 |

## 2. Bigger input difference → bigger output difference?

Spearman rank correlation between input distance and output distance over 5000 random pairs: combined **0.22**, routine 0.17, ingredients 0.18, explanation text 0.25.

| Input distance | Pairs | Mean routine distance | Mean ingredient distance | Mean text distance |
| --- | ---: | ---: | ---: | ---: |
| 0.00–0.10 | 6 | 0.15 | 0.22 | 0.28 |
| 0.10–0.20 | 22 | 0.10 | 0.27 | 0.21 |
| 0.20–0.30 | 63 | 0.22 | 0.39 | 0.35 |
| 0.30–0.45 | 531 | 0.23 | 0.44 | 0.37 |
| 0.45–1.00 | 4378 | 0.28 | 0.56 | 0.43 |

## 3. Output diversity

Distinct routines: 22; distinct ingredient sets: 40; distinct explanations: 236 (out of 7560 runs). Runs where the final safety rescan removed an ingredient: 0. Runs flagged for review by the safety passes: 0.

| Step | How often each ingredient was picked |
| --- | --- |
| am:antioxidant-context | resveratrol 100.0% |
| am:comfort-hydration | sodium-hyaluronate 87.5%, glycerin 12.5% |
| am:daytime-photoprotection | titanium-dioxide 100.0% |
| am:light-hydration | beta-glucan 55.3%, niacinamide 31.6%, glycerin 13.2% |
| am:supportive-hydration | beta-glucan 100.0% |
| pm:barrier-support-moisturising | dimethicone 81.1%, ceramide-eop 18.9% |
| pm:lightweight-moisturising | glycerin 77.1%, niacinamide 22.9% |
| pm:overnight-comfort | madecassoside 89.9%, allantoin 10.1% |
| pm:supportive-moisturising | squalane 100.0% |
| pm:texture-renewal | gluconolactone 100.0% |

## 4. Threshold sweeps (acne context, other readings at UV 5, humidity 60%, PM2.5 20, 24 °C)

**uvi**

| Value | Steps | Ingredients | Main driver | Context score | Changed vs previous |
| ---: | --- | --- | --- | ---: | --- |
| 0 | low-irritation-cleansing, light-hydration, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | niacinamide, glycerin, gluconolactone, madecassoside | temperature | 0.40 | — |
| 1 | low-irritation-cleansing, light-hydration, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | niacinamide, glycerin, gluconolactone, madecassoside | temperature | 0.41 | no |
| 2 | low-irritation-cleansing, light-hydration, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | niacinamide, glycerin, gluconolactone, madecassoside | temperature | 0.42 | no |
| 3 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.43 | steps + ingredients |
| 4 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.44 | no |
| 5 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.45 | no |
| 6 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.46 | no |
| 7 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.47 | no |
| 8 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.48 | no |
| 9 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.49 | no |
| 10 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | uvi | 0.51 | no |
| 11 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | uvi | 0.52 | no |

**humidity**

| Value | Steps | Ingredients | Main driver | Context score | Changed vs previous |
| ---: | --- | --- | --- | ---: | --- |
| 20 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, barrier-support-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, ceramide-eop, gluconolactone, madecassoside | humidity | 0.57 | — |
| 30 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, barrier-support-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, ceramide-eop, gluconolactone, madecassoside | humidity | 0.54 | no |
| 40 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, barrier-support-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, ceramide-eop, gluconolactone, madecassoside | temperature | 0.51 | no |
| 50 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, barrier-support-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, ceramide-eop, gluconolactone, madecassoside | temperature | 0.48 | no |
| 51 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.48 | steps + ingredients |
| 60 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.45 | no |
| 70 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | humidity | 0.42 | no |
| 74 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | humidity | 0.41 | no |
| 75 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | humidity | 0.41 | no |
| 85 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | humidity | 0.38 | no |
| 95 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | humidity | 0.34 | no |

**pm25**

| Value | Steps | Ingredients | Main driver | Context score | Changed vs previous |
| ---: | --- | --- | --- | ---: | --- |
| 5 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.38 | — |
| 15 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.43 | no |
| 30 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | pm25 | 0.50 | no |
| 45 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | pm25 | 0.58 | no |
| 54 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | pm25 | 0.62 | no |
| 55 | low-irritation-cleansing, antioxidant-context, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | resveratrol, titanium-dioxide, niacinamide, gluconolactone | pm25 | 0.63 | steps + ingredients |
| 70 | low-irritation-cleansing, antioxidant-context, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | resveratrol, titanium-dioxide, niacinamide, gluconolactone | pm25 | 0.70 | no |
| 100 | low-irritation-cleansing, antioxidant-context, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | resveratrol, titanium-dioxide, niacinamide, gluconolactone | pm25 | 0.72 | no |
| 150 | low-irritation-cleansing, antioxidant-context, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | resveratrol, titanium-dioxide, niacinamide, gluconolactone | pm25 | 0.72 | no |

**temperature**

| Value | Steps | Ingredients | Main driver | Context score | Changed vs previous |
| ---: | --- | --- | --- | ---: | --- |
| 0 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.69 | — |
| 10 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.66 | no |
| 18 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | humidity | 0.54 | no |
| 24 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.45 | no |
| 30 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | humidity | 0.54 | no |
| 36 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.63 | no |
| 42 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, gluconolactone, madecassoside | temperature | 0.69 | no |

## Scope

This measures the deterministic pipeline that bounds the language model. It shows which inputs the system responds to and where it does not; it does not measure clinical appropriateness.

