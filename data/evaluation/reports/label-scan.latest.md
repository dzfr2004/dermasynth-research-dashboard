# Label scan: reading a product photo (the language model's own job)

Generated 2026-11-06 by `npm run eval:label-scan -- --live`, model gpt-5.6-sol. 16 synthetic labels with fictional names and known printed ingredient lists (rotated, tinted, lightly blurred or compressed); 2 heavily blurred on purpose. The product check that follows is deterministic; this measures whether the model reads the label well enough for that check to reach the same answer as on the true list.

| Measure | Result |
| --- | ---: |
| Legible labels read | 14/14 (100%) |
| Mean ingredient recall | 100.0% |
| Mean ingredient precision (nothing invented) | 100.0% |
| Same recognised ingredients as the true list | 14/14 (100%) |
| Same clashes with the routine | 14/14 (100%) (labels with a clash: 4) |
| Same safety cautions | 14/14 (100%) (labels needing a pharmacist: 2) |
| Same overall verdict | 14/14 (100%) |
| Blurred labels refused instead of guessed | 2/2 (100%) |
| Median time per label | 2.3 s |

## Per label

| Label | Recall | Precision | Same verdict | Notes |
| --- | ---: | ---: | --- | --- |
| L01 | 100% | 100% | yes |  |
| L02 | 100% | 100% | yes |  |
| L03 | 100% | 100% | yes |  |
| L04 | 100% | 100% | yes |  |
| L05 | 100% | 100% | yes |  |
| L06 | 100% | 100% | yes |  |
| L07 | 100% | 100% | yes |  |
| L08 | 100% | 100% | yes |  |
| L09 | 100% | 100% | yes |  |
| L10 | 100% | 100% | yes |  |
| L11 | 100% | 100% | yes |  |
| L12 | 100% | 100% | yes |  |
| L13 | 100% | 100% | yes |  |
| L14 | 100% | 100% | yes |  |
| L15 (blurred) | | | | refused (correct) |
| L16 (blurred) | | | | refused (correct) |

Limits: synthetic, printed-text labels are easier than real curved, glossy packaging. A real-photo set would be the next step.
