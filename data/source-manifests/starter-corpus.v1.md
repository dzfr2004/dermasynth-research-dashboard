# DermaSynth starter corpus — review queue

Created 16 July 2026. This is a source-discovery pack, not an uploaded evidence corpus.

| Track | Sources located | What they are for | Pinecone state |
| --- | --- | --- | --- |
| Clinical | NICE acne guideline; open-access acne, sunscreen, melasma, and pollution reviews | Retrieval grounding and escalation boundaries | Not uploaded |
| Ingredient safety | CIR final reports; SCCS final opinions | Ingredient and formulation safety context | Not uploaded |
| Environment | WHO AQG; Malaysia DOE API | Measured environmental-input context | Not uploaded |
| Ingredient database | EU CosIng; EWG Skin Deep | Normalisation/provenance and optional link-out | Link-only / deferred |

## Licence-compatible first sources to acquire and review

These are compatible with the current non-commercial FYP scope, subject to citation, licence preservation, and qualified review. They are still **not uploaded**.

1. [PRACT-India acne consensus](https://pmc.ncbi.nlm.nih.gov/articles/PMC12382837/) — CC BY acne consensus. Retain the India-specific scope and Glenmark-affiliation flag.
2. [Korean atopic-dermatitis guideline](https://pmc.ncbi.nlm.nih.gov/articles/PMC4622891/) — CC BY-NC barrier-care concepts only; it must not become eczema diagnosis advice.
3. [Spada et al. ceramide barrier RCT](https://pmc.ncbi.nlm.nih.gov/articles/PMC8459234/) — CC BY. Preserve product-specific and industry-sponsored limitations.
4. [Pandhi et al. sensitive-skin position statement](https://pmc.ncbi.nlm.nih.gov/articles/PMC12419229/) — CC BY, useful context but below formal guidelines; retain its India-specific scope and industry-affiliation flag.
5. [Tsai & Kang photoaging review](https://pmc.ncbi.nlm.nih.gov/articles/PMC13243712/) — CC BY-NC photoprotection context; do not turn it into product-specific claims.
6. [Huang & Lee tretinoin meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC12615114/) — CC BY-NC. Treat tretinoin as clinician-gated medicine, never autonomous routine advice.

The CC BY-NC sunscreen and melasma reviews already listed in the JSON manifest can be considered later for a non-commercial, attribution-preserving research corpus. The particulate-matter review remains on a licence-verification hold.

## Held until permission is confirmed

- NICE NG198 and the SCCS opinions are high-authority safety references, but remain outside Pinecone until their reuse/AI-processing terms are confirmed. NICE's current terms specifically require approval/licensing for AI use.
- CIR’s final reports for niacinamide, salicylic acid/salicylates, ceramides, retinol/retinyl palmitate, and benzyl salicylate are recorded in the JSON manifest with official URLs. Their access terms do not clearly authorise extraction or embedding, so they remain citations only.
- EWG Skin Deep stays out of the corpus unless you obtain written permission. Its hazard ratings should never become the app’s safety verdict.

## Next action

After a reviewer selects the first 5–7 approved documents, I can capture their permitted passages with page/section locators, prepare a separate `data/evidence/*.jsonl` review batch, and run the dry-run validator. Nothing will be uploaded to Pinecone unless you explicitly ask.
