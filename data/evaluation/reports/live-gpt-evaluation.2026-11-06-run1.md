# Live GPT evaluation

Generated 2026-11-06 14:00 UTC by `npm run eval:live` against http://127.0.0.1:4173. 20 routine requests over 10 cities and 4 user profiles, with live weather, air quality and GPT.

| Metric | Value |
| --- | ---: |
| Runs completed | 20 of 20 |
| GPT category selection completed | 20 (100.0%) |
| GPT ingredient-pick call completed | 20 (100.0%) |
| GPT picks accepted | 69 of 76 slots (90.8%) |
| Invented ingredient ids (rejected) | 0 (0.0%) |
| Real ingredient but outside the step's pool (rejected) | 0 |
| No pick returned | 7 |
| Accepted picks that match the top candidate score | 17 of 69 (24.6%) |
| Runs flagged degraded | 0 (0.0%) |
| Runs that used up the GPT time budget | 0 |
| Explanations shown from GPT (passed CUE) | 195 of 195 (100.0%) |
| Mean / lowest CUE of shown explanations | 1.000 / 1.000 |
| Median routine latency / GPT time within it | 8191 ms / 8183 ms |
| Median explanation latency | 6831 ms |

## Runs

| # | City | Profile / concern | Env | GPT routine | GPT picks | Degraded | Explanations shown / withheld | Routine ms |
| ---: | --- | --- | --- | --- | --- | --- | --- | ---: |
| 1 | Kuala Lumpur, MY | oily / acne | live | completed | 3/4 accepted | full | 10 / 0 | 10666 |
| 2 | Ipoh, MY | dry / dryness | live | completed | 4/4 accepted | full | 10 / 0 | 12581 |
| 3 | Singapore, SG | sensitive / redness | live | completed | 4/4 accepted | full | 10 / 0 | 9996 |
| 4 | New Delhi, IN | combination / pigment | live | completed | 4/4 accepted | full | 12 / 0 | 14685 |
| 5 | Dubai, AE | oily / acne | live | completed | 3/4 accepted | full | 10 / 0 | 11423 |
| 6 | London, GB | dry / dryness | live | completed | 3/3 accepted | full | 8 / 0 | 7757 |
| 7 | Seoul, KR | sensitive / redness | live | completed | 4/4 accepted | full | 10 / 0 | 9980 |
| 8 | Sydney, AU | combination / pigment | live | completed | 3/4 accepted | full | 10 / 0 | 7040 |
| 9 | Oslo, NO | oily / acne | live | completed | 3/4 accepted | full | 10 / 0 | 11551 |
| 10 | Cairo, EG | dry / dryness | live | completed | 3/3 accepted | full | 8 / 0 | 7110 |
| 11 | Kuala Lumpur, MY | sensitive / redness | live | completed | 4/4 accepted | full | 10 / 0 | 7347 |
| 12 | Ipoh, MY | combination / pigment | live | completed | 3/4 accepted | full | 10 / 0 | 13560 |
| 13 | Singapore, SG | oily / acne | live | completed | 3/4 accepted | full | 10 / 0 | 6442 |
| 14 | New Delhi, IN | dry / dryness | live | completed | 4/4 accepted | full | 10 / 0 | 8624 |
| 15 | Dubai, AE | sensitive / redness | live | completed | 4/4 accepted | full | 10 / 0 | 6054 |
| 16 | London, GB | combination / pigment | live | completed | 4/4 accepted | full | 10 / 0 | 12810 |
| 17 | Seoul, KR | oily / acne | live | completed | 4/4 accepted | full | 11 / 0 | 6674 |
| 18 | Sydney, AU | dry / dryness | live | completed | 3/3 accepted | full | 8 / 0 | 6217 |
| 19 | Oslo, NO | sensitive / redness | live | completed | 3/3 accepted | full | 8 / 0 | 7123 |
| 20 | Cairo, EG | combination / pigment | live | completed | 3/4 accepted | full | 10 / 0 | 7024 |

Scope: live behaviour of the GPT layer on this date, models and account. Every pick and explanation shown here also passed the deterministic safety passes. This is not a clinical evaluation.

