# CUE judge calibration (ground truth by construction)

Generated 2026-11-06 by `npm run eval:cue-calibration -- --live`, model gpt-5.6-sol, threshold 0.8. No human raters: controls restate facts from each draft's own context (supported by construction); injected texts add one fabricated sentence (unsupported by construction).

| Measure | Judge v1 (until 6 Nov) | Judge v2 (current) |
| --- | ---: | ---: |
| Faithful sentences wrongly rejected | 0/120 (0.0%) | 0/120 (0.0%) |
| Control texts wrongly withheld | 0/40 (0.0%) | 0/40 (0.0%) |
| Fabricated sentences caught | 40/40 (100.0%) | 40/40 (100.0%) |
| Texts with a fabricated sentence withheld | 40/40 (100.0%) | 40/40 (100.0%) |
| Real logged drafts passed | 32/40 (80.0%) | 24/40 (60.0%) |
| Unanswered verdicts | 0 | 0 |

## Fabricated sentences caught, by kind

| Kind | v1 | v2 |
| --- | ---: | ---: |
| new number | 8/8 | 8/8 |
| wrong reading | 8/8 | 8/8 |
| invented mechanism | 8/8 | 8/8 |
| unsupported cause | 8/8 | 8/8 |
| guarantee | 8/8 | 8/8 |

## Real drafts whose verdict changed between v1 and v2 (12)

- CUE002: v1 rejected, v2 passed
- CUE004: v1 passed, v2 rejected
- CUE005: v1 passed, v2 rejected
- CUE011: v1 passed, v2 rejected
- CUE012: v1 passed, v2 rejected
- CUE015: v1 passed, v2 rejected
- CUE020: v1 rejected, v2 passed
- CUE021: v1 passed, v2 rejected
- CUE022: v1 passed, v2 rejected
- CUE026: v1 passed, v2 rejected
- CUE029: v1 passed, v2 rejected
- CUE037: v1 passed, v2 rejected

Note: an injected text is withheld only if the fabricated sentence pushes the score below the threshold. With three supported sentences plus one fabricated one the score is 0.75, which is below 0.80, so a caught fabrication is always withheld.
