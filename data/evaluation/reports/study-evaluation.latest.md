# DermaSynth offline study evaluation report

Fixture: `data/evaluation/fixtures/study-evaluation.v1.json`
Fixture SHA-256: `cc8abce4dc15585cfbe26a4157d728008ca6a766c389cea7df663bad7a5c89bf`

Result: **113/113 passed; 0 failed.**

## Coverage

| Category | Passed | Failed | Total |
| --- | ---: | ---: | ---: |
| api_contract | 47 | 0 | 47 |
| catalogue | 3 | 0 | 3 |
| category_reference | 2 | 0 | 2 |
| ingredient_catalog | 1 | 0 | 1 |
| ingredient_knowledge_base | 2 | 0 | 2 |
| output_guardrail | 15 | 0 | 15 |
| retrieval_provenance | 3 | 0 | 3 |
| routine_template | 10 | 0 | 10 |
| triage | 30 | 0 | 30 |

## Failures

None.

## Scope and limitations

- This suite verifies implementation behaviour with synthetic fixtures; it is not clinical validation or a measure of treatment effectiveness.
- The isolated server runs with live services disabled and provider credentials explicitly blank; no live provider calls are made.
- It is not a dermatologist audit, a blinded study, an inter-rater reliability assessment, or a user-acceptance test.
- The retrieval check verifies provenance-field preservation and a deterministic coverage proxy; it does not establish retrieval relevance, faithfulness, or calibration against a judged corpus.

The accompanying JSON and CSV contain the full deterministic case-level export.
