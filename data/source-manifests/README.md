# Source manifests

This folder is the **discovery and review queue** for DermaSynth’s evidence base. It is deliberately separate from `data/evidence/`, so `npm run ingest:evidence` cannot upload anything listed here.

`starter-corpus.v1.json` contains verified source metadata, scope notes, and rights/review status. It does **not** contain source passages, generated summaries, or clinical rules.

## Status meanings

- `ready_for_acquisition` — an authoritative or open-access source with a compatible displayed licence has been located. Capture a stable copy and obtain clinical review before deriving chunks.
- `rights_hold` — a useful source was found, but its terms do not clearly allow extraction, embedding, or redistribution. Keep it as a citation/link until written permission or a compatible licence is confirmed.
- `link_only` — use the source in the interface as provenance or a direct link; do not scrape or ingest its database content.
- `deferred` — intentionally excluded until a specific permission or governance decision is made.

## Gate before Pinecone

Every source must pass all of these checks before a derived JSONL record is added to `data/evidence/`:

1. Confirm permitted use, licence, version, and stable URL.
2. Capture only the portions needed for the stated claim, with page/section locators.
3. Have a qualified reviewer approve scope and wording.
4. Record limitations, contraindications, jurisdiction, and retrieval date.
5. Keep deterministic safety rules separate from retrieved prose.

Do not ingest CIR or NICE source text, or EWG Skin Deep data, from this manifest without documented permission. EWG remains a direct-link comparison source only.
