# AI rater panel (Codex) - NOT human ratings

The files in this folder were produced by OpenAI Codex acting as three simulated
raters on 6 November 2026. They are not human judgements and must never be
reported as a human evaluation, inter-rater study or user study.

They may be cited only as an "LLM-as-judge panel" (a second, independent model
family checking CUE and the ablation pairs), with that label, and as weaker
evidence than human ratings.

- cue/: simulated ratings of the 40 CUE drafts (cue-rating-sheet.csv)
- ablation/: simulated preferences for the 40 LLM-vs-rule pairs
- cue-human-agreement.latest.*, llm-ablation.latest.md: reports scored from
  these files with the human-rating scripts, kept for reference only.

Human rating folders (cue-rating/ratings/, ablation/ratings/) are empty again
and wait for real raters.

## Also produced by Codex on 6 November 2026

- independent/: a 30-case "independent" triage and safety set and its eval:independent
  report. The cases were written by Codex, not by a person who had not seen the rules,
  so they are not independent evidence and are not reported anywhere.
- expert-review/: Codex's answers to the expert-review form (pairs, lists, routines).
  This is not a pharmacist or clinician review and is not reported anywhere. Safety
  rules are instead traced to published sources (data/ingredients/safety-rule-sources.v1.json).

The blank templates were regenerated in data/evaluation/independent/ and
data/evaluation/expert-review/ for real reviewers.
