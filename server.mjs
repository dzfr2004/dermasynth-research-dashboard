import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { createConfig, loadDotEnv, publicConfigStatus } from "./lib/config.mjs";
import { buildOutlook, readingChanges, tomorrowChanges } from "./lib/outlook.mjs";
import { checkProduct } from "./lib/product-check.mjs";
import { createStudyRoutes } from "./lib/study-routes.mjs";
import { CONCERN_WORDS, plainFunction, safetyShort } from "./lib/plain-language.mjs";
import { DEFAULT_LOCATION, getEnvironment, reverseLocation, getEnvironmentForecast, parseReportedConditions, providerReliabilitySnapshot, REPORTED_CONDITION_OPTIONS, reportedConditionsEnvironment, searchLocations } from "./lib/environment.mjs";
import { llmTriageSecondOpinion } from "./lib/triage-llm.mjs";
import { networkLocation } from "./lib/network-location.mjs";
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
  ALLOWED_CONCERNS,
  ALLOWED_PROFILES,
  ALLOWED_REACTIVITY_LEVELS,
  CONCERN_CATALOG,
  ROUTINE_CATEGORY_CATALOG,
  createCategoryRoutine,
  firstSafetyPass,
  MAX_CONCERNS,
  normaliseConcern,
  normaliseConcerns,
  secondSafetyPass,
  templateRoutine,
  triageRoutineRequest,
} from "./lib/safety.mjs";
import { summarizeKnowledgeContext, synthesizeRoutine, composeIngredientRationales, synthesizeIngredientSelection, composeRoutineContext } from "./lib/synthesis.mjs";
import { budgetSummary, createGptBudget, currentGptBudget, describeOpenAiError, openAiStatus, runWithGptBudget } from "./lib/openai.mjs";
import { functionalClass } from "./lib/ingredient-evidence-corpus.mjs";
import { evidenceGrade } from "./lib/ingredient-evidence-notes.mjs";
import { getEwgReference } from "./lib/kb-reference.mjs";
import { prefetchSlotSearches, retrieveSlotCandidates } from "./lib/candidate-retrieval.mjs";
import { clearSearchCache, searchCacheStats } from "./lib/search-cache.mjs";
import { buildIngredientEvidenceCorpus } from "./lib/ingredient-evidence-corpus.mjs";
import { postSelectionSafetyPass } from "./lib/post-selection-safety.mjs";
import { SHELF_LIMIT, checkShelf, cleanShelfProduct } from "./lib/shelf.mjs";
import { MAX_IMAGE_CHARS, scanProductLabel, validLabelImage } from "./lib/label-scan.mjs";
import { effectiveReactivity } from "./lib/personalisation.mjs";
import { buildTwoLevelExplanation, slotReasonText } from "./lib/peg.mjs";
import { createRecentPicks } from "./lib/rotation.mjs";
import { pgQuery, postgresEnabled } from "./lib/db/postgres.mjs";
import { clientAddress } from "./lib/client-address.mjs";
import { appendContextLog, appendFeedback, appendSelectionLog, selectionLogRecord } from "./lib/selection-log.mjs";
import { getRuntimePolicy } from "./lib/policy-store.mjs";
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
// What each routine slot showed in the last few runs (score-band rotation).
const recentPicks = createRecentPicks();
// With Postgres the memory is shared by every server instance (Vercel runs
// several): it is loaded before each selection and saved after it.
async function loadRecentPicks() {
  if (!postgresEnabled()) return;
  try {
    const { rows } = await pgQuery("SELECT slot_key, ids FROM rotation_recent");
    recentPicks.replace(Object.fromEntries(rows.map((row) => [row.slot_key, row.ids])));
  } catch { /* keep this instance's memory */ }
}
async function saveRecentPicks(entries) {
  if (!postgresEnabled()) return;
  try {
    const keys = [...new Set(entries.map((entry) => `${entry.phase || "am"}:${entry.categoryId}`))];
    await Promise.all(keys.map((key) => pgQuery(
      "INSERT INTO rotation_recent (slot_key, ids, updated_at) VALUES ($1, $2, now()) ON CONFLICT (slot_key) DO UPDATE SET ids = excluded.ids, updated_at = now()",
      [key, JSON.stringify(recentPicks.get(key))],
    )));
  } catch { /* non-fatal: rotation still works from this instance's memory */ }
}
function rotationSeedFor(requestId) {
  return config.ingredientRotationEnabled && requestId ? String(requestId) : null;
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
const INSTANCE_ID = randomUUID().slice(0, 8);
const INSTANCE_STARTED_AT = new Date().toISOString();
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
  ["/assets/og-image.png", { path: "assets/og-image.png", contentType: "image/png" }],
  ["/manifest.webmanifest", { path: "manifest.webmanifest", contentType: "application/manifest+json; charset=utf-8" }],
  ["/labelling", { path: "labelling.html", contentType: "text/html; charset=utf-8" }],
  ["/labelling.html", { path: "labelling.html", contentType: "text/html; charset=utf-8" }],
  ["/labelling.js", { path: "labelling.js", contentType: "text/javascript; charset=utf-8" }],
  ["/study", { path: "study.html", contentType: "text/html; charset=utf-8" }],
  ["/study.html", { path: "study.html", contentType: "text/html; charset=utf-8" }],
  ["/study.js", { path: "study.js", contentType: "text/javascript; charset=utf-8" }],
  ["/study.css", { path: "study.css", contentType: "text/css; charset=utf-8" }],
  ["/study-guide.js", { path: "study-guide.js", contentType: "text/javascript; charset=utf-8" }],
  ["/sky.js", { path: "sky.js", contentType: "text/javascript; charset=utf-8" }],
  ["/assets/fonts/fraunces-latin-opsz.woff2", { path: "assets/fonts/fraunces-latin-opsz.woff2", contentType: "font/woff2" }],
  ["/assets/fonts/lato-400.woff2", { path: "assets/fonts/lato-400.woff2", contentType: "font/woff2" }],
  ["/assets/fonts/lato-700.woff2", { path: "assets/fonts/lato-700.woff2", contentType: "font/woff2" }],
  ["/assets/fonts/lato-900.woff2", { path: "assets/fonts/lato-900.woff2", contentType: "font/woff2" }],
]);
// The front end's modules (ui/*.js) are served as they are added.
for (const name of readdirSync(resolve(root, "ui"))) {
  if (name.endsWith(".js")) publicFiles.set(`/ui/${name}`, { path: `ui/${name}`, contentType: "text/javascript; charset=utf-8" });
}

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
    "permissions-policy": "geolocation=(self), camera=(), microphone=()",
    "cross-origin-opener-policy": "same-origin",
    // The dashboard uses one deliberate inline width style for a visual-only
    // environmental bar. Scripts remain restricted to the local static file.
    "content-security-policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self';",
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

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
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

/**
 * The concerns a user picked, main concern first. `concerns` (an array of up
 * to MAX_CONCERNS ids) takes priority; the single `concern` field still works.
 */
function requiredConcerns(input) {
  if (input?.concerns === undefined || input?.concerns === null) return [requiredConcern(input?.concern)];
  const raw = input.concerns;
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_CONCERNS || raw.some((item) => typeof item !== "string")) {
    throw new HttpError(400, `Choose between 1 and ${MAX_CONCERNS} concerns.`);
  }
  const concerns = normaliseConcerns(raw);
  if (concerns.length !== raw.length) throw new HttpError(400, "Invalid concern.");
  return concerns;
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
      // The index changed, so cached search results may be out of date.
      clearSearchCache();
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
  return clientAddress(request);
}

function pruneWindow(map, windowMs) {
  const now = Date.now();
  for (const [client, entry] of map) {
    if (now - entry.windowStartedAt >= windowMs && !entry.inFlight) map.delete(client);
  }
}

const weekRequests = new Map();
const WEEK_WINDOW_MS = 60_000;
const WEEK_MAX_PER_WINDOW = 12;
function enforceWeekRateLimit(request) {
  pruneWindow(weekRequests, WEEK_WINDOW_MS);
  const client = clientKey(request);
  const existing = weekRequests.get(client);
  if (existing) {
    if (existing.count >= WEEK_MAX_PER_WINDOW) throw new HttpError(429, "Too many weekly plans. Please wait a minute and try again.", { "retry-after": "60" });
    existing.count += 1;
    return;
  }
  if (weekRequests.size >= LOCATION_SEARCH_CLIENTS_MAX) weekRequests.delete(weekRequests.keys().next().value);
  weekRequests.set(client, { windowStartedAt: Date.now(), count: 1, inFlight: 0 });
}

// Label scans call a vision model, so they get their own, tighter limit.
const scanRequests = new Map();
const SCAN_WINDOW_MS = 60_000;
const SCAN_MAX_PER_WINDOW = 6;
function enforceScanRateLimit(request) {
  pruneWindow(scanRequests, SCAN_WINDOW_MS);
  const client = clientKey(request);
  const existing = scanRequests.get(client);
  if (existing) {
    if (existing.count >= SCAN_MAX_PER_WINDOW) throw new HttpError(429, "Too many label scans. Please wait a minute and try again.", { "retry-after": "60" });
    existing.count += 1;
    return;
  }
  if (scanRequests.size >= LOCATION_SEARCH_CLIENTS_MAX) scanRequests.delete(scanRequests.keys().next().value);
  scanRequests.set(client, { windowStartedAt: Date.now(), count: 1, inFlight: 0 });
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
    sufficiencyScore: 0,
    scoreType: "not_run",
    evidence: [],
    eligibleEvidence: [],
    gate: {
      kind: "evidence_sufficiency",
      passed: false,
      sufficiencyScore: 0,
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

function cuePayload(cue) {
  if (!cue || typeof cue !== "object" || cue.score === undefined) {
    return {
      status: cue?.status || "not_run",
      score: null,
      threshold: config.cueThreshold,
      passed: null,
      method: cue?.method || null,
      explanation: "CUE scores model-written text against the context it was given. It runs only when the language model writes a rationale.",
    };
  }
  return {
    status: cue.status || (cue.passed ? "passed" : "withheld_below_threshold"),
    score: cue.score,
    threshold: cue.threshold ?? config.cueThreshold,
    passed: Boolean(cue.passed),
    method: cue.method || null,
    evaluatedClaims: cue.evaluatedClaims ?? null,
    supportedClaims: cue.supportedClaims ?? null,
    attempts: Array.isArray(cue.attempts) ? cue.attempts : [],
    unsupported: Array.isArray(cue.unsupported) ? cue.unsupported : [],
  };
}

function groundingPayload(retrieval, cue = null) {
  const gate = retrieval.gate || {};
  return {
    kind: "evidence_sufficiency",
    sufficiencyScore: Number.isFinite(Number(retrieval.sufficiencyScore)) ? Number(retrieval.sufficiencyScore) : 0,
    passed: Boolean(gate.passed),
    evidenceCount: Array.isArray(retrieval.evidence) ? retrieval.evidence.length : 0,
    eligibleEvidenceCount: Array.isArray(retrieval.eligibleEvidence) ? retrieval.eligibleEvidence.length : 0,
    scoreType: retrieval.scoreType || "not_run",
    relevanceThreshold: gate.relevanceThreshold ?? null,
    criteria: Array.isArray(gate.criteria) ? gate.criteria : [],
    rationale: gate.rationale || "No retrieval gate result is available.",
    relevanceMethod: retrieval.relevanceMethod || null,
    cue: cuePayload(cue),
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
      compositionStatus: rationale.compositionStatus || null,
      cue: rationale.cue ? cuePayload(rationale.cue) : null,
      boundary: rationale.compositionStatus === "withheld_below_cue_threshold"
        ? "The model's composed paragraph was withheld because its CUE stayed below the threshold after one regeneration; the locally allowlisted text is shown instead."
        : rationale.mode === "openai_composed_grounded_rationale"
          ? "Composed by the model from the supplied facts and retrieved evidence, then checked with CUE and the deterministic safety passes."
          : "The model selected only constrained rationale tags. Visible wording is locally allowlisted, and deterministic safety checks remain the final authority.",
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
  concerns = [],
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
  cue = null,
  explanation = null,
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
      ...(concerns.length > 1 ? { concerns } : {}),
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
      gate: groundingPayload(retrieval, cue),
      trace: retrieval.trace || {},
      evidence: (retrieval.evidence || []).map(evidenceProvenance),
    },
    safety: {
      status: safety.status,
      checks: safety.checks || [],
      rules: safety.rules || [],
      flags: safety.flags || [],
      postSelection: safety.postSelection || null,
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
    explanation: explanation || null,
    aiCategoryRationale,
  };
}

// Facts for the GPT step/ingredient context are kept server-side per run, so
// the browser can only ask for the context of a run the server produced.
const ROUTINE_CONTEXT_TTL_MS = 60 * 60 * 1000;
const routineContextCache = new Map();

function rememberRoutineContext(runId, payload) {
  const now = Date.now();
  for (const [key, value] of routineContextCache) {
    if (now - value.createdAt > ROUTINE_CONTEXT_TTL_MS) routineContextCache.delete(key);
  }
  while (routineContextCache.size >= 100) routineContextCache.delete(routineContextCache.keys().next().value);
  routineContextCache.set(runId, { createdAt: now, payload, result: null, pending: null });
}

// On a multi-instance host the explanation request can reach another
// instance, so with Postgres the run's facts are also stored there (1 hour).
async function persistRoutineContext(runId, payload) {
  if (!postgresEnabled()) return;
  try {
    await pgQuery("INSERT INTO routine_context (run_id, payload) VALUES ($1, $2) ON CONFLICT (run_id) DO NOTHING", [runId, JSON.stringify(payload)]);
    await pgQuery("DELETE FROM routine_context WHERE created_at < now() - interval '1 hour'");
  } catch { /* the in-memory copy still serves this instance */ }
}

async function recallRoutineContext(runId) {
  const cached = routineContextCache.get(runId);
  if (cached || !postgresEnabled() || !runId) return cached || null;
  try {
    const { rows } = await pgQuery("SELECT payload, created_at FROM routine_context WHERE run_id = $1 AND created_at > now() - interval '1 hour'", [runId]);
    if (!rows.length) return null;
    const entry = { createdAt: new Date(rows[0].created_at).getTime(), payload: rows[0].payload, result: null, pending: null };
    routineContextCache.set(runId, entry);
    return entry;
  } catch {
    return null;
  }
}

const FACTOR_WORDS = {
  environmental_driver: "how strongly today's reading triggered the step",
  retrieval_relevance: "how closely its evidence matched this step",
  evidence_strength: "the strength of its verified safety evidence",
  ewg_reference: "its EWG reference score",
  user_fit: "how well it fits this user's profile, finish preference, concern and weather",
};

function routineContextPayload({ concern, concerns = [], profile, environment, routine, entries, explanation = null }) {
  const labelFor = (id) => CONCERN_CATALOG.find((item) => item.id === id)?.label || id;
  const concernLabel = [...new Set([concern, ...concerns])].filter(Boolean).map(labelFor).join(" + ");
  const steps = [
    ...(routine?.am || []).map((step) => ({ ...step, phase: "am" })),
    ...(routine?.pm || []).map((step) => ({ ...step, phase: "pm" })),
  ].map((step) => ({
    key: `${step.phase}:${step.id}`,
    phase: step.phase,
    title: step.title,
    purpose: step.note,
    rule: slotReasonText({ step, environment, routine, concern }),
    plain: (explanation?.steps || []).find((item) => item.phase === step.phase && item.categoryId === step.id)?.plain || "",
  }));
  const contextEntries = (entries || []).map((entry) => {
    const attr = entry.attribution || {};
    const grade = evidenceGrade(entry.ingredientId);
    const ewg = getEwgReference(entry.ingredientId);
    const step = steps.find((item) => item.key === `${entry.phase}:${entry.categoryId}`);
    return {
      key: `${entry.phase}:${entry.categoryId}`,
      name: entry.displayName,
      phase: entry.phase,
      stepTitle: entry.categoryTitle,
      stepRule: step?.rule || "",
      facts: {
        functional_class: functionalClass(entry.ingredientId) || "not recorded",
        verified_safety_evidence: grade.note?.text || "no verified safety card",
        safety_source: grade.note?.source || "none",
        evidence_grade: grade.label,
        retrieved_candidates_in_rank_order: (attr.ranking || []).map((item) => item.displayName),
        selected_rank: attr.poolRank ? `${attr.poolRank} of ${attr.poolSize}` : "only candidate",
        runner_up: attr.contrast?.runnerUp?.displayName || null,
        deciding_factor_versus_runner_up: attr.contrast?.decisive ? FACTOR_WORDS[attr.contrast.decisive.id] || attr.contrast.decisive.label : null,
        fit_to_user: (entry.userFit?.components || []).map((c) => c.reason),
        // Plain-language facts for the consumer panel (lib/plain-language.mjs).
        what_it_is_plain: entry.explanation?.consumer?.whatItIs || null,
        why_today_plain: entry.explanation?.consumer?.whyToday || null,
        user_concern: CONCERN_WORDS[concern] || concern,
        chosen_by: entry.selectedBy === "llm_from_rag_pool" ? "the language model, from the retrieved approved pool" : entry.selectedBy === "rotation_within_score_band" ? "a rotation among equally well-supported candidates, so routines do not always repeat the same ingredient" : "the highest transparent candidate score",
        ewg_reference: ewg?.status === "listed" ? `EWG Skin Deep hazard score ${ewg.hazardScore} on a 1 to 10 scale (1 = lowest), ${ewg.dataAvailability} data, checked ${ewg.checkedAt || "2026-09-23"}` : "not listed on EWG Skin Deep",
      },
      passages: grade.note ? [{ title: grade.note.source, text: grade.note.text }] : [],
    };
  });
  return { concernLabel, profile, environment: { readings: environment?.readings || {} }, steps, entries: contextEntries };
}

function selectionUnavailable(status, notice) {
  return { status, registryVersion: getRuntimePolicy().policyVersion, entries: [], pool: [], notices: [notice], boundary: "Routine steps remain broad categories. No named ingredient candidate is shown." };
}

/**
 * Named-ingredient layer: retrieve each slot's pool, optionally let the model
 * choose within it, re-validate, then run the post-selection safety pass over
 * the final output. Returns the selection plus everything the run report and
 * selection log need.
 */
/**
 * Weekly planner ingredients. Each future day's routine (rule-based, from that
 * day's forecast) goes through the same named-ingredient selection as today's
 * run without GPT: the approved, retrieved pool for each step, the candidate
 * score for that day's readings, then the post-selection safety pass. Where a
 * day keeps a step from today and today's ingredient is still in that day's
 * pool, today's ingredient is kept, so the plan only changes when the weather
 * or the step changes. Returns { "am:category": { id, name, sameAsToday } } per day.
 */
async function weekIngredients({ days, todaySteps = [], todayIngredients, profile, finishPreference, concern, concerns = [], reactivityLevel }) {
  if (!config.ingredientSelectionEnabled || !config.ingredientDb?.enabled) return null;
  const repo = knowledgeRepo();
  const policy = getRuntimePolicy();
  const names = new Map(repo.listIngredients().map((record) => [record.ingredient_id, record.display_name]));
  const today = Object.fromEntries(Object.entries(todayIngredients).filter(([, id]) => names.has(id)));
  let corpus = [];
  try { corpus = buildIngredientEvidenceCorpus({ ingredients: repo.listIngredients(), sources: repo.listSources() }); } catch { corpus = []; }
  const selectionMap = Object.fromEntries(Object.entries(today).map(([key, id]) => [key.split(":")[1], id]));
  return Promise.all(days.map(async (day) => {
    if (day.isToday) return Object.fromEntries(Object.entries(today).map(([key, id]) => [key, { id, name: names.get(id), sameAsToday: true }]));
    const routine = day.routine;
    if (!routine) return {};
    const environment = { readings: day.readings };
    const categoryIds = [...(routine.am || []), ...(routine.pm || [])].map((step) => String(step?.id || "").toLowerCase()).filter(Boolean);
    try {
      const slotRetrieval = await retrieveSlotCandidates({ config, corpus, categoryIds, concern, concerns, environment, policy });
      const selection = selectApprovedIngredientCandidates({ enabled: true, repository: repo, routine, profile, finishPreference, concern, concerns, environment, reactivityLevel, slotRetrieval, selectionMap });
      const post = postSelectionSafetyPass({ entries: selection.entries, concern, concerns, reactivityLevel, environment });
      // A routine names at most a few ingredients (the policy's per-run
      // limit), so a step that is in today's routine without a named
      // ingredient stays unnamed on other days too. Otherwise a day with
      // fewer steps would name one and look like a change when it is not.
      const todayStepSet = new Set(todaySteps);
      const shown = post.entries.filter((entry) => {
        const key = `${entry.phase}:${entry.categoryId}`;
        return today[key] || !todayStepSet.has(key);
      });
      return Object.fromEntries(shown.map((entry) => {
        const key = `${entry.phase}:${entry.categoryId}`;
        return [key, { id: entry.ingredientId, name: entry.displayName, sameAsToday: today[key] === entry.ingredientId }];
      }));
    } catch {
      return {};
    }
  }));
}

/**
 * The categories a routine can have are fixed by the concern, the weather and
 * two GPT choices (the evidence subset and the extra hydration step), so the
 * likely set is the union of the rule-built routine with and without the extra
 * hydration step. Returns how many searches were started.
 */
function prefetchIngredientSearches({ concern, concerns = [], environment, evidence, profile, finishPreference, reactivityLevel, exposureContext, genericRoutine }) {
  if (!config.ingredientSelectionEnabled || !config.ingredientDb?.enabled) return 0;
  try {
    const ids = new Set();
    const add = (routine) => [...(routine?.am || []), ...(routine?.pm || [])].forEach((step) => { const id = String(step?.id || "").toLowerCase(); if (id) ids.add(id); });
    add(genericRoutine);
    for (const includeHydration of [true, false]) {
      add(createCategoryRoutine({ concern, concerns, environment, evidence, includeHydration, profile, finishPreference, reactivityLevel, exposureContext }));
    }
    return prefetchSlotSearches({ config, categoryIds: [...ids], concern, concerns, environment, policy: getRuntimePolicy() });
  } catch {
    return 0;
  }
}

// Latency (Nov 2026): the GPT ingredient pick used to start only after the GPT
// category pick had finished. It now starts at the same time, on the largest
// routine the category pick can produce (with the optional hydration step).
// Picks for a step the final routine does not keep are dropped, and every
// pick is still re-validated against its own slot pool and the post-selection
// safety pass, so this changes timing only, never what may be shown.
function startSpeculativeIngredientPicks({ requestId = null, concern, concerns = [], environment, evidence, profile, finishPreference, reactivityLevel, exposureContext }) {
  if (!config.ingredientSelectionEnabled || !config.ingredientDb?.enabled || !config.liveServicesEnabled || !config.openai?.apiKey) return null;
  return (async () => {
    const superset = createCategoryRoutine({ concern, concerns, environment, evidence, includeHydration: true, profile, finishPreference, reactivityLevel, exposureContext });
    const repo = knowledgeRepo();
    const corpus = buildIngredientEvidenceCorpus({ ingredients: repo.listIngredients(), sources: repo.listSources() });
    const categoryIds = [...(superset?.am || []), ...(superset?.pm || [])].map((step) => String(step?.id || "").toLowerCase()).filter(Boolean);
    const slotRetrieval = await retrieveSlotCandidates({ config, corpus, categoryIds, concern, concerns, environment, policy: getRuntimePolicy() });
    const pre = selectApprovedIngredientCandidates({ enabled: true, repository: repo, routine: superset, profile, finishPreference, concern, concerns, environment, reactivityLevel, slotRetrieval });
    if (pre.status !== "available" || !pre.pool.some((slot) => slot.candidates.length)) return null;
    const vote = superset?.generation?.textureVote;
    const userContext = { skin_profile: profile || null, finish_preference: finishPreference || "no-preference", reactivity: superset?.generation?.reactivityLevel || reactivityLevel || "low", routine_texture: vote ? vote.direction : "balanced", texture_reasons: vote ? vote.votes.map((v) => v.reason) : [] };
    const started = Date.now();
    const result = await synthesizeIngredientSelection({ config, concern, concerns, environment, pool: pre.pool, userContext, recentPicks: rotationSeedFor(requestId) ? recentPicks : null, rotationSeed: rotationSeedFor(requestId) });
    return { ...result, latencyMs: Date.now() - started };
  })().catch((error) => ({ error }));
}

async function selectNamedIngredients({ requestId = null, routine, profile, finishPreference, concern, concerns = [], environment, reactivityLevel, allowLlmSelection, stages, speculativePicks = null }) {
  const rotationSeed = rotationSeedFor(requestId);
  if (rotationSeed) await loadRecentPicks();
  const rotationRecent = rotationSeed ? recentPicks : null;
  const repo = knowledgeRepo();
  const selectionStarted = Date.now();
  const policy = getRuntimePolicy();
  const categoryIds = [...(routine?.am || []), ...(routine?.pm || [])].map((step) => String(step?.id || "").toLowerCase()).filter(Boolean);
  let corpus = [];
  try {
    corpus = buildIngredientEvidenceCorpus({ ingredients: repo.listIngredients(), sources: repo.listSources() });
  } catch {
    corpus = [];
  }
  const slotRetrieval = await retrieveSlotCandidates({ config, corpus, categoryIds, concern, concerns, environment, policy });
  stages.push(stage("ingredient_retrieval", corpus.length ? "completed" : "unavailable", selectionStarted, {
    corpusDocuments: corpus.length,
    modes: [...new Set([...slotRetrieval.values()].map((item) => item.mode))],
  }));

  const base = { enabled: true, repository: repo, routine, profile, finishPreference, concern, concerns, environment, reactivityLevel, slotRetrieval, rotationSeed, recentPicks: rotationRecent };
  const pre = selectApprovedIngredientCandidates(base);
  const llm = { requested: false, status: "not_requested", raw: [], rejected: [] };
  let selectionMap = null;
  const llmPermitted = allowLlmSelection && config.liveServicesEnabled && config.openai?.apiKey;
  if (llmPermitted && pre.status === "available" && pre.pool.some((slot) => slot.candidates.length)) {
    llm.requested = true;
    const llmStarted = Date.now();
    try {
      const vote = routine?.generation?.textureVote;
      const userContext = { skin_profile: profile || null, finish_preference: finishPreference || "no-preference", reactivity: routine?.generation?.reactivityLevel || reactivityLevel || "low", routine_texture: vote ? vote.direction : "balanced", texture_reasons: vote ? vote.votes.map((v) => v.reason) : [] };
      const early = speculativePicks ? await speculativePicks : null;
      if (early?.error) throw early.error;
      const result = early || await synthesizeIngredientSelection({ config, concern, concerns, environment, pool: pre.pool, userContext, recentPicks: rotationRecent, rotationSeed });
      if (early) {
        // Keep only picks for steps this routine has.
        const keep = new Set(pre.pool.map((slot) => slot.categoryId));
        result.map = Object.fromEntries(Object.entries(result.map || {}).filter(([category]) => keep.has(category)));
        llm.startedEarly = true;
        // The early call covers one extra step, and the model occasionally
        // skips a step in a longer list. Ask again for any step it skipped.
        const skipped = pre.pool.filter((slot) => slot.candidates.length && !result.map[slot.categoryId]);
        if (skipped.length) {
          try {
            const extra = await synthesizeIngredientSelection({ config, concern, concerns, environment, pool: skipped, userContext, recentPicks: rotationRecent, rotationSeed });
            result.map = { ...result.map, ...(extra.map || {}) };
            result.raw = [...(result.raw || []), ...(extra.raw || [])];
            result.rejected = [...(result.rejected || []), ...(extra.rejected || [])];
            llm.followUpFor = skipped.map((slot) => slot.categoryId);
          } catch { /* the skipped step keeps the top-scored candidate */ }
        }
      }
      selectionMap = result.map;
      llm.status = "completed";
      llm.raw = result.raw;
      llm.rejected = result.rejected;
    } catch (error) {
      llm.status = "failed_fell_back_to_top_score";
      llm.error = error instanceof ExternalServiceError ? error.code || "provider_error" : "provider_error";
    }
    llm.latencyMs = Date.now() - llmStarted;
  } else if (allowLlmSelection && !llmPermitted) {
    llm.status = "not_configured";
  }
  const selection = llm.requested
    ? selectApprovedIngredientCandidates({ ...base, selectionMap, llmRequested: true, llmFailed: llm.status !== "completed", llmRejected: llm.rejected })
    : pre;
  stages.push(stage("ingredient_selection", selection.status, selectionStarted, {
    selectionMode: selection.selectionMode || null,
    llm: { requested: llm.requested, status: llm.status, rejected: llm.rejected.length },
  }));

  const postStarted = Date.now();
  const postSafety = postSelectionSafetyPass({ entries: selection.entries, concern, concerns, reactivityLevel, environment });
  selection.entries = postSafety.entries;
  selection.removedBySafety = postSafety.removed;
  // Remember only what was actually shown, after the final safety pass.
  if (rotationSeed) {
    recentPicks.record(selection.entries);
    await saveRecentPicks(selection.entries);
  }
  if (!selection.entries.length && postSafety.removed.length) selection.status = "removed_by_post_selection_safety";
  stages.push(stage("post_selection_safety", postSafety.status, postStarted, {
    ruleIds: postSafety.rules.map((item) => item.id),
    removed: postSafety.removed.map((item) => item.ingredientId),
  }));
  return { selection, postSafety, llm };
}

async function routineResult({
  requestId,
  startedAt,
  profile,
  concern,
  concerns = [concern],
  finishPreference,
  reactivityLevel,
  exposureContext,
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
  allowLlmSelection = false,
  speculativePicks = null,
}) {
  const ingredientResearch = ingredientResearchForConcern(concern, {
    exposeCandidates: status !== "medical_redirect",
  });
  const resolvedResearchEvidence = researchEvidence || notRunResearchEvidence();
  const resolvedExplainability = explainability || buildEnvironmentalExplainability({ concern, environment });
  const aiCategoryRationale = aiCategoryRationalePayload(routine);
  const cue = routine?.generation?.aiRationale?.cue || null;
  if (routine) {
    stages.push(stage("cue", cue ? String(cue.status || (cue.passed ? "passed" : "withheld_below_threshold")) : "not_run", Date.now(), {
      score: cue?.score ?? null,
      threshold: config.cueThreshold,
      method: cue?.method || null,
    }));
  }

  const selectionEnabled = config.ingredientSelectionEnabled && config.ingredientDb?.enabled && status !== "medical_redirect" && safety?.status === "cleared" && routine;
  let ingredientCandidates;
  let postSafety = null;
  let llm = { requested: false, status: "not_requested" };
  if (!selectionEnabled) {
    ingredientCandidates = selectApprovedIngredientCandidates({ enabled: false });
  } else {
    try {
      ({ selection: ingredientCandidates, postSafety, llm } = await selectNamedIngredients({ requestId, routine, profile, finishPreference, concern, concerns, environment, reactivityLevel, allowLlmSelection, stages, speculativePicks }));
    } catch {
      ingredientCandidates = selectionUnavailable("knowledge_base_unavailable", "The approved knowledge base could not be read, so no named ingredient is shown.");
    }
  }
  const resolvedSafety = postSafety
    ? {
      ...safety,
      checks: [...new Set([...(safety.checks || []), ...postSafety.checks])],
      rules: [...(safety.rules || []), ...postSafety.rules],
      postSelection: { status: postSafety.status, removed: postSafety.removed, flags: postSafety.flags },
    }
    : safety;
  const namedRoutine = enrichRoutineWithApprovedIngredients(routine, ingredientCandidates);
  const explanation = routine ? buildTwoLevelExplanation({ explainability: resolvedExplainability, routine, entries: ingredientCandidates.entries || [], environment, concern }) : null;
  if (explanation) {
    for (const entry of ingredientCandidates.entries || []) {
      const level2 = explanation.level2.find((item) => item.ingredientId === entry.ingredientId && item.phase === entry.phase);
      if (level2) entry.explanation = { whyThisStep: level2.whyThisStep, whyThisIngredient: level2.whyThisIngredient, consumer: level2.consumer };
    }
  }
  const contextAvailable = Boolean(routine && status !== "medical_redirect" && config.liveServicesEnabled && config.openai?.apiKey);
  if (routine && status !== "medical_redirect") {
    const contextPayload = routineContextPayload({ concern, concerns, profile, environment, routine, entries: ingredientCandidates.entries || [], explanation });
    rememberRoutineContext(requestId, contextPayload);
    await persistRoutineContext(requestId, contextPayload);
  }
  const runReport = buildRunReport({
    requestId,
    startedAt,
    profile,
    concern,
    concerns,
    finishPreference,
    reactivityLevel,
    symptomsProvided,
    requestedLocation,
    environment,
    retrieval,
    safety: resolvedSafety,
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
    cue,
    explanation,
  });
  // Written by handleRoutine() once the degraded status is known (F1).
  const selectionRecord = !selectionEnabled ? null : selectionLogRecord({
      runId: requestId,
      startedAt,
      concern,
      concerns,
      profile,
      reactivityLevel,
      environment,
      routineMode: mode,
      synthesisStatus,
      selection: ingredientCandidates,
      postSafety,
      cue: cue ? { status: cue.status || null, score: cue.score ?? null, method: cue.method || null } : null,
      llm,
      gptBudget: budgetSummary(currentGptBudget()),
      stages: stages.map((item) => ({ id: item.id, status: item.status, durationMs: item.durationMs })),
    });
  return {
    __selectionLog: selectionRecord,
    mode,
    status,
    synthesisStatus,
    outputMode: INGREDIENT_OUTPUT_MODE,
    profile,
    concern,
    concerns,
    profileModifiers: {
      ...(finishPreference === undefined ? {} : { finishPreference }),
      ...(reactivityLevel === undefined ? {} : { reactivityLevel }),
      ...(exposureContext === undefined ? {} : { exposureContext }),
    },
    routine,
    namedRoutine,
    environment,
    grounding: groundingPayload(retrieval, cue),
    safety: resolvedSafety,
    evidence: retrieval.evidence || [],
    notices: uniqueNotices([...(retrieval.notices || []), ...notices, ...(postSafety?.flags || [])]),
    ingredientResearch,
    ingredientCandidates,
    researchEvidence: resolvedResearchEvidence,
    explainability: resolvedExplainability,
    explanation,
    aiCategoryRationale,
    routineContext: {
      available: contextAvailable,
      runId: requestId,
      reason: contextAvailable ? null : (!config.liveServicesEnabled || !config.openai?.apiKey ? "GPT is not configured (set LIVE_SERVICES_ENABLED=true and OPENAI_API_KEY in .env)." : null),
    },
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

function stage(id, status, startedAt, detail = {}) {
  return {
    id,
    status,
    durationMs: Math.max(0, Date.now() - startedAt),
    ...detail,
  };
}

/**
 * C4/C5: every GPT call made while serving one routine shares one time budget
 * (GPT_ROUTINE_BUDGET_MS, default 20 s). When a GPT step fails, times out or is
 * skipped, the rule-based path answers instead and the response says so in
 * `degraded`, so a reduced answer is never presented as a full one.
 */
async function handleRoutine(input, requestId, cancel = null) {
  const gptActive = Boolean(config.liveServicesEnabled && config.openai?.apiKey);
  // The budget object is always kept (it records GPT time and calls); it only
  // limits anything when GPT_ROUTINE_BUDGET_MS is set above 0.
  // F2: "Show the standard routine now" re-requests with standardRoutine=true;
  // every GPT step is then skipped and the rule-based path answers at once.
  const standardRoutine = input?.standardRoutine === true;
  const budget = gptActive ? createGptBudget(config.openai.routineBudgetMs || Number.POSITIVE_INFINITY, { disabled: standardRoutine }) : null;
  if (cancel) cancel.budget = budget;
  const { __selectionLog, ...result } = budget ? await runWithGptBudget(budget, () => handleRoutineRun(input, requestId)) : await handleRoutineRun(input, requestId);
  const degraded = degradedStatus(result, { gptActive, budget });
  recordRunOutcome(degraded);
  // F1: the degraded status goes into the selection log with the run.
  if (__selectionLog) await appendSelectionLog(config, { ...__selectionLog, degraded: { status: degraded.status, reasons: degraded.reasons.map((reason) => reason.id) } });
  return { ...result, gpt: { active: gptActive, budget: budgetSummary(budget) }, degraded, compare: compareRoutine(input?.compare, result) };
}

const STEP_KEY = /^(am|pm):[a-z-]{3,40}$/;
const cleanSteps = (value) => (Array.isArray(value) ? value : []).slice(0, 16).map(String).filter((s) => STEP_KEY.test(s));

// Improvements 6 and 7: today's routine against the user's usual routine and
// against the last routine this browser saw (both sent by the browser, which
// stores them; the server keeps nothing).
function compareRoutine(compare, result) {
  if (!compare || typeof compare !== "object" || !result?.routine || result.status === "medical_redirect") return null;
  const routine = result.routine;
  const readings = result.environment?.readings || {};
  const out = {};
  const usual = cleanSteps(compare.usualSteps);
  if (usual.length) {
    const diff = tomorrowChanges({ todaySteps: usual, tomorrowRoutine: routine, readings, when: "today" });
    out.vsUsual = { changes: diff.changes.filter((c) => c.change !== "kept"), sameAsUsual: diff.same };
  }
  const previous = compare.previous && typeof compare.previous === "object" ? compare.previous : null;
  const previousSteps = cleanSteps(previous?.steps);
  if (previousSteps.length) {
    const prevReadings = {};
    for (const key of ["uvi", "uviMaxToday", "humidity", "pm25", "temperature"]) {
      const v = Number(previous.readings?.[key]);
      if (previous.readings?.[key] !== null && previous.readings?.[key] !== undefined && Number.isFinite(v)) prevReadings[key] = v;
    }
    const diff = tomorrowChanges({ todaySteps: previousSteps, tomorrowRoutine: routine, readings, when: "today" });
    out.vsPrevious = {
      at: typeof previous.at === "string" ? previous.at.slice(0, 40) : null,
      changes: diff.changes.filter((c) => c.change !== "kept"),
      same: diff.same,
      readingChanges: readingChanges(prevReadings, readings),
    };
  }
  return Object.keys(out).length ? out : null;
}

// F1: in-process counters, exposed in /api/health so a monitor can alert on a
// rising share of reduced answers even though they return HTTP 200.
const runOutcomes = { since: new Date().toISOString(), runs: 0, degraded: 0, reasons: {}, recent: [] };
function recordRunOutcome(degraded) {
  runOutcomes.runs += 1;
  const isDegraded = degraded.status === "degraded";
  if (isDegraded) runOutcomes.degraded += 1;
  for (const reason of degraded.reasons) runOutcomes.reasons[reason.id] = (runOutcomes.reasons[reason.id] || 0) + 1;
  runOutcomes.recent.push(isDegraded ? 1 : 0);
  if (runOutcomes.recent.length > 50) runOutcomes.recent.shift();
}
function runOutcomeSummary() {
  const recent = runOutcomes.recent;
  return { since: runOutcomes.since, runs: runOutcomes.runs, degraded: runOutcomes.degraded, degradedShareLast50: recent.length ? Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 1000) / 1000 : null, reasons: runOutcomes.reasons };
}

function degradedStatus(result, { gptActive, budget }) {
  const stages = result?.trace?.stages || [];
  const find = (name) => stages.find((item) => item.id === name) || null;
  const reasons = [];
  if (gptActive && budget?.disabled) {
    reasons.push({ id: "standard_routine_chosen", text: "You asked for the standard routine, so the AI steps were skipped. The rule-based symptom check and all safety checks still ran." });
  } else if (gptActive) {
    if (budget?.exhausted) reasons.push({ id: "gpt_time_budget", text: `GPT used its ${Math.round(budget.totalMs / 1000)}-second budget, so the remaining GPT steps were skipped.` });
    const triage = find("triage");
    if (triage?.secondOpinion === "failed") reasons.push({ id: "ai_symptom_check_failed", text: "The AI second symptom check did not complete; the rule-based symptom check still ran." });
    const synthesis = find("synthesis");
    if (synthesis && synthesis.providerCode && synthesis.providerCode !== "not_enabled" && synthesis.providerCode !== "insufficient_evidence") reasons.push({ id: "gpt_category_selection_failed", text: "GPT did not complete the routine selection; the rule-based routine is shown." });
    const selection = find("ingredient_selection");
    if (String(selection?.llm?.status || "").startsWith("failed")) reasons.push({ id: "gpt_ingredient_pick_failed", text: "GPT did not complete the ingredient choice; the top-scored ingredient was used in each step." });
  }
  const environmentMode = result?.environment?.mode;
  if (environmentMode === "degraded") reasons.push({ id: "environment_partial", text: "Some live environmental readings were missing." });
  if (environmentMode === "user_reported") reasons.push({ id: "environment_user_reported", text: "Live readings were unavailable, so the conditions you reported were used." });
  return { status: reasons.length ? "degraded" : "full", reasons };
}

async function handleRoutineRun(input, requestId) {
  const startedAt = new Date();
  const profile = requiredChoice(input.profile, ALLOWED_PROFILES, "profile", "combination");
  const concerns = requiredConcerns(input);
  const concern = concerns[0];
  const finishPreference = optionalChoice(input.finishPreference, ALLOWED_FINISH_PREFERENCES, "finish preference");
  const statedReactivityLevel = optionalChoice(input.reactivityLevel, ALLOWED_REACTIVITY_LEVELS, "reactivity level");
  // B1: a sensitive skin profile raises low or missing reactivity to moderate,
  // so every safety pass and the ingredient selector apply the barrier guardrail.
  const reactivityRaise = effectiveReactivity({ profile, reactivityLevel: statedReactivityLevel });
  const reactivityLevel = reactivityRaise.raisedByProfile ? reactivityRaise.level : statedReactivityLevel;
  const exposureContext = optionalChoice(input.exposureContext, ALLOWED_EXPOSURE_CONTEXTS, "exposure context");
  const symptoms = optionalText(input.symptoms, "symptoms");
  const stages = [];
  const triageStarted = Date.now();
  let triage = triageRoutineRequest({ symptoms });
  // Layer 2: a model second opinion that can only escalate a cleared result.
  if (triage.status === "cleared" && symptoms && config.triage.llmEnabled && config.liveServicesEnabled && config.openai?.apiKey) {
    try {
      const opinion = await llmTriageSecondOpinion({ config, symptoms });
      triage = { ...triage, triage: { ...triage.triage, secondOpinion: opinion } };
      if (opinion.escalate) {
        const flag = `The AI second check flagged these symptoms for clinical assessment (${opinion.category}).`;
        triage = {
          ...triage,
          status: "medical_redirect",
          rules: [...(triage.rules || []), { id: "clinical-symptom-triage-second-opinion", label: "AI second-opinion symptom check", status: "redirected", detail: flag }],
          flags: [flag],
          notices: ["This research prototype cannot assess urgent or clinical skin symptoms. Please seek appropriate professional care."],
        };
      }
    } catch (error) {
      triage = { ...triage, triage: { ...triage.triage, secondOpinion: { status: "failed", code: error?.code || "error" } } };
    }
  }
  stages.push(stage("triage", triage.status, triageStarted, {
    ruleIds: (triage.rules || []).map((rule) => rule.id),
    matched: (triage.triage?.matched || []).map((item) => item.rule),
    negated: (triage.triage?.negated || []).map((item) => item.rule),
    secondOpinion: triage.triage?.secondOpinion?.status || "not_run",
  }));

  if (triage.status === "medical_redirect") {
    return routineResult({
      requestId,
      startedAt,
      profile,
      concern,
      concerns,
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
  let environment = await getEnvironment(config, requestedLocation);
  // Never build a routine from invented readings: if live data is missing,
  // use conditions the user reported, or ask for them.
  const reportedConditions = input.reportedConditions === undefined ? null : parseReportedConditions(input.reportedConditions);
  if (input.reportedConditions !== undefined && !reportedConditions) throw new HttpError(400, "Invalid reported conditions.");
  if (environment.mode !== "live" && reportedConditions) {
    environment = reportedConditionsEnvironment(requestedLocation, reportedConditions);
  } else if (environment.mode === "unavailable") {
    stages.push(stage("environment", "awaiting_user_conditions", environmentStarted));
    return {
      mode: "awaiting_conditions",
      status: "needs_conditions",
      synthesisStatus: "not_requested",
      profile,
      concern,
      concerns,
      routine: null,
      environment,
      conditionOptions: Object.fromEntries(Object.entries(REPORTED_CONDITION_OPTIONS).map(([key, options]) => [key, Object.entries(options).map(([id, option]) => ({ id, label: option.label }))])),
      notices: environment.notices,
      trace: { runId: requestId, stages },
    };
  }
  stages.push(stage("environment", environment.mode, environmentStarted, {
    providerStates: Object.fromEntries(Object.entries(environment.sources || {}).map(([key, value]) => [key, value?.status || "unknown"])),
  }));

  const firstSafetyStarted = Date.now();
  const firstPass = firstSafetyPass({ concern, concerns, environment, reactivityLevel });
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
  stages.push(stage("evidence_sufficiency_gate", retrieval.gate?.passed ? "passed" : "blocked", Date.now(), {
    sufficiencyScore: retrieval.sufficiencyScore,
    criteria: retrieval.gate?.criteria || [],
  }));

  const genericRoutine = templateRoutine(concern, {
    concerns,
    environment,
    evidence: [],
    profile,
    finishPreference,
    // The routine applies the same sensitive-profile raise itself and records
    // that it did, so it gets the stated level.
    reactivityLevel: statedReactivityLevel,
    exposureContext,
  });
  const genericSecondPass = secondSafetyPass(genericRoutine, {
    concern,
    concerns,
    environment,
    reactivityLevel,
    allowedEvidenceIds: [],
  });
  const genericSafety = combineSafety(firstPass, genericSecondPass);

  if (!retrieval.gate?.passed) {
    stages.push(stage("synthesis", "category_fallback", Date.now(), { reason: "evidence_sufficiency_gate_not_passed" }));
    stages.push(stage("second_safety", genericSafety.status, Date.now(), { ruleIds: (genericSecondPass.rules || []).map((rule) => rule.id) }));
    return routineResult({
      requestId,
      startedAt,
      profile,
      concern,
      concerns,
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

  // Start the ingredient searches for the categories this routine can end up
  // with while GPT picks the categories (they are picked up from the cache).
  const prefetchedCategories = prefetchIngredientSearches({ concern, concerns, environment, evidence: retrieval.eligibleEvidence, profile, finishPreference, reactivityLevel: statedReactivityLevel, exposureContext, genericRoutine });

  const speculativePicks = startSpeculativeIngredientPicks({ requestId, concern, concerns, environment, evidence: retrieval.eligibleEvidence, profile, finishPreference, reactivityLevel: statedReactivityLevel, exposureContext });

  let routine;
  const synthesisStarted = Date.now();
  try {
    routine = await synthesizeRoutine({
      config,
      profile,
      concern,
      concerns,
      environment,
      evidence: retrieval.eligibleEvidence,
      finishPreference,
      reactivityLevel: statedReactivityLevel,
      exposureContext,
    });
    stages.push(stage("synthesis", "completed", synthesisStarted, {
      prefetchedIngredientSearches: prefetchedCategories,
      mode: routine.generation?.mode || "allowlisted-category-selection",
      selectedEvidenceIds: routine.generation?.selectionEvidenceIds || [],
    }));
  } catch (error) {
    const fallback = synthesisFallback(error);
    if (error instanceof ExternalServiceError && error.code !== "not_enabled") {
      fallback.notices = [...fallback.notices, `GPT category synthesis did not complete: ${describeOpenAiError(error)}`];
    }
    stages.push(stage("synthesis", fallback.synthesisStatus, synthesisStarted, { providerCode: error?.code || null, providerStatus: error?.status ?? null }));
    stages.push(stage("second_safety", genericSafety.status, Date.now(), { ruleIds: (genericSecondPass.rules || []).map((rule) => rule.id) }));
    return routineResult({
      requestId,
      startedAt,
      profile,
      concern,
      concerns,
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
    concerns,
    environment,
    reactivityLevel,
    allowedEvidenceIds: retrieval.eligibleEvidence,
  });
  stages.push(stage("second_safety", secondPass.status, secondSafetyStarted, { ruleIds: (secondPass.rules || []).map((rule) => rule.id) }));
  let safety = combineSafety(firstPass, secondPass);
  let recoveryNotice = null;

  // If only the GPT-written routine text tripped the second pass (for example
  // it named an ingredient), keep the live path and use the deterministic,
  // allowlisted routine text instead of dropping to a category-only preview.
  if (secondPass.status !== "cleared" && genericSecondPass.status === "cleared") {
    routine = genericRoutine;
    safety = genericSafety;
    recoveryNotice = "GPT routine text did not pass the second safety screen, so the rule-based routine text is shown; ingredient selection continued normally.";
    stages.push(stage("second_safety_recovered", "cleared", Date.now(), { ruleIds: (genericSecondPass.rules || []).map((rule) => rule.id) }));
  } else if (secondPass.status !== "cleared") {
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
      concerns,
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

  // The language model may choose named ingredients only on this fully cleared
  // live path; routineResult() retrieves each slot's pool, re-validates the
  // picks and runs the post-selection safety pass.
  return routineResult({
    requestId,
    startedAt,
    profile,
    concern,
    concerns,
    finishPreference,
    reactivityLevel,
    exposureContext,
    symptomsProvided: Boolean(symptoms),
    requestedLocation,
    mode: "live",
    status: "cleared",
    routine,
    environment,
    allowLlmSelection: true,
    speculativePicks,
    retrieval,
    safety,
    stages,
    synthesisStatus: "completed",
    notices: [...(recoveryNotice ? [recoveryNotice] : []), "Live category selection completed with sufficient evidence and two deterministic safety passes; named ingredients passed the post-selection safety pass."],
    researchEvidence,
    explainability,
  });
}

let studyRoutes = null;

async function routeApi(request, response, url, requestId) {
  if (url.pathname.startsWith("/api/study/")) {
    studyRoutes ??= createStudyRoutes({ HttpError, readJson, sendJson, securityHeaders, ingredients: getIngredientKnowledgeBase().ingredients || [] });
    return studyRoutes.handle(request, response, url, requestId);
  }
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
        cue: { threshold: config.cueThreshold, method: config.cue.method, maxRetries: config.cue.maxRetries },
        openai: openAiStatus(config),
        postSelectionSafetyPass: true,
        selectionLog: Boolean(config.selectionLog.enabled),
        gptBudgetMs: { routine: config.openai.routineBudgetMs || "off", explanations: config.openai.contextBudgetMs || "off" },
        searchCache: { ttlMs: config.searchCacheMs || "off", ...searchCacheStats() },
        runOutcomes: runOutcomeSummary(),
        // F3: identifies the process, so two different ids behind one URL
        // reveal an accidental multi-instance deployment.
        instance: { id: INSTANCE_ID, startedAt: INSTANCE_STARTED_AT, inMemoryState: ["rate limits", "weather and forecast caches", "search cache", "GPT explanation cache", "model fallback memory", "run counters"] },
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

  if (request.method === "GET" && url.pathname === "/api/labelling/scenarios") {
    let text = "";
    try {
      text = await readFile(resolve(root, "data/models/labelling/scenario-sheet.v1.csv"), "utf8");
    } catch {
      throw new HttpError(404, "No labelling sheet found. Run npm run labelling:sheet.");
    }
    const [header, ...lines] = text.trim().split(/\r?\n/);
    const keys = header.split(",");
    const scenarios = lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [keys[index], value])));
    return sendJson(response, 200, {
      sheet: "scenario-sheet.v1",
      scenarios,
      concernLabels: Object.fromEntries(CONCERN_CATALOG.map((item) => [item.id, item.label])),
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
      if (error instanceof ExternalServiceError) throw new HttpError(503, describeOpenAiError(error));
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
      if (error instanceof ExternalServiceError) throw new HttpError(503, describeOpenAiError(error));
      throw error;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/ai/routine-context") {
    const body = await readJson(request);
    const runId = optionalText(body?.runId, "run id", 80);
    const cached = await recallRoutineContext(runId);
    if (!cached) throw new HttpError(404, "This run is no longer available. Run the routine again.");
    if (!config.liveServicesEnabled || !config.openai?.apiKey) throw new HttpError(503, describeOpenAiError({ code: "not_enabled" }));
    try {
      if (!cached.result) {
        if (!cached.pending) {
          const contextStarted = Date.now();
          const budget = createGptBudget(config.openai.contextBudgetMs || Number.POSITIVE_INFINITY);
          cached.budget = budget;
          cached.pending = runWithGptBudget(budget, () => composeRoutineContext({ config, ...cached.payload })).then(async (result) => {
            await appendContextLog(config, { runId, latencyMs: Date.now() - contextStarted, model: result.model, retry: result.retry, budget: budgetSummary(budget), accepted: { steps: Object.keys(result.steps).length, ingredients: Object.keys(result.ingredients).length }, withheld: result.withheld, drafts: result.audit });
            return result;
          });
        }
        cached.result = await cached.pending;
      }
      return sendJson(response, 200, {
        status: "available",
        runId,
        model: cached.result.model,
        steps: cached.result.steps,
        ingredients: cached.result.ingredients,
        withheld: cached.result.withheld,
        retry: cached.result.retry,
        budget: budgetSummary(cached.budget),
        cue: { threshold: config.cueThreshold, method: config.cue.method },
        requestId,
      }, requestId);
    } catch (error) {
      cached.pending = null;
      if (error instanceof ExternalServiceError) throw new HttpError(503, describeOpenAiError(error));
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
      return sendJson(response, 200, {
        status: rationales.length ? "available" : "unavailable",
        rationales: [...rationales],
        // Rationales whose CUE stayed below the threshold after one
        // regeneration are withheld; the UI keeps the deterministic reason.
        withheld: rationales.withheld || [],
        cue: { threshold: config.cueThreshold, method: config.cue.method },
        requestId,
      }, requestId);
    } catch (error) {
      if (error instanceof ExternalServiceError) throw new HttpError(503, describeOpenAiError(error));
      throw error;
    }
  }

  if (request.method === "GET" && url.pathname === "/api/knowledge-explorer") {
    const concern = optionalConcernFromQuery(url);
    const repo = knowledgeRepo();
    const explorer = repo ? buildExplorerFromDb(repo, { concern }) : ingredientResearchExplorer({ concern });
    // Plain-language lines for the consumer Ingredient guide.
    const ingredients = (explorer.ingredients || []).map((item) => {
      const fn = plainFunction(item.id);
      return { ...item, plain: { whatItIs: fn ? `${fn[0].toUpperCase()}${fn.slice(1)}.` : null, safety: safetyShort(item.id) } };
    });
    return sendJson(response, 200, {
      ...explorer,
      ingredients,
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

  if (request.method === "GET" && url.pathname === "/api/locations/network") {
    enforceLocationSearchRateLimit(request);
    const result = await networkLocation(config, request.socket.remoteAddress, { reverse: (lat, lon) => reverseLocation(config, lat, lon) });
    return sendJson(response, 200, { ...result, requestId }, requestId);
  }

  if (request.method === "GET" && url.pathname === "/api/locations/reverse") {
    enforceLocationSearchRateLimit(request);
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new HttpError(400, "Invalid latitude or longitude.");
    // Rounded to ~1 km before leaving the server.
    const name = await reverseLocation(config, Math.round(lat * 100) / 100, Math.round(lon * 100) / 100);
    return sendJson(response, 200, { name, requestId }, requestId);
  }

  if (request.method === "POST" && url.pathname === "/api/shelf/check") {
    enforceLocationSearchRateLimit(request);
    const input = await readJson(request, 256 * 1024);
    const raw = Array.isArray(input?.products) ? input.products : [];
    if (raw.length > SHELF_LIMIT) throw new HttpError(400, `A shelf holds up to ${SHELF_LIMIT} products.`);
    const products = raw.map(cleanShelfProduct).filter(Boolean);
    const routine = input?.routine && typeof input.routine === "object" ? input.routine : {};
    const entries = (Array.isArray(routine.entries) ? routine.entries : []).slice(0, 12).map((e) => ({
      ingredientId: String(e?.ingredientId || "").slice(0, 60), displayName: String(e?.displayName || "").slice(0, 80),
      phase: e?.phase === "pm" ? "pm" : "am", categoryId: String(e?.categoryId || "").slice(0, 60),
    })).filter((e) => /^[a-z0-9-]+$/.test(e.ingredientId));
    const result = checkShelf({
      products,
      repository: knowledgeRepo(),
      routine: { entries, steps: cleanSteps(routine.steps), concern: String(routine.concern || "").slice(0, 30), reactivityLevel: String(routine.reactivityLevel || "").slice(0, 12) },
    });
    return sendJson(response, 200, { ...result, requestId }, requestId);
  }

  if (request.method === "POST" && url.pathname === "/api/shelf/scan") {
    enforceScanRateLimit(request);
    const input = await readJson(request, MAX_IMAGE_CHARS + 4096);
    if (!validLabelImage(input?.image)) throw new HttpError(400, "Send a JPEG, PNG or WebP photo under 2 MB.");
    try {
      const scan = await scanProductLabel({ config, image: input.image });
      return sendJson(response, 200, { ...scan, requestId }, requestId);
    } catch (error) {
      const code = error?.code || "error";
      const message = code === "not_enabled"
        ? "Label scanning needs the live AI service, which is off. Type or paste the ingredient list instead."
        : code === "model_refusal" ? "The label couldn't be read. Type or paste the ingredient list instead."
          : `The label couldn't be read right now. ${describeOpenAiError(error)}`;
      return sendJson(response, 200, { legible: false, error: message, code, requestId }, requestId);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/check-product") {
    enforceLocationSearchRateLimit(request);
    const input = await readJson(request);
    const text = String(input?.text || "").slice(0, 4000);
    if (text.trim().length < 3) throw new HttpError(400, "Paste the product's ingredient list.");
    const routine = input?.routine && typeof input.routine === "object" ? input.routine : {};
    const entries = (Array.isArray(routine.entries) ? routine.entries : []).slice(0, 12).map((e) => ({
      ingredientId: String(e?.ingredientId || "").slice(0, 60), displayName: String(e?.displayName || "").slice(0, 80),
      phase: e?.phase === "pm" ? "pm" : "am", categoryId: String(e?.categoryId || "").slice(0, 60),
    })).filter((e) => /^[a-z0-9-]+$/.test(e.ingredientId));
    const result = checkProduct({
      text,
      repository: knowledgeRepo(),
      routine: { entries, steps: cleanSteps(routine.steps), concern: String(routine.concern || "").slice(0, 30), reactivityLevel: String(routine.reactivityLevel || "").slice(0, 12) },
    });
    return sendJson(response, 200, { ...result, requestId }, requestId);
  }

  if (request.method === "POST" && url.pathname === "/api/feedback") {
    enforceLocationSearchRateLimit(request);
    const input = await readJson(request);
    const rating = ["good", "ok", "bad"].includes(input?.rating) ? input.rating : null;
    if (!rating) throw new HttpError(400, "Choose how your skin felt.");
    const followed = ["yes", "partly", "no"].includes(input?.followed) ? input.followed : null;
    const record = {
      at: new Date().toISOString(),
      runId: /^[0-9a-f-]{8,40}$/i.test(String(input?.runId || "")) ? String(input.runId) : null,
      about: input?.about === "yesterday" ? "yesterday" : "today",
      rating,
      followed,
      profile: ALLOWED_PROFILES.has(input?.profile) ? input.profile : null,
      concern: ALLOWED_CONCERNS.has(input?.concern) ? input.concern : null,
    };
    await appendFeedback(config, record);
    return sendJson(response, 200, { saved: true, requestId }, requestId);
  }

  if (request.method === "POST" && url.pathname === "/api/outlook") {
    const input = await readJson(request);
    const profile = requiredChoice(input.profile, ALLOWED_PROFILES, "profile", "combination");
    const concerns = requiredConcerns(input);
    const concern = concerns[0];
    const finishPreference = optionalChoice(input.finishPreference, ALLOWED_FINISH_PREFERENCES, "finish preference");
    const reactivityLevel = optionalChoice(input.reactivityLevel, ALLOWED_REACTIVITY_LEVELS, "reactivity level");
    const exposureContext = optionalChoice(input.exposureContext, ALLOWED_EXPOSURE_CONTEXTS, "exposure context") || "mixed";
    const todaySteps = (Array.isArray(input.todaySteps) ? input.todaySteps : []).slice(0, 16).map((s) => String(s)).filter((s) => /^(am|pm):[a-z-]{3,40}$/.test(s));
    try {
      const outlook = await buildOutlook({ config, location: routineLocation(input), profile, concern, concerns, finishPreference, reactivityLevel, exposureContext, todaySteps });
      return sendJson(response, 200, { ...outlook, requestId }, requestId, { "cache-control": "private, max-age=300" });
    } catch {
      return sendJson(response, 200, { available: false, reason: "forecast_unavailable", requestId }, requestId);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/week") {
    if (!config.weeklyPlannerEnabled) return sendJson(response, 200, { available: false, reason: "weekly_planner_off", requestId }, requestId);
    enforceWeekRateLimit(request);
    const input = await readJson(request);
    const profile = requiredChoice(input.profile, ALLOWED_PROFILES, "profile", "combination");
    const concerns = requiredConcerns(input);
    const concern = concerns[0];
    const finishPreference = optionalChoice(input.finishPreference, ALLOWED_FINISH_PREFERENCES, "finish preference");
    const reactivityLevel = optionalChoice(input.reactivityLevel, ALLOWED_REACTIVITY_LEVELS, "reactivity level");
    const exposureContext = optionalChoice(input.exposureContext, ALLOWED_EXPOSURE_CONTEXTS, "exposure context") || "mixed";
    const todaySteps = (Array.isArray(input.todaySteps) ? input.todaySteps : []).slice(0, 16).map((s) => String(s)).filter((s) => /^(am|pm):[a-z-]{3,40}$/.test(s));
    const todayIngredients = Object.fromEntries(Object.entries(input.todayIngredients && typeof input.todayIngredients === "object" ? input.todayIngredients : {})
      .slice(0, 16)
      .map(([key, id]) => [String(key), String(id || "").toLowerCase()])
      .filter(([key, id]) => /^(am|pm):[a-z-]{3,40}$/.test(key) && /^[a-z0-9-]{2,80}$/.test(id)));
    try {
      const outlook = await buildOutlook({ config, location: routineLocation(input), profile, concern, concerns, finishPreference, reactivityLevel, exposureContext, todaySteps, week: true });
      if (!outlook.available || !outlook.week) return sendJson(response, 200, { available: false, reason: outlook.reason || "forecast_unavailable", requestId }, requestId);
      const picks = await weekIngredients({ days: outlook.week.days, todaySteps, todayIngredients, profile, finishPreference, concern, concerns, reactivityLevel }).catch(() => null);
      const days = outlook.week.days.map((day, index) => ({ ...day, ingredients: picks?.[index] || {} }));
      return sendJson(response, 200, { available: true, source: outlook.source, week: { ...outlook.week, days }, requestId }, requestId, { "cache-control": "private, max-age=300" });
    } catch {
      return sendJson(response, 200, { available: false, reason: "forecast_unavailable", requestId }, requestId);
    }
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
    // F2: if the browser gives up (the user chose the standard routine), stop
    // making GPT calls for this request and free the client's in-flight slot.
    const cancel = { budget: null };
    response.on("close", () => {
      if (response.writableFinished) return;
      if (cancel.budget) cancel.budget.disabled = true;
      release();
    });
    try {
      const result = await handleRoutine(input, requestId, cancel);
      // F1: reduced answers stay HTTP 200 (the user still gets a safe routine)
      // but are visible to monitoring through this header and /api/health.
      const degradedHeader = result.degraded?.status === "degraded" ? { "x-dermasynth-degraded": result.degraded.reasons.map((reason) => reason.id).join(",") || "yes" } : {};
      return sendJson(response, 200, { ...result, requestId }, requestId, degradedHeader);
    } finally {
      release();
    }
  }

  return sendJson(response, 404, { error: "API route not found", requestId }, requestId);
}

async function serveStatic(response, pathname, requestId, host = "") {
  const file = publicFiles.get(pathname);
  if (!file) {
    return sendJson(response, 404, { error: "Not found", requestId }, requestId);
  }

  try {
    let contents = await readFile(resolve(root, file.path));
    // Link previews need an absolute image address.
    if (file.path === "index.html" && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
      const scheme = /^(localhost|127\.|192\.168\.|10\.)/.test(host) ? "http" : "https";
      contents = contents.toString("utf8").replaceAll('content="/assets/og-image.png"', `content="${scheme}://${host}/assets/og-image.png"`);
    }
    response.writeHead(200, {
      ...securityHeaders(requestId),
      "content-type": file.contentType,
    });
    response.end(contents);
  } catch {
    sendJson(response, 404, { error: "Not found", requestId }, requestId);
  }
}

export async function handleRequest(request, response) {
  const requestId = randomUUID();

  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(request, response, url, requestId);
      return;
    }
    await serveStatic(response, url.pathname, requestId, String(request.headers["x-forwarded-host"] || request.headers.host || ""));
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
}
export default handleRequest;

// On Vercel the platform calls handleRequest (api/index.mjs); nothing listens.
const server = process.env.VERCEL ? null : createServer(handleRequest);

// HOST stays 127.0.0.1 for local use; a hosting platform sets HOST=0.0.0.0.
const HOST = process.env.HOST || "127.0.0.1";
server?.listen(PORT, HOST, () => {
  console.log(`DermaSynth server listening on http://${HOST}:${PORT} (${config.liveServicesEnabled ? "live services enabled" : "demo mode"})`);
  if (HOST === "0.0.0.0") {
    // Print the addresses a phone on the same Wi-Fi or hotspot can use.
    const addresses = Object.values(networkInterfaces()).flat().filter((net) => net && net.family === "IPv4" && !net.internal).map((net) => net.address);
    if (addresses.length) {
      console.log("On a phone on the same Wi-Fi or hotspot, open:");
      for (const address of addresses) console.log(`  http://${address}:${PORT}/${process.env.STUDY_MODE === "on" ? "   (study link: add ?study at the end)" : ""}`);
    } else {
      console.log("No network found. Connect this laptop to Wi-Fi or a phone hotspot, then restart.");
    }
  }
  // F3: caches, rate limits, the GPT explanation cache and run counters live in
  // this process, so the app must run as ONE instance (docs/DEPLOYMENT.md).
  const workers = Number(process.env.WEB_CONCURRENCY || process.env.INSTANCE_COUNT || 1);
  if (workers > 1) console.warn(`Warning: ${workers} instances requested. DermaSynth keeps rate limits, caches and the explanation cache in memory; run a single instance (see docs/DEPLOYMENT.md).`);
});
