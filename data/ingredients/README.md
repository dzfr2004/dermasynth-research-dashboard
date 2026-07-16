# Ingredient knowledge base

`catalog.v1.json` is the original UI-facing audit catalogue. It preserves the first four product-regimen ingredient records and cannot select a name for an AM/PM routine.

`knowledge-base.v1.json`, `demo-extension.v1.json`, and `atlas-extension-50.v1.json` form the merged source registry used by the app. Together they contain 50 held, source-mapped ingredient records and 52 attributed sources from three roles:

- CIR — official safety-provenance citations only; do not copy or embed report content without permission.
- EWG Skin Deep — direct external link only; do not copy scores, ratings, product records, or database content.
- Medical journals — attributed, review-pending research notes with source-specific reuse metadata.

The existing isolated demo segment uses [ingredient-demo.v1.jsonl](../evidence/ingredient-demo.v1.jsonl) plus [ingredient-source-supplement.v1.jsonl](../evidence/ingredient-source-supplement.v1.jsonl): 31 source-attributed metadata cards (20 ingredient cards + 11 journal-mapping cards) uploaded only to `demo-ingredient-kb-v1`. The 30 additions in `atlas-extension-50.v1.json` remain local, held, and review-pending; they are not part of that vector upload. All records remain research inspection metadata, not routine instructions.

Run the structural check with:

```sh
npm run verify:ingredient-kb
npm run verify:demo-kb
```

Use `GET /api/ingredient-knowledge` to inspect the full, source-attributed registry. The endpoint exposes audit metadata only—not a recommendation selector.
