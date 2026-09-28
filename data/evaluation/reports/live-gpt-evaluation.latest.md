# Live GPT evaluation

Generated 2026-09-28 07:21 UTC by `npm run eval:live` against http://127.0.0.1:4173. 20 routine requests over 10 cities and 4 user profiles, with live weather, air quality and GPT.

| Metric | Value |
| --- | ---: |
| Runs completed | 20 of 20 |
| GPT category selection completed | 20 (100.0%) |
| GPT ingredient-pick call completed | 19 (95.0%) |
| GPT picks accepted | 72 of 72 slots (100.0%) |
| Invented ingredient ids (rejected) | 0 (0.0%) |
| Real ingredient but outside the step's pool (rejected) | 0 |
| No pick returned | 0 |
| Accepted picks that match the top candidate score | 28 of 72 (38.9%) |
| Runs flagged degraded | 0 (0.0%) |
| Runs that used up the GPT time budget | 0 |
| Explanations shown from GPT (passed CUE) | 188 of 190 (98.9%) |
| Mean / lowest CUE of shown explanations | 1.000 / 1.000 |
| Median routine latency / GPT time within it | 13788 ms / 13781 ms |
| Median explanation latency | 15158 ms |

## Runs

| # | City | Profile / concern | Env | GPT routine | GPT picks | Degraded | Explanations shown / withheld | Routine ms |
| ---: | --- | --- | --- | --- | --- | --- | --- | ---: |
| 1 | Kuala Lumpur, MY | oily / acne | live | completed | 4/4 accepted | full | 10 / 0 | 24928 |
| 2 | Ipoh, MY | dry / dryness | live | completed | 4/4 accepted | full | 10 / 0 | 14044 |
| 3 | Singapore, SG | sensitive / redness | live | completed | 4/4 accepted | full | 10 / 0 | 13392 |
| 4 | New Delhi, IN | combination / pigment | live | completed | 4/4 accepted | full | 10 / 0 | 18121 |
| 5 | Dubai, AE | oily / acne | live | completed | 4/4 accepted | full | 12 / 0 | 13525 |
| 6 | London, GB | dry / dryness | live | completed | 3/3 accepted | full | 8 / 0 | 13824 |
| 7 | Seoul, KR | sensitive / redness | live | completed | 4/4 accepted | full | 10 / 0 | 20076 |
| 8 | Sydney, AU | combination / pigment | live | completed | 4/4 accepted | full | 10 / 0 | 16970 |
| 9 | Oslo, NO | oily / acne | live | completed | 4/4 accepted | full | 10 / 0 | 13788 |
| 10 | Cairo, EG | dry / dryness | live | completed | 0/0 accepted | full | 5 / 0 | 8955 |
| 11 | Kuala Lumpur, MY | sensitive / redness | live | completed | 4/4 accepted | full | 10 / 0 | 18640 |
| 12 | Ipoh, MY | combination / pigment | live | completed | 4/4 accepted | full | 10 / 0 | 10967 |
| 13 | Singapore, SG | oily / acne | live | completed | 4/4 accepted | full | 10 / 0 | 15889 |
| 14 | New Delhi, IN | dry / dryness | live | completed | 3/3 accepted | full | 8 / 0 | 12195 |
| 15 | Dubai, AE | sensitive / redness | live | completed | 4/4 accepted | full | 11 / 0 | 11395 |
| 16 | London, GB | combination / pigment | live | completed | 4/4 accepted | full | 10 / 0 | 12517 |
| 17 | Seoul, KR | oily / acne | live | completed | 4/4 accepted | full | 10 / 0 | 12725 |
| 18 | Sydney, AU | dry / dryness | live | completed | 3/3 accepted | full | 7 / 1 | 12541 |
| 19 | Oslo, NO | sensitive / redness | live | completed | 3/3 accepted | full | 8 / 0 | 12025 |
| 20 | Cairo, EG | combination / pigment | live | completed | 4/4 accepted | full | 9 / 1 | 18776 |

Scope: live behaviour of the GPT layer on this date, models and account. Every pick and explanation shown here also passed the deterministic safety passes. This is not a clinical evaluation.

