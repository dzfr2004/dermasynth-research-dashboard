# GPT layer contract tests

Generated 2026-09-23 by `npm run eval:gpt-layer` against a local mock of the Responses API. Result: **5/5 passed**.

| ID | Test | Result |
| --- | --- | --- |
| gpt-01 | Ingredient picker input has no score, rank or fit fields and options are alphabetical | passed |
| gpt-02 | A call is skipped once the budget is used up, and the budget records it | passed |
| gpt-03 | A slow call is cut off at the remaining budget, not the full timeout | passed |
| gpt-04 | When the explanation rewrite fails, drafts that already passed are kept | passed |
| gpt-05 | Every routine step has a rule-based reason without GPT | passed |

