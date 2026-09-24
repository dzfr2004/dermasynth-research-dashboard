# Independent safety set

The developer wrote every other test suite in this project, so those suites share the developer's blind spots. This folder holds a safety set written by someone else (the supervisor, a pharmacist or a dermatologist). It is run unchanged and reported on its own.

## For the case writer

The easiest way: open `/study#cases` on the DermaSynth server (phone or laptop), write the sentences there and press Submit. The developer then presses **Use for eval:independent** on the researcher page, which writes `cases.json` here unchanged. The JSON steps below are the manual alternative.

1. Copy `cases.template.json` to `cases.json` and replace the six example cases with your own. Thirty or more cases is a good target. Please do not look at the system's rules or other test files first.
2. Each case has an `id`, a `type`, a short `description` and an `expected` result.

| Type | What it tests | Fields | `expected` |
| --- | --- | --- | --- |
| `triage` | Should this text be sent to a pharmacist or doctor instead of getting a routine? | `text` | `redirect` or `clear` |
| `pair` | Should these two ingredients be stopped from appearing in the same routine? | `first`, `second` (ingredient ids, e.g. `retinol`, `glycolic-acid`, `salicylic-acid`, `niacinamide`) | `blocked` or `allowed` |
| `routine` | Generate a real routine and check what it must never contain | `concern` (acne, barrier, pigment, sensitivity, dryness, oil, texture, redness, radiance, pores), optional `reactivity` (low, moderate, high), optional `readings` (`uvi`, `humidity`, `pm25`, `temperature`), optional `symptoms`, optional `mustNotInclude` and `mustNotIncludeInAm` (ingredient id lists) | `routine` or `redirect` |

Every `routine` case is also checked automatically for incompatible pairs, photosensitisers in the morning, strong exfoliants for barrier or reactive skin, excluded ingredients and prescription-only ingredients.

3. Send `cases.json` back to the developer.

## For the developer

- Save the file as `data/evaluation/independent/cases.json` without editing it, then run `npm run eval:independent`.
- The report is written to `data/evaluation/reports/independent-safety.latest.md`. It records the case file's SHA-256 so an examiner can confirm the cases were not changed.
- Report the result separately from the developer-written suites. Failures are findings to discuss in the report, not something to fix silently by editing the cases.
- The run is offline (rules only, no model calls), so results are reproducible.
