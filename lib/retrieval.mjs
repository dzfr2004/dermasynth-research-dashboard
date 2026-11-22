import { fetchJson } from "./http-client.mjs";
import { describePineconeIndex, isIntegratedTextIndex, PINECONE_API_VERSION } from "./pinecone.mjs";
import { ingredientResearchExplorer } from "./ingredient-knowledge.mjs";
import { createRepository } from "./ingredient-repository.mjs";
import { bm25 } from "./bm25.mjs";
import { CONCERN_CATALOG } from "./safety.mjs";
import { cachedSearch, searchCacheKey } from "./search-cache.mjs";

const TOP_K = 8;
const MINIMUM_RELEVANCE_SCORE = 0.15;
const REQUIRED_ELIGIBLE_EVIDENCE = 3;
const REQUIRED_DOCUMENTS = 2;
const REQUIRED_DIRECT_EVIDENCE = 2;
const INGREDIENT_SELECTION_ELIGIBLE_ROLE = "eligible_ingredient_selection";
const RESEARCH_TOP_K = 12;
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const RRF_K = 60;
const RESEARCH_STOP_WORDS = new Set(["and", "the", "for", "with", "from", "only", "research", "ingredient", "evidence", "map", "source", "final", "demo", "context"]);

function clipped(value, length = 900) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, length);
}

function safeHttpUrl(value) {
  const candidate = clipped(value, 2_000);
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function finiteScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function booleanField(value) {
  return value === true || String(value).trim().toLowerCase() === "true";
}

function stringList(value, itemLength = 120) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clipped(item, itemLength)).filter(Boolean).slice(0, 20);
}

function recordedReviewState(value) {
  const status = clipped(value, 220);
  // An anonymous, user-confirmed, or otherwise unspecified approval must not
  // silently satisfy the strict synthesis gate.
  const indicatesApproval = /^approved(?:\b|[-_:])/i.test(status);
  const indicatesQualifiedReviewer = /\b(qualified|licensed|credentialed|dermatolog(?:ist|y)|domain[-\s]?reviewer)\b/i.test(status);
  const lacksReviewerIdentity = /user[-\s]?confirmed|identity\s+not\s+captured|reviewer\s+not\s+(?:named|identified)|unverified/i.test(status);
  if (indicatesApproval && indicatesQualifiedReviewer && !lacksReviewerIdentity) return "qualified_review_recorded";
  if (indicatesApproval) return "approval_not_qualified";
  if (status) return "not_approved";
  return "not_recorded";
}

function concernRole(claimCategory, concern) {
  const category = String(claimCategory || "").toLowerCase();
  if (!category) return "out_of_scope";

  const direct = {
    acne: ["acne-"],
    barrier: ["barrier-"],
    pigment: ["pigment", "hyperpigment", "acne-associated-pigment"],
    sensitivity: ["sensitive-skin-"],
    dryness: ["dryness-"],
    oil: ["oil-", "sebum-", "shine-"],
    texture: ["texture-"],
    redness: ["redness-"],
    radiance: ["radiance-"],
    pores: ["pores-"],
  };
  if ((direct[concern] || []).some((prefix) => category.includes(prefix))) return "direct";
  // Published-database records are tagged with the concern they were
  // retrieved for, so they are direct evidence for that concern.
  if (concern && category === `${concern}-approved-published-record`) return "direct";

  // Environmental context can complement, but never replace, direct concern
  // evidence. The evidence-sufficiency gate requires two direct records.
  if (category.includes("environmental-exposure-context") || category.includes("sensitive-skin-environmental-context")) {
    return "contextual";
  }
  return "out_of_scope";
}

function documentKey(item) {
  return item.documentId || item.sourceUrl || item.citation || item.source || "";
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function gateCriteria({ eligible }) {
  const documentCount = new Set(eligible.map(documentKey).filter(Boolean)).size;
  const directCount = eligible.filter((item) => item.eligibility?.role === "direct").length;
  const contextualCount = eligible.filter((item) => item.eligibility?.role === "contextual").length;
  const relevantCount = eligible.filter((item) => item.score !== null && item.score >= MINIMUM_RELEVANCE_SCORE).length;
  const criteria = [
    {
      id: "eligible-evidence-count",
      label: "Eligible evidence records",
      required: REQUIRED_ELIGIBLE_EVIDENCE,
      actual: eligible.length,
      passed: eligible.length >= REQUIRED_ELIGIBLE_EVIDENCE,
    },
    {
      id: "distinct-source-documents",
      label: "Distinct attributable source documents",
      required: REQUIRED_DOCUMENTS,
      actual: documentCount,
      passed: documentCount >= REQUIRED_DOCUMENTS,
    },
    {
      id: "direct-concern-evidence",
      label: "Direct concern-scope records",
      required: REQUIRED_DIRECT_EVIDENCE,
      actual: directCount,
      passed: directCount >= REQUIRED_DIRECT_EVIDENCE,
    },
    {
      id: "relevance-threshold",
      label: "Records meeting the retrieval relevance threshold",
      required: REQUIRED_ELIGIBLE_EVIDENCE,
      actual: relevantCount,
      threshold: MINIMUM_RELEVANCE_SCORE,
      passed: relevantCount >= REQUIRED_ELIGIBLE_EVIDENCE,
    },
  ];
  return { criteria, documentCount, directCount, contextualCount, relevantCount };
}

/**
 * Evidence-sufficiency gate. It passes only when every count criterion is
 * met; there is no separate score threshold. `sufficiencyScore` is the
 * weighted share of the criteria that are met (1.00 when the gate passes) and
 * is reported for information only.
 *
 * This gate decides whether there is enough attributable evidence to ask the
 * model for a routine. It is not the Context Utilisation Evaluation (CUE),
 * which scores the model's OUTPUT against its context (lib/cue.mjs).
 */
function evidenceSufficiencyGate(evidence) {
  const eligible = evidence.filter((item) => item.eligibility?.eligible);
  const details = gateCriteria({ eligible });
  const sufficiencyScore = round(
    (Math.min(eligible.length / REQUIRED_ELIGIBLE_EVIDENCE, 1) * 0.35)
      + (Math.min(details.documentCount / REQUIRED_DOCUMENTS, 1) * 0.25)
      + (Math.min(details.directCount / REQUIRED_DIRECT_EVIDENCE, 1) * 0.25)
      + (Math.min(details.relevantCount / REQUIRED_ELIGIBLE_EVIDENCE, 1) * 0.15),
  );
  const passed = details.criteria.every((criterion) => criterion.passed);
  return {
    kind: "evidence_sufficiency",
    passed,
    sufficiencyScore,
    relevanceThreshold: MINIMUM_RELEVANCE_SCORE,
    ...details,
    rationale: passed
      ? "Enough attributable, review-marked, non-product-specific evidence was found across direct concern and environmental-context records. This is an evidence-coverage check, not clinical validation."
      : "The evidence-sufficiency gate did not satisfy every attribution, scope, diversity and relevance requirement. Live category selection is withheld.",
  };
}

function emptyGate() {
  return evidenceSufficiencyGate([]);
}

function seedEvidence(config, reason) {
  const gate = emptyGate();
  return {
    mode: "seed",
    sufficiencyScore: gate.sufficiencyScore,
    scoreType: "evidence_sufficiency_coverage",
    evidence: [],
    eligibleEvidence: [],
    gate,
    query: "",
    trace: {
      requestedTopK: TOP_K,
      candidateCount: 0,
      eligibleEvidenceCount: 0,
      excludedEvidenceCount: 0,
      qualifyingDocumentCount: 0,
      directEvidenceCount: 0,
      contextualEvidenceCount: 0,
      relevanceThreshold: MINIMUM_RELEVANCE_SCORE,
      criteria: gate.criteria,
    },
    notices: [reason],
  };
}

function queryFor({ profile, concern, environment }) {
  const readings = environment?.readings || {};
  const context = [
    `${concern} skincare research`,
    `${profile} skin profile`,
    readings.uvi !== null && readings.uvi !== undefined ? `UV index ${readings.uvi}` : "UV data unavailable",
    readings.humidity !== null && readings.humidity !== undefined ? `humidity ${readings.humidity}%` : "humidity unavailable",
    readings.pm25 !== null && readings.pm25 !== undefined ? `PM2.5 ${readings.pm25} ug/m3` : "PM2.5 unavailable",
  ];
  return context.join(". ");
}

function researchQueryFor({ concern, search = "" }) {
  const terms = [
    "ingredient research evidence map",
    String(concern || "").trim(),
    String(search || "").trim(),
    "source provenance limitations nonclinical final demo",
  ].filter(Boolean);
  return terms.join(". ");
}

function tokeniseResearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => (token.length > 1 || /^\d$/.test(token)) && !RESEARCH_STOP_WORDS.has(token));
}

function bm25Rank(records, query) {
  if (!records.length) return [];
  const queryTerms = [...new Set(tokeniseResearchText(query))];
  if (!queryTerms.length) return records.map((record, index) => ({ ...record, lexicalScore: round(1 - (index * 0.01), 4) }));

  const documents = records.map((record) => {
    const text = [
      record.title,
      record.source,
      ...(record.ingredientIds || []),
      ...(record.ingredientNames || []),
      ...(record.sourceRecordIds || []),
      record.evidenceScope,
      record.citation,
    ].join(" ");
    const tokens = tokeniseResearchText(text);
    const frequencies = new Map();
    tokens.forEach((token) => frequencies.set(token, (frequencies.get(token) || 0) + 1));
    return { record, tokens, frequencies };
  });
  const averageLength = documents.reduce((sum, document) => sum + document.tokens.length, 0) / documents.length || 1;
  const documentFrequency = new Map();
  documents.forEach((document) => {
    new Set(document.tokens).forEach((token) => documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1));
  });
  const total = documents.length;
  return documents.map((document, index) => {
    const score = queryTerms.reduce((sum, term) => {
      const tf = document.frequencies.get(term) || 0;
      if (!tf) return sum;
      const df = documentFrequency.get(term) || 0;
      const idf = Math.log(1 + ((total - df + 0.5) / (df + 0.5)));
      const denominator = tf + (BM25_K1 * (1 - BM25_B + (BM25_B * document.tokens.length / averageLength)));
      return sum + (idf * tf * (BM25_K1 + 1) / denominator);
    }, 0);
    return { ...document.record, lexicalScore: round(score || (1 / (index + 1)) * 0.0001, 4) };
  }).sort((left, right) => right.lexicalScore - left.lexicalScore || left.title.localeCompare(right.title));
}

function researchIdentity(item) {
  return item?.ingredientIds?.[0] || item?.documentId || item?.id || "";
}

function reciprocalRankFusion(dense, lexical) {
  const byIdentity = new Map();
  const include = (item, rank, kind) => {
    const identity = researchIdentity(item);
    if (!identity) return;
    const previous = byIdentity.get(identity) || { ...item, sourceRecordIds: [...(item.sourceRecordIds || [])], ingredientIds: [...(item.ingredientIds || [])], ingredientNames: [...(item.ingredientNames || [])] };
    previous[`${kind}Rank`] = rank + 1;
    previous[`${kind}Score`] = kind === "dense" ? item.score : item.lexicalScore;
    previous.fusedScore = (previous.fusedScore || 0) + (1 / (RRF_K + rank + 1));
    previous.sourceRecordIds = [...new Set([...previous.sourceRecordIds, ...(item.sourceRecordIds || [])])];
    previous.ingredientIds = [...new Set([...previous.ingredientIds, ...(item.ingredientIds || [])])];
    previous.ingredientNames = [...new Set([...previous.ingredientNames, ...(item.ingredientNames || [])])];
    byIdentity.set(identity, previous);
  };
  dense.forEach((item, index) => include(item, index, "dense"));
  lexical.forEach((item, index) => include(item, index, "lexical"));
  return [...byIdentity.values()]
    .map((item) => ({ ...item, fusedScore: round(item.fusedScore || 0, 5), score: round(item.fusedScore || 0, 5) }))
    .sort((left, right) => right.fusedScore - left.fusedScore || left.title.localeCompare(right.title))
    .slice(0, RESEARCH_TOP_K);
}

function assessEligibility(item, concern) {
  const blockers = [];
  const cautions = [];
  const satisfied = [];
  const role = concernRole(item.claimCategory, concern);
  const attributable = Boolean(item.documentId && item.title && item.source && (item.sourceUrl || item.citation));

  if (attributable) satisfied.push("attributable-source");
  else blockers.push("missing-attribution");

  if (item.reviewStatus === "qualified_review_recorded") satisfied.push("qualified-review-recorded");
  else if (item.reviewStatus === "governance_signoff_recorded") satisfied.push("governance-signoff-recorded");
  else if (item.reviewStatus === "approval_not_qualified") blockers.push("review-approval-not-qualified");
  else blockers.push(item.reviewStatus === "not_approved" ? "review-not-approved" : "review-not-recorded");

  if (item.evidenceTier) satisfied.push("evidence-tier-present");
  else blockers.push("missing-evidence-tier");

  if (item.productSpecific) blockers.push("product-specific-evidence");
  else satisfied.push("not-product-specific");

  // Ingredient-tagged records need a separate, explicit activation review.
  // A generic clinical-review marker alone must not turn a formulation note
  // into a named-ingredient selection signal.
  if (item.ingredientEvidenceRole && item.ingredientEvidenceRole !== INGREDIENT_SELECTION_ELIGIBLE_ROLE) {
    blockers.push("ingredient-evidence-not-activated");
  } else if (item.ingredientEvidenceRole === INGREDIENT_SELECTION_ELIGIBLE_ROLE) {
    satisfied.push("ingredient-selection-activation-recorded");
  }

  if (item.score === null) blockers.push("missing-relevance-score");
  else if (item.score < MINIMUM_RELEVANCE_SCORE) blockers.push("relevance-below-threshold");
  else satisfied.push("relevance-threshold-met");

  if (role === "out_of_scope") blockers.push("concern-scope-mismatch");
  else satisfied.push(role === "direct" ? "direct-concern-scope" : "environmental-context-scope");

  if (item.conflictFlag) cautions.push("conflict-disclosure-present");
  if (item.industrySponsored) cautions.push("industry-sponsored-record");
  if (item.commercialRestriction) cautions.push("commercial-restriction-recorded");
  if (item.attributionRequired) cautions.push("attribution-required");

  return {
    eligible: blockers.length === 0,
    role,
    blockers,
    cautions,
    satisfied,
    relevanceThreshold: MINIMUM_RELEVANCE_SCORE,
  };
}

function normaliseHits(payload, config, concern) {
  const hits = payload?.result?.hits || payload?.hits || payload?.matches || [];
  if (!Array.isArray(hits)) return [];

  return hits.map((hit, index) => {
    const fields = hit?.fields || hit?.metadata || {};
    const excerpt = clipped(fields[config.pinecone.textField] || hit?.text);
    const clinicalReviewStatus = clipped(fields.clinical_review_status, 220);
    const sourceCardReviewStatus = clipped(fields.source_card_review_status, 220);
    const item = {
      id: clipped(hit?._id || hit?.id || `record-${index + 1}`, 160),
      title: clipped(fields[config.pinecone.titleField] || "Indexed evidence", 180),
      source: clipped(fields[config.pinecone.sourceField] || "Pinecone record", 180),
      documentId: clipped(fields.document_id, 200),
      excerpt,
      sourceUrl: safeHttpUrl(fields.source_url),
      sourceLocator: clipped(fields.source_locator, 360),
      citation: clipped(fields.citation_text, 700),
      evidenceTier: clipped(fields.evidence_tier, 120),
      jurisdiction: clipped(fields.jurisdiction, 120),
      publishedYear: Number.isInteger(Number(fields.published_year)) ? Number(fields.published_year) : null,
      documentType: clipped(fields.document_type, 120),
      claimCategory: clipped(fields.claim_category, 160),
      evidenceScope: clipped(fields.evidence_scope, 520),
      reviewScope: clipped(fields.review_scope, 180),
      ingredientEvidenceRole: clipped(fields.ingredient_evidence_role, 120),
      demoUseStatus: clipped(fields.demo_use_status, 120),
      sourceUseMode: clipped(fields.source_use_mode, 160),
      normalizationStatus: clipped(fields.normalization_status, 160),
      routineSelectionAllowed: booleanField(fields.routine_selection_allowed),
      ingredientIds: stringList(fields.ingredient_ids),
      ingredientNames: stringList(fields.ingredient_names),
      sourceRecordIds: stringList(fields.source_record_ids),
      clinicalReviewStatus,
      sourceCardReviewStatus,
      // Non-clinical category-source cards may carry source_card_review_status
      // for display, but strict CUE can only count a documented qualified
      // clinical-review marker; source-card review state cannot activate it.
      reviewStatus: recordedReviewState(clinicalReviewStatus),
      licenseOrAccess: clipped(fields.license_or_access, 220),
      conflictFlag: booleanField(fields.conflict_flag),
      conflictDisclosure: clipped(fields.conflict_disclosure, 360),
      productSpecific: booleanField(fields.product_specific),
      industrySponsored: booleanField(fields.industry_sponsored),
      commercialRestriction: booleanField(fields.commercial_restriction),
      attributionRequired: booleanField(fields.attribution_required),
      envTags: stringList(fields.env_tags),
      score: finiteScore(hit?._score ?? hit?.score),
    };
    return { ...item, eligibility: assessEligibility(item, concern) };
  }).filter((hit) => hit.excerpt && hit.id);
}

function sourceForLocalIngredient(ingredient) {
  return ingredient.sources.find((source) => source.sourceFamily === "medical_journal")
    || ingredient.sources.find(Boolean)
    || null;
}

function atlasIngredientCount() {
  return Number(ingredientResearchExplorer({})?.overview?.ingredientCount) || 0;
}

function localResearchEvidence({ concern, search = "" }) {
  const explorer = ingredientResearchExplorer({ concern });
  // Candidate filtering is deliberately by research context only. The BM25
  // ranker below must see every candidate so broader queries (for example
  // "oil shine" or "barrier source") can still retrieve a mapped record.
  const ingredients = explorer.ingredients;
  const evidence = ingredients.map((ingredient, index) => {
    const source = sourceForLocalIngredient(ingredient);
    return {
      id: `registry-${ingredient.id}`,
      title: `${ingredient.displayName} — research evidence map`,
      source: source?.source || "Source mapping record",
      documentId: `ingredient-registry-${ingredient.id}`,
      excerpt: `Source-mapped final-demo ingredient record. ${ingredient.evidenceStates.join("; ")}. Limitations are preserved in the research atlas.`,
      sourceUrl: source?.sourceUrl || "",
      sourceLocator: source?.sourceLocator || "Ingredient registry",
      citation: source?.title || "Ingredient research record",
      evidenceTier: "source-attributed research metadata",
      jurisdiction: "research-demo",
      publishedYear: null,
      documentType: "ingredient-research-map",
      claimCategory: "ingredient-research-demo-metadata",
      evidenceScope: "Non-clinical source mapping with documented boundaries; no individual-use inference.",
      ingredientEvidenceRole: "research_explorer_visible",
      ingredientIds: [ingredient.id],
      ingredientNames: [ingredient.displayName],
      sourceRecordIds: [...ingredient.sourceRecordIds],
      reviewStatus: "research_ready",
      researchReviewStatus: "source_mapped_for_final_demo",
      demoUseStatus: "research_demo_only",
      sourceUseMode: "source_link_and_original_metadata",
      normalizationStatus: ingredient.normalizationStatus,
      licenseOrAccess: "Per-source reuse metadata is shown in the Knowledge Atlas.",
      conflictFlag: false,
      conflictDisclosure: "Read the linked source and recorded boundary before interpreting this map.",
      productSpecific: false,
      industrySponsored: false,
      commercialRestriction: false,
      attributionRequired: true,
      envTags: [],
      score: round(Math.max(0.6, 0.98 - (index * 0.02))),
      sourceFamilies: ingredient.sourceFamilySummary,
      limitations: [...ingredient.limitations],
      eligibility: {
        eligible: false,
        role: "research_metadata",
        blockers: ["research-explorer-only"],
        cautions: ["source-boundaries-preserved"],
        satisfied: ["source-mapped", "nonclinical-demo"],
      },
    };
  });
  return { explorer, evidence: bm25Rank(evidence, researchQueryFor({ concern, search })).slice(0, RESEARCH_TOP_K) };
}

function researchCoverage(evidence, { mode, namespace }) {
  const uniqueIngredients = new Set(evidence.flatMap((item) => item.ingredientIds || [])).size;
  const sourceCount = new Set(evidence.flatMap((item) => item.sourceRecordIds || [])).size;
  return {
    status: evidence.length ? "mapped" : "no_match",
    mode,
    namespace: namespace || "local-registry",
    queryCoverage: evidence.length,
    uniqueIngredients,
    sourceRecords: sourceCount,
    rationale: evidence.length ? "Source-linked records for this research context." : "No ingredient record matched the requested research query.",
  };
}

function researchResult({ mode, namespace, query, evidence, strategy, notices = [] }) {
  const atlasCount = atlasIngredientCount();
  return {
    mode,
    namespace: namespace || "local-registry",
    query,
    evidence,
    strategy: strategy || "source-linked research retrieval",
    coverage: researchCoverage(evidence, { mode, namespace }),
    notices,
  };
}

/**
 * Research-atlas retrieval is intentionally separate from the strict generic
 * category-synthesis gate above. It makes the isolated demo namespace
 * demonstrable, while retaining its non-clinical, source-boundary contract.
 */
export async function retrieveResearchEvidence({ config, concern, search = "" }) {
  const query = researchQueryFor({ concern, search });
  const fallback = () => {
    const local = localResearchEvidence({ concern, search });
    return researchResult({
      mode: "local-research-registry",
      query,
      evidence: local.evidence,
      strategy: `local BM25 over the versioned ${atlasIngredientCount()}-ingredient research registry`,
      notices: ["Showing the versioned local registry because live Pinecone research retrieval is not enabled or available."],
    });
  };

  if (!config.liveServicesEnabled || !config.pinecone.apiKey || !config.pinecone.index) return fallback();

  try {
    const descriptor = await describePineconeIndex(config);
    if (!isIntegratedTextIndex(descriptor, config.pinecone.textField)) return fallback();
    const namespace = config.pinecone.researchNamespace;
    const url = `https://${descriptor.host}/records/namespaces/${encodeURIComponent(namespace)}/search`;
    // Same concern and search text give the same hits, so a recent result is
    // reused (see search-cache.mjs).
    const payload = await cachedSearch(config.searchCacheMs, searchCacheKey(["research", config.pinecone.index, namespace, RESEARCH_TOP_K, query]), () =>
      fetchJson(url, {
        service: "Pinecone research retrieval",
        timeoutMs: config.requestTimeoutMs,
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Api-Key": config.pinecone.apiKey,
          "X-Pinecone-Api-Version": PINECONE_API_VERSION,
        },
        body: JSON.stringify({
          query: { inputs: { text: query }, top_k: RESEARCH_TOP_K },
          fields: [
            config.pinecone.textField,
            config.pinecone.titleField,
            config.pinecone.sourceField,
            "document_id", "source_url", "source_locator", "citation_text", "published_year", "document_type",
            "evidence_tier", "jurisdiction", "claim_category", "ingredient_evidence_role", "ingredient_ids", "ingredient_names",
            "source_record_ids", "evidence_scope", "clinical_review_status", "source_card_review_status", "review_scope", "demo_use_status", "source_use_mode", "normalization_status",
            "license_or_access", "conflict_flag", "conflict_disclosure", "product_specific", "industry_sponsored",
            "commercial_restriction", "attribution_required", "routine_selection_allowed", "env_tags",
          ],
        }),
      }));
    const denseEvidence = normaliseHits(payload, config, concern).map((item) => ({
      ...item,
      researchReviewStatus: "source_mapped_for_final_demo",
      // The strict routine-eligibility result remains present as an audit
      // field, but does not block browsing the study corpus.
      researchUseStatus: "research_demo_only",
    }));
    if (!denseEvidence.length) return fallback();
    const lexicalEvidence = localResearchEvidence({ concern, search }).evidence;
    const evidence = reciprocalRankFusion(denseEvidence, lexicalEvidence);
    return researchResult({
      mode: "hybrid-retrieval",
      namespace,
      query,
      evidence,
      strategy: "Pinecone integrated dense retrieval fused with local BM25 using reciprocal-rank fusion",
    });
  } catch {
    const local = localResearchEvidence({ concern, search });
    return researchResult({
      mode: "local-research-registry",
      query,
      evidence: local.evidence,
      strategy: `local BM25 over the versioned ${atlasIngredientCount()}-ingredient research registry`,
      notices: ["Pinecone research retrieval was unavailable, so the same versioned final-demo registry is shown locally."],
    });
  }
}

function retrievalNotices(gate, evidence) {
  // Detailed audit notices are retained for evaluation and exported traces.
  // The browser condenses them into a short operational status.
  const notices = [];
  const excluded = evidence.filter((item) => !item.eligibility?.eligible);
  if (excluded.some((item) => item.eligibility.blockers.includes("product-specific-evidence"))) {
    notices.push("Product-specific records remain visible for audit but are excluded from generic category synthesis.");
  }
  if (excluded.some((item) => item.eligibility.blockers.includes("ingredient-evidence-not-activated"))) {
    notices.push("Ingredient-tagged research notes remain audit-only until a separate activation record is approved.");
  }
  if (excluded.some((item) => item.eligibility.blockers.some((reason) => reason.startsWith("review-")))) {
    notices.push("Only records with a documented qualified-review or governance sign-off marker may count toward the evidence-sufficiency gate; user confirmation or a source-card status cannot activate it.");
  }
  if (!gate.passed) notices.push("Live category selection was not requested because the evidence-sufficiency gate did not pass.");
  return notices;
}

const CONCERN_LABELS = new Map(CONCERN_CATALOG.map((item) => [item.id, item.label]));

function databaseReviewStatus(value) {
  const status = String(value || "");
  if (recordedReviewState(status) === "qualified_review_recorded") return "qualified_review_recorded";
  // The signed-off corpus records supervisor + examiner sign-off. That is a
  // governance approval, reported as such rather than as clinical review.
  if (/^approved\b/i.test(status) && /sign[-\s]?off/i.test(status)) return "governance_signoff_recorded";
  return recordedReviewState(status);
}

/**
 * Evidence retrieval over the governed, published database corpus. Each
 * published source is represented by its title, publisher and the names,
 * categories and research contexts of the ingredients it is linked to, and is
 * ranked against the run query with BM25. `score` is the BM25 score divided
 * by the best score in the run, so it is a real relevance value in [0, 1].
 */
function publishedDatabaseRetrieval({ profile, concern, environment }) {
  const query = queryFor({ profile, concern, environment });
  const repo = createRepository({});
  const sources = repo.listSources({ state: "published" });
  const ingredients = repo.listIngredients({ concern }).filter((ingredient) => ingredient.approval_state === "published" && ingredient.routine_selection_allowed);
  const sourceIds = new Set(ingredients.flatMap((ingredient) => ingredient.source_ids || []));
  const selectedSources = sources.filter((source) => sourceIds.has(source.source_id));
  // A signed-off published corpus is the canonical source. If a newer concern
  // has no explicit ingredient tag yet, rank the whole published corpus.
  const pool = selectedSources.length >= REQUIRED_ELIGIBLE_EVIDENCE ? selectedSources : sources;
  const allIngredients = repo.listIngredients().filter((ingredient) => ingredient.approval_state === "published");
  const linked = (source) => allIngredients.filter((ingredient) => (ingredient.source_ids || []).includes(source.source_id));
  const documents = pool.map((source) => {
    const links = linked(source);
    return {
      id: source.source_id,
      text: [
        source.title,
        source.publisher,
        source.source_family,
        ...links.map((ingredient) => ingredient.display_name),
        ...links.flatMap((ingredient) => ingredient.categories || []).map((category) => category.replaceAll("-", " ")),
        ...links.flatMap((ingredient) => ingredient.concern_contexts || []).map((context) => `${context} ${CONCERN_LABELS.get(context) || ""}`),
      ].filter(Boolean).join(" "),
    };
  });
  const ranking = bm25(documents, `${query} ${CONCERN_LABELS.get(concern) || ""}`);
  const bySource = new Map(pool.map((source) => [source.source_id, source]));
  const evidence = ranking.slice(0, TOP_K).map((hit) => {
    const source = bySource.get(hit.id);
    const linkedIngredients = ingredients.filter((ingredient) => (ingredient.source_ids || []).includes(source.source_id));
    const item = {
      id: `db-source-${source.source_id}`,
      title: source.title || source.source_id,
      source: source.publisher || source.source_family || "Published source",
      documentId: source.source_id,
      excerpt: `Approved, published source-linked corpus record for ${concern} research context.`,
      sourceUrl: safeHttpUrl(source.source_url),
      sourceLocator: source.doi_or_pmid || source.source_url || source.source_id,
      citation: source.title || source.source_id,
      evidenceTier: source.evidence_type || "approved source-linked record",
      claimCategory: `${concern}-approved-published-record`,
      evidenceScope: source.corpus_eligibility || "approved published source-linked corpus",
      ingredientIds: linkedIngredients.map((ingredient) => ingredient.ingredient_id),
      ingredientNames: linkedIngredients.map((ingredient) => ingredient.display_name),
      sourceRecordIds: [source.source_id],
      reviewStatus: databaseReviewStatus(source.clinical_review_status),
      productSpecific: false,
      industrySponsored: false,
      conflictFlag: false,
      score: hit.normalisedScore,
      lexicalScore: hit.score,
      matchedTerms: hit.matchedTerms,
    };
    return { ...item, eligibility: assessEligibility(item, concern) };
  });
  const gate = evidenceSufficiencyGate(evidence);
  const eligibleEvidence = evidence.filter((item) => item.eligibility?.eligible);
  return {
    mode: "approved-published-database",
    sufficiencyScore: gate.sufficiencyScore,
    scoreType: "evidence_sufficiency_coverage",
    relevanceMethod: "bm25_over_published_source_metadata",
    evidence,
    eligibleEvidence,
    gate,
    query,
    trace: { requestedTopK: TOP_K, candidateCount: evidence.length, eligibleEvidenceCount: eligibleEvidence.length, excludedEvidenceCount: evidence.length - eligibleEvidence.length, qualifyingDocumentCount: gate.documentCount, directEvidenceCount: gate.directCount, contextualEvidenceCount: gate.contextualCount, relevanceThreshold: MINIMUM_RELEVANCE_SCORE, criteria: gate.criteria },
    notices: retrievalNotices(gate, evidence),
  };
}

export async function retrieveEvidence({ config, profile, concern, environment }) {
  if (config.ingredientDb?.enabled) {
    try {
      return publishedDatabaseRetrieval({ profile, concern, environment });
    } catch {
      return seedEvidence(config, "The approved database corpus was unavailable.");
    }
  }
  if (!config.liveServicesEnabled) {
    return seedEvidence(config, "Live retrieval is disabled; no LLM category selection will be requested.");
  }
  if (!config.pinecone.apiKey || !config.pinecone.index) {
    return seedEvidence(config, "Pinecone index configuration is incomplete; no LLM category selection will be requested.");
  }

  const query = queryFor({ profile, concern, environment });
  try {
    const descriptor = await describePineconeIndex(config);
    if (!isIntegratedTextIndex(descriptor, config.pinecone.textField)) {
      return seedEvidence(config, `The configured Pinecone index does not expose integrated embedding for ${config.pinecone.textField}. Check its field map before enabling grounded synthesis.`);
    }

    const url = `https://${descriptor.host}/records/namespaces/${encodeURIComponent(config.pinecone.namespace)}/search`;
    const payload = await fetchJson(url, {
      service: "Pinecone retrieval",
      timeoutMs: config.requestTimeoutMs,
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Api-Key": config.pinecone.apiKey,
        "X-Pinecone-Api-Version": PINECONE_API_VERSION,
      },
      body: JSON.stringify({
        query: {
          inputs: { text: query },
          top_k: TOP_K,
        },
        fields: [
          config.pinecone.textField,
          config.pinecone.titleField,
          config.pinecone.sourceField,
          "document_id",
          "source_url",
          "source_locator",
          "citation_text",
          "published_year",
          "document_type",
          "evidence_tier",
          "jurisdiction",
          "claim_category",
          "ingredient_evidence_role",
          "ingredient_ids",
          "ingredient_names",
          "source_record_ids",
          "evidence_scope",
          "clinical_review_status",
          "source_card_review_status",
          "review_scope",
          "license_or_access",
          "conflict_flag",
          "conflict_disclosure",
          "product_specific",
          "industry_sponsored",
          "commercial_restriction",
          "attribution_required",
          "env_tags",
          "chunk_number",
        ],
      }),
    });

    const evidence = normaliseHits(payload, config, concern);
    if (!evidence.length) {
      const empty = seedEvidence(config, "Pinecone did not return usable evidence excerpts for this request.");
      return { ...empty, query };
    }

    const gate = evidenceSufficiencyGate(evidence);
    const eligibleEvidence = evidence.filter((item) => item.eligibility?.eligible);
    return {
      mode: "pinecone",
      sufficiencyScore: gate.sufficiencyScore,
      scoreType: "evidence_sufficiency_coverage",
      evidence,
      eligibleEvidence,
      gate,
      query,
      trace: {
        requestedTopK: TOP_K,
        candidateCount: evidence.length,
        eligibleEvidenceCount: eligibleEvidence.length,
        excludedEvidenceCount: evidence.length - eligibleEvidence.length,
        qualifyingDocumentCount: gate.documentCount,
        directEvidenceCount: gate.directCount,
        contextualEvidenceCount: gate.contextualCount,
        relevanceThreshold: MINIMUM_RELEVANCE_SCORE,
        criteria: gate.criteria,
      },
      notices: retrievalNotices(gate, evidence),
    };
  } catch {
    const unavailable = seedEvidence(config, "Indexed evidence retrieval is unavailable; no LLM category selection will be requested.");
    return { ...unavailable, query };
  }
}
