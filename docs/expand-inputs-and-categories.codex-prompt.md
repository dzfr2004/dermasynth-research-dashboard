# Codex prompt: Expand profile inputs, concerns, and routine categories

Paste this into Codex as-is. This is a UI/content-model expansion, not a
safety-boundary change — read the constraints before writing code.

---

## Task

Three changes, all additive to the existing category-only architecture:

1. Rename UI copy that reads as clunky/placeholder ("Research preview
   inputs" section header, related labels) — keep every disclaimer sentence
   intact, word for word.
2. Expand the skin-profile input so users can identify their skin more
   precisely.
3. Add more research concerns and more routine categories so the AM/PM
   output has more real variation.

## 1. Wording cleanup (labels only — do not touch disclaimer text)

In `app.js`:

- Line ~980: `<h3 class="panel-title">${icon("flask", 17)} Research preview
  inputs</h3>` → change the heading text to something clearer, e.g. "Your
  skin profile" or "Set up your preview." Keep `<p class="panel-note">` and
  the `<p class="form-disclaimer">` sentence right after it (currently:
  "This interface is research-only and not medical advice.") completely
  unchanged.
- Line ~620: the "Start research preview" button label can be renamed (e.g.
  "Start a preview") but the surrounding hero copy and the "research-only"
  framing must stay.
- Do NOT touch the `reason` fields in `profileRoutines` (app.js ~55-96, e.g.
  "This generic research preview is not a personalised treatment plan."),
  the toast messages around line 2163-2185, or any text in
  `lib/safety.mjs`. Those are disclaimer/status language, not labels, and
  must not change wording or be removed.
- If you're unsure whether a given string is a "label" or a "disclaimer,"
  leave it unchanged and flag it in your output instead of guessing.

## 2. Expand the skin-profile input

Currently `ALLOWED_PROFILES` (`lib/safety.mjs:1`) is a single selector with
four values: `dry`, `combination`, `oily`, `sensitive`. Keep this exact set
and exact IDs (routine copy and safety rules key off them) but add two
**independent, optional, self-descriptive** secondary fields so returning
users can self-identify more precisely. These must stay cosmetic/self-report
only — no medical or diagnostic language, nothing that implies a skin
condition:

- `finishPreference`: optional enum `matte | dewy | no-preference`. Used only
  to bias which existing hydration/moisturising category variant is chosen
  (e.g. `light-hydration` vs `comfort-hydration`) — it must map onto
  categories that already exist in `ROUTINE_CATEGORY_CATALOG`, not create new
  meaning.
- `reactivityLevel`: optional enum `low | moderate | high`, self-reported
  only ("how easily does your skin usually react to new products?"). At
  `moderate`/`high`, this should behave like the existing `barrier` /
  `sensitivity` handling — i.e. it can add the `low-irritation-barrier-guardrail`
  rule id and exclude high-intensity exfoliation categories the same way
  `DEFAULT_HYDRATION_CONCERNS` already does. Do not let it change the primary
  `concern` value; it's a modifier, not a fifth concern.

Wire both fields through `state.profile` in `app.js`, into the `POST
/api/routine` request body, and into `createCategoryRoutine()` in
`lib/safety.mjs` as optional parameters with safe defaults (absent = current
behavior, unchanged). Add validation in `server.mjs` identical in strictness
to how `profile` is currently validated — reject unknown enum values rather
than silently accepting them.

## 3. Add more research concerns

Extend `CONCERN_CATALOG` in `lib/safety.mjs` (currently 7: acne, barrier,
pigment, sensitivity, dryness, oil, texture) with up to 3 more, following the
exact existing pattern — non-diagnostic id, label, shortLabel, and a
description that explicitly disclaims diagnosis/treatment, matching the
style of the existing 7 entries word-for-word in tone. Suggested additions
(adjust wording to match house style):

- `redness` — "Redness-prone appearance" — "Self-reported comfort context
  only; this prototype does not diagnose rosacea or a vascular condition."
- `radiance` — "Dullness/radiance appearance" — "A cosmetic appearance topic;
  it does not assess skin health or barrier function."
- `pores` — "Visible-pore appearance" — "A cosmetic appearance topic; it does
  not assess pore size, sebum production, or a skin condition."

For each new concern, add a corresponding entry to `CONCERN_ROUTINE_COPY`
mapping it to existing hydration/moisturising category ids (reuse, don't
invent new categories here — category expansion is step 4). Update
`data/evidence` / retrieval fixtures only if the retrieval eval
(`scripts/evaluate-retrieval.mjs`) requires coverage for the new concern IDs
to keep passing — check `REQUIRED_ELIGIBLE_EVIDENCE` / `REQUIRED_DOCUMENTS`
in `lib/retrieval.mjs` before assuming zero-evidence concerns will pass CUE.
If there's no evidence for a new concern yet, it's fine for it to fall back
to `templateRoutine` behavior — same as any concern with insufficient CUE
score today.

## 4. Add more routine categories

Extend `ROUTINE_CATEGORY_CATALOG` in `lib/safety.mjs` (currently 8 categories
across Cleansing/Hydration/Moisturising/Photoprotection) with up to 3 new
category types, same object shape (`category`, `title`, `note` — note must
explicitly disclaim it's not a product/ingredient/amount/frequency
specification, matching the existing note style):

- An antioxidant-context AM category (the original proposal mockup mentions
  this for high-PM2.5 conditions) — e.g. `"antioxidant-context"`: category
  `"Antioxidant"`, gated the same way `daytime-photoprotection` is gated by
  UV (add an equivalent PM2.5 threshold check, e.g. `pm25 >= 55`, alongside
  the existing `highUv` check in `createCategoryRoutine`).
- A texture-renewal PM category for concerns where it's currently safe (NOT
  barrier/sensitivity/dryness — those must keep the existing exclusion via
  `BARRIER_EXFOLIATION_PATTERN` and the `barrier-exfoliation-exclusion` rule
  in `firstSafetyPass`/`secondSafetyPass`). Wire it so it only appears for
  `acne`, `oil`, `texture`, `pigment` concerns.
- An overnight-comfort PM category (broad, no exfoliation implication) usable
  across all concerns.

For every new category: add it to `ALLOWED_ROUTINE_CATEGORY_IDS` (this is
automatic since it derives from `Object.keys`), make sure
`secondSafetyPass`'s `validCategories` check still covers it (it does, since
that check is generic), and add matching cases to
`scripts/evaluate-safety.mjs` / `scripts/evaluate-safety-50.mjs` verifying:
the new antioxidant category actually appears when PM2.5 is high and is
absent when it's low; the texture-renewal category never appears for
barrier/sensitivity/dryness regardless of other inputs.

## Hard constraints — do not relax these

- No new field, concern, or category may introduce a named ingredient,
  product, brand, percentage, or frequency anywhere in its id, label, title,
  or note.
- No new concern or profile field may use clinical/diagnostic language
  (condition names, "treats," "cures," "prescription"). Run the new strings
  through the existing `BLOCKED_MODEL_CONTENT` and
  `SPECIFIC_INGREDIENT_OR_PRODUCT_PATTERN` regexes mentally before adding
  them — they should never match.
- `secondSafetyPass` must continue to reject any routine (old or new
  category) that doesn't satisfy the fixed AM/PM structure, valid category
  ids, and valid evidence links. Do not weaken `hasBothPhases`,
  `validCategories`, or `validLinks` to accommodate new categories — extend
  the data, not the validation logic's strictness.
- The barrier/sensitivity/dryness exfoliation exclusion must keep working
  for the new texture-renewal category exactly as it already does for
  existing categories — this is a regression risk, test it explicitly.

## Acceptance check

```sh
npm run check
npm run eval:safety
npm run eval:safety-50
npm run eval:study
npm run eval:retrieval
```

All must pass. Then manually verify in the UI: the profile form shows the
two new optional fields without breaking the existing 4-option skin-type
selector; selecting a new concern with no evidence falls back to a
deterministic category-only preview (not an error); a high-PM2.5 location
triggers the new antioxidant category in the AM routine; barrier/sensitivity/
dryness concerns never show the texture-renewal category no matter what
other inputs are set.
