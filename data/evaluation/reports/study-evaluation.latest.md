# DermaSynth offline study evaluation report

Fixture: `data/evaluation/fixtures/study-evaluation.v1.json`
Fixture SHA-256: `1354df851ebd11af90ead2453a00f9ef2db73c345143bd1b708d38b1637c478f`

Result: **92/92 passed; 0 failed.**

## Coverage

| Category | Passed | Failed | Total |
| --- | ---: | ---: | ---: |
| api_contract | 32 | 0 | 32 |
| catalogue | 2 | 0 | 2 |
| ingredient_catalog | 1 | 0 | 1 |
| ingredient_knowledge_base | 2 | 0 | 2 |
| output_guardrail | 15 | 0 | 15 |
| retrieval_provenance | 3 | 0 | 3 |
| routine_template | 7 | 0 | 7 |
| triage | 30 | 0 | 30 |

## Failures

None.

## Scope and limitations

- This suite verifies implementation behaviour with synthetic fixtures; it is not clinical validation or a measure of treatment effectiveness.
- The isolated server runs with live services disabled and provider credentials explicitly blank; no live provider calls are made.
- It is not a dermatologist audit, a blinded study, an inter-rater reliability assessment, or a user-acceptance test.
- The retrieval check verifies provenance-field preservation and a deterministic coverage proxy; it does not establish retrieval relevance, faithfulness, or calibration against a judged corpus.

The accompanying JSON and CSV contain the full deterministic case-level export.
