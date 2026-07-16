const REUSE_RIGHTS_STATUS = Object.freeze({
  RESEARCH_NONCOMMERCIAL: "cleared_research_noncommercial",
  COMMERCIAL: "cleared_commercial",
});

const VALID_REUSE_RIGHTS_STATUSES = new Set(Object.values(REUSE_RIGHTS_STATUS));
const UNRESOLVED_BASIS_PATTERN = /\b(?:tbd|unknown|pending|unverified|to be determined)\b/i;

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isIsoCalendarDate(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1800 || year > 2100) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function hasRecognisedCommercialSafeLegacyLicense(value) {
  const basis = cleanText(value);
  if (!basis || UNRESOLVED_BASIS_PATTERN.test(basis)) return false;

  const hasCommercialRestriction = /\b(?:non[- ]?commercial|cc[- ]?by[- ]?nc|cc[- ]?nc|no[- ]?derivatives|cc[- ]?by[- ]?nd)\b/i.test(basis);
  if (hasCommercialRestriction) return false;

  return /\b(?:cc0|cc[- ]?by)\b|\bcreative commons attribution\b|\bpublic domain\b/i.test(basis);
}

function rejected(reason) {
  return { allowed: false, reason };
}

/**
 * Determine whether a prepared evidence record has enough documented reuse
 * metadata for an upload. This is a provenance gate, not legal advice or an
 * independent verification of a licence or permission statement.
 */
export function inspectUploadReuseRights(record) {
  const status = cleanText(record?.reuse_rights_status).toLowerCase();
  const basis = cleanText(record?.reuse_rights_basis);
  const reviewedAt = cleanText(record?.reuse_rights_reviewed_at);
  const commercialRestriction = record?.commercial_restriction;

  if (!status) {
    if (commercialRestriction !== true && hasRecognisedCommercialSafeLegacyLicense(record?.license_or_access)) {
      return {
        allowed: true,
        status: "legacy_commercial_safe_license",
        basis: cleanText(record.license_or_access),
      };
    }
    return rejected("requires reuse_rights_status, reuse_rights_basis, and reuse_rights_reviewed_at, or a recognised commercial-safe license_or_access value");
  }

  if (!VALID_REUSE_RIGHTS_STATUSES.has(status)) {
    return rejected(`has unsupported reuse_rights_status \"${status}\"`);
  }
  if (basis.length < 12 || UNRESOLVED_BASIS_PATTERN.test(basis)) {
    return rejected("requires a specific, resolved reuse_rights_basis");
  }
  if (!isIsoCalendarDate(reviewedAt)) {
    return rejected("requires reuse_rights_reviewed_at as a valid YYYY-MM-DD date");
  }

  if (status === REUSE_RIGHTS_STATUS.RESEARCH_NONCOMMERCIAL) {
    if (commercialRestriction !== true) {
      return rejected("marks research/non-commercial reuse but commercial_restriction is not true");
    }
    return { allowed: true, status, basis, reviewedAt };
  }

  if (commercialRestriction === true) {
    return rejected("marks commercial-safe reuse but commercial_restriction is true");
  }
  return { allowed: true, status, basis, reviewedAt };
}

export { REUSE_RIGHTS_STATUS };
