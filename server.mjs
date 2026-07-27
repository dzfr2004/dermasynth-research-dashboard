import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { createConfig, loadDotEnv, publicConfigStatus } from "./lib/config.mjs";
import { DEFAULT_LOCATION, getEnvironment, getEnvironmentForecast, providerReliabilitySnapshot, searchLocations } from "./lib/environment.mjs";
import { ExternalServiceError } from "./lib/http-client.mjs";
import { retrieveEvidence, retrieveResearchEvidence } from "./lib/retrieval.mjs";
import {
  categoryReferenceExamples,
  getIngredientCatalog,
  ingredientResearchForConcern,
  INGREDIENT_OUTPUT_MODE,
} from "./lib/ingredients.mjs";
import { getIngredientKnowledgeBase, ingredientResearchExplorer } from "./lib/ingredient-knowledge.mjs";
import { createRepository, RepositoryError } from "./lib/ingredient-repository.mjs";
import { createPineconeSync } from "./lib/pinecone-sync.mjs";
import { buildExplorerFromDb } from "./lib/ingredient-db-explorer.mjs";
import { selectApprovedIngredientCandidates } from "./lib/ingredient-selection.mjs";
import { publicRuntimePolicy, saveRuntimePolicy } from "./lib/policy-store.mjs";
import { corpusSummaryFromRepository } from "./lib/corpus-summary.mjs";
import { groundedAugmentation } from "./lib/ai-augmentations.mjs";
import { buildEnvironmentalExplainability } from "./lib/explainability.mjs";
import {
  ALLOWED_FINISH_PREFERENCES,
  ALLOWED_EXPOSURE_CONTEXTS,
  ALLOWED_PROFILES,
  ALLOWED_REACTIVITY_LEVELS,
  CONCERN_CATALOG,
  ROUTINE_CATEGORY_CATALOG,
  firstSafetyPass,
  normaliseConcern,
  secondSafetyPass,
  templateRoutine,
  triageRoutineRequest,
} from "./lib/safety.mjs";
import { summarizeKnowledgeContext, synthesizeRoutine, composeIngredientRationales, synthesizeIngredientSelection } from "./lib/synthesis.mjs";
import { getIngredientEvidenceNote } from "./lib/ingredient-evidence-notes.mjs";
import {
  appendReviewerAnnotation,
  getReviewerQueue,
  reviewerQueueAvailability,
  reviewerTokenMatches,
  ReviewerQueueInputError,
  ReviewerQueueStorageError,
} from "./lib/reviewer-queue.mjs";

const root = resolve(process.cwd());
loadDotEnv(root);
const config = createConfig();

// Lazily construct the DB-backed knowledge repository + Pinecone sync only when
// the dynamic knowledge base is enabled, so the default JSON path is untouched.
let knowledgeRepoSingleton = null;
let pineconeSyncSingleton = null;
function knowledgeRepo() {
  if (!config.ingredientDb?.enabled) return null;
  if (!knowledgeRepoSingleton) {
    // getDatabase() caches one handle per path, so repo and sync share it.
    const repo = createRepository();
    pineconeSyncSingleton = createPineconeSync({ config, db: repo.db });
    knowledgeRepoSingleton = createRepository({ db: repo.db, pineconeSync: pineconeSyncSingleton });
  }
  return knowledgeRepoSingleton;
}
function pineconeSync() {
  knowledgeRepo();
  return pineconeSyncSingleton;
}
const PORT = Number(process.env.PORT || 4173);
const MAX_BODY_BYTES = 64 * 1024;
const LOCATION_SEARCH_WINDOW_MS = 60_000;
const LOCATION_SEARCH_MAX_PER_WINDOW = 20;
const LOCATION_SEARCH_CLIENTS_MAX = 500;
const ROUTINE_WINDOW_MS = 60_000;
const ROUTINE_MAX_PER_WINDOW = 6;
const ROUTINE_MAX_IN_FLIGHT_PER_CLIENT = 1;
const ROUTINE_MAX_IN_FLIGHT_GLOBAL = 4;
const ROUTINE_CLIENTS_MAX = 500;
const EVALUATION_REPORT_PATH = resolve(root, "data/evaluation/reports/study-evaluation.latest.json");
const RETRIEVAL_EVALUATION_REPORT_PATH = resolve(root, "data/evaluation/reports/retrieval-evaluation.latest.json");
const SAFETY_50_EVALUATION_REPORT_PATH = resolve(root, "data/evaluation/reports/safety-50-case.latest.json");
const CATEGORY_COVERAGE_EVALUATION_REPORT_PATH = resolve(root, "data/evaluation/reports/category-coverage.latest.json");
const REVIEWER_QUEUE_STORE_PATH = resolve(root, "data/reviewer-queue/review-annotations.local.json");
const locationSearchRequests = new Map();
const routineRequests = new Map();
let activeRoutineRequests = 0;

// This payload is constructed once from the fixed local category catalog. It
// has no route, profile, concern, environment, retrieval, or synthesis input,
// so it cannot become an ingredient-selection path for an individual routine.
const CATEGORY_REFERENCE_CATALOG = Object.freeze(Object.fromEntries(
  Object.entries(ROUTINE_CATEGORY_CATALOG).map(([id, definition]) => [
    id,
    Object.freeze({
      category: definition.category,
      title: definition.title,
      examples: Object.freeze(categoryReferenceExamples(id)),
    }),
  ]),
));

const CATEGORY_REFERENCE_RESPONSE = Object.freeze({
  categories: CATEGORY_REFERENCE_CATALOG,
  scope: "Static general category reference only. Examples are not selected from profile, concern, location, environment, retrieval, or synthesis inputs and are not recommendations for an individual routine.",
  routineSelectionAllowed: false,
});

const publicFiles = new Map([
  ["/", { path: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/index.html", { path: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/app.js", { path: "app.js", contentType: "text/javascript; charset=utf-8" }],
  ["/styles.css", { path: "styles.css", contentType: "text/css; charset=utf-8" }],
  ["/assets/dermasynth-mark.svg", { path: "assets/dermasynth-mark.svg", contentType: "image/svg+xml" }],
]);

class HttpError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.headers = headers;
  }
}

function securityHeaders(requestId) {
  return {
    "cache-control": "no-store",
    "x-request-id": requestId,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "geolocation=(), camera=(), microphone=()",
    "cross-origin-opener-policy": "same-origin",
    // The dashboard uses one deliberate inline width style for a visual-only
    // environmental bar. Scripts remain restricted to the local static file.
    "content-security-policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';",
  };
}

function sendJson(response, status, data, requestId, headers = {}) {
  response.writeHead(status, {
    ...securityHeaders(requestId),
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(data));
}

function sendMethodNotAllowed(response, requestId) {
  response.writeHead(405, {
    ...securityHeaders(requestId),
    "content-type": "application/json; charset=utf-8",
    allow: "GET, POST",
  });
  response.end(JSON.stringify({ error: "Method not allowed", requestId }));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};

  try {
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new HttpError(400, "Request body must be a JSON object.");
    }
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Request body must contain valid JSON.");
  }
}

function requiredChoice(value, allowed, name, fallback) {
  const selected = value ?? fallback;
  if (typeof selected !== "string" || !allowed.has(selected)) {
    throw new HttpError(400, `Invalid ${name}.`);
  }
  return selected;
}

function optionalChoice(value, allowed, name) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new HttpError(400, `Invalid ${name}.`);
  }
  return value;
}

function requiredConcern(value, fallback = "acne") {
  const selected = value ?? fallback;
  if (typeof selected !== "string") throw new HttpError(400, "Invalid concern.");
  const concern = normaliseConcern(selected);
  if (!concern) throw new HttpError(400, "Invalid concern.");
  return concern;
}

function optionalText(value, name, maximum = 500) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > maximum) {
    throw new HttpError(400, `Invalid ${name}.`);
  }
  return value.trim();
}

function requireReviewerQueueAccess(request) {
  const availability = reviewerQueueAvailability(config.reviewerQueue);
  if (!availability.active) {
    throw new HttpError(503, availability.message);
  }
  if (!reviewerTokenMatches(request.headers, config.reviewerQueue.token)) {
    throw new HttpError(403, "Reviewer queue access is denied.");
  }
}

function governanceTokenMatches(request) {
  const candidate = request.headers?.["x-governance-token"];
  const expected = config.governance?.token;
  if (typeof candidate !== "string" || typeof expected !== "string" || candidate.length < 24 || expected.length < 24) return false;
  const actualBuffer = Buffer.from(candidate, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireGovernanceAccess(request) {
  if (!config.governance?.localOnly) throw new HttpError(403, "Runtime policy administration is local-only.");
  if (!governanceTokenMatches(request)) throw new HttpError(403, "Runtime policy administration is denied.");
}

const ADMIN_ENTITY_TYPES = new Set(["ingredient", "source"]);
const ADMIN_ACTIONS = new Set(["submit", "approve", "reject", "publish", "archive", "supersede"]);

function adminActor(request) {
  const label = request.headers?.["x-actor-label"];
  return typeof label === "string" && label.trim() ? label.trim().slice(0, 60) : "admin";
}

/**
 * Token-protected admin workflow for the dynamic knowledge base: import/edit,
 * the approval state machine, versioned rollback, audit, and Pinecone sync.
 * Reuses the same local-only governance token as the policy registry.
 */
async function handleKnowledgeAdmin(request, response, url, requestId) {
  requireGovernanceAccess(request);
  const repo = knowledgeRepo();
  if (!repo) throw new HttpError(503, "The dynamic knowledge base is disabled. Set INGREDIENT_DB_ENABLED=true.");
  const actor = adminActor(request);
  const path = url.pathname.slice("/api/admin/".length);

  try {
    if (request.method === "GET" && path === "knowledge-base") {
      return sendJson(response, 200, {
        counts: repo.counts(),
        ingredients: repo.listIngredients(),
        sources: repo.listSources(),
        pineconePending: pineconeSync().pending().length,
        requestId,
      }, requestId);
    }

    if (path === "ingredients") {
      if (request.method === "GET") {
        const state = optionalText(url.searchParams.get("state"), "state", 20) || null;
        return sendJson(response, 200, { ingredients: repo.listIngredients({ state }), requestId }, requestId);
      }
      if (request.method === "POST") {
        const body = await readJson(request);
        const saved = repo.upsertIngredient(body, { actor, reason: body.reason });
        return sendJson(response, 201, { ingredient: saved, requestId }, requestId);
      }
    }

    if (path === "sources") {
      if (request.method === "GET") {
        const state = optionalText(url.searchParams.get("state"), "state", 20) || null;
        return sendJson(response, 200, { sources: repo.listSources({ state }), requestId }, requestId);
      }
      if (request.method === "POST") {
        const body = await readJson(request);
        const saved = repo.upsertSource(body, { actor, reason: body.reason });
        return sendJson(response, 201, { source: saved, requestId }, requestId);
      }
    }

    if (request.method === "POST" && path === "transition") {
      const body = await readJson(request);
      const entityType = String(body.entityType || "").trim();
      const action = String(body.action || "").trim();
      if (!ADMIN_ENTITY_TYPES.has(entityType)) throw new HttpError(400, "entityType must be 'ingredient' or 'source'.");
      if (!ADMIN_ACTIONS.has(action)) throw new HttpError(400, `action must be one of ${[...ADMIN_ACTIONS].join(", ")}.`);
      if (!body.id) throw new HttpError(400, "id is required.");
      const record = repo[action](entityType, String(body.id), { actor, reason: body.reason });
      return sendJson(response, 200, { record, requestId }, requestId);
    }

    if (request.method === "POST" && path === "rollback") {
      const body = await readJson(request);
      const entityType = String(body.entityType || "").trim();
      if (!ADMIN_ENTITY_TYPES.has(entityType)) throw new HttpError(400, "entityType must be 'ingredient' or 'source'.");
      if (!body.id || body.version === undefined) throw new HttpError(400, "id and version are required.");
      const record = repo.rollback(entityType, String(body.id), Number(body.version), { actor, reason: body.reason });
      return sendJson(response, 200, { record, requestId }, requestId);
    }

    if (request.method === "GET" && path === "versions") {
      const entityType = String(url.searchParams.get("entityType") || "").trim();
      const id = optionalText(url.searchParams.get("id"), "id", 120);
      if (!ADMIN_ENTITY_TYPES.has(entityType) || !id) throw new HttpError(400, "entityType and id are required.");
      return sendJson(response, 200, { versions: repo.getVersions(entityType, id), requestId }, requestId);
    }

    if (request.method === "GET" && path === "audit") {
      const entityType = optionalText(url.searchParams.get("entityType"), "entityType", 20) || null;
      const id = optionalText(url.searchParams.get("id"), "id", 120) || null;
      const limit = Number(url.searchParams.get("limit")) || 200;
      return sendJson(response, 200, { audit: repo.getAuditLog({ entityType, entityId: id, limit }), requestId }, requestId);
    }

    if (request.method === "POST" && path === "pinecone/flush") {
      const summary = await pineconeSync().flush({ repo });
      return sendJson(response, 200, { summary, requestId }, requestId);
    }

    if (request.method === "GET" && path === "pinecone/log") {
      return sendJson(response, 200, { log: pineconeSync().log({ limit: 100 }), requestId }, requestId);
    }

    throw new HttpError(404, "Unknown admin route.");
  } catch (error) {
    if (error instanceof RepositoryError) {
      const status = error.code === "not_found" ? 404 : 400;
      throw new HttpError(status, error.message);
    }
    throw error;
  }
}

function boundedCoordinate(value, minimum, maximum) {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) {
    throw new HttpError(400, "Invalid latitude or longitude.");
  }

  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < minimum || coordinate > maximum) {
    throw new HttpError(400, "Invalid latitude or longitude.");
  }
  return coordinate;
}

function normaliseLocation(value, fallbackName = "Custom location") {
  const lat = boundedCoordinate(value?.lat, -90, 90);
  const lon = boundedCoordinate(value?.lon, -180, 180);
  const name = optionalText(value?.name ?? fallbackName, "location", 80) || fallbackName;
  return { name, lat, lon };
}

function requestLocation(url) {
  const rawLat = url.searchParams.get("lat");
  const rawLon = url.searchParams.get("lon");
  const rawLocation = url.searchParams.get("location");

  if (rawLat === null && rawLon === null && rawLocation === null) return DEFAULT_LOCATION;
  if (rawLat === null || rawLon === null) {
    throw new HttpError(400, "Both lat and lon are required when requesting a custom location.");
  }
  return normaliseLocation({ lat: rawLat, lon: rawLon, name: rawLocation }, "Custom location");
}

function routineLocation(input) {
  if (input.location === undefined || input.location === null) return DEFAULT_LOCATION;
  if (!input.location || Array.isArray(input.location) || typeof input.location !== "object") {
    throw new HttpError(400, "Invalid location.");
  }
  return normaliseLocation(input.location, "Custom location");
}

function locationSearchQuery(url) {
  const query = optionalText(url.searchParams.get("q"), "location query", 80);
  if (query.length < 2 || /[\u0000-\u001F\u007F]/.test(query)) {
    throw new HttpError(400, "Location query must contain 2–80 printable characters.");
  }
  return query;
}

function clientKey(request) {
  return request.socket.remoteAddress || "unknown";
}

function pruneWindow(map, windowMs) {
  const now = Date.now();
  for (const [client, entry] of map) {
    if (now - entry.windowStartedAt >= windowMs && !entry.inFlight) map.delete(client);
  }
}

function enforceLocationSearchRateLimit(request) {
  pruneWindow(locationSearchRequests, LOCATION_SEARCH_WINDOW_MS);
  const client = clientKey(request);
  const existing = locationSearchRequests.get(client);
  if (existing) {
    if (existing.count >= LOCATION_SEARCH_MAX_PER_WINDOW) {
      throw new HttpError(429, "Too many location searches. Please wait a minute and try again.", { "retry-after": "60" });
    }
    existing.count += 1;
    return;
  }

  if (locationSearchRequests.size >= LOCATION_SEARCH_CLIENTS_MAX) {
    const oldestClient = locationSearchRequests.keys().next().value;
    if (oldestClient !== undefined) locationSearchRequests.delete(oldestClient);
  }
  locationSearchRequests.set(client, { windowStartedAt: Date.now(), count: 1, inFlight: 0 });
}

/** Acquire a short-lived local budget before any provider-bearing routine run. */
function acquireRoutineBudget(request) {
  pruneWindow(routineRequests, ROUTINE_WINDOW_MS);
  const client = clientKey(request);
  let entry = routineRequests.get(client);
  const now = Date.now();
  if (!entry) {
    if (routineRequests.size >= ROUTINE_CLIENTS_MAX) {
      const oldestClient = routineRequests.keys().next().value;
      if (oldestClient !== undefined) routineRequests.delete(oldestClient);
    }
    entry = { windowStartedAt: now, count: 0, inFlight: 0 };
    routineRequests.set(client, entry);
  } else if (now - entry.windowStartedAt >= ROUTINE_WINDOW_MS && !entry.inFlight) {
    entry.windowStartedAt = now;
    entry.count = 0;
  }

  if (entry.count >= ROUTINE_MAX_PER_WINDOW) {
    throw new HttpError(429, "Routine request budget reached. Please wait a minute and try again.", { "retry-after": "60" });
  }
  if (entry.inFlight >= ROUTINE_MAX_IN_FLIGHT_PER_CLIENT) {
    throw new HttpError(429, "A routine request is already in progress for this client.", { "retry-after": "3" });
  }
  if (activeRoutineRequests >= ROUTINE_MAX_IN_FLIGHT_GLOBAL) {
    throw new HttpError(503, "Routine service is busy. Please try again shortly.", { "retry-after": "3" });
  }

  entry.count += 1;
  entry.inFlight += 1;
  activeRoutineRequests += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.inFlight = Math.max(0, entry.inFlight - 1);
    activeRoutineRequests = Math.max(0, activeRoutineRequests - 1);
  };
}

function notRunRetrieval() {
  return {
    mode: "not_run",
    cueScore: 0,
    scoreType: "not_run",
    evidence: [],
    eligibleEvidence: [],
    gate: {
      passed: false,
      cueScore: 0,
      cueThreshold: config.cueThreshold,
      relevanceThreshold: null,
      criteria: [],
      rationale: "Retrieval was not run because symptom triage redirected the request.",
    },
    query: "",
    trace: { candidateCount: 0, eligibleEvidenceCount: 0, excludedEvidenceCount: 0, criteria: [] },
    notices: [],
  };
}

function notRunResearchEvidence() {
  return {
    mode: "not_run",
    namespace: config.pinecone.researchNamespace,
    query: "",
    evidence: [],
    coverage: {
      status: "not_run",
      mode: "not_run",
      namespace: config.pinecone.researchNamespace,
      queryCoverage: 0,
      uniqueIngredients: 0,
      sourceRecords: 0,
      rationale: "Research retrieval was not run because symptom triage redirected the request.",
    },
    notices: [],
  };
}

async function evaluationSnapshot() {
  try {
    const report = JSON.parse(await readFile(EVALUATION_REPORT_PATH, "utf8"));
    const optionalReport = async (path) => {
      try {
        const value = JSON.parse(await readFile(path, "utf8"));
        return { suite: value.suite || "evaluation", execution: value.execution || {}, summary: value.summary || {}, coverage: value.coverage || {}, limitations: value.limitations || [] };
      } catch {
        return null;
      }
    };
    const [retrieval, safety50, categoryCoverage] = await Promise.all([
      optionalReport(RETRIEVAL_EVALUATION_REPORT_PATH),
      optionalReport(SAFETY_50_EVALUATION_REPORT_PATH),
      optionalReport(CATEGORY_COVERAGE_EVALUATION_REPORT_PATH),
    ]);
    return {
      schemaVersion: String(report.schemaVersion || "1.0"),
      suite: String(report.suite || "dermasynth-offline-study-evaluation"),
      execution: report.execution || {},
      summary: report.summary || {},
      limitations: Array.isArray(report.limitations) ? report.limitations : [],
      reportUpdatedAt: report.execution?.deterministicRunMarker || "not_recorded",
      retrieval,
      safety50,
      categoryCoverage,
    };
  } catch {
    return {
      schemaVersion: "1.0",
      suite: "dermasynth-offline-study-evaluation",
      execution: { mode: "report unavailable" },
      summary: { total: 0, passed: 0, failed: 0, byCategory: [] },
      limitations: ["Run npm run eval:study to generate the current deterministic implementation report."],
      reportUpdatedAt: "not_recorded",
      retrieval: null,
      safety50: null,
      categoryCoverage: null,
    };
  }
}

function optionalConcernFromQuery(url) {
  const value = url.searchParams.get("concern");
  if (value === null || !value.trim()) return "";
  return requiredConcern(value);
}

function groundingPayload(retrieval) {
  const gate = retrieval.gate || {};
  return {
    cueScore: Number.isFinite(Number(retrieval.cueScore)) ? Number(retrieval.cueScore) : 0,
    threshold: Number.isFinite(Number(gate.cueThreshold)) ? Number(gate.cueThreshold) : config.cueThreshold,
    passed: Boolean(gate.passed),
    evidenceCount: Array.isArray(retrieval.evidence) ? retrieval.evidence.length : 0,
    eligibleEvidenceCount: Array.isArray(retrieval.eligibleEvidence) ? retrieval.eligibleEvidence.length : 0,
    scoreType: retrieval.scoreType || "not_run",
    relevanceThreshold: gate.relevanceThreshold ?? null,
    criteria: Array.isArray(gate.criteria) ? gate.criteria : [],
    rationale: gate.rationale || "No retrieval gate result is available.",
  };
}

function uniqueNotices(notices) {
  return [...new Set(notices.map((notice) => String(notice || "").trim()).filter(Boolean))];
}

function combineSafety(...passes) {
  const checks = [];
  const rules = [];
  const flags = [];
  for (const pass of passes.filter(Boolean)) {
    checks.push(...(pass.checks || []));
    rules.push(...(pass.rules || []));
    flags.push(...(pass.flags || []));
  }
  return {
    status: flags.length ? "review_required" : "cleared",
    checks: [...new Set(checks)],
    rules,
    flags: [...new Set(flags)],
  };
}

function environmentProvenance(environment) {
  if (!environment) return null;
  const providers = Object.entries(environment.sources || {}).map(([id, source]) => ({
    id,
    provider: String(source?.provider || id),
    status: String(source?.status || "unknown"),
    endpoint: source?.endpoint ? String(source.endpoint) : undefined,
    cached: Boolean(source?.cached),
  }));
  return {
    mode: environment.mode,
    observedAt: environment.observedAt || null,
    location: environment.location || null,
    readings: environment.readings || {},
    providers,
    notices: Array.isArray(environment.notices) ? environment.notices : [],
  };
}

function evidenceProvenance(item) {
  return {
    id: item.id,
    documentId: item.documentId || "",
    title: item.title || "",
    source: item.source || "",
    sourceUrl: item.sourceUrl || "",
    sourceLocator: item.sourceLocator || "",
    citation: item.citation || "",
    evidenceTier: item.evidenceTier || "",
    documentType: item.documentType || "",
    publishedYear: item.publishedYear ?? null,
    jurisdiction: item.jurisdiction || "",
    claimCategory: item.claimCategory || "",
    evidenceScope: item.evidenceScope || "",
    reviewStatus: item.reviewStatus || "not_recorded",
    licenseOrAccess: item.licenseOrAccess || "",
    conflictFlag: Boolean(item.conflictFlag),
    conflictDisclosure: item.conflictDisclosure || "",
    productSpecific: Boolean(item.productSpecific),
    industrySponsored: Boolean(item.industrySponsored),
    commercialRestriction: Boolean(item.commercialRestriction),
    attributionRequired: Boolean(item.attributionRequired),
    envTags: Array.isArray(item.envTags) ? item.envTags : [],
    score: item.score ?? null,
    eligibility: item.eligibility || null,
  };
}

function aiCategoryRationalePayload(routine) {
  const rationale = routine?.generation?.aiRationale;
  if (rationale?.status === "available" && typeof rationale.text === "string") {
    return {
      status: "available",
      label: "AI category rationale",
      mode: rationale.mode || "openai_structured_tags_with_local_allowlisted_copy",
      tags: Array.isArray(rationale.tags) ? rationale.tags : [],
      factors: Array.isArray(rationale.factors) ? rationale.factors : [],
      text: rationale.text,
      boundary: "The model selected only constrained rationale tags. Visible wording is locally allowlisted, and deterministic safety checks remain the final authority.",
    };
  }
  return {
    status: "not_available",
    label: "AI category rationale",
    mode: "not_requested_or_not_completed",
    tags: [],
    factors: [],
    text: "No AI category rationale is shown because the gated OpenAI category-selection path was not authorised or did not complete. The visible routine remains a deterministic category-only research preview.",
    boundary: "No fallback rationale is generated by an AI model; deterministic safety checks remain the final authority.",
  };
}

function buildRunReport({
  requestId,
  startedAt,
  profile,
  concern,
  finishPreference,
  reactivityLevel,
  symptomsProvided,
  requestedLocation,
  environment,
  retrieval,
  safety,
  stages,
  mode,
  status,
  synthesisStatus,
  ingredientResearch,
  researchEvidence,
  explainability,
  aiCategoryRationale,
  ingredientCandidates,
  namedRoutine,
}) {
  const finishedAt = new Date();
  return {
    schemaVersion: "1.0",
    runId: requestId,
    startedAt: startedAt.toISOString(),
    completedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    researchOnly: true,
    outputMode: INGREDIENT_OUTPUT_MODE,
    input: {
      profile,
      concern,
      ...(finishPreference === undefined ? {} : { finishPreference }),
      ...(reactivityLevel === undefined ? {} : { reactivityLevel }),
      symptomsProvided: Boolean(symptomsProvided),
      requestedLocation: requestedLocation || null,
    },
    outcome: { mode, status, synthesisStatus },
    stages,
    environment: environmentProvenance(environment),
    retrieval: {
      mode: retrieval.mode,
      query: retrieval.query || "",
      scoreType: retrieval.scoreType,
      gate: groundingPayload(retrieval),
      trace: retrieval.trace || {},
      evidence: (retrieval.evidence || []).map(evidenceProvenance),
    },
    safety: {
      status: safety.status,
      checks: safety.checks || [],
      rules: safety.rules || [],
      flags: safety.flags || [],
    },
    ingredientResearch,
    ingredientCandidates,
    namedRoutine,
    researchEvidence: {
      mode: researchEvidence?.mode || "not_run",
      namespace: researchEvidence?.namespace || "",
      query: researchEvidence?.query || "",
      coverage: researchEvidence?.coverage || null,
      evidence: (researchEvidence?.evidence || []).map(evidenceProvenance),
      notices: researchEvidence?.notices || [],
    },
    explainability: explainability || null,
    aiCategoryRationale,
  };
}

function routineResult({
  requestId,
  startedAt,
  profile,
  concern,
  finishPreference,
  reactivityLevel,
  symptomsProvided,
  requestedLocation,
  mode,
  status,
  routine,
  environment,
  retrieval,
  safety,
  stages,
  synthesisStatus = "not_requested",
  notices = [],
  researchEvidence = null,
  explainability = null,
  ingredientSelectionMap = null,
}) {
  const ingredientResearch = ingredientResearchForConcern(concern, {
    exposeCandidates: status !== "medical_redirect",
  });
  const resolvedResearchEvidence = researchEvidence || notRunResearchEvidence();
  const resolvedExplainability = explainability || buildEnvironmentalExplainability({ concern, environment });
  const aiCategoryRationale = aiCategoryRationalePayload(routine);
  const ingredientCandidates = selectApprovedIngredientCandidates({
    enabled: config.ingredientSelectionEnabled && config.ingredientDb?.enabled && status !== "medical_redirect" && safety?.status === "cleared",
    repository: knowledgeRepo(),
    routine,
    concern,
    environment,
    reactivityLevel,
    selectionMap: ingredientSelectionMap,
  });
  const namedRoutine = enrichRoutineWithApprovedIngredients(routine, ingredientCandidates);
  const runReport = buildRunReport({
    requestId,
    startedAt,
    profile,
    concern,
    finishPreference,
    reactivityLevel,
    symptomsProvided,
    requestedLocation,
    environment,
    retrieval,
    safety,
    stages,
    mode,
    status,
    synthesisStatus,
    ingredientResearch,
    researchEvidence: resolvedResearchEvidence,
    explainability: resolvedExplainability,
    aiCategoryRationale,
    ingredientCandidates,
    namedRoutine,
  });
  return {
    mode,
    status,
    synthesisStatus,
    outputMode: INGREDIENT_OUTPUT_MODE,
    profile,
    concern,
    profileModifiers: {
      ...(finishPreference === undefined ? {} : { finishPreference }),
      ...(reactivityLevel === undefined ? {} : { reactivityLevel }),
    },
    routine,
    namedRoutine,
    environment,
    grounding: groundingPayload(retrieval),
    safety,
    evidence: retrieval.evidence || [],
    notices: uniqueNotices([...(retrieval.notices || []), ...notices]),
    ingredientResearch,
    ingredientCandidates,
    researchEvidence: resolvedResearchEvidence,
    explainability: resolvedExplainability,
    aiCategoryRationale,
    runReport,
    // Compact compatibility alias for clients that call this provenance a trace.
    trace: { runId: runReport.runId, schemaVersion: runReport.schemaVersion, stages: runReport.stages },
  };
}

function enrichRoutineWithApprovedIngredients(routine, selection) {
  const entries = Array.isArray(selection?.entries) ? selection.entries : [];
  const enrichPhase = (steps, phase) => (Array.isArray(steps) ? steps.map((step) => {
    const categoryId = String(step?.id || "").trim().toLowerCase();
    const recommendedIngredients = entries
      .filter((entry) => entry.phase === phase && entry.categoryId === categoryId)
      .map((entry) => ({
        ingredientId: entry.ingredientId,
        displayName: entry.displayName,
        sourceRecords: entry.sourceRecords,
      }));
    return { ...step, recommendedIngredients };
  }) : []);
  return {
    ...(routine || {}),
    am: enrichPhase(routine?.am, "am"),
    pm: enrichPhase(routine?.pm, "pm"),
  };
}

function synthesisFallback(error) {
  if (error instanceof ExternalServiceError && error.code === "insufficient_quota") {
    return {
      synthesisStatus: "deterministic_completed",
      notices: ["Deterministic synthesis completed from approved published evidence."],
    };
  }
  return {
    synthesisStatus: "deterministic_completed",
    notices: ["Deterministic synthesis completed from approved published evidence."],
  };
}

function bulkResultFor({ profile, index, environment, retrieval, researchEvidence, requestId }) {
  const startedAt = new Date();
  const firstPass = firstSafetyPass({ concern: profile.concern, environment });
  const routine = templateRoutine(profile.concern, { environment, evidence: [] });
  const secondPass = secondSafetyPass(routine, { concern: profile.concern, environment, allowedEvidenceIds: [] });
  const safety = combineSafety(firstPass, secondPass);
  const explainability = buildEnvironmentalExplainability({ concern: profile.concern, environment });
  const strictGatePassed = Boolean(retrieval?.gate?.passed);
  const status = strictGatePassed && safety.status === "cleared" ? "Cleared" : "Review";
  const stages = [
    stage("input", "normalised", Date.now(), { profile: profile.profile }),
    stage("environment", environment?.mode || "unavailable", Date.now()),
    stage("retrieval", retrieval?.mode || "not_run", Date.now(), { cueScore: retrieval?.cueScore ?? 0 }),
    stage("research_knowledge", researchEvidence?.mode || "not_run", Date.now(), {
      ingredientCount: researchEvidence?.coverage?.uniqueIngredients ?? 0,
    }),
    stage("first_safety", firstPass.status, Date.now(), { ruleIds: firstPass.rules.map((rule) => rule.id) }),
    stage("second_safety", secondPass.status, Date.now(), { ruleIds: secondPass.rules.map((rule) => rule.id) }),
  ];
  const ingredientResearch = ingredientResearchForConcern(profile.concern, { exposeCandidates: true });
  const runReport = buildRunReport({
    requestId: `${requestId}:row-${index + 1}`,
    startedAt,
    profile: profile.profile,
    concern: profile.concern,
    symptomsProvided: false,
    requestedLocation: environment?.location || DEFAULT_LOCATION,
    environment,
    retrieval,
    safety,
    stages,
    mode: "deterministic-research-batch",
    status: status === "Cleared" ? "cleared" : "review_required",
    synthesisStatus: "not_requested",
    ingredientResearch,
    researchEvidence,
    explainability,
    aiCategoryRationale: aiCategoryRationalePayload(routine),
  });
  return {
    profileId: profile.id || `SP-${String(2000 + index).padStart(4, "0")}`,
    profile: profile.profile,
    concern: profile.concern,
    cueScore: Number(retrieval?.cueScore || 0),
    cueGatePassed: strictGatePassed,
    researchEvidenceCount: researchEvidence?.coverage?.queryCoverage ?? 0,
    researchSourceCount: researchEvidence?.coverage?.sourceRecords ?? 0,
    safetyStatus: safety.status,
    topDriver: explainability.dominantFeature?.label || "No environmental signal",
    status,
    runReport,
  };
}

function stage(id, status, startedAt, detail = {}) {
  return {
    id,
    status,
    durationMs: Math.max(0, Date.now() - startedAt),
    ...detail,
  };
}

async function handleRoutine(input, requestId) {
  const startedAt = new Date();
  const profile = requiredChoice(input.profile, ALLOWED_PROFILES, "profile", "combination");
  const concern = requiredConcern(input.concern);
  const finishPreference = optionalChoice(input.finishPreference, ALLOWED_FINISH_PREFERENCES, "finish preference");
  const reactivityLevel = optionalChoice(input.reactivityLevel, ALLOWED_REACTIVITY_LEVELS, "reactivity level");
  const exposureContext = optionalChoice(input.exposureContext, ALLOWED_EXPOSURE_CONTEXTS, "exposure context");
  const symptoms = optionalText(input.symptoms, "symptoms");
  const stages = [];
  const triageStarted = Date.now();
  const triage = triageRoutineRequest({ symptoms });
  stages.push(stage("triage", triage.status, triageStarted, { ruleIds: (triage.rules || []).map((rule) => rule.id) }));

  if (triage.status === "medical_redirect") {
    return routineResult({
      requestId,
      startedAt,
      profile,
      concern,
      finishPreference,
      reactivityLevel,
      symptomsProvided: Boolean(symptoms),
      requestedLocation: null,
      mode: "safety",
      status: "medical_redirect",
      routine: null,
      environment: null,
      retrieval: notRunRetrieval(),
      safety: triage,
      stages,
      synthesisStatus: "not_requested",
      notices: triage.notices,
    });
  }

  const requestedLocation = routineLocation(input);
  const environmentStarted = Date.now();
  const environment = await getEnvironment(config, requestedLocation);
  stages.push(stage("environment", environment.mode, environmentStarted, {
    providerStates: Object.fromEntries(Object.entries(environment.sources || {}).map(([key, value]) => [key, value?.status || "unknown"])),
  }));

  const firstSafetyStarted = Date.now();
  const firstPass = firstSafetyPass({ concern, environment, reactivityLevel });
  stages.push(stage("first_safety", firstPass.status, firstSafetyStarted, { ruleIds: (firstPass.rules || []).map((rule) => rule.id) }));

  const retrievalStarted = Date.now();
  const researchRetrievalStarted = Date.now();
  const explainability = buildEnvironmentalExplainability({ concern, environment });
  const [retrieval, researchEvidence] = await Promise.all([
    retrieveEvidence({ config, profile, concern, environment }),
    retrieveResearchEvidence({ config, concern }),
  ]);
  stages.push(stage("retrieval", retrieval.mode, retrievalStarted, {
    candidateCount: retrieval.trace?.candidateCount ?? retrieval.evidence?.length ?? 0,
    eligibleEvidenceCount: retrieval.trace?.eligibleEvidenceCount ?? retrieval.eligibleEvidence?.length ?? 0,
  }));
  stages.push(stage("research_knowledge", researchEvidence.mode, researchRetrievalStarted, {
    namespace: researchEvidence.namespace,
    ingredientCount: researchEvidence.coverage?.uniqueIngredients ?? 0,
    sourceRecords: researchEvidence.coverage?.sourceRecords ?? 0,
  }));
  stages.push(stage("cue_gate", retrieval.gate?.passed ? "passed" : "blocked", Date.now(), {
    cueScore: retrieval.cueScore,
    threshold: retrieval.gate?.cueThreshold ?? config.cueThreshold,
    criteria: retrieval.gate?.criteria || [],
  }));

  const genericRoutine = templateRoutine(concern, {
    environment,
    evidence: [],
    finishPreference,
    reactivityLevel,
    exposureContext,
  });
  const genericSecondPass = secondSafetyPass(genericRoutine, {
    concern,
    environment,
    reactivityLevel,
    allowedEvidenceIds: [],
  });
  const genericSafety = combineSafety(firstPass, genericSecondPass);

  if (!retrieval.gate?.passed) {
    stages.push(stage("synthesis", "category_fallback", Date.now(), { reason: "cue_gate_not_passed" }));
    stages.push(stage("second_safety", genericSafety.status, Date.now(), { ruleIds: (genericSecondPass.rules || []).map((rule) => rule.id) }));
    return routineResult({
      requestId,
      startedAt,
      profile,
      concern,
      finishPreference,
      reactivityLevel,
      symptomsProvided: Boolean(symptoms),
      requestedLocation,
      mode: "deterministic_synthesis",
      status: genericSafety.status,
      routine: genericRoutine,
      environment,
      retrieval,
      safety: genericSafety,
      stages,
      notices: ["Category routine continued with the approved database recommendation layer."],
      researchEvidence,
      explainability,
    });
  }

  let routine;
  const synthesisStarted = Date.now();
  try {
    routine = await synthesizeRoutine({
      config,
      profile,
      concern,
      environment,
      evidence: retrieval.eligibleEvidence,
      finishPreference,
      reactivityLevel,
    });
    stages.push(stage("synthesis", "completed", synthesisStarted, {
      mode: routine.generation?.mode || "allowlisted-category-selection",
      selectedEvidenceIds: routine.generation?.selectionEvidenceIds || [],
    }));
  } catch (error) {
    const fallback = synthesisFallback(error);
    stages.push(stage("synthesis", fallback.synthesisStatus, synthesisStarted));
    stages.push(stage("second_safety", genericSafety.status, Date.now(), { ruleIds: (genericSecondPass.rules || []).map((rule) => rule.id) }));
    return routineResult({
      requestId,
      startedAt,
      profile,
      concern,
      finishPreference,
      reactivityLevel,
      symptomsProvided: Boolean(symptoms),
      requestedLocation,
      mode: "deterministic_synthesis",
      status: genericSafety.status,
      routine: genericRoutine,
      environment,
      retrieval,
      safety: genericSafety,
      stages,
      ...fallback,
      researchEvidence,
      explainability,
    });
  }

  const secondSafetyStarted = Date.now();
  const secondPass = secondSafetyPass(routine, {
    concern,
    environment,
    reactivityLevel,
    allowedEvidenceIds: retrieval.eligibleEvidence,
  });
  stages.push(stage("second_safety", secondPass.status, secondSafetyStarted, { ruleIds: (secondPass.rules || []).map((rule) => rule.id) }));
  const safety = combineSafety(firstPass, secondPass);

  if (secondPass.status !== "cleared") {
    const blockedSafety = {
      ...genericSafety,
      status: "review_required",
      flags: [...new Set([...(genericSafety.flags || []), ...(secondPass.flags || [])])],
      rules: [...(genericSafety.rules || []), ...(secondPass.rules || [])],
    };
    return routineResult({
      requestId,
      startedAt,
      profile,
      concern,
      finishPreference,
      reactivityLevel,
      symptomsProvided: Boolean(symptoms),
      requestedLocation,
      mode: "safety",
      status: "review_required",
      routine: genericRoutine,
      environment,
      retrieval,
      safety: blockedSafety,
      stages,
      synthesisStatus: "blocked_by_safety",
      notices: ["The provider selection did not pass the second deterministic safety screen. It was not shown; a deterministic category-only preview is displayed instead."],
      researchEvidence,
      explainability,
    });
  }

  // LLM-driven ingredient synthesis, constrained to the RAG-approved pool. Only
  // runs on the cleared, live path with selection enabled; on any failure the
  // routine falls back to deterministic first-match selection.
  let ingredientSelectionMap = null;
  if (config.liveServicesEnabled && config.openai?.apiKey && config.ingredientSelectionEnabled && config.ingredientDb?.enabled) {
    try {
      const pre = selectApprovedIngredientCandidates({
        enabled: true, repository: knowledgeRepo(), routine, concern, environment, reactivityLevel,
      });
      if (pre.status === "available" && Array.isArray(pre.pool) && pre.pool.length) {
        ingredientSelectionMap = await synthesizeIngredientSelection({ config, concern, environment, pool: pre.pool });
      }
    } catch { ingredientSelectionMap = null; }
  }

  return routineResult({
    requestId,
    startedAt,
    profile,
    concern,
    finishPreference,
    reactivityLevel,
    exposureContext,
    symptomsProvided: Boolean(symptoms),
    requestedLocation,
    mode: "live",
    status: "cleared",
    routine,
    namedRoutine,
    environment,
    ingredientSelectionMap,
    retrieval,
    safety,
    stages,
    synthesisStatus: "completed",
    notices: ["Live category selection completed with eligible indexed evidence and two deterministic safety passes. Visible routine wording remains locally allowlisted and category-only."],
    researchEvidence,
    explainability,
  });
}

async function routeApi(request, response, url, requestId) {
  if (!["GET", "POST"].includes(request.method || "GET")) {
    return sendMethodNotAllowed(response, requestId);
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, {
      status: "ok",
      mode: config.liveServicesEnabled ? "live-enabled" : "demo",
      integrations: publicConfigStatus(config),
      safeguards: {
        routineRateLimitPerMinute: ROUTINE_MAX_PER_WINDOW,
        routineInFlightPerClient: ROUTINE_MAX_IN_FLIGHT_PER_CLIENT,
        routineCategoryOnlyContract: true,
        approvedIngredientCandidateLayer: Boolean(config.ingredientSelectionEnabled),
      },
      requestId,
    }, requestId);
  }

  if (request.method === "GET" && url.pathname === "/api/concerns") {
    return sendJson(response, 200, {
      concerns: CONCERN_CATALOG,
      scope: "Research-preview concern topics only; none are diagnoses or treatment indications.",
      requestId,
    }, requestId);
  }

  if (request.method === "GET" && url.pathname === "/api/category-reference") {
    return sendJson(response, 200, CATEGORY_REFERENCE_RESPONSE, requestId, {
      "cache-control": "public, max-age=3600, immutable",
    });
  }

  if (url.pathname === "/api/governance/policy") {
    if (request.method === "GET") {
      return sendJson(response, 200, {
        policy: publicRuntimePolicy(),
        writeMode: publicConfigStatus(config).governance.mode,
        requestId,
      }, requestId);
    }
    requireGovernanceAccess(request);
    const policy = await readJson(request);
    try {
      const saved = await saveRuntimePolicy(policy);
      return sendJson(response, 200, { policy: publicRuntimePolicy(saved), writeMode: "local_token_protected", requestId }, requestId);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : "Invalid runtime policy.");
    }
  }

  if (url.pathname.startsWith("/api/admin/")) {
    return handleKnowledgeAdmin(request, response, url, requestId);
  }

  if (request.method === "GET" && url.pathname === "/api/ingredients") {
    return sendJson(response, 200, { ...getIngredientCatalog(), requestId }, requestId);
  }

  if (url.pathname === "/api/reviewer-queue") {
    requireReviewerQueueAccess(request);
    const sourceRecords = getIngredientKnowledgeBase().sourceRecords;
    if (request.method === "GET") {
      const queue = await getReviewerQueue({ sourceRecords, storagePath: REVIEWER_QUEUE_STORE_PATH });
      return sendJson(response, 200, { ...queue, requestId }, requestId);
    }
    const input = await readJson(request);
    try {
      const result = await appendReviewerAnnotation({ sourceRecords, storagePath: REVIEWER_QUEUE_STORE_PATH, input });
      return sendJson(response, 201, { ...result, requestId }, requestId);
    } catch (error) {
      if (error instanceof ReviewerQueueInputError) throw new HttpError(400, error.message);
      throw error;
    }
  }

  if (request.method === "GET" && url.pathname === "/api/ingredient-knowledge") {
    const repo = knowledgeRepo();
    if (repo) {
      const explorer = buildExplorerFromDb(repo, {});
      return sendJson(response, 200, { ...explorer, requestId }, requestId);
    }
    return sendJson(response, 200, { ...getIngredientKnowledgeBase(), requestId }, requestId);
  }

  if (request.method === "GET" && url.pathname === "/api/corpus-summary") {
    const repo = knowledgeRepo();
    if (!repo) throw new HttpError(503, "The dynamic knowledge base is unavailable.");
    return sendJson(response, 200, { ...corpusSummaryFromRepository(repo), requestId }, requestId, {
      "cache-control": "private, max-age=60",
    });
  }

  if (request.method === "POST" && url.pathname === "/api/ai/ingredient-summary") {
    const repo = knowledgeRepo();
    if (!repo) throw new HttpError(503, "The dynamic knowledge base is unavailable.");
    const body = await readJson(request);
    const ingredient = repo.getCurrentIngredient(optionalText(body.ingredientId, "ingredient ID", 120));
    if (!ingredient || !["approved", "published"].includes(ingredient.approval_state)) throw new HttpError(404, "Approved ingredient record not found.");
    const sourceIds = repo.listIngredientSourceIds(ingredient.ingredient_id);
    const sources = repo.listSources().filter((source) => sourceIds.includes(source.source_id) && ["approved", "published"].includes(source.approval_state)).map((source) => ({ id: source.source_id, title: source.title, family: source.source_family, locator: source.doi_or_pmid || source.source_url }));
    try {
      return sendJson(response, 200, { ingredientId: ingredient.ingredient_id, ...await summarizeKnowledgeContext({ config, subject: { name: ingredient.display_name, categories: ingredient.categories, contexts: ingredient.concern_contexts }, sources }), requestId }, requestId);
    } catch (error) {
      if (error instanceof ExternalServiceError) throw new HttpError(503, error.message);
      throw error;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/ai/augment") {
    const body = await readJson(request);
    const kind = optionalText(body.kind, "augmentation kind", 40);
    const allowed = new Set(["corpus", "evidence", "routine", "comparison", "report", "reviewer", "presentation", "atlas_search", "forecast"]);
    if (!allowed.has(kind)) throw new HttpError(400, "Unknown augmentation kind.");
    let facts;
    if (kind === "corpus") {
      const repo = knowledgeRepo();
      if (!repo) throw new HttpError(503, "The dynamic knowledge base is unavailable.");
      facts = corpusSummaryFromRepository(repo);
    } else if (kind === "atlas_search") {
      facts = { query: optionalText(body.query, "search query", 180), instruction: "Return up to five neutral search terms only; do not answer the query." };
    } else {
      const supplied = body.facts;
      if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) throw new HttpError(400, "Structured augmentation facts are required.");
      const raw = JSON.stringify(supplied);
      if (raw.length > 12_000) throw new HttpError(400, "Augmentation facts are too large.");
      facts = supplied;
    }
    try {
      return sendJson(response, 200, { ...await groundedAugmentation({ config, task: kind.replaceAll("_", " "), facts }), requestId }, requestId);
    } catch (error) {
      if (error instanceof ExternalServiceError) throw new HttpError(503, error.message);
      throw error;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/ai/ingredient-rationale") {
    const body = await readJson(request);
    const concern = String(body?.concern || "acne").trim().toLowerCase().slice(0, 40);
    const readings = {};
    for (const key of ["uvi", "humidity", "temperature", "pm25"]) {
      const value = Number(body?.environment?.readings?.[key]);
      if (Number.isFinite(value)) readings[key] = value;
    }
    const rawCandidates = Array.isArray(body?.candidates) ? body.candidates.slice(0, 6) : [];
    if (!rawCandidates.length) throw new HttpError(400, "At least one candidate is required.");
    // Only genuinely approved, selectable ingredients may be explained; this
    // re-validates against the governed knowledge base rather than trusting the client.
    const repo = knowledgeRepo();
    const approved = new Map();
    if (repo && typeof repo.listIngredients === "function") {
      for (const ing of repo.listIngredients()) {
        if (["approved", "published"].includes(ing.approval_state) && ing.routine_selection_allowed === true) approved.set(ing.ingredient_id, ing);
      }
    }
    const candidates = [];
    for (const candidate of rawCandidates) {
      const id = String(candidate?.ingredientId || "").trim().toLowerCase();
      const name = String(candidate?.displayName || "").trim().slice(0, 80);
      if (!id || !name) continue;
      if (approved.size && !approved.has(id)) continue;
      candidates.push({ id, name, category: String(candidate?.categoryTitle || "").trim().slice(0, 80), note: getIngredientEvidenceNote(id) });
    }
    if (!candidates.length) throw new HttpError(400, "No valid approved candidate to explain.");
    try {
      const rationales = await composeIngredientRationales({ config, concern, environment: { readings }, candidates });
      return sendJson(response, 200, { status: rationales.length ? "available" : "unavailable", rationales, requestId }, requestId);
    } catch (error) {
      if (error instanceof ExternalServiceError) throw new HttpError(503, error.message);
      throw error;
    }
  }

  if (request.method === "GET" && url.pathname === "/api/knowledge-explorer") {
    const concern = optionalConcernFromQuery(url);
    const repo = knowledgeRepo();
    const explorer = repo ? buildExplorerFromDb(repo, { concern }) : ingredientResearchExplorer({ concern });
    return sendJson(response, 200, {
      ...explorer,
      overview: {
        ...explorer.overview,
        liveResearchIndex: {
          enabled: Boolean(config.liveServicesEnabled && config.pinecone.apiKey && config.pinecone.index),
          namespace: config.pinecone.researchNamespace,
          contentMode: "project_authored_metadata_only",
          routineSelectionAllowed: false,
        },
      },
      requestId,
    }, requestId);
  }

  if (request.method === "GET" && url.pathname === "/api/research-search") {
    const concern = optionalConcernFromQuery(url);
    const search = optionalText(url.searchParams.get("q"), "research query", 100);
    const result = await retrieveResearchEvidence({ config, concern, search });
    return sendJson(response, 200, { ...result, requestId }, requestId);
  }

  if (request.method === "GET" && url.pathname === "/api/explainability") {
    const concern = optionalConcernFromQuery(url) || "acne";
    const environment = await getEnvironment(config, requestLocation(url));
    return sendJson(response, 200, {
      environment,
      explainability: buildEnvironmentalExplainability({ concern, environment }),
      requestId,
    }, requestId);
  }

  if (request.method === "GET" && url.pathname === "/api/evaluation") {
    return sendJson(response, 200, { ...(await evaluationSnapshot()), requestId }, requestId);
  }

  if (request.method === "GET" && url.pathname === "/api/environment") {
    const environment = await getEnvironment(config, requestLocation(url));
    return sendJson(response, 200, { ...environment, requestId }, requestId);
  }

  if (request.method === "GET" && url.pathname === "/api/environment/forecast") {
    const concern = optionalConcernFromQuery(url) || "acne";
    const forecast = await getEnvironmentForecast(config, requestLocation(url));
    const routineComparison = (periods) => (periods || []).map((period) => ({
      horizon: period.horizon,
      at: period.at,
      environment: period.environment,
      routine: templateRoutine(concern, { environment: period.environment }),
      explainability: buildEnvironmentalExplainability({ concern, environment: period.environment }),
    }));
    return sendJson(response, 200, {
      ...forecast,
      concern,
      next24Hours: routineComparison(forecast.next24Hours),
      next7Days: routineComparison(forecast.next7Days),
      providerReliability: providerReliabilitySnapshot(),
      requestId,
    }, requestId, { "cache-control": "private, max-age=60" });
  }

  if (request.method === "GET" && url.pathname === "/api/locations") {
    const query = locationSearchQuery(url);
    enforceLocationSearchRateLimit(request);
    const result = await searchLocations(config, query);
    return sendJson(response, 200, { query, ...result, requestId }, requestId);
  }

  if (request.method === "POST" && url.pathname === "/api/routine") {
    const input = await readJson(request);
    const release = acquireRoutineBudget(request);
    try {
      const result = await handleRoutine(input, requestId);
      return sendJson(response, 200, { ...result, requestId }, requestId);
    } finally {
      release();
    }
  }

  if (request.method === "POST" && url.pathname === "/api/bulk") {
    const input = await readJson(request);
    if (!Array.isArray(input.profiles)) {
      throw new HttpError(400, "profiles must be an array.");
    }
    if (input.profiles.length > 100) {
      throw new HttpError(400, "A batch may contain at most 100 profiles.");
    }

    const profiles = input.profiles.map((profile, index) => {
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
        throw new HttpError(400, `Invalid profile at row ${index + 1}.`);
      }
      const id = optionalText(profile.id, "profile id", 80) || `SP-${String(2000 + index).padStart(4, "0")}`;
      const concern = requiredConcern(optionalText(profile.concern, "profile concern", 80) || "acne");
      const profileCode = optionalText(profile.profile, "skin profile", 40).toLowerCase() || "combination";
      if (!ALLOWED_PROFILES.has(profileCode)) {
        throw new HttpError(400, `Invalid skin profile at row ${index + 1}.`);
      }
      return { id, concern, profile: profileCode };
    });

    const location = input.location === undefined || input.location === null ? DEFAULT_LOCATION : routineLocation({ location: input.location });
    const environment = await getEnvironment(config, location);
    const concernContexts = [...new Set(profiles.map((profile) => profile.concern))];
    const byConcern = new Map(await Promise.all(concernContexts.map(async (concern) => {
      const [retrieval, researchEvidence] = await Promise.all([
        retrieveEvidence({ config, profile: "combination", concern, environment }),
        retrieveResearchEvidence({ config, concern }),
      ]);
      return [concern, { retrieval, researchEvidence }];
    })));
    const results = profiles.map((profile, index) => {
      const context = byConcern.get(profile.concern);
      return bulkResultFor({
        profile,
        index,
        environment,
        retrieval: context?.retrieval || notRunRetrieval(),
        researchEvidence: context?.researchEvidence || notRunResearchEvidence(),
        requestId,
      });
    });
    const cleared = results.filter((item) => item.status === "Cleared").length;
    const averageCue = results.length
      ? Number((results.reduce((sum, item) => sum + item.cueScore, 0) / results.length).toFixed(2))
      : 0;
    return sendJson(response, 200, {
      results,
      summary: {
        total: results.length,
        cleared,
        review: results.length - cleared,
        averageCue,
        researchEvidenceRecords: results.reduce((sum, item) => sum + item.researchEvidenceCount, 0),
        environmentMode: environment.mode,
      },
      environment: environmentProvenance(environment),
      mode: "deterministic-research-batch",
      notices: ["Bulk analysis executes the deterministic environment, strict retrieval/CUE, non-clinical research-atlas, safety, and explainability paths for each concern. It does not fan out live LLM requests or generate individual treatment advice."],
      requestId,
    }, requestId);
  }

  return sendJson(response, 404, { error: "API route not found", requestId }, requestId);
}

async function serveStatic(response, pathname, requestId) {
  const file = publicFiles.get(pathname);
  if (!file) {
    return sendJson(response, 404, { error: "Not found", requestId }, requestId);
  }

  try {
    const contents = await readFile(resolve(root, file.path));
    response.writeHead(200, {
      ...securityHeaders(requestId),
      "content-type": file.contentType,
    });
    response.end(contents);
  } catch {
    sendJson(response, 404, { error: "Not found", requestId }, requestId);
  }
}

const server = createServer(async (request, response) => {
  const requestId = randomUUID();

  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(request, response, url, requestId);
      return;
    }
    await serveStatic(response, url.pathname, requestId);
  } catch (error) {
    if (response.writableEnded) return;
    if (error instanceof HttpError) {
      sendJson(response, error.status, { error: error.message, requestId }, requestId, error.headers);
      return;
    }
    if (error instanceof ReviewerQueueStorageError) {
      sendJson(response, 503, { error: "Reviewer queue storage is unavailable. Resolve the local storage issue before continuing.", requestId }, requestId);
      return;
    }
    sendJson(response, 500, { error: "Internal server error", requestId }, requestId);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`DermaSynth server listening on http://127.0.0.1:${PORT} (${config.liveServicesEnabled ? "live services enabled" : "demo mode"})`);
});
