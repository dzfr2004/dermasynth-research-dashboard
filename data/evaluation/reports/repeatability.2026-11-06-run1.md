# Repeatability check

Generated 2026-11-06 14:02 UTC by `npm run eval:repeatability` against http://127.0.0.1:4173 (live services, GPT on). Each profile was sent 5 times unchanged, for Kuala Lumpur.

| Profile | Runs | Same triage | Same safety status | Same steps | Same readings | Steps with the same pick every run | Picks outside the pool | Unsafe runs |
| --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: |
| combination, acne, low | 5/5 | yes | yes | yes | yes | 2 of 4 | 0 | 0 |
| sensitive, redness, high | 5/5 | yes | yes | yes | yes | 4 of 4 | 0 | 0 |
| dry, dryness, moderate | 5/5 | yes | yes | yes | yes | 4 of 4 | 0 | 0 |

## Ingredient picks per step

**combination, acne**

- am:daytime-photoprotection: zinc-oxide (3), titanium-dioxide (2)
- pm:lightweight-moisturising: dimethicone (3), niacinamide (2)
- pm:texture-renewal: salicylic-acid (5)
- pm:overnight-comfort: allantoin (5)

**sensitive, redness**

- am:comfort-hydration: sodium-hyaluronate (5)
- am:daytime-photoprotection: titanium-dioxide (5)
- pm:barrier-support-moisturising: squalane (5)
- pm:overnight-comfort: madecassoside (5)

**dry, dryness**

- am:comfort-hydration: sodium-hyaluronate (5)
- am:daytime-photoprotection: titanium-dioxide (5)
- pm:barrier-support-moisturising: ceramide-eop (5)
- pm:overnight-comfort: ceramide-np (5)

Deterministic stages (triage, routine steps, safety status) are expected to be identical in every run. Variation in picks is expected only where the LLM chooses among approved candidates; any pick outside the pool or any unsafe run would be a failure.
