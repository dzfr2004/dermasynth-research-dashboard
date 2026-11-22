# Symptom-triage evaluation

Generated 2026-11-22 by `npm run eval:triage`. Case set: 148 labelled cases (86 need professional care, 62 should clear).

| Method | Sensitivity | Specificity | Accuracy | Missed redirects | False redirects |
| --- | ---: | ---: | ---: | ---: | ---: |
| v1_keyword_baseline | 22.1% | 91.9% | 51.4% | 67 | 5 |
| v2_rules | 100.0% | 100.0% | 100.0% | 0 | 0 |

## Accuracy by case type

| Case type | v1_keyword_baseline | v2_rules |
| --- | ---: | ---: |
| direct | 11/13 | 13/13 |
| paraphrase | 1/21 | 21/21 |
| typo | 0/8 | 8/8 |
| mixed | 2/4 | 4/4 |
| negation | 4/8 | 8/8 |
| cosmetic | 24/24 | 24/24 |
| held-out | 16/40 | 40/40 |
| fresh | 18/30 | 30/30 |

## Errors

**v1_keyword_baseline**: 

- tri-007 (direct, expected redirect, got clear): "A mole on my arm has been changing shape."
- tri-013 (direct, expected redirect, got clear): "I broke out in hives."
- tri-014 (paraphrase, expected redirect, got clear): "My face is swollen."
- tri-015 (paraphrase, expected redirect, got clear): "my lips puffed up after the new lip mask"
- tri-016 (paraphrase, expected redirect, got clear): "Eyes puffy and itchy after new cream."
- tri-017 (paraphrase, expected redirect, got clear): "Burning after new product."
- tri-018 (paraphrase, expected redirect, got clear): "It stings a lot since I started using the retinol serum."
- tri-019 (paraphrase, expected redirect, got clear): "My cheeks went really red after using the toner."
- tri-020 (paraphrase, expected redirect, got clear): "There's yellow stuff oozing from a spot."
- tri-021 (paraphrase, expected redirect, got clear): "My throat feels tight and my skin is itchy."
- tri-022 (paraphrase, expected redirect, got clear): "I can't breathe properly and my face is hot."
- tri-023 (paraphrase, expected redirect, got clear): "Big welts appeared on my neck."
- tri-024 (paraphrase, expected redirect, got clear): "The redness keeps getting worse every day."
- tri-025 (paraphrase, expected redirect, got clear): "This sore won't heal."
- tri-026 (paraphrase, expected redirect, got clear): "My eyelids are swelling up."
- tri-027 (paraphrase, expected redirect, got clear): "Skin peeling badly after the acid peel."
- tri-028 (paraphrase, expected redirect, got clear): "I got a reaction from the sunscreen."
- tri-029 (paraphrase, expected redirect, got clear): "There's a new lump under my skin."
- tri-030 (paraphrase, expected redirect, got clear): "The rash is all over my body."
- tri-031 (paraphrase, expected redirect, got clear): "It has been itchy and red since applying the new moisturiser."
- tri-032 (paraphrase, expected redirect, got clear): "Really painful bumps on my jaw."
- tri-034 (paraphrase, expected redirect, got clear): "The patch is raw and weeping."
- tri-035 (typo, expected redirect, got clear): "blistr on cheek"
- tri-036 (typo, expected redirect, got clear): "my face is swolen"
- tri-037 (typo, expected redirect, got clear): "lips are sweling"
- tri-038 (typo, expected redirect, got clear): "burnnig after new serum"
- tri-039 (typo, expected redirect, got clear): "i have a fevr and rash"
- tri-040 (typo, expected redirect, got clear): "infeccted spot on my nose"
- tri-041 (typo, expected redirect, got clear): "blisterz on my forehead"
- tri-042 (typo, expected redirect, got clear): "skin is bleding"
- tri-044 (mixed, expected redirect, got clear): "I don't have a rash however my eyes are puffy."
- tri-046 (mixed, expected redirect, got clear): "I'm not sure whether my face is swelling."
- tri-047 (negation, expected clear, got redirect): "I do not have a fever."
- tri-049 (negation, expected clear, got redirect): "No blisters, no bleeding, just dry patches."
- tri-052 (negation, expected clear, got redirect): "My skin isn't swollen or infected."
- tri-054 (negation, expected clear, got redirect): "There is no pus and nothing is spreading."
- tri-h001 (held-out, expected redirect, got clear): "my eye has swollen shut"
- tri-h002 (held-out, expected redirect, got clear): "tongue feels swollen and tingly"
- tri-h003 (held-out, expected redirect, got clear): "I got hives all over after trying the serum"
- tri-h004 (held-out, expected redirect, got clear): "face ballooned up this morning"
- tri-h005 (held-out, expected redirect, got clear): "there are small fluid-filled bubbles on my chin"
- tri-h006 (held-out, expected redirect, got clear): "my acne spot is leaking yellow fluid"
- tri-h007 (held-out, expected redirect, got clear): "the area around the pimple is hot, red and hurts a lot"
- tri-h008 (held-out, expected redirect, got clear): "my skin cracked and it bleeds when I smile"
- tri-h009 (held-out, expected redirect, got clear): "since yesterday the new toner makes my face burn"
- tri-h010 (held-out, expected redirect, got clear): "used the aha peel and now my skin is raw"
- tri-h011 (held-out, expected redirect, got clear): "a dark spot on my back has grown and changed colour"
- tri-h012 (held-out, expected redirect, got clear): "I feel feverish and my rash is spreading"
- tri-h013 (held-out, expected redirect, got clear): "it hurts so much I can't sleep"
- tri-h014 (held-out, expected redirect, got clear): "chest feels tight after using the spray sunscreen"
- tri-h015 (held-out, expected redirect, got clear): "rash spread from my cheek to my neck overnight"
- tri-h016 (held-out, expected redirect, got clear): "red streaks spreading from a cut on my face"
- tri-h017 (held-out, expected redirect, got clear): "my lips swelled up after the lip balm"
- tri-h018 (held-out, expected redirect, got clear): "eyes watering and swollen after the eye cream"
- tri-h020 (held-out, expected redirect, got clear): "skin burning like fire after retinol"
- tri-h021 (held-out, expected redirect, got clear): "its been itchy and red ever since I started the new moisturizer"
- tri-h022 (held-out, expected redirect, got clear): "breathing is hard and my face is itchy"
- tri-h023 (held-out, expected redirect, got clear): "the rash keeps getting worse despite stopping everything"
- tri-h025 (held-out, expected redirect, got clear): "stinging and redness right after applying vitamin c serum"
- tri-h027 (held-out, expected clear, got redirect): "no blisters or pus, only blackheads"
- tri-f001 (fresh, expected redirect, got clear): "my cheek got really puffy and hot an hour after the new serum"
- tri-f003 (fresh, expected redirect, got clear): "skin on my arm is peeling off in sheets and I feel feverish"
- tri-f004 (fresh, expected redirect, got clear): "a mole on my back changed colour and got bigger"
- tri-f005 (fresh, expected redirect, got clear): "my tongue feels thick and swallowing is hard after using the mask"
- tri-f006 (fresh, expected redirect, got clear): "burn from a chemical peel is oozing yellow stuff"
- tri-f007 (fresh, expected redirect, got clear): "red streak spreading up from a pimple on my leg"
- tri-f009 (fresh, expected redirect, got clear): "eyelids swelled up so much i can barely open my eyes"
- tri-f011 (fresh, expected redirect, got clear): "huge painful lumps under the skin on my jaw that leave scars"
- tri-f012 (fresh, expected redirect, got clear): "rash all over my body after starting new antibiotics"
- tri-f013 (fresh, expected redirect, got clear): "patch of skin went numb and pale after the sunburn"
- tri-f014 (fresh, expected redirect, got clear): "face has been hot, red and swollen for three days and its getting worse"
- tri-f015 (fresh, expected redirect, got clear): "hives came up and my throat feels tight"

**v2_rules**: none


## Held-out set: first blind run

The 40 held-out cases (type "held-out" above) were written after the rules were tuned and run once blind on 2026-09-24: v2 rules sensitivity 17/25 (68.0%), specificity 15/15 (100%); v1 baseline sensitivity 2/25 (8.0%). The missed concepts were then added (face ballooned; fluid-filled bubbles; leaking yellow fluid; hot, red and hurting; spot grown and changed colour; pain preventing sleep; chest feels tight; breathing is hard), so today's held-out score is optimistic. The 68% blind figure is the honest estimate of how the rules alone generalise, which is why the model second opinion exists.

Scope: both sets were written by the developer. An independent set written by someone else is run with `npm run eval:independent`.

