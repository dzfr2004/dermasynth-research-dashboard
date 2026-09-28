import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

/**
 * User-study store (consent, session tasks, questionnaire with SUS, and
 * independent triage cases). Kept in its own SQLite file, separate from the
 * knowledge base, so `kb:rebuild -- --fresh` can never touch study data and
 * the file can be deleted after grading as the consent form promises.
 *
 * Names live only in `consents`. Every other table is keyed by the
 * participant code (P01, P02...), and exports for analysis never include names.
 */

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_STUDY_DB_PATH = resolve(here, "../data/study/study.sqlite");

// Order matters in guided mode: the story image needs a routine on screen, so it
// comes before the symptom task, which replaces the routine with a redirect.
export const STUDY_TASKS = Object.freeze([
  { id: "t1", short: "Get routine", check: "routine", text: "Get your skincare routine for today using your own skin type and main concern.", success: "Routine shows", hint: "Choose your skin type and main concern, then press Build routine." },
  { id: "t2", short: "Why? panel", check: "why", text: "Find out why one of the ingredients was suggested.", success: "Opens a Why? panel", hint: "Scroll to your routine and tap a Why? button under one of the steps." },
  { id: "t3", short: "Sun timing", check: "sun-answer", text: "What should you do about sun protection today, and when does it matter most?", success: "States sunscreen and the time window", hint: "Look at the Sun protection step in your morning routine.", question: "Type your answer, for example what to use and between which times." },
  { id: "t4", short: "Check product", check: "product", text: "Check whether a product fits your routine.", success: "Sees a verdict", hint: "Tap 'Check a product you own' near the top, tap 'Try an example', then 'Check this product'." },
  { id: "t5", short: "Tomorrow", check: "tomorrow-answer", text: "What will change in your routine tomorrow?", success: "Names a change shown on the Tomorrow card", hint: "Scroll down to the Tomorrow card, or open Weather at the bottom.", question: "Type one thing that changes tomorrow." },
  { id: "t6", short: "Story image", check: "story", text: "Save today's plan as an image you could share.", success: "Saves or shares the story image", hint: "Tap 'Share as story' near the top, then Save or Share." },
  { id: "t7", short: "Lip swelling", check: "redirect", text: "Imagine your lips swelled after a new cream. Tell the app and see what it says.", success: "Sees the 'get this checked' screen", hint: "Tap 'Edit my skin details', type it in the box about your skin today, then build again." },
]);

export const SUS_ITEMS = Object.freeze([
  "I think that I would like to use this system frequently.",
  "I found the system unnecessarily complex.",
  "I thought the system was easy to use.",
  "I think that I would need the support of a technical person to be able to use this system.",
  "I found the various functions in this system were well integrated.",
  "I thought there was too much inconsistency in this system.",
  "I would imagine that most people would learn to use this system very quickly.",
  "I found the system very cumbersome to use.",
  "I felt very confident using the system.",
  "I needed to learn a lot of things before I could get going with this system.",
]);

export const APP_ITEMS = Object.freeze([
  "The routine made sense for today's weather.",
  "The \"Why?\" explanations were easy to understand.",
  "The explanations made me trust the suggestions more.",
  "I understood why sunscreen or other steps were added or left out.",
  "\"Check a product you own\" was useful.",
  "I would follow this routine, or adjust mine because of it.",
  "The app was clear that it is not medical advice.",
]);

export const CHOICES = Object.freeze({
  skinType: ["dry", "combination", "oily", "sensitive", "not-sure"],
  appUse: ["never", "rarely", "monthly", "weekly", "daily"],
  outcome: ["success", "helped", "failed", "skipped"],
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS consents (
  code TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  signature TEXT NOT NULL,
  signed_date TEXT NOT NULL,
  credit_opt_in INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS responses (
  code TEXT PRIMARY KEY REFERENCES consents(code) ON DELETE CASCADE,
  submitted_at TEXT NOT NULL,
  skin_type TEXT, concern TEXT, app_use TEXT, asked_chatbot INTEGER, multi_day INTEGER, days_used INTEGER,
  sus TEXT NOT NULL, sus_score REAL NOT NULL, items TEXT NOT NULL,
  most_useful TEXT, confusing TEXT
);
CREATE TABLE IF NOT EXISTS task_results (
  code TEXT NOT NULL REFERENCES consents(code) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  seconds REAL,
  notes TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (code, task_id)
);
CREATE TABLE IF NOT EXISTS case_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_at TEXT NOT NULL,
  author TEXT NOT NULL,
  role TEXT,
  cases TEXT NOT NULL,
  pairs TEXT NOT NULL,
  sha256 TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS code_counter (id INTEGER PRIMARY KEY CHECK (id = 1), last INTEGER NOT NULL);
`;

export class StudyInputError extends Error {}

const clean = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const bool = (value) => value === true;
const likert = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new StudyInputError("Every rating must be a number from 1 to 5.");
  return n;
};
const codeOf = (value) => {
  const code = String(value ?? "").trim().toUpperCase();
  if (!/^P\d{2,3}$/.test(code)) throw new StudyInputError("Enter your participant code, for example P07.");
  return code;
};

/** SUS: odd items score (x - 1), even items (5 - x); sum x 2.5 gives 0 to 100. */
export function susScore(answers) {
  if (!Array.isArray(answers) || answers.length !== 10) throw new StudyInputError("Answer all ten usability statements.");
  const values = answers.map(likert);
  return values.reduce((sum, v, i) => sum + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5;
}

/** Closest adjective from Bangor, Kortum and Miller (2009), by mean SUS per adjective. */
export function susAdjective(score) {
  if (!Number.isFinite(score)) return null;
  const anchors = [["Worst imaginable", 12.5], ["Awful", 20.3], ["Poor", 35.7], ["OK", 50.9], ["Good", 71.4], ["Excellent", 85.5], ["Best imaginable", 90.9]];
  return anchors.reduce((best, cur) => (Math.abs(cur[1] - score) < Math.abs(best[1] - score) ? cur : best))[0];
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const round = (x, d = 1) => (x === null || x === undefined ? null : Number(x.toFixed(d)));

export function createStudyStore({ path = process.env.STUDY_DB_PATH || DEFAULT_STUDY_DB_PATH } = {}) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  try { db.exec("PRAGMA journal_mode = WAL;"); } catch { /* some filesystems refuse WAL */ }
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  // Added for guided mode: a per-participant key so a phone can save its own task results.
  if (!db.prepare("PRAGMA table_info(consents)").all().some((c) => c.name === "session_key")) db.exec("ALTER TABLE consents ADD COLUMN session_key TEXT");
  db.prepare("INSERT OR IGNORE INTO code_counter (id, last) VALUES (1, 0)").run();

  const now = () => new Date().toISOString();

  function addConsent(input = {}) {
    const required = ["readInfo", "adult", "prototype", "agree"];
    if (!required.every((k) => bool(input[k]))) throw new StudyInputError("Please tick all four required boxes to take part.");
    const name = clean(input.name, 80);
    const signature = clean(input.signature, 80);
    if (name.length < 2) throw new StudyInputError("Please enter your name.");
    if (signature.length < 2) throw new StudyInputError("Please type your name again as your signature.");
    const signedDate = clean(input.date, 10) || now().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(signedDate)) throw new StudyInputError("Please enter the date.");
    return db.transaction(() => {
      const last = db.prepare("SELECT last FROM code_counter WHERE id = 1").get().last + 1;
      db.prepare("UPDATE code_counter SET last = ? WHERE id = 1").run(last);
      const code = `P${String(last).padStart(2, "0")}`;
      const key = randomBytes(18).toString("base64url");
      db.prepare("INSERT INTO consents (code, created_at, name, signature, signed_date, credit_opt_in, session_key) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(code, now(), name, signature, signedDate, bool(input.creditOptIn) ? 1 : 0, key);
      return { code, key };
    })();
  }

  function hasParticipant(code) {
    return Boolean(db.prepare("SELECT 1 FROM consents WHERE code = ?").get(code));
  }

  function submitQuestionnaire(input = {}) {
    const code = codeOf(input.code);
    if (!hasParticipant(code)) throw new StudyInputError("That participant code was not found. Check it with the researcher.");
    const score = susScore(input.sus);
    if (!Array.isArray(input.items) || input.items.length !== APP_ITEMS.length) throw new StudyInputError("Answer all the statements about DermaSynth.");
    const items = input.items.map(likert);
    const skinType = CHOICES.skinType.includes(input.skinType) ? input.skinType : null;
    const appUse = CHOICES.appUse.includes(input.appUse) ? input.appUse : null;
    const days = Number(input.daysUsed);
    db.prepare(`INSERT INTO responses (code, submitted_at, skin_type, concern, app_use, asked_chatbot, multi_day, days_used, sus, sus_score, items, most_useful, confusing)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET submitted_at = excluded.submitted_at, skin_type = excluded.skin_type, concern = excluded.concern, app_use = excluded.app_use,
        asked_chatbot = excluded.asked_chatbot, multi_day = excluded.multi_day, days_used = excluded.days_used, sus = excluded.sus, sus_score = excluded.sus_score,
        items = excluded.items, most_useful = excluded.most_useful, confusing = excluded.confusing`)
      .run(code, now(), skinType, clean(input.concern, 60) || null, appUse,
        input.askedChatbot === true ? 1 : input.askedChatbot === false ? 0 : null,
        input.multiDay === true ? 1 : input.multiDay === false ? 0 : null,
        input.multiDay === true && Number.isInteger(days) && days >= 1 && days <= 60 ? days : null,
        JSON.stringify(input.sus.map(Number)), score, JSON.stringify(items), clean(input.mostUseful, 1000) || null, clean(input.confusing, 1000) || null);
    return { code, susScore: score };
  }

  function saveTask(input = {}) {
    const code = codeOf(input.code);
    if (!hasParticipant(code)) throw new StudyInputError("Unknown participant code.");
    if (!STUDY_TASKS.some((t) => t.id === input.taskId)) throw new StudyInputError("Unknown task.");
    if (!CHOICES.outcome.includes(input.outcome)) throw new StudyInputError("Choose an outcome.");
    const seconds = input.seconds === null || input.seconds === undefined || input.seconds === "" ? null : Number(input.seconds);
    if (seconds !== null && (!Number.isFinite(seconds) || seconds < 0 || seconds > 3600)) throw new StudyInputError("Time must be between 0 and 3600 seconds.");
    db.prepare(`INSERT INTO task_results (code, task_id, outcome, seconds, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(code, task_id) DO UPDATE SET outcome = excluded.outcome, seconds = excluded.seconds, notes = excluded.notes, updated_at = excluded.updated_at`)
      .run(code, input.taskId, input.outcome, seconds === null ? null : round(seconds, 1), clean(input.notes, 500) || null, now());
    return { ok: true };
  }

  /** Guided mode: the participant's phone saves its own result with the key it got at consent. */
  function saveOwnTask(input = {}) {
    const code = codeOf(input.code);
    const row = db.prepare("SELECT session_key FROM consents WHERE code = ?").get(code);
    const given = Buffer.from(String(input.key || ""));
    const expected = Buffer.from(String(row?.session_key || ""));
    if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new StudyInputError("This phone is not linked to that participant code. Please start again from the study page.");
    }
    return saveTask({ code, taskId: input.taskId, outcome: input.outcome, seconds: input.seconds, notes: input.notes });
  }

  function submitCases(input = {}) {
    const author = clean(input.author, 80);
    if (author.length < 2) throw new StudyInputError("Please enter your name.");
    const cases = (Array.isArray(input.cases) ? input.cases : [])
      .map((c) => ({ text: clean(c?.text, 400), expected: c?.expected === "redirect" ? "redirect" : c?.expected === "clear" ? "clear" : null }))
      .filter((c) => c.text && c.expected)
      .slice(0, 200);
    if (cases.length < 5) throw new StudyInputError("Please add at least 5 sentences, each marked yes or no.");
    const pairs = (Array.isArray(input.pairs) ? input.pairs : [])
      .map((p) => ({ first: clean(p?.first, 60), second: clean(p?.second, 60), expected: p?.expected === "blocked" ? "blocked" : p?.expected === "allowed" ? "allowed" : null }))
      .filter((p) => p.first && p.second && p.expected)
      .slice(0, 100);
    const payload = JSON.stringify({ cases, pairs });
    const sha256 = createHash("sha256").update(payload).digest("hex");
    const info = db.prepare("INSERT INTO case_sets (submitted_at, author, role, cases, pairs, sha256) VALUES (?, ?, ?, ?, ?, ?)")
      .run(now(), author, clean(input.role, 80) || null, JSON.stringify(cases), JSON.stringify(pairs), sha256);
    return { id: Number(info.lastInsertRowid), count: cases.length, pairs: pairs.length };
  }

  // ---- Researcher views ------------------------------------------------------
  function participants() {
    const rows = db.prepare("SELECT code, created_at, name, credit_opt_in FROM consents ORDER BY code").all();
    const answered = new Set(db.prepare("SELECT code FROM responses").all().map((r) => r.code));
    const tasks = db.prepare("SELECT code, COUNT(*) AS n FROM task_results GROUP BY code").all();
    const taskCount = Object.fromEntries(tasks.map((t) => [t.code, t.n]));
    return rows.map((r) => ({ code: r.code, consentedAt: r.created_at, name: r.name, creditOptIn: Boolean(r.credit_opt_in), questionnaire: answered.has(r.code), tasksRecorded: taskCount[r.code] || 0 }));
  }

  function taskResults(code) {
    return db.prepare("SELECT task_id AS taskId, outcome, seconds, notes FROM task_results WHERE code = ?").all(codeOf(code));
  }

  function withdraw(code) {
    const c = codeOf(code);
    const info = db.prepare("DELETE FROM consents WHERE code = ?").run(c);
    return { removed: info.changes > 0 };
  }

  function summary() {
    const responses = db.prepare("SELECT * FROM responses").all().map((r) => ({ ...r, sus: JSON.parse(r.sus), items: JSON.parse(r.items) }));
    const scores = responses.map((r) => r.sus_score);
    const susMean = mean(scores);
    const tasks = db.prepare("SELECT * FROM task_results").all();
    const taskSummary = STUDY_TASKS.map((t) => {
      const rows = tasks.filter((r) => r.task_id === t.id && r.outcome !== "skipped");
      const count = (o) => rows.filter((r) => r.outcome === o).length;
      const times = rows.filter((r) => r.outcome !== "failed" && Number.isFinite(r.seconds)).map((r) => r.seconds);
      return { id: t.id, short: t.short, text: t.text, attempts: rows.length, success: count("success"), helped: count("helped"), failed: count("failed"), completionRate: rows.length ? round((100 * count("success")) / rows.length, 0) : null, medianSeconds: round(median(times), 0) };
    });
    const itemSummary = APP_ITEMS.map((text, i) => {
      const values = responses.map((r) => r.items[i]).filter(Number.isFinite);
      return { text, n: values.length, median: median(values), agreePercent: values.length ? round((100 * values.filter((v) => v >= 4).length) / values.length, 0) : null };
    });
    const share = (key, values) => Object.fromEntries(values.map((v) => [v, responses.filter((r) => r[key] === v).length]));
    return {
      participants: db.prepare("SELECT COUNT(*) AS n FROM consents").get().n,
      questionnaires: responses.length,
      sus: {
        n: scores.length,
        mean: round(susMean),
        sd: round(sd(scores)),
        median: round(median(scores)),
        min: scores.length ? Math.min(...scores) : null,
        max: scores.length ? Math.max(...scores) : null,
        adjective: susAdjective(susMean),
        benchmark: 68,
        aboveBenchmark: scores.filter((s) => s > 68).length,
      },
      items: itemSummary,
      tasks: taskSummary,
      profile: {
        skinType: share("skin_type", CHOICES.skinType),
        appUse: share("app_use", CHOICES.appUse),
        askedChatbot: responses.filter((r) => r.asked_chatbot === 1).length,
        multiDay: responses.filter((r) => r.multi_day === 1).length,
      },
      comments: responses.map((r) => ({ code: r.code, mostUseful: r.most_useful, confusing: r.confusing })).filter((c) => c.mostUseful || c.confusing),
      acknowledgements: db.prepare("SELECT name FROM consents WHERE credit_opt_in = 1 ORDER BY code").all().map((r) => r.name),
      caseSets: db.prepare("SELECT id, submitted_at AS submittedAt, author, role, sha256, json_array_length(cases) AS cases, json_array_length(pairs) AS pairs FROM case_sets ORDER BY id").all(),
    };
  }

  const csvCell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCsv = (header, rows) => [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";

  /** Anonymous exports for analysis: participant codes only, never names. */
  function exportCsv(kind) {
    if (kind === "responses") {
      const rows = db.prepare("SELECT * FROM responses ORDER BY code").all();
      return toCsv(
        ["code", "submitted_at", "skin_type", "concern", "app_use", "asked_chatbot", "multi_day", "days_used", ...SUS_ITEMS.map((_, i) => `sus_${i + 1}`), "sus_score", ...APP_ITEMS.map((_, i) => `item_${i + 11}`), "most_useful", "confusing"],
        rows.map((r) => [r.code, r.submitted_at, r.skin_type, r.concern, r.app_use, r.asked_chatbot, r.multi_day, r.days_used, ...JSON.parse(r.sus), r.sus_score, ...JSON.parse(r.items), r.most_useful, r.confusing]),
      );
    }
    if (kind === "tasks") {
      const rows = db.prepare("SELECT * FROM task_results ORDER BY code, task_id").all();
      return toCsv(["code", "task_id", "outcome", "seconds", "notes"], rows.map((r) => [r.code, r.task_id, r.outcome, r.seconds, r.notes]));
    }
    throw new StudyInputError("Unknown export.");
  }

  /** A case set in the format of data/evaluation/independent/cases.template.json. */
  function caseSetAsIndependent(id) {
    const row = db.prepare("SELECT * FROM case_sets WHERE id = ?").get(Number(id));
    if (!row) throw new StudyInputError("Case set not found.");
    const cases = JSON.parse(row.cases);
    const pairs = JSON.parse(row.pairs);
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let n = 0;
    const next = () => `ind-${String(++n).padStart(3, "0")}`;
    return {
      author: row.author,
      role: row.role || "",
      written: row.submitted_at.slice(0, 10),
      note: `Submitted through the DermaSynth study site (case set ${row.id}, sha256 ${row.sha256}). Converted without editing the text.`,
      cases: [
        ...cases.map((c) => ({ id: next(), type: "triage", description: "Written by the independent case writer", text: c.text, expected: c.expected })),
        ...pairs.map((p) => ({ id: next(), type: "pair", description: `Independent pair: ${p.first} + ${p.second}`, first: slug(p.first), second: slug(p.second), expected: p.expected })),
      ],
    };
  }

  return { addConsent, submitQuestionnaire, saveTask, saveOwnTask, submitCases, participants, taskResults, withdraw, summary, exportCsv, caseSetAsIndependent, close: () => db.close() };
}

/** Constant-time check of the researcher token (at least 16 characters). */
export function studyTokenMatches(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string" || expected.length < 16 || candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate, "utf8"), Buffer.from(expected, "utf8"));
}
