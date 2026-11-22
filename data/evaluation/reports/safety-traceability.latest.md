# Safety-rule traceability

Generated 2026-11-06 by `npm run eval:safety-traceability`. Matrix 2026-07-27.1, flags 2026-09-23.1, sources reviewed 2026-11-06.

38 rules: 15 confirmed, 5 extended, 17 design choices, 1 pending. No rule is looser than its source.

| Status | Meaning | Rules |
| --- | --- | ---: |
| Confirmed | The source names this ingredient and this effect. | 15 |
| Extended | The source covers a close relative; the rule applies it to this ingredient. | 5 |
| Design choice | No source requires this rule; it is deliberately stricter than the sources. | 17 |
| Pending | Not yet confirmed for Malaysia. | 1 |

## Rules

| Rule type | Rule | Status | Sources | Note |
| --- | --- | --- | --- | --- |
| Incompatible pair | retinol + benzoyl-peroxide | Extended | [1] [2] | Benzoyl peroxide oxidises tretinoin and adds irritation; applied to retinol, a related oxidisable retinoid. |
| Incompatible pair | retinol + glycolic-acid | Extended | [2] [3] | Label warns against strongly drying products with tretinoin; AHAs are not named. Weaker extension. |
| Incompatible pair | retinol + mandelic-acid | Extended | [2] [3] | As for glycolic acid; mandelic acid is an AHA. Weaker extension. |
| Incompatible pair | retinol + salicylic-acid | Extended | [2] | Label warns that salicylic acid with tretinoin increases dryness, redness and peeling; applied to retinol. |
| Incompatible pair | benzoyl-peroxide + glycolic-acid | Design choice | [4] [3] | No source addresses this pair; avoids stacking two drying or exfoliating actives in one routine. |
| Incompatible pair | benzoyl-peroxide + mandelic-acid | Design choice | [4] [3] | No source addresses this pair; avoids stacking two drying or exfoliating actives in one routine. |
| Incompatible pair | benzoyl-peroxide + salicylic-acid | Design choice | [4] [3] | No source addresses this pair; avoids stacking two drying or exfoliating actives in one routine. |
| Incompatible pair | glycolic-acid + salicylic-acid | Design choice | [3] [4] | CIR limits acid strength per product but does not address layering; avoids stacking two exfoliating acids. |
| Incompatible pair | glycolic-acid + mandelic-acid | Design choice | [3] [4] | CIR limits acid strength per product but does not address layering; avoids stacking two exfoliating acids. |
| Incompatible pair | mandelic-acid + salicylic-acid | Design choice | [3] [4] | CIR limits acid strength per product but does not address layering; avoids stacking two exfoliating acids. |
| Excluded from selection | retinal | Confirmed | [5] | AICIS Evaluation Statement EVA00186 (26 June 2026) classifies retinal as a developmental toxicant (Reproductive toxicity Category 1B). |
| Not allowed in the morning | glycolic-acid | Confirmed | [6] [3] | Named AHA; increases UV sensitivity. |
| Not allowed in the morning | lactic-acid | Confirmed | [6] [3] | Named AHA; increases UV sensitivity. |
| Not allowed in the morning | mandelic-acid | Extended | [6] [3] | Chemically an AHA but not named by FDA or CIR. |
| Not allowed in the morning | citric-acid | Confirmed | [6] | Named by FDA as an AHA used in cosmetics. |
| Not allowed in the morning | salicylic-acid | Confirmed | [4] | CIR via FDA: formulate to avoid increased sun sensitivity; use sun protection. |
| Not allowed in the morning | retinol | Design choice | [2] | No photosensitivity source found for retinol; follows evening use convention and the tretinoin label's UV advice. |
| Not allowed in the morning | retinal | Design choice | [2] | No photosensitivity source found; retinal is also excluded from selection (AICIS EVA00186). |
| Not allowed in the morning | retinyl-palmitate | Confirmed | [7] | Increased skin neoplasms under simulated solar light in mice. |
| Blocked by barrier guardrail | glycolic-acid | Design choice | [3] [4] [2] | Sources advise formulating to avoid irritation and stopping on irritation; none requires blocking on a weakened barrier. |
| Blocked by barrier guardrail | lactic-acid | Design choice | [3] [4] [2] | Sources advise formulating to avoid irritation and stopping on irritation; none requires blocking on a weakened barrier. |
| Blocked by barrier guardrail | mandelic-acid | Design choice | [3] [4] [2] | Sources advise formulating to avoid irritation and stopping on irritation; none requires blocking on a weakened barrier. |
| Blocked by barrier guardrail | citric-acid | Design choice | [3] [4] [2] | Sources advise formulating to avoid irritation and stopping on irritation; none requires blocking on a weakened barrier. |
| Blocked by barrier guardrail | salicylic-acid | Design choice | [3] [4] [2] | Sources advise formulating to avoid irritation and stopping on irritation; none requires blocking on a weakened barrier. |
| Blocked by barrier guardrail | gluconolactone | Design choice | [3] [4] [2] | Polyhydroxy acid, milder than AHAs. Included as the strictest design choice; no source requires it. |
| Blocked by barrier guardrail | retinol | Design choice | [3] [4] [2] | Sources advise formulating to avoid irritation and stopping on irritation; none requires blocking on a weakened barrier. |
| Blocked by barrier guardrail | retinal | Design choice | [3] [4] [2] | Sources advise formulating to avoid irritation and stopping on irritation; none requires blocking on a weakened barrier. |
| Blocked by barrier guardrail | retinyl-palmitate | Design choice | [3] [4] [2] | Sources advise formulating to avoid irritation and stopping on irritation; none requires blocking on a weakened barrier. |
| Prescription-only | tretinoin | Confirmed | [8] [9] [10] | Annex II entry 375; NPRA Appendix 7 entry 4 restricts supply to dermatologists. |
| Prescription-only | adapalene | Confirmed | [11] [12] [13] | Differin 0.1% gel is registered as MAL20010011ARZ; the A suffix marks a prescription product (NPRA). Also listed as prescription-only by a licensed pharmacy. |
| Prescription-only | isotretinoin | Confirmed | [10] [8] | NPRA Appendix 7 entry 4: supply restricted to dermatologists; teratogenicity warning required. |
| Prescription-only | tazarotene | Pending | none | No Malaysian registration (MAL number) found, so it cannot be sold in Malaysia; prescription-only where approved elsewhere. |
| Prescription-only | trifarotene | Confirmed | [14] [12] | Aklief Cream 50 mcg/g is registered as MAL24076001AZ; the A suffix marks a prescription product (NPRA). |
| Prescription-only | clindamycin | Confirmed | [8] | Annex II entry 39 (antibiotics). |
| Prescription-only | hydroquinone | Confirmed | [9] | Pharmaceutical needing DCA registration; use under healthcare supervision. |
| Prescription-only | hydrocortisone | Confirmed | [8] | Annex II entry 300 (glucocorticoids). |
| Prescription-only | betamethasone-valerate | Confirmed | [8] | Annex II entry 300 (glucocorticoids). |
| Prescription-only | clobetasol-propionate | Confirmed | [8] | Annex II entry 300 (glucocorticoids). |

## Sources

1. Chemical stability of adapalene and tretinoin when combined with benzoyl peroxide in presence and in absence of visible light and ultraviolet radiation. Br J Dermatol. 1998;139 Suppl 52:8-11. doi:10.1046/j.1365-2133.1998.1390s2008.x https://pubmed.ncbi.nlm.nih.gov/9990414/
2. U.S. FDA. RETIN-A MICRO (tretinoin) gel prescribing information, sections 5.1 and 5.3. 2025. https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/020475s029lbl.pdf
3. Fiume MM. Alpha Hydroxy Acids. Int J Toxicol. 2017;36(5 suppl 2):15S-21S (CIR re-review of the 1998 assessment). doi:10.1177/1091581817716656 https://journals.sagepub.com/doi/10.1177/1091581817716656
4. U.S. FDA. Beta Hydroxy Acids (content current as of 25 Feb 2022). https://www.fda.gov/cosmetics/cosmetic-ingredients/beta-hydroxy-acids
5. AICIS. Evaluation statement EVA00186: retinal (CAS 116-31-4). 26 June 2026. https://www.industrialchemicals.gov.au/sites/default/files/2026-06/EVA00186%20-%20Evaluation%20statement%20-%2026%20June%202026.pdf
6. U.S. FDA. Alpha Hydroxy Acids (content current as of 22 Nov 2022), with Guidance for Industry: Labeling for Topically Applied Cosmetic Products Containing Alpha Hydroxy Acids (2005). https://www.fda.gov/cosmetics/cosmetic-ingredients/alpha-hydroxy-acids
7. National Toxicology Program. Photocarcinogenesis study of retinoic acid and retinyl palmitate in SKH-1 mice (TR-568). 2012. https://ntp.niehs.nih.gov/go/tr568abs
8. NPRA / ASEAN Cosmetic Directive. Annex II: list of substances which must not form part of the composition of cosmetic products. Release 2 July 2025. https://npra.gov.my/images/Guidelines_Central/Guidelines_on_Cosmetic/Annex_II_release_-_2_July_2025.pdf
9. Director General of Health Malaysia. Press statement: cosmetic products found to contain scheduled poison. NPRA, 9 October 2018. https://www.npra.gov.my/index.php/component/content/article/215-press-release/press-release-2018/1756-press-statement-director-general-of-health-cosmetic-products-found-to-contain-scheduled-poison
10. NPRA. Appendix 7: Special conditions for registration for a particular product or group of products, entry 4 (isotretinoin/tretinoin). Posted 29 August 2018. https://npra.gov.my/index.php/en/component/content/article/194-guidelines-central/guidelines-others/1572-appendix-7-special-conditions-for-registration-for-a-particular-product-or-group-of-products
11. Differin 0.1% Gel (30 g), Malaysian registration number MAL20010011ARZ, product listing on newpages.com.my. Accessed 6 November 2026. https://m.newpages.com.my/bm/company/741535/product/437327/3961846/Differin-0-1--Gel-30g.html
12. NPRA. Presentation to the International Over-the-Counter Medicines Regulators Forum, 2017 (hosted by TGA). https://www.tga.gov.au/sites/default/files/international-over-counter-otc-medicines-regulators-forum-2017-malaysia.pdf
13. DoctorOnCall (licensed online pharmacy, Malaysia). Differin (adapalene) 0.1% gel product page: prescription-only medicine; registration holder Galderma Malaysia Sdn Bhd. Accessed 6 November 2026. https://www.doctoroncall.com.my/pharmacy/differin-adapalene-0-1-gel-v-30g/
14. Aklief Cream 50 mcg/g (trifarotene), Laboratoires Galderma, Malaysian registration number MAL24076001AZ, product listing on newpages.asia. Accessed 6 November 2026. https://newpages.asia/my/en/product/5273127/aklief-cream-50mcgg

Check passed: every rule has a status, and every non-pending rule cites at least one known source.
