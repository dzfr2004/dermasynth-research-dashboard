# Live GPT evaluation

Generated 2026-11-06 14:27 UTC by `npm run eval:live` against http://127.0.0.1:4173. 20 routine requests over 10 cities and 4 user profiles, with live weather, air quality and GPT.

| Metric | Value |
| --- | ---: |
| Runs completed | 20 of 20 |
| GPT category selection completed | 20 (100.0%) |
| GPT ingredient-pick call completed | 20 (100.0%) |
| GPT picks accepted | 76 of 76 slots (100.0%) |
| Invented ingredient ids (rejected) | 0 (0.0%) |
| Real ingredient but outside the step's pool (rejected) | 0 |
| No pick returned | 0 |
| Accepted picks that match the top candidate score | 22 of 76 (28.9%) |
| Runs flagged degraded | 0 (0.0%) |
| Runs that used up the GPT time budget | 0 |
| Explanations shown from GPT (passed CUE) | 194 of 194 (100.0%) |
| Mean / lowest CUE of shown explanations | 1.000 / 1.000 |
| Median routine latency / GPT time within it | 8653 ms / 8644 ms |
| Median explanation latency | 6413 ms |

## Runs

| # | City | Profile / concern | Env | GPT routine | GPT picks | Degraded | Explanations shown / withheld | Routine ms |
| ---: | --- | --- | --- | --- | --- | --- | --- | ---: |
| 1 | Kuala Lumpur, MY | oily / acne | live | completed | 4/4 accepted | full | 10 / 0 | 12069 |
| 2 | Ipoh, MY | dry / dryness | live | completed | 4/4 accepted | full | 10 / 0 | 8519 |
| 3 | Singapore, SG | sensitive / redness | live | completed | 4/4 accepted | full | 10 / 0 | 8945 |
| 4 | New Delhi, IN | combination / pigment | live | completed | 4/4 accepted | full | 11 / 0 | 11002 |
| 5 | Dubai, AE | oily / acne | live | completed | 4/4 accepted | full | 10 / 0 | 8400 |
| 6 | London, GB | dry / dryness | live | completed | 3/3 accepted | full | 8 / 0 | 6642 |
| 7 | Seoul, KR | sensitive / redness | live | completed | 4/4 accepted | full | 10 / 0 | 10247 |
| 8 | Sydney, AU | combination / pigment | live | completed | 4/4 accepted | full | 10 / 0 | 15056 |
| 9 | Oslo, NO | oily / acne | live | completed | 4/4 accepted | full | 10 / 0 | 7903 |
| 10 | Cairo, EG | dry / dryness | live | completed | 3/3 accepted | full | 8 / 0 | 10294 |
| 11 | Kuala Lumpur, MY | sensitive / redness | live | completed | 4/4 accepted | full | 10 / 0 | 6470 |
| 12 | Ipoh, MY | combination / pigment | live | completed | 4/4 accepted | full | 10 / 0 | 8787 |
| 13 | Singapore, SG | oily / acne | live | completed | 4/4 accepted | full | 10 / 0 | 10819 |
| 14 | New Delhi, IN | dry / dryness | live | completed | 4/4 accepted | full | 10 / 0 | 6011 |
| 15 | Dubai, AE | sensitive / redness | live | completed | 4/4 accepted | full | 10 / 0 | 6739 |
| 16 | London, GB | combination / pigment | live | completed | 4/4 accepted | full | 10 / 0 | 5025 |
| 17 | Seoul, KR | oily / acne | live | completed | 4/4 accepted | full | 11 / 0 | 11840 |
| 18 | Sydney, AU | dry / dryness | live | completed | 3/3 accepted | full | 8 / 0 | 5602 |
| 19 | Oslo, NO | sensitive / redness | live | completed | 3/3 accepted | full | 8 / 0 | 6139 |
| 20 | Cairo, EG | combination / pigment | live | completed | 4/4 accepted | full | 10 / 0 | 12176 |

Scope: live behaviour of the GPT layer on this date, models and account. Every pick and explanation shown here also passed the deterministic safety passes. This is not a clinical evaluation.

