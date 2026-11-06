# LLM ablation scored by an AI rater panel (Codex, simulated raters, NOT human)

Generated 2026-11-06 by `python3 scripts/rater-workbooks.py ablation-score`. Source: 76 logged routines up to 2026-10-01; the LLM differed from the top-scored candidate in 162 of 282 steps (47 unique situations, 40 rated). The simulated raters saw both options in random order without knowing which came from the LLM.

| Rater | Items | Prefer LLM pick | Prefer rule-based pick | Tie | Sign test p (LLM vs rule) |
| --- | ---: | ---: | ---: | ---: | ---: |
| rater-1 | 40 | 13 | 9 | 18 | 0.523 |
| rater-2 | 40 | 13 | 10 | 17 | 0.678 |
| rater-3 | 40 | 0 | 0 | 40 | n/a |
| **Majority** | 40 | **12** | **8** | 20 | 0.503 |

Interpretation: a preference for the LLM pick, or no significant difference, shows that bounding the LLM to the approved pool does not make its choices worse than the rule-based score; a significant preference for the rule-based pick would mean the LLM adds wording but not better selection. Only steps where the two differ are rated, so ties and agreements elsewhere are not counted.
