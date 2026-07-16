import assert from "node:assert/strict";
import { REUSE_RIGHTS_STATUS, inspectUploadReuseRights } from "../lib/evidence-rights.mjs";

const cases = [
  {
    id: "allows-cleared-research-noncommercial",
    record: {
      reuse_rights_status: REUSE_RIGHTS_STATUS.RESEARCH_NONCOMMERCIAL,
      reuse_rights_basis: "Permission recorded for free use in this non-commercial academic study.",
      reuse_rights_reviewed_at: "2026-07-16",
      commercial_restriction: true,
    },
    allowed: true,
  },
  {
    id: "allows-cleared-commercial",
    record: {
      reuse_rights_status: REUSE_RIGHTS_STATUS.COMMERCIAL,
      reuse_rights_basis: "CC BY 4.0 licence and attribution requirements were recorded.",
      reuse_rights_reviewed_at: "2026-07-16",
      commercial_restriction: false,
    },
    allowed: true,
  },
  {
    id: "allows-existing-commercial-safe-license-metadata",
    record: {
      license_or_access: "CC BY 4.0; attribution required.",
      attribution_required: true,
    },
    allowed: true,
  },
  {
    id: "rejects-noncommercial-without-explicit-commercial-restriction",
    record: {
      reuse_rights_status: REUSE_RIGHTS_STATUS.RESEARCH_NONCOMMERCIAL,
      reuse_rights_basis: "Permission recorded for free use in this non-commercial academic study.",
      reuse_rights_reviewed_at: "2026-07-16",
    },
    allowed: false,
  },
  {
    id: "rejects-uncleared-or-noncommercial-license-as-commercial-safe",
    record: {
      license_or_access: "CC BY-NC 4.0; attribution required.",
    },
    allowed: false,
  },
];

for (const testCase of cases) {
  const result = inspectUploadReuseRights(testCase.record);
  assert.equal(result.allowed, testCase.allowed, `${testCase.id}: ${result.reason || "unexpected result"}`);
}

console.log(`Evidence reuse-rights evaluation passed: ${cases.length}/${cases.length}`);
