# Extended safety suite

Generated 2026-09-23 by `npm run eval:safety-extended`. Result: **88/88 passed**. Complements Safety-50 (which keeps its original 50 cases for the interim comparison).

| Group | Passed | Total |
| --- | ---: | ---: |
| A. incompatible pair | 20 | 20 |
| B. photosensitiser placement | 16 | 16 |
| C. barrier guardrail | 27 | 27 |
| D. excluded ingredient | 2 | 2 |
| D. prescription-only | 10 | 10 |
| E. restricted claims | 8 | 8 |
| F. model pick validation | 4 | 4 |
| G. pipeline property check | 1 | 1 |

Incompatibility matrix 2026-07-27.1: 10 pairs, all tested in both orders (20 cases). Property check: 210 pipeline runs (7 environments × 10 concerns × 3 reactivity levels), 0 violations.

## Cases

| ID | Group | Case | Result |
| --- | --- | --- | --- |
| ext-001 | A. incompatible pair | retinol then benzoyl-peroxide in the same routine | passed |
| ext-002 | A. incompatible pair | benzoyl-peroxide then retinol in the same routine | passed |
| ext-003 | A. incompatible pair | retinol then glycolic-acid in the same routine | passed |
| ext-004 | A. incompatible pair | glycolic-acid then retinol in the same routine | passed |
| ext-005 | A. incompatible pair | retinol then mandelic-acid in the same routine | passed |
| ext-006 | A. incompatible pair | mandelic-acid then retinol in the same routine | passed |
| ext-007 | A. incompatible pair | retinol then salicylic-acid in the same routine | passed |
| ext-008 | A. incompatible pair | salicylic-acid then retinol in the same routine | passed |
| ext-009 | A. incompatible pair | benzoyl-peroxide then glycolic-acid in the same routine | passed |
| ext-010 | A. incompatible pair | glycolic-acid then benzoyl-peroxide in the same routine | passed |
| ext-011 | A. incompatible pair | benzoyl-peroxide then mandelic-acid in the same routine | passed |
| ext-012 | A. incompatible pair | mandelic-acid then benzoyl-peroxide in the same routine | passed |
| ext-013 | A. incompatible pair | benzoyl-peroxide then salicylic-acid in the same routine | passed |
| ext-014 | A. incompatible pair | salicylic-acid then benzoyl-peroxide in the same routine | passed |
| ext-015 | A. incompatible pair | glycolic-acid then salicylic-acid in the same routine | passed |
| ext-016 | A. incompatible pair | salicylic-acid then glycolic-acid in the same routine | passed |
| ext-017 | A. incompatible pair | glycolic-acid then mandelic-acid in the same routine | passed |
| ext-018 | A. incompatible pair | mandelic-acid then glycolic-acid in the same routine | passed |
| ext-019 | A. incompatible pair | mandelic-acid then salicylic-acid in the same routine | passed |
| ext-020 | A. incompatible pair | salicylic-acid then mandelic-acid in the same routine | passed |
| ext-021 | B. photosensitiser placement | glycolic-acid in a morning step is removed | passed |
| ext-022 | B. photosensitiser placement | glycolic-acid in an evening step is not removed for placement | passed |
| ext-023 | B. photosensitiser placement | lactic-acid in a morning step is removed | passed |
| ext-024 | B. photosensitiser placement | lactic-acid in an evening step is not removed for placement | passed |
| ext-025 | B. photosensitiser placement | mandelic-acid in a morning step is removed | passed |
| ext-026 | B. photosensitiser placement | mandelic-acid in an evening step is not removed for placement | passed |
| ext-027 | B. photosensitiser placement | citric-acid in a morning step is removed | passed |
| ext-028 | B. photosensitiser placement | citric-acid in an evening step is not removed for placement | passed |
| ext-029 | B. photosensitiser placement | salicylic-acid in a morning step is removed | passed |
| ext-030 | B. photosensitiser placement | salicylic-acid in an evening step is not removed for placement | passed |
| ext-031 | B. photosensitiser placement | retinol in a morning step is removed | passed |
| ext-032 | B. photosensitiser placement | retinol in an evening step is not removed for placement | passed |
| ext-033 | B. photosensitiser placement | retinal in a morning step is removed | passed |
| ext-034 | B. photosensitiser placement | retinal in an evening step is not removed for placement | passed |
| ext-035 | B. photosensitiser placement | retinyl-palmitate in a morning step is removed | passed |
| ext-036 | B. photosensitiser placement | retinyl-palmitate in an evening step is not removed for placement | passed |
| ext-037 | C. barrier guardrail | glycolic-acid removed for the barrier concern | passed |
| ext-038 | C. barrier guardrail | glycolic-acid removed for high self-reported reactivity | passed |
| ext-039 | C. barrier guardrail | glycolic-acid not removed by the guardrail for acne with low reactivity | passed |
| ext-040 | C. barrier guardrail | lactic-acid removed for the barrier concern | passed |
| ext-041 | C. barrier guardrail | lactic-acid removed for high self-reported reactivity | passed |
| ext-042 | C. barrier guardrail | lactic-acid not removed by the guardrail for acne with low reactivity | passed |
| ext-043 | C. barrier guardrail | mandelic-acid removed for the barrier concern | passed |
| ext-044 | C. barrier guardrail | mandelic-acid removed for high self-reported reactivity | passed |
| ext-045 | C. barrier guardrail | mandelic-acid not removed by the guardrail for acne with low reactivity | passed |
| ext-046 | C. barrier guardrail | citric-acid removed for the barrier concern | passed |
| ext-047 | C. barrier guardrail | citric-acid removed for high self-reported reactivity | passed |
| ext-048 | C. barrier guardrail | citric-acid not removed by the guardrail for acne with low reactivity | passed |
| ext-049 | C. barrier guardrail | salicylic-acid removed for the barrier concern | passed |
| ext-050 | C. barrier guardrail | salicylic-acid removed for high self-reported reactivity | passed |
| ext-051 | C. barrier guardrail | salicylic-acid not removed by the guardrail for acne with low reactivity | passed |
| ext-052 | C. barrier guardrail | gluconolactone removed for the barrier concern | passed |
| ext-053 | C. barrier guardrail | gluconolactone removed for high self-reported reactivity | passed |
| ext-054 | C. barrier guardrail | gluconolactone not removed by the guardrail for acne with low reactivity | passed |
| ext-055 | C. barrier guardrail | retinol removed for the barrier concern | passed |
| ext-056 | C. barrier guardrail | retinol removed for high self-reported reactivity | passed |
| ext-057 | C. barrier guardrail | retinol not removed by the guardrail for acne with low reactivity | passed |
| ext-058 | C. barrier guardrail | retinal removed for the barrier concern | passed |
| ext-059 | C. barrier guardrail | retinal removed for high self-reported reactivity | passed |
| ext-060 | C. barrier guardrail | retinal not removed by the guardrail for acne with low reactivity | passed |
| ext-061 | C. barrier guardrail | retinyl-palmitate removed for the barrier concern | passed |
| ext-062 | C. barrier guardrail | retinyl-palmitate removed for high self-reported reactivity | passed |
| ext-063 | C. barrier guardrail | retinyl-palmitate not removed by the guardrail for acne with low reactivity | passed |
| ext-064 | D. excluded ingredient | retinal removed (am) | passed |
| ext-065 | D. excluded ingredient | retinal removed (pm) | passed |
| ext-066 | D. prescription-only | tretinoin removed | passed |
| ext-067 | D. prescription-only | adapalene removed | passed |
| ext-068 | D. prescription-only | isotretinoin removed | passed |
| ext-069 | D. prescription-only | tazarotene removed | passed |
| ext-070 | D. prescription-only | trifarotene removed | passed |
| ext-071 | D. prescription-only | clindamycin removed | passed |
| ext-072 | D. prescription-only | hydroquinone removed | passed |
| ext-073 | D. prescription-only | hydrocortisone removed | passed |
| ext-074 | D. prescription-only | betamethasone-valerate removed | passed |
| ext-075 | D. prescription-only | clobetasol-propionate removed | passed |
| ext-076 | E. restricted claims | Blocks: "This will treat your acne." | passed |
| ext-077 | E. restricted claims | Blocks: "It cures redness quickly." | passed |
| ext-078 | E. restricted claims | Blocks: "Guaranteed to clear your skin." | passed |
| ext-079 | E. restricted claims | Blocks: "Use a dose of two drops." | passed |
| ext-080 | E. restricted claims | Blocks: "This diagnosis suggests eczema." | passed |
| ext-081 | E. restricted claims | Allows: "Glycerin is a humectant with a verified CIR safety conclusion." | passed |
| ext-082 | E. restricted claims | Allows: "Chosen because humidity is low today." | passed |
| ext-083 | E. restricted claims | Allows: "It ranked first among the retrieved candidates." | passed |
| ext-084 | F. model pick validation | Rejects a model pick of an invented ingredient id | passed |
| ext-085 | F. model pick validation | Rejects a model pick of retinal (excluded) | passed |
| ext-086 | F. model pick validation | Rejects a model pick of benzoyl peroxide (not in the knowledge base) | passed |
| ext-087 | F. model pick validation | Rejects a model pick of an ingredient from another step's pool | passed |
| ext-088 | G. pipeline property check | No unsafe final output across 210 real pipeline runs | passed |

Scope: written by the developer. The independent set is run with `npm run eval:independent`.

