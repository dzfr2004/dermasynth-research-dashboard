# CIR / EWG factual-context cards (rights-safe grounding)

This folder upgrades CIR/EWG from *link-only* to genuine retrieval grounding
**without copying protected text**. The rule:

> Facts are not copyrightable; the specific expression is. Store your own
> short, paraphrased factual summary of a published conclusion, plus a source
> locator — never verbatim assessment text, tables, or figures.

## What a card may contain

- A **provenance statement** that is verifiably true: e.g. *"The CIR Expert Panel
  has published a safety assessment covering [ingredient]; see the linked
  report."*
- A **paraphrased factual conclusion** you have read and confirmed, in your own
  words: e.g. *"CIR concluded [ingredient] is safe in the present practices of
  use and concentration."* (Paraphrase — do not quote.)
- An **EWG reference**: e.g. *"[ingredient] appears in the EWG Skin Deep database
  with a stated hazard score of N; see source."* (Attribute; do not bulk-copy.)

## What a card must NOT contain

Verbatim CIR/EWG text, copied tables/figures, full hazard datasets, or any
invented conclusion. If you have not read the source, leave
`verification_status` as `unverified_needs_source_read` — such cards are kept
out of strict CUE and synthesis until verified.

## Workflow

1. Copy `cir-ewg-factual-context.template.jsonl` and add one card per line.
2. Read each CIR report / EWG entry, paraphrase the conclusion, set
   `verification_status: "verified_paraphrase"` and record who verified it.
3. Dry-run validate (no upload):
   `npm run ingest:evidence -- --file data/evidence/cir-ewg/cir-ewg-factual-context.seed.v1.jsonl`
4. When cleared, upload to the isolated research namespace with
   `--research-upload --namespace demo-...` (never the ordinary namespace until
   qualified review).

These files live in a subfolder so they are **not** swept into the default
`data/evidence` validation until you deliberately point `--file` at them.

## Files in this folder

- `cir-ewg-factual-context.template.jsonl` — one-line template.
- `cir-ewg-factual-context.seed.v1.jsonl` — early hand seed (unverified).
- `cir-ewg-factual-context.scaffold-50.v1.jsonl` — **auto-generated** CIR + EWG
  cards for all 50 Atlas ingredients (100 cards), all `unverified`. Regenerate
  with `npm run data:cir-ewg-cards`.
- `cir-factual-context.verified.batch1.v1.jsonl` — batch 1 (6 cards):
  Niacinamide, Salicylic Acid, Glycerin, Tocopherol, Urea, Sodium Hyaluronate.
- `cir-factual-context.verified.batch2.v1.jsonl` — batch 2 (8 cards):
  Zinc Oxide, Dexpanthenol/Panthenol, Allantoin, Ascorbic Acid, Retinol,
  Retinyl Palmitate, Colloidal Oatmeal, Squalane.

### Verification progress — COMPLETE (50 / 50)

All 50 Atlas ingredients now have a source-verified card; the full set
dry-run validates as 50 records with no duplicate document IDs.

- **46** cards are `verified_paraphrase` (a read CIR/SCCS/EU conclusion,
  paraphrased with attribution + source link).
- **4** cards are `verified_status_no_dedicated_assessment` — an honest record
  that **no dedicated cosmetic panel opinion exists**, not a safety conclusion:
  Ectoin, Retinal (retinaldehyde), Mandelic Acid, Tranexamic Acid.

Files (all dry-run validated):
- `cir-factual-context.verified.batch1..5.v1.jsonl` — CIR conclusions.
- `regulatory-factual-context.verified.batch6.v1.jsonl` — CIR + EU SCCS / FDA /
  EU-regulation cards.
- `factual-context.verified.batch7.v1.jsonl` — final 6 (Centella triterpenes,
  beta-glucan, plus the status cards).

Source families used where CIR had no assessment: **SCCS** (Alpha-Arbutin,
Titanium Dioxide, Retinal context), **EU-regulation** (Piroctone Olamine),
**regulatory-status** (Tranexamic Acid, Ectoin, Mandelic Acid). Petrolatum is a
CIR-deferred-to-FDA card.

Every card is a web-search-assisted draft with `clinical_review_status: pending`
and `routine_selection_allowed: false`; a qualified reviewer must reconfirm each
against its source before anything is set to approved/activated. The
`cir-ewg-factual-context.scaffold-50.v1.jsonl` file remains as the regenerable
template and is **not** ingested alongside the verified set (it would duplicate).
- EWG ratings: left **unverified by design** — Skin Deep scores change over
  time, so freeze one only with a recorded "date checked".
- `verified_by` on batch 1 marks these as web-search-assisted drafts; a
  qualified reviewer must reconfirm against each source PDF, and
  `clinical_review_status` stays `pending` (no activation without qualified
  review).

## Honest scope

CIR remains citation/paraphrase-with-attribution; EWG remains
reference-with-attribution. The Atlas stores project-authored factual summaries
and source locators, not the source corpora themselves.
