# CUE against an AI rater panel (Codex, simulated raters, NOT human)

Generated 2026-11-06 by `npm run eval:cue-human`. 40 GPT-written explanation drafts, rated by 3 simulated Codex raters (rater-1, rater-2, rater-3) for whether every statement is supported by the facts the model was given. Ties count as unsupported.

## Agreement between raters

| Raters | Items | Observed agreement | Cohen's kappa |
| --- | ---: | ---: | ---: |
| rater-1 vs rater-2 | 40 | 95.0% | 0.724 |
| rater-1 vs rater-3 | 40 | 90.0% | 0.553 |
| rater-2 vs rater-3 | 40 | 95.0% | 0.805 |

## CUE verdict against the raters

Agreement 37.5%, Cohen's kappa **-0.250** (threshold 0.8).

| | Raters: supported | Raters: unsupported |
| --- | ---: | ---: |
| CUE passed (shown to the user) | 15 | **5** |
| CUE rejected (withheld or regenerated) | 20 | 0 |

CUE caught 0.0% of the drafts the raters judged unsupported. Drafts CUE passed that the raters judged unsupported: 5 of 40 (12.5%); these are the ones a user would have seen.

Note: the sheet over-samples drafts CUE rejected (up to half the sheet), so the agreement figures describe this sheet, not the live pass rate. The live pass rate is in the selection-log report.

