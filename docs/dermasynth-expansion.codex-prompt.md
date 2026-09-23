# Codex prompt: DermaSynth UI copy, category reference panel, and input/output expansion

Paste this into Codex as-is. This is a single combined task covering five
changes. Read the shared constraints at the bottom before writing any code —
several of these changes touch the safety boundary and must not weaken it.

---

## Overview

1. Rename clunky UI labels; keep every disclaimer sentence unchanged.
2. Add a general, category-level ingredient reference panel, structurally
   decoupled from the individualized routine.
3. Expand the skin-profile input with two optional self-report fields.
4. Add more research concerns to `CONCERN_CATALOG`.
5. Add more routine categories to `ROUTINE_CATEGORY_CATALOG`.

Do these roughly in this order — (3), (4), and (5) build on each other, and
(2) is independent and can be done in parallel.

---

## 1. Wording cleanup (labels only — do not touch disclaimer text)

In `app.js`:

- Line ~980: `<h3 class="panel-title">${icon("flask", 17)} Research preview
  inputs</h3>` → change the heading text to something clearer, e.g. "Your
  skin profile" or "Set up your preview." Keep the adjacent `<p
  class="panel-note">` and the `<p class="form-disclaimer">` sentence right
  after it (currently: "This interface is research-only and not medical
  advice.") completely unchanged.
- Line ~620: the "Start research preview" button label can be renamed (e.g.
  "Start a preview") but the surrounding hero copy and "research-only"
  framing must stay.
- Do NOT touch the `reason` fields in `profileRoutines` (app.js ~55-96, e.g.
  "This generic research preview is not a personalised treatment plan."),
  the toast messages around line 2163-2185, or any text in
  `lib/safety.mjs`. Those are disclaimer/status language, not labels — leave
  wording and presence unchanged.
- If unsure whether a string is a "label" or a "disclaimer," leave it
  unchanged and flag it in your output instead of guessing.

## 2. Category-level ingredient reference panel

The AM/PM routine (`lib/safety.mjs`, `createCategoryRoutine`) outputs only
fixed category labels for a specific user's profile + concern + environment.
That contract does not change. Named ingredients must never appear inside an
individualized routine step, step note, or anything derived from a specific
user's inputs.

`lib/ingredients.mjs` already has the right pattern for general reference
content: `ingredientResearchForConcern()` returns candidate ingredient names
as an "audit-only appendix," explicitly marked `routineSelectionAllowed:
false`. Extend that posture into a visible panel:

- **New pure function** `categoryReferenceExamples(categoryId)` in
  `lib/ingredients.mjs` (or a new `lib/category-reference.mjs`). Input: a
  `ROUTINE_CATEGORY_CATALOG` key from `lib/safety.mjs`. Output: 2-4
  ingredient *class* examples commonly associated with that category (e.g.
  for `"daytime-photoprotection"`: `["mineral filters (e.g. zinc oxide)",
  "chemical filters (e.g. avobenzone)"]`), sourced from the existing
  ingredient Atlas (`lib/ingredient-knowledge.mjs`) where possible.
  - This function takes **only** a category ID. No profile, concern,
    symptoms, environment, or evidence-retrieval result may be passed in or
    influence the output. Same category ID always returns the same
    examples, regardless of who's asking. Enforce this structurally (e.g. no
    other parameters in the function signature at all) so a future edit
    can't accidentally wire in personalization.
- **API**: new endpoint `GET /api/category-reference` in `server.mjs`,
  returning all category IDs and their example lists in one static,
  cacheable payload. Do NOT attach this data to the `POST /api/routine`
  response — keep it a fully separate fetch.
- **UI**: in `app.js`, render this only on a general category-info surface
  (a glossary/legend view, or inside the existing Ingredient Atlas) — never
  inside the "Today's Routine" / Synthesised routine card. Subheading
  format:

  ```
  Think: mineral filters, chemical filters
  General research reference only — not a recommendation for your routine.
  See Ingredient Atlas for sourced evidence.
  ```

  The disclaimer line must always render adjacent to the examples at the
  same font size — not a tooltip, not a collapsed footnote. Link "Ingredient
  Atlas" to the existing knowledge-explorer view.

## 3. Expand the skin-profile input

Keep `ALLOWED_PROFILES` (`lib/safety.mjs:1`) exactly as-is — `dry`,
`combination`, `oily`, `sensitive` — routine copy and safety rules key off
these IDs. Add two **independent, optional, self-descriptive** secondary
fields, cosmetic/self-report only, no medical or diagnostic language:

- `finishPreference`: optional enum `matte | dewy | no-preference`. Used
  only to bias which existing hydration/moisturising category variant is
  chosen (e.g. `light-hydration` vs `comfort-hydration`) — must map onto
  categories that already exist in `ROUTINE_CATEGORY_CATALOG`.
- `reactivityLevel`: optional enum `low | moderate | high`, self-reported
  ("how easily does your skin usually react to new products?"). At
  `moderate`/`high`, behave like existing `barrier`/`sensitivity` handling —
  add the `low-irritation-barrier-guardrail` rule id and exclude
  high-intensity categories the same way `DEFAULT_HYDRATION_CONCERNS`
  already does. Do not let it change the primary `concern` value — it's a
  modifier, not a fifth concern.

Wire both through `state.profile` in `app.js`, into the `POST /api/routine`
request body, and into `createCategoryRoutine()` in `lib/safety.mjs` as
optional parameters with safe defaults (absent = current behavior,
unchanged). Add validation in `server.mjs` as strict as the existing
`profile` validation — reject unknown enum values rather than silently
accepting them.

## 4. Add more research concerns

Extend `CONCERN_CATALOG` in `lib/safety.mjs` (currently 7: acne, barrier,
pigment, sensitivity, dryness, oil, texture) with up to 3 more, following
the exact existing pattern — non-diagnostic id, label, shortLabel, and a
description that explicitly disclaims diagnosis/treatment, matching the
tone of the existing 7 entries word-for-word in style:

- `redness` — "Redness-prone appearance" — "Self-reported comfort context
  only; this prototype does not diagnose rosacea or a vascular condition."
- `radiance` — "Dullness/radiance appearance" — "A cosmetic appearance
  topic; it does not assess skin health or barrier function."
- `pores` — "Visible-pore appearance" — "A cosmetic appearance topic; it
  does not assess pore size, sebum production, or a skin condition."

For each new concern, add a `CONCERN_ROUTINE_COPY` entry mapping it to
*existing* hydration/moisturising category ids (reuse — category expansion
is step 5). Check `REQUIRED_ELIGIBLE_EVIDENCE` / `REQUIRED_DOCUMENTS` in
`lib/retrieval.mjs` before assuming a new concern will clear CUE — if
there's no evidence for it yet, it's fine for it to fall back to
`templateRoutine` behavior, same as any low-CUE concern today. Do not fake
evidence records just to make a new concern pass; an honest fallback is
correct behavior.

## 5. Add more routine categories

Extend `ROUTINE_CATEGORY_CATALOG` in `lib/safety.mjs` (currently 8 across
Cleansing/Hydration/Moisturising/Photoprotection) with up to 3 new category
types, same object shape (`category`, `title`, `note` — note must explicitly
disclaim it's not a product/ingredient/amount/frequency specification,
matching existing note style):

- Antioxidant-context AM category, gated on high PM2.5 the same way
  `daytime-photoprotection` is gated on high UV (add a threshold check, e.g.
  `pm25 >= 55`, alongside the existing `highUv` check in
  `createCategoryRoutine`).
- Texture-renewal PM category, only for concerns where it's currently safe —
  NOT `barrier`/`sensitivity`/`dryness`, which must keep the existing
  exclusion via `BARRIER_EXFOLIATION_PATTERN` and the
  `barrier-exfoliation-exclusion` rule in `firstSafetyPass`/
  `secondSafetyPass`. Wire it to appear only for `acne`, `oil`, `texture`,
  `pigment` (and `redness`/`radiance`/`pores` if added in step 4, case by
  case — check each makes sense).
- Overnight-comfort PM category, broad, no exfoliation implication, usable
  across all concerns.

Add matching cases to `scripts/evaluate-safety.mjs` /
`scripts/evaluate-safety-50.mjs`: the antioxidant category appears when
PM2.5 is high and is absent when low; the texture-renewal category never
appears for barrier/sensitivity/dryness regardless of other inputs.

---

## Hard constraints — apply to all five sections above

- No new field, concern, or category may introduce a named ingredient,
  product, brand, percentage, or frequency anywhere in its id, label, title,
  or note — except inside the category-reference panel (section 2), which is
  the one place ingredient *class* examples are allowed, and only because
  it's structurally decoupled from any individual user's inputs.
- No new concern or profile field may use clinical/diagnostic language
  (condition names, "treats," "cures," "prescription"). Mentally check new
  strings against `BLOCKED_MODEL_CONTENT` and
  `SPECIFIC_INGREDIENT_OR_PRODUCT_PATTERN` in `lib/safety.mjs` before adding
  them — they should never match.
- `secondSafetyPass` must continue to reject any routine that doesn't
  satisfy the fixed AM/PM structure, valid category ids, and valid evidence
  links. Extend the data, not the validation logic's strictness.
- The barrier/sensitivity/dryness exfoliation exclusion must keep working
  for any new category exactly as it does today — test this explicitly, it's
  the highest-risk regression in this change.
- Never let the OpenAI synthesis call (`lib/synthesis.mjs`) see or influence
  category reference examples (section 2) — that stays a static, locally
  sourced mapping, never model output.
- If any constraint conflicts with making a feature "feel" more personalized
  or complete, stop and flag it in your output rather than loosening the
  constraint.

## Acceptance check

```sh
npm run check
npm run eval:safety
npm run eval:safety-50
npm run eval:study
npm run eval:retrieval
```

All must pass unchanged (plus any new cases you added). Then manually
verify:

- The profile form shows the two new optional fields without breaking the
  existing 4-option skin-type selector.
- Selecting a new concern with no evidence falls back to a deterministic
  category-only preview, not an error.
- A high-PM2.5 location triggers the antioxidant category in the AM
  routine; a high-UV context still triggers photoprotection as before.
- Barrier/sensitivity/dryness concerns never show the texture-renewal
  category no matter what other inputs are set.
- The category reference panel renders identically for two different
  profiles/concerns hitting the same category — confirming it's truly
  input-independent — and never appears inside the "Today's Routine" card.
