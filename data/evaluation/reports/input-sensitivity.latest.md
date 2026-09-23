# Input-sensitivity evaluation

Generated 2026-09-23 17:07 UTC by `npm run eval:input-sensitivity` in 124.5 s.

Full-factorial grid: 7 environments × 10 concerns × 4 profiles × 3 reactivity levels × 3 finish preferences × 3 exposure contexts = **7560 runs** of the deterministic pipeline (routine, safety passes, retrieved candidate pools, rule-based ingredient choice, post-selection safety, two-level explanation). GPT is not called.

Output distance measures (0 = identical, 1 = nothing in common): routine = Jaccard distance between the sets of AM/PM steps; ingredients = Jaccard distance between the sets of step→ingredient picks; text = Jaccard distance between the word sets of the explanations.

## 1. Change one input, keep the rest

| Input changed | Pairs | Routine changed | Ingredients changed | Main driver changed | Mean routine distance | Mean ingredient distance | Mean explanation-text distance |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Environment (7 weather scenarios) | 22680 | 75.5% | 82.2% | 76.2% | 0.17 | 0.47 | 0.32 |
| Concern (10) | 34020 | 16.3% | 78.6% | 32.7% | 0.07 | 0.50 | 0.30 |
| Skin profile (4) | 11340 | 18.5% | 62.1% | 0.0% | 0.08 | 0.37 | 0.20 |
| Reactivity (3) | 7560 | 32.7% | 39.9% | 0.0% | 0.15 | 0.27 | 0.22 |
| Finish preference (3) | 7560 | 8.6% | 68.3% | 0.0% | 0.04 | 0.37 | 0.17 |
| Exposure context (3) | 7560 | 38.1% | 38.1% | 0.0% | 0.07 | 0.11 | 0.07 |

## 2. Bigger input difference → bigger output difference?

Spearman rank correlation between input distance and output distance over 5000 random pairs: combined **0.17**, routine 0.14, ingredients 0.13, explanation text 0.22.

| Input distance | Pairs | Mean routine distance | Mean ingredient distance | Mean text distance |
| --- | ---: | ---: | ---: | ---: |
| 0.00–0.10 | 6 | 0.10 | 0.41 | 0.32 |
| 0.10–0.20 | 22 | 0.15 | 0.48 | 0.28 |
| 0.20–0.30 | 63 | 0.20 | 0.58 | 0.40 |
| 0.30–0.45 | 531 | 0.22 | 0.64 | 0.43 |
| 0.45–1.00 | 4378 | 0.26 | 0.71 | 0.48 |

### Stratified by how many inputs differ

Random pairs dominate the far end of the input range (most random pairs differ in almost every input), so the check above says little about small changes. This check samples 600 pairs for each number of changed inputs.

| Inputs changed | Pairs | Identical output | Mean routine distance | Mean ingredient distance | Mean text distance | Mean combined |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 600 | 18.0% | 0.10 | 0.36 | 0.21 | 0.22 |
| 2 | 600 | 3.3% | 0.15 | 0.51 | 0.32 | 0.33 |
| 3 | 600 | 1.0% | 0.20 | 0.61 | 0.39 | 0.40 |
| 4 | 600 | 0.3% | 0.23 | 0.67 | 0.44 | 0.45 |
| 5 | 600 | 0.0% | 0.26 | 0.71 | 0.48 | 0.48 |
| 6 | 600 | 0.0% | 0.29 | 0.75 | 0.51 | 0.52 |

Spearman rank correlation between the number of changed inputs and the combined output distance: **0.46**.

## 3. Output diversity

Distinct routines: 35; distinct ingredient sets: 122; distinct explanations: 1675 (out of 7560 runs). Runs where the final safety rescan removed an ingredient: 0. Runs flagged for review by the safety passes: 0.

| Step | How often each ingredient was picked |
| --- | --- |
| am:antioxidant-context | resveratrol 90.0%, tocopherol 10.0% |
| am:comfort-hydration | beta-glucan 49.0%, sodium-hyaluronate 39.5%, glycerin 11.5% |
| am:daytime-photoprotection | titanium-dioxide 100.0% |
| am:light-hydration | niacinamide 51.7%, beta-glucan 25.4%, sodium-hyaluronate 22.9% |
| am:supportive-hydration | beta-glucan 58.7%, niacinamide 41.3% |
| pm:barrier-support-moisturising | squalane 58.7%, ceramide-eop 21.8%, dimethicone 13.8%, ceramide-np 5.7% |
| pm:lightweight-moisturising | glycerin 76.1%, niacinamide 23.9% |
| pm:overnight-comfort | madecassoside 73.7%, ceramide-np 14.7%, allantoin 6.9%, squalane 4.8% |
| pm:supportive-moisturising | squalane 100.0% |
| pm:texture-renewal | gluconolactone 83.3%, salicylic-acid 16.7% |

## 4. Threshold sweeps (acne context, other readings at UV 5, humidity 60%, PM2.5 20, 24 °C)

**uvi**

| Value | Steps | Ingredients | Main driver | Context score | Changed vs previous |
| ---: | --- | --- | --- | ---: | --- |
| 0 | low-irritation-cleansing, light-hydration, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | niacinamide, glycerin, salicylic-acid, madecassoside | temperature | 0.40 | — |
| 1 | low-irritation-cleansing, light-hydration, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | niacinamide, glycerin, salicylic-acid, madecassoside | temperature | 0.41 | no |
| 2 | low-irritation-cleansing, light-hydration, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | niacinamide, glycerin, salicylic-acid, madecassoside | temperature | 0.42 | no |
| 3 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | temperature | 0.43 | steps + ingredients |
| 4 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | temperature | 0.44 | no |
| 5 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | temperature | 0.45 | no |
| 6 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | temperature | 0.46 | no |
| 7 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | temperature | 0.47 | no |
| 8 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | temperature | 0.48 | no |
| 9 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | temperature | 0.49 | no |
| 10 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | uvi | 0.51 | no |
| 11 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | uvi | 0.52 | no |

**humidity**

| Value | Steps | Ingredients | Main driver | Context score | Changed vs previous |
| ---: | --- | --- | --- | ---: | --- |
| 20 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, supportive-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, squalane, salicylic-acid, madecassoside | humidity | 0.57 | — |
| 30 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, supportive-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, squalane, salicylic-acid, madecassoside | humidity | 0.54 | no |
| 40 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, supportive-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, squalane, salicylic-acid, madecassoside | temperature | 0.51 | no |
| 50 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, supportive-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, squalane, salicylic-acid, madecassoside | temperature | 0.48 | no |
| 51 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | temperature | 0.48 | steps + ingredients |
| 60 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | temperature | 0.45 | no |
| 70 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | humidity | 0.42 | no |
| 74 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | humidity | 0.41 | no |
| 75 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, allantoin | humidity | 0.41 | ingredients |
| 85 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, allantoin | humidity | 0.38 | no |
| 95 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, allantoin | humidity | 0.34 | no |

**pm25**

| Value | Steps | Ingredients | Main driver | Context score | Changed vs previous |
| ---: | --- | --- | --- | ---: | --- |
| 5 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | temperature | 0.38 | — |
| 15 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | temperature | 0.43 | no |
| 30 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | pm25 | 0.50 | no |
| 45 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | pm25 | 0.58 | no |
| 54 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | pm25 | 0.62 | no |
| 55 | low-irritation-cleansing, antioxidant-context, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | resveratrol, titanium-dioxide, niacinamide, salicylic-acid | pm25 | 0.63 | steps + ingredients |
| 70 | low-irritation-cleansing, antioxidant-context, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | resveratrol, titanium-dioxide, niacinamide, salicylic-acid | pm25 | 0.70 | no |
| 100 | low-irritation-cleansing, antioxidant-context, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | resveratrol, titanium-dioxide, niacinamide, salicylic-acid | pm25 | 0.72 | no |
| 150 | low-irritation-cleansing, antioxidant-context, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | resveratrol, titanium-dioxide, niacinamide, salicylic-acid | pm25 | 0.72 | no |

**temperature**

| Value | Steps | Ingredients | Main driver | Context score | Changed vs previous |
| ---: | --- | --- | --- | ---: | --- |
| 0 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, supportive-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, squalane, salicylic-acid, madecassoside | temperature | 0.69 | — |
| 10 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, supportive-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, squalane, salicylic-acid, madecassoside | temperature | 0.66 | no |
| 18 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | humidity | 0.54 | steps + ingredients |
| 24 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, madecassoside | temperature | 0.45 | no |
| 30 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, allantoin | humidity | 0.54 | ingredients |
| 36 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, allantoin | temperature | 0.63 | no |
| 42 | low-irritation-cleansing, daytime-photoprotection, low-irritation-cleansing, lightweight-moisturising, texture-renewal, overnight-comfort | titanium-dioxide, niacinamide, salicylic-acid, allantoin | temperature | 0.69 | no |

## B5 regression targets

`npm test` checks these on a reduced grid (`npm run eval:input-sensitivity -- --quick`).

| Target | Value | Result |
| --- | --- | --- |
| Skin profile changes the ingredients in at least 30% of pairs | 0.62 | passed |
| Finish preference changes the ingredients in at least 30% of pairs | 0.68 | passed |
| Skin profile changes the routine steps in some pairs | 0.18 | passed |
| Moving from cold to hot changes the routine steps | 1 | passed |
| Mean output distance rises with every extra changed input | 0.223 < 0.327 < 0.399 < 0.445 < 0.484 < 0.517 | passed |
| Changing one input leaves the output identical in at most 30% of pairs | 0.18 | passed |
| Spearman(changed inputs, output distance) is at least 0.30 | 0.46 | passed |

## Scope

This measures the deterministic pipeline that bounds the language model. It shows which inputs the system responds to and where it does not; it does not measure clinical appropriateness.

