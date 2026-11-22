# Score-band rotation evaluation

Generated 2026-11-22 09:43 UTC by `npm run eval:rotation` in 25.7 s.

Grid: 4 environments × 10 concerns × 4 profiles × 3 finish preferences = **480 input combinations**, each run **10 times in a row** with a fresh seed and a shared recent-picks memory (as successive visitors to the server). GPT is not called.

Rule (`lib/rotation.mjs` v1.0): candidates within **0.05** of the slot's top score are treated as equally supported (smaller than one evidence-grade step, 0.075). One is drawn with weight exp((score − top)/0.025), × 0.2 if it was shown for that slot in the last 3 runs.

## Checks

| Check | Result |
| --- | --- |
| R1 every pick within 0.05 of its slot's top score | pass |
| R2 every pick in its own approved pool; post-selection safety removed nothing (0 removals) | pass |
| R3 same seed + same memory replays the same output | pass |
| R4 no seed gives the plain top-score pick | pass |
| R5 no near-tied slot shows one ingredient in more than 80% of picks | pass |
| R6 every "equally good" alternative is in the band and pool, not shown elsewhere, and passes safety when swapped in (23518 shown) | pass |

19820 picks; 80.4% came from a band with more than one member; 37.9% differ from the top-scored candidate.

## Picks per step, before (top score) and after (rotation)

| Step | Near-tied pool | Before | After |
| --- | :---: | --- | --- |
| am:antioxidant-context | yes | resveratrol 90.0%, tocopherol 10.0% | resveratrol 37.8%, ascorbic-acid 32.0%, tocopherol 30.2% |
| am:comfort-hydration | yes | beta-glucan 49.0%, sodium-hyaluronate 35.3%, glycerin 15.7% | glycerin 39.2%, sodium-hyaluronate 32.2%, beta-glucan 28.6% |
| am:daytime-photoprotection | yes | titanium-dioxide 100.0% | titanium-dioxide 70.7%, zinc-oxide 29.3% |
| am:light-hydration | yes | niacinamide 56.0%, beta-glucan 28.0%, sodium-hyaluronate 16.0% | niacinamide 60.4%, beta-glucan 19.2%, sodium-hyaluronate 10.4%, glycerin 10.0% |
| am:supportive-hydration | yes | beta-glucan 52.0%, niacinamide 48.0% | beta-glucan 46.4%, niacinamide 43.2%, glycerin 10.4% |
| pm:barrier-support-moisturising | yes | ceramide-eop 38.0%, squalane 35.1%, dimethicone 21.2%, ceramide-np 5.7% | ceramide-eop 30.7%, ceramide-np 27.6%, dimethicone 21.2%, squalane 20.5% |
| pm:lightweight-moisturising | yes | glycerin 58.6%, niacinamide 41.4% | niacinamide 54.5%, glycerin 44.8%, squalane 0.7% |
| pm:overnight-comfort | yes | madecassoside 57.7%, ceramide-np 16.5%, squalane 14.0%, allantoin 11.9% | madecassoside 43.1%, allantoin 29.5%, ceramide-np 14.1%, squalane 13.3% |
| pm:supportive-moisturising | yes | squalane 100.0% | squalane 52.3%, linoleic-acid 29.6%, ceramide-ap 18.1% |
| pm:texture-renewal | no | gluconolactone 83.3%, salicylic-acid 16.7% | gluconolactone 83.3%, salicylic-acid 16.7% |

Steps whose pool has a clear leader (a gap above the band) keep that leader, for example salicylic acid for evening texture renewal in the breakout context. Rotation only moves picks between candidates the score cannot tell apart.
