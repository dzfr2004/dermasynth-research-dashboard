import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ITEMS, CHOICES, createStudyStore, STUDY_TASKS, StudyInputError, studyTokenMatches, SUS_ITEMS } from "./study.mjs";

/**
 * HTTP routes for the user-study site (/study). Public routes take consent,
 * the questionnaire and the independent case set. Researcher routes need the
 * x-study-token header to match STUDY_ADMIN_TOKEN (16+ characters); with no
 * token configured they are switched off.
 *
 * The store opens lazily on the first study request, so the rest of the app
 * never creates the study database.
 */

const here = dirname(fileURLToPath(import.meta.url));
const INDEPENDENT_CASES_PATH = resolve(here, "../data/evaluation/independent/cases.json");
const WINDOW_MS = 60_000;
const POSTS_PER_WINDOW = 30;
const ADMIN_FAILURES_PER_WINDOW = 10;

export function createStudyRoutes({ HttpError, readJson, sendJson, securityHeaders, ingredients = [], env = process.env, dbPath = env.STUDY_DB_PATH, casesPath = env.STUDY_CASES_PATH || INDEPENDENT_CASES_PATH }) {
  let store = null;
  const getStore = () => (store ??= createStudyStore(dbPath ? { path: dbPath } : {}));
  const posts = new Map();
  const failures = new Map();
  const adminToken = () => String(env.STUDY_ADMIN_TOKEN || "");

  const client = (request) => request.socket.remoteAddress || "unknown";
  function limit(map, request, max, message) {
    const now = Date.now();
    for (const [key, entry] of map) if (now - entry.start >= WINDOW_MS) map.delete(key);
    const key = client(request);
    const entry = map.get(key) || { start: now, count: 0 };
    if (entry.count >= max) throw new HttpError(429, message, { "retry-after": "60" });
    entry.count += 1;
    map.set(key, entry);
  }

  function requireAdmin(request) {
    const expected = adminToken();
    if (expected.length < 16) {
      throw new HttpError(403, "The researcher page is switched off. Set STUDY_ADMIN_TOKEN (16 or more characters) in .env and restart the server.");
    }
    const failed = failures.get(client(request));
    if (failed && failed.count >= ADMIN_FAILURES_PER_WINDOW && Date.now() - failed.start < WINDOW_MS) {
      throw new HttpError(429, "Too many wrong tokens. Wait a minute and try again.", { "retry-after": "60" });
    }
    if (!studyTokenMatches(request.headers["x-study-token"], expected)) {
      limit(failures, request, Number.MAX_SAFE_INTEGER, "");
      throw new HttpError(401, "Wrong researcher token.");
    }
  }

  function sendFile(response, requestId, body, contentType, filename) {
    response.writeHead(200, {
      ...securityHeaders(requestId),
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
    });
    response.end(body);
  }

  const config = Object.freeze({
    tasks: STUDY_TASKS,
    susItems: SUS_ITEMS,
    appItems: APP_ITEMS,
    choices: CHOICES,
    ingredients: ingredients.map((i) => ({ id: i.id, name: i.displayName || i.id })).sort((a, b) => a.name.localeCompare(b.name)),
  });

  async function handle(request, response, url, requestId) {
    const method = request.method || "GET";
    const path = url.pathname;
    try {
      // ---- Public ----
      if (method === "GET" && path === "/api/study/config") {
        return sendJson(response, 200, { ...config, adminEnabled: adminToken().length >= 16, requestId }, requestId);
      }
      if (method === "POST" && path === "/api/study/consent") {
        limit(posts, request, POSTS_PER_WINDOW, "Too many submissions. Please wait a minute.");
        return sendJson(response, 201, { ...getStore().addConsent(await readJson(request)), requestId }, requestId);
      }
      if (method === "POST" && path === "/api/study/questionnaire") {
        limit(posts, request, POSTS_PER_WINDOW, "Too many submissions. Please wait a minute.");
        return sendJson(response, 201, { ...getStore().submitQuestionnaire(await readJson(request)), requestId }, requestId);
      }
      if (method === "POST" && path === "/api/study/cases") {
        limit(posts, request, POSTS_PER_WINDOW, "Too many submissions. Please wait a minute.");
        return sendJson(response, 201, { ...getStore().submitCases(await readJson(request)), requestId }, requestId);
      }

      // ---- Researcher ----
      if (path.startsWith("/api/study/admin/")) {
        requireAdmin(request);
        const s = getStore();
        const route = path.slice("/api/study/admin/".length);
        if (method === "GET" && route === "check") return sendJson(response, 200, { ok: true, requestId }, requestId);
        if (method === "GET" && route === "summary") return sendJson(response, 200, { ...s.summary(), requestId }, requestId);
        if (method === "GET" && route === "participants") return sendJson(response, 200, { participants: s.participants(), requestId }, requestId);
        if (method === "GET" && route === "tasks") return sendJson(response, 200, { results: s.taskResults(url.searchParams.get("code")), requestId }, requestId);
        if (method === "POST" && route === "task") return sendJson(response, 200, { ...s.saveTask(await readJson(request)), requestId }, requestId);
        if (method === "POST" && route === "withdraw") {
          const body = await readJson(request);
          if (String(body.confirm || "").toUpperCase() !== String(body.code || "").toUpperCase()) throw new StudyInputError("Type the participant code again to confirm.");
          return sendJson(response, 200, { ...s.withdraw(body.code), requestId }, requestId);
        }
        if (method === "GET" && route === "export") {
          const kind = url.searchParams.get("kind");
          return sendFile(response, requestId, s.exportCsv(kind), "text/csv; charset=utf-8", `dermasynth-study-${kind}.csv`);
        }
        if (method === "GET" && route === "cases") {
          const id = url.searchParams.get("id");
          return sendFile(response, requestId, `${JSON.stringify(s.caseSetAsIndependent(id), null, 2)}\n`, "application/json; charset=utf-8", `independent-cases-${Number(id)}.json`);
        }
        if (method === "POST" && route === "install-cases") {
          const body = await readJson(request);
          const set = s.caseSetAsIndependent(body.id);
          if (existsSync(casesPath) && body.overwrite !== true) {
            throw new HttpError(409, "cases.json already exists. Tick 'replace the existing file' to overwrite it.");
          }
          await mkdir(dirname(casesPath), { recursive: true });
          await writeFile(casesPath, `${JSON.stringify(set, null, 2)}\n`);
          return sendJson(response, 200, { installed: true, cases: set.cases.length, next: "npm run eval:independent", requestId }, requestId);
        }
      }
      return sendJson(response, 404, { error: "Study route not found", requestId }, requestId);
    } catch (error) {
      if (error instanceof StudyInputError) return sendJson(response, 400, { error: error.message, requestId }, requestId);
      throw error;
    }
  }

  return { handle, close: () => store?.close() };
}
