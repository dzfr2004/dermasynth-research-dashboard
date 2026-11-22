# CUE against human ratings

CUE is the automatic check that decides whether a GPT-written explanation is shown or withheld. This folder holds the evidence that CUE agrees with people.

## Steps

1. Collect live explanations: start the app with live services on and run `npm run eval:live` (or use the app normally). Every draft GPT writes, its facts and CUE's verdict are logged to `data/logs/context-log.jsonl`.
2. Build the sheet: `npm run cue:sheet` (default 60 items: up to half are drafts CUE rejected, the rest a random sample of drafts it passed, so both verdicts are represented; rejected drafts are over-sampled compared with real use, so report this). This writes:
   - `cue-rating-sheet.csv`: give this to each rater;
   - `cue-rating-key.json`: CUE's verdicts. Do not share it with raters.
3. Each rater fills the `supported` column with `yes` or `no` for every row: **yes** only if every statement in `text_to_rate` can be read directly from `facts_given_to_the_model`. General knowledge does not count. Use `notes` for anything unclear.
4. Save each filled sheet in `ratings/` as `<rater-name>.csv` (for example `ratings/supervisor.csv`).
5. Score: `npm run eval:cue-human`. The report goes to `data/evaluation/reports/cue-human-agreement.latest.md`.

Two or more raters are recommended so that agreement between raters (Cohen's kappa) can be reported next to CUE's agreement with them.
