# Local reviewer queue

This folder is reserved for the protected, local-only reviewer workflow.

When explicitly enabled, the server creates `review-annotations.local.json` here with owner-only permissions. That file is ignored by Git and must not contain patient data, user identifiers, symptoms, credentials, or copied restricted source text.

The queue records a reviewer’s local annotation against a source-card ID. Its `approve`, `reject`, `needs_changes`, and `annotate` actions are **not** clinical approval and have no automatic effect on:

- the research Atlas or its `clinicalReviewStatus` field;
- source rights or corpus eligibility;
- Pinecone records or strict CUE eligibility; or
- routine selection, safety guards, or synthesis.

To enable an isolated local session, set `REVIEWER_QUEUE_ENABLED=true` and a private `REVIEWER_QUEUE_TOKEN` of at least 24 characters in `.env`. The server refuses the queue when `NODE_ENV=production`.

Use the `x-reviewer-token` request header for `GET` and `POST /api/reviewer-queue`. The public dashboard does not send this header and cannot write annotations.
