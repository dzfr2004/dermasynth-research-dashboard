# Result-impact feature tests

Generated 2026-09-24 by `npm run eval:impact`. Result: **8/8 passed**.

| ID | Test | Result |
| --- | --- | --- |
| imp-01 | Ingredient lists split on commas, new lines and bullets; bracketed names and percentages are handled | passed |
| imp-02 | A product with the chosen ingredient fits that step exactly | passed |
| imp-03 | A clash with today's routine is reported from the incompatibility matrix | passed |
| imp-04 | Prescription-only ingredients get a stop caution | passed |
| imp-05 | Strong exfoliants are flagged for reactive skin only | passed |
| imp-06 | Unknown ingredients are counted as not checked, never guessed | passed |
| imp-07 | Sunscreen is planned on today's peak UV, not the reading at build time | passed |
| imp-08 | Changes since last time: steps and readings are described in plain words | passed |

