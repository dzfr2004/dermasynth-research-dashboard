# Codex prompt: Category-level ingredient reference panel

Paste the block below into Codex as-is. Adjust file/line references if the
codebase has moved since this was written.

---

## Task

Add a **category-level ingredient reference panel** to the DermaSynth
dashboard. This is a general-education addition, not a personalization
feature — read the constraints section carefully before writing any code,
because the safety boundary is the entire point of this change.

## Context

The AM/PM routine (`lib/safety.mjs`, `createCategoryRoutine`) outputs only
fixed category labels (e.g. "Daytime photoprotection category") for a
specific user's profile + concern + environment. That contract must not
change. Named ingredients must never appear inside an individualized routine
step, step note, or anything derived from a specific user's inputs.

Separately, `lib/ingredients.mjs` already has a working pattern for this
exact distinction: `ingredientResearchForConcern()` returns candidate
ingredient names as an "audit-only appendix," explicitly marked
`routineSelectionAllowed: false`, with a `rationale` explaining the names are
retained for research/audit purposes and "not selected for this routine."
That's the right shape — general reference content, structurally decoupled
from the routine's decision logic. `lib/ingredient-knowledge.mjs` has the
larger 50-ingredient Atlas with the same posture (`GET /api/knowledge-explorer`,
`ingredientResearchExplorer`).

## What to build

1. **New pure function** `categoryReferenceExamples(categoryId)` in
   `lib/ingredients.mjs` (or a new `lib/category-reference.mjs` if cleaner).
   Input: a `ROUTINE_CATEGORY_CATALOG` key from `lib/safety.mjs` (e.g.
   `"daytime-photoprotection"`, `"lightweight-moisturising"`). Output: a small
   list (2-4 max) of ingredient *class* examples commonly associated with that
   category in general skincare literature — e.g. for
   `"daytime-photoprotection"`: `["mineral filters (e.g. zinc oxide)",
   "chemical filters (e.g. avobenzone)"]`. Pull these from the existing
   ingredient Atlas (`ingredient-knowledge.mjs`) where possible so the
   examples stay source-linked, not hardcoded prose.
   - This function must take **only** a category ID as input. No profile,
     concern, symptoms, environment, or evidence-retrieval result may be
     passed in or influence the output. Same category ID always returns the
     same examples, regardless of who's asking or why. This is the property
     that keeps it "general reference" instead of "recommendation" — enforce
     it structurally, not just by convention, so a future edit can't
     accidentally wire in personalization.

2. **API**: expose this via a new endpoint `GET /api/category-reference` in
   `server.mjs`, returning all category IDs and their example lists in one
   payload (small, cacheable, no per-request computation). Do NOT attach this
   data to the `POST /api/routine` response — keep it a fully separate fetch
   so the routine payload's shape and safety-review surface don't change.

3. **UI**: in `app.js`, wherever `ROUTINE_CATEGORY_CATALOG` definitions are
   rendered as static category descriptions (e.g. an "About the categories"
   or Atlas-adjacent info view — NOT inside the rendered AM/PM routine step
   list around line 392-419), add a collapsed subheading under each category
   definition:

   ```
   Think: mineral filters, chemical filters
   General research reference only — not a recommendation for your routine.
   See Ingredient Atlas for sourced evidence.
   ```

   - This must render on a **general category-info surface** (e.g. a
     glossary/legend view, or inside the existing Ingredient Atlas), never
     inside the personalized "Today's Routine" / Synthesised routine card.
   - The disclaimer line is not optional styling — it must always render
     adjacent to the examples, same font size, not a tooltip or collapsed
     footnote.
   - Link "Ingredient Atlas" to the existing knowledge-explorer view so users
     can click through to sourced evidence instead of taking the hint at
     face value.

4. **Tests**: add a case to `scripts/evaluate-safety.mjs` or a new script
   asserting `categoryReferenceExamples()` output is identical across calls
   with different concern/profile/environment arguments (if such params
   accidentally end up in the signature, this test should fail). Also assert
   the second safety pass (`secondSafetyPass` in `lib/safety.mjs`) still
   flags any named ingredient found inside an actual routine step/note — this
   change must not weaken that scan.

## Hard constraints — do not relax these

- Never pass user profile, concern, symptoms, or environment data into the
  function that produces category examples.
- Never render category examples inside the AM/PM routine step list, the
  "Synthesised routine" card, run report, or CSV/audit export for a specific
  request.
- Never let the OpenAI synthesis call (`lib/synthesis.mjs`) see or influence
  category reference examples — this stays a static, locally-sourced mapping.
- Keep the existing `secondSafetyPass` ingredient-scan regexes in
  `lib/safety.mjs` unchanged and passing on the current test suite
  (`npm run eval:safety`, `npm run eval:safety-50`) after this change.
- If any of the above constraints conflict with making the feature "feel"
  more personalized, stop and flag it in your output rather than loosening
  the constraint.

## Acceptance check

After implementing, run:

```sh
npm run check
npm run eval:safety
npm run eval:safety-50
npm run eval:study
```

All must still pass unchanged. Then manually verify: generate a routine for
two different profiles with the same concern — the AM/PM routine text must
be identical in structure (category-only, no ingredient names), while the
category reference panel (fetched separately) must also be identical between
the two, since it's profile-independent by design.
