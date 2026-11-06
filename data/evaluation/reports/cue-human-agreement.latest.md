# CUE against human ratings

Generated 2026-11-06 by `npm run eval:cue-human`. 40 GPT-written explanation drafts, rated blind by 2 rater(s) (rater-2, rater-3) for whether every statement is supported by the facts the model was given. Ties count as unsupported.

## Agreement between raters

| Raters | Items | Observed agreement | Cohen's kappa |
| --- | ---: | ---: | ---: |
| rater-2 vs rater-3 | 40 | 85.0% | 0.489 |

## CUE verdict against the raters

Agreement 35.0%, Cohen's kappa **-0.300** (threshold 0.8).

| | Raters: supported | Raters: unsupported |
| --- | ---: | ---: |
| CUE passed (shown to the user) | 12 | **8** |
| CUE rejected (withheld or regenerated) | 18 | 2 |

CUE caught 20.0% of the drafts the raters judged unsupported. Drafts CUE passed that the raters judged unsupported: 8 of 40 (20.0%); these are the ones a user would have seen.

Note: the sheet over-samples drafts CUE rejected (up to half the sheet), so the agreement figures describe this sheet, not the live pass rate. The live pass rate is in the selection-log report.

