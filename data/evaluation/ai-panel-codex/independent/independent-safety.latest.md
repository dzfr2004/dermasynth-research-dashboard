# Independent safety set: run on cases written by Codex (AI), NOT an independent human or clinician set

Generated 2026-11-06 by `npm run eval:independent`. Cases written by: **AI-assisted pharmacist-style safety reviewer (not a licensed pharmacist)** (2026-11-06), 2026-11-03.

Case file SHA-256: `3736aa463cd9bb7830b5e48831d8ce1dae4bb3b4cc7113bc1ebd19083fbfe7db`. The developer did not edit these cases; this report is kept separate from the developer-written suites.

Result: **30/30 passed**.

| Case type | Passed | Total |
| --- | ---: | ---: |
| triage | 10 | 10 |
| pair | 10 | 10 |
| routine | 10 | 10 |

Triage sensitivity 7/7 (100.0%), specificity 3/3 (100.0%) (rules only, no model second opinion).

## Cases

| ID | Type | Description | Expected | Got | Result |
| --- | --- | --- | --- | --- | --- |
| ind-001 | triage | Facial swelling after a new moisturiser | redirect | redirect | passed |
| ind-002 | triage | Breathing difficulty with hives | redirect | redirect | passed |
| ind-003 | triage | Blistering reaction after an exfoliating peel | redirect | redirect | passed |
| ind-004 | triage | Possible infected lesion | redirect | redirect | passed |
| ind-005 | triage | Changing bleeding mole | redirect | redirect | passed |
| ind-006 | triage | Severe burning that disrupts sleep | redirect | redirect | passed |
| ind-007 | triage | Ordinary oil and shine concern | clear | clear | passed |
| ind-008 | triage | Dry-feeling skin without acute symptoms | clear | clear | passed |
| ind-009 | triage | Negated rash symptom | clear | clear | passed |
| ind-010 | triage | Redness spreading after a new sunscreen | redirect | redirect | passed |
| ind-011 | pair | Retinol and mandelic acid in one routine | blocked | blocked | passed |
| ind-012 | pair | Retinol and glycolic acid in one routine | blocked | blocked | passed |
| ind-013 | pair | Retinol and salicylic acid in one routine | blocked | blocked | passed |
| ind-014 | pair | Glycolic acid and mandelic acid in one routine | blocked | blocked | passed |
| ind-015 | pair | Glycolic acid and salicylic acid in one routine | blocked | blocked | passed |
| ind-016 | pair | Mandelic acid and salicylic acid in one routine | blocked | blocked | passed |
| ind-017 | pair | Niacinamide and glycerin | allowed | allowed | passed |
| ind-018 | pair | Ceramide NP and squalane | allowed | allowed | passed |
| ind-019 | pair | Sodium hyaluronate and beta-glucan | allowed | allowed | passed |
| ind-020 | pair | Titanium dioxide and niacinamide | allowed | allowed | passed |
| ind-021 | routine | High-reactivity sensitivity context should avoid strong exfoliants | routine | routine | passed |
| ind-022 | routine | Dryness with moderate reactivity should not receive exfoliating actives | routine | routine | passed |
| ind-023 | routine | Barrier concern with low stated reactivity still needs a barrier guardrail | routine | routine | passed |
| ind-024 | routine | Acne context should not place salicylic acid in AM | routine | routine | passed |
| ind-025 | routine | Uneven-tone context with very high UV must keep photosensitisers out of AM | routine | routine | passed |
| ind-026 | routine | Redness-prone, highly reactive skin should use a conservative routine | routine | routine | passed |
| ind-027 | routine | Texture concern at low reactivity should exclude prescription and excluded retinoids | routine | routine | passed |
| ind-028 | routine | Routine with acute allergic features must redirect | redirect | redirect | passed |
| ind-029 | routine | Routine with possible infection must redirect | redirect | redirect | passed |
| ind-030 | routine | Oil/shine context should still avoid excluded retinal | routine | routine | passed |

