# CUE threshold analysis

Generated 2026-11-05 by `python3 scripts/analyse-cue-threshold.py`. Source: 92 routines in the context log before 2026-10-01; 887 scored drafts, of which 834 were first attempts (judge: {'llm_judge': 877, 'lexical_fallback_after_judge_error': 10}).

## First-attempt drafts that would pass at each threshold

| Threshold | Drafts passing | Share |
| ---: | ---: | ---: |
| 0.50 | 822 | 98.6% |
| 0.60 | 811 | 97.2% |
| 0.67 | 786 | 94.2% |
| 0.70 | 786 | 94.2% |
| 0.75 | 786 | 94.2% |
| 0.80 (current) | 776 | 93.0% |
| 0.90 | 776 | 93.0% |
| 1.00 | 776 | 93.0% |

## Score distribution (first attempts)

| CUE score | Drafts |
| ---: | ---: |
| 0.00 | 11 |
| 0.33 | 1 |
| 0.50 | 11 |
| 0.60 | 1 |
| 0.67 | 24 |
| 0.75 | 10 |
| 1.00 | 776 |

## Findings

- No first-attempt draft scored between 0.80 and 1.00 (0 drafts). Drafts contain few claims, so a single unsupported claim already lowers the score to 0.75 (3 of 4) or below.
- In this data the 0.80 gate therefore behaved exactly like a strict "every claim supported" rule: it passed the same 776 drafts as a threshold of 1.00.
- Drafts that passed but still listed an unsupported claim: 0.
- A lower threshold (0.75 or 0.67) would have let drafts with an unsupported claim through; the 0.80 value, taken from RAGAS-style faithfulness practice, keeps tolerance for longer explanations without admitting any in the observed data.
- Limitation: these are CUE's own scores. Whether CUE judges claims as people would is measured separately by the human rating (eval:cue-human).
