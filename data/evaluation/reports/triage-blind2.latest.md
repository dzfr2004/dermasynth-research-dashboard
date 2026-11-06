# Triage: second blind set

Generated 2026-11-06 by `npm run eval:triage-blind -- --llm`. 40 cases (25 need professional care, 15 should clear), written from NHS and DermNet red-flag guidance by someone other than the rule author, after the rules were frozen.

## First blind run (recorded once, never overwritten)

| Method | Date | Sensitivity | Specificity | Missed | False alarms | Model errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Rules alone | 2026-11-06 | 15/25 (60.0%) | 15/15 (100.0%) | 10 | 0 | 0 |
| Rules + GPT second opinion | 2026-11-06 | 25/25 (100.0%) | 15/15 (100.0%) | 0 | 0 | 0 |

## By case type (this run)

| Case type | Rules alone | Rules + GPT second opinion |
| --- | ---: | ---: |
| symptom | 22/22 | 22/22 |
| manglish | 5/5 | 5/5 |
| cosmetic | 10/10 | 10/10 |
| negation | 3/3 | 3/3 |

## Errors (this run)

**Rules alone**

- none

**Rules + GPT second opinion**

- none

Rule files at first run: triage f5aa8ee21f1ac29e, safety 8ddf991c42042311. Current: triage e5282565261ba7d2, safety 8ddf991c42042311.
Limits: 40 cases written by an AI assistant from public guidance, not by a clinician; Malay and mixed-language cases test a language the rules were not designed for.
