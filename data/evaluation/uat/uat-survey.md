# DermaSynth — User Acceptance Test (UAT) instrument

A small, self-administered acceptance test for the research prototype. It
combines the standard **System Usability Scale (SUS)** with a few domain items
specific to this project (environment-awareness, explanation trust, safety
confidence). It measures perceived usability and acceptance of the prototype;
it is **not** a clinical outcome study.

## How to run

1. Ask each participant to complete a short, scripted walkthrough (select a
   location → view environment/UV → run a routine preview → open the
   explanation and run report).
2. Have them fill one row in `uat-responses.template.csv` (copy it to
   `uat-responses.csv`). All Likert items are 1–5 (1 = Strongly disagree,
   5 = Strongly agree).
3. Score: `npm run eval:uat` (reads `uat-responses.csv`, writes a report to
   `data/evaluation/reports/uat.latest.json` and `.md`).

Aim for ~5–12 participants for an indicative small-sample UAT. Report the mean
SUS with the standard adjective rating, and summarise the domain items.

## SUS items (q1–q10, alternating positive/negative — do not reorder)

1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.

## Domain items (d1–d4, 1–5 agreement)

- d1: The routine preview clearly reflected the current environmental
  conditions (UV, humidity, temperature, air quality).
- d2: The explanation (contribution breakdown and plain-language rationale)
  helped me understand *why* the preview was shown.
- d3: I felt confident that the system would not suggest an unsafe or
  contraindicated combination.
- d4: I understood that this is a non-clinical research preview, not medical
  advice.

`comments` is an optional free-text column (kept local; do not record
identifiers).
