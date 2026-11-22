import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { APP_ITEMS, CHOICES, STUDY_TASKS, SUS_ITEMS, StudyInputError, studyHelpers, susAdjective, susScore } from "./study.mjs";
import { pgQuery, pgTransaction } from "./db/postgres.mjs";

/**
 * Postgres version of the user-study store (lib/study.mjs), used when
 * DATABASE_URL is set. Same methods, same validation, same outputs; every
 * method returns a promise. Tables are prefixed study_ so they sit beside the
 * app's other runtime tables without clashing.
 */

const { clean, bool, likert, codeOf, mean, sd, median, round } = studyHelpers;

export function createPgStudyStore({ round: roundSetting = process.env.STUDY_ROUND } = {}) {
  const currentRound = Math.max(1, Math.min(9, Number.parseInt(roundSetting, 10) || 1));
  const now = () => new Date().toISOString();
  const rows = async (sql, params = []) => (await pgQuery(sql, params)).rows;
  const one = async (sql, params = []) => (await rows(sql, params))[0] || null;

  async function addConsent(input = {}) {
    const required = ["readInfo", "adult", "prototype", "agree"];
    if (!required.every((k) => bool(input[k]))) throw new StudyInputError("Please tick all four required boxes to take part.");
    const name = clean(input.name, 80);
    const signature = clean(input.signature, 80);
    if (name.length < 2) throw new StudyInputError("Please enter your name.");
    if (signature.length < 2) throw new StudyInputError("Please type your name again as your signature.");
    const signedDate = clean(input.date, 10) || now().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(signedDate)) throw new StudyInputError("Please enter the date.");
    return pgTransaction(async (client) => {
      const { rows: [counter] } = await client.query("UPDATE study_code_counter SET last = last + 1 WHERE id = 1 RETURNING last");
      const code = `P${String(counter.last).padStart(2, "0")}`;
      const key = randomBytes(18).toString("base64url");
      await client.query("INSERT INTO study_consents (code, created_at, name, signature, signed_date, credit_opt_in, session_key, round) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [code, now(), name, signature, signedDate, bool(input.creditOptIn) ? 1 : 0, key, currentRound]);
      return { code, key };
    });
  }

  const hasParticipant = async (code) => Boolean(await one("SELECT 1 FROM study_consents WHERE code = $1", [code]));

  async function submitQuestionnaire(input = {}) {
    const code = codeOf(input.code);
    if (!await hasParticipant(code)) throw new StudyInputError("That participant code was not found. Check it with the researcher.");
    const score = susScore(input.sus);
    if (!Array.isArray(input.items) || input.items.length !== APP_ITEMS.length) throw new StudyInputError("Answer all the statements about DermaSynth.");
    const items = input.items.map(likert);
    const skinType = CHOICES.skinType.includes(input.skinType) ? input.skinType : null;
    const appUse = CHOICES.appUse.includes(input.appUse) ? input.appUse : null;
    const days = Number(input.daysUsed);
    await pgQuery(`INSERT INTO study_responses (code, submitted_at, skin_type, concern, app_use, asked_chatbot, multi_day, days_used, sus, sus_score, items, most_useful, confusing)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (code) DO UPDATE SET submitted_at = excluded.submitted_at, skin_type = excluded.skin_type, concern = excluded.concern, app_use = excluded.app_use,
        asked_chatbot = excluded.asked_chatbot, multi_day = excluded.multi_day, days_used = excluded.days_used, sus = excluded.sus, sus_score = excluded.sus_score,
        items = excluded.items, most_useful = excluded.most_useful, confusing = excluded.confusing`,
    [code, now(), skinType, clean(input.concern, 60) || null, appUse,
      input.askedChatbot === true ? 1 : input.askedChatbot === false ? 0 : null,
      input.multiDay === true ? 1 : input.multiDay === false ? 0 : null,
      input.multiDay === true && Number.isInteger(days) && days >= 1 && days <= 60 ? days : null,
      JSON.stringify(input.sus.map(Number)), score, JSON.stringify(items), clean(input.mostUseful, 1000) || null, clean(input.confusing, 1000) || null]);
    return { code, susScore: score };
  }

  async function saveTask(input = {}) {
    const code = codeOf(input.code);
    if (!await hasParticipant(code)) throw new StudyInputError("Unknown participant code.");
    if (!STUDY_TASKS.some((t) => t.id === input.taskId)) throw new StudyInputError("Unknown task.");
    if (!CHOICES.outcome.includes(input.outcome)) throw new StudyInputError("Choose an outcome.");
    const seconds = input.seconds === null || input.seconds === undefined || input.seconds === "" ? null : Number(input.seconds);
    if (seconds !== null && (!Number.isFinite(seconds) || seconds < 0 || seconds > 3600)) throw new StudyInputError("Time must be between 0 and 3600 seconds.");
    await pgQuery(`INSERT INTO study_task_results (code, task_id, outcome, seconds, notes, updated_at) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (code, task_id) DO UPDATE SET outcome = excluded.outcome, seconds = excluded.seconds, notes = excluded.notes, updated_at = excluded.updated_at`,
    [code, input.taskId, input.outcome, seconds === null ? null : round(seconds, 1), clean(input.notes, 500) || null, now()]);
    return { ok: true };
  }

  async function saveOwnTask(input = {}) {
    const code = codeOf(input.code);
    const row = await one("SELECT session_key FROM study_consents WHERE code = $1", [code]);
    const given = Buffer.from(String(input.key || ""));
    const expected = Buffer.from(String(row?.session_key || ""));
    if (!expected.length || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new StudyInputError("This phone is not linked to that participant code. Please start again from the study page.");
    }
    return saveTask({ code, taskId: input.taskId, outcome: input.outcome, seconds: input.seconds, notes: input.notes });
  }

  async function submitCases(input = {}) {
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
    const row = await one("INSERT INTO study_case_sets (submitted_at, author, role, cases, pairs, sha256) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [now(), author, clean(input.role, 80) || null, JSON.stringify(cases), JSON.stringify(pairs), sha256]);
    return { id: Number(row.id), count: cases.length, pairs: pairs.length };
  }

  async function participants() {
    const list = await rows("SELECT code, created_at, name, credit_opt_in, round FROM study_consents ORDER BY round, code");
    const answered = new Set((await rows("SELECT code FROM study_responses")).map((r) => r.code));
    const tasks = await rows("SELECT code, COUNT(*)::int AS n FROM study_task_results GROUP BY code");
    const taskCount = Object.fromEntries(tasks.map((t) => [t.code, t.n]));
    return list.map((r) => ({ code: r.code, round: r.round, consentedAt: r.created_at, name: r.name, creditOptIn: Boolean(r.credit_opt_in), questionnaire: answered.has(r.code), tasksRecorded: taskCount[r.code] || 0 }));
  }

  const taskResults = (code) => rows("SELECT task_id AS \"taskId\", outcome, seconds, notes FROM study_task_results WHERE code = $1", [codeOf(code)]);

  async function withdraw(code) {
    const result = await pgQuery("DELETE FROM study_consents WHERE code = $1", [codeOf(code)]);
    return { removed: result.rowCount > 0 };
  }

  async function setRound(code, value) {
    const c = codeOf(code);
    const r = Number.parseInt(value, 10);
    if (!Number.isInteger(r) || r < 1 || r > 9) throw new StudyInputError("Round must be a number from 1 to 9.");
    const result = await pgQuery("UPDATE study_consents SET round = $1 WHERE code = $2", [r, c]);
    if (!result.rowCount) throw new StudyInputError("Unknown participant code.");
    return { code: c, round: r };
  }

  const rounds = () => rows("SELECT round, COUNT(*)::int AS n FROM study_consents GROUP BY round ORDER BY round");

  const confirmed = (row) => (row.outcome === "success" || row.outcome === "helped") && !/^self-reported/.test(row.notes || "");

  async function summary(which = null) {
    const r = which === null || which === undefined || which === "" || which === "all" ? null : Number.parseInt(which, 10) || null;
    const inRound = r ? " WHERE code IN (SELECT code FROM study_consents WHERE round = $1)" : "";
    const params = r ? [r] : [];
    const responses = (await rows(`SELECT * FROM study_responses${inRound}`, params)).map((row) => ({ ...row, sus: JSON.parse(row.sus), items: JSON.parse(row.items) }));
    const scores = responses.map((row) => row.sus_score);
    const susMean = mean(scores);
    const tasks = await rows(`SELECT * FROM study_task_results${inRound}`, params);
    const taskSummary = STUDY_TASKS.map((t) => {
      const list = tasks.filter((x) => x.task_id === t.id && x.outcome !== "skipped");
      const count = (o) => list.filter((x) => x.outcome === o).length;
      const times = list.filter((x) => x.outcome !== "failed" && Number.isFinite(x.seconds)).map((x) => x.seconds);
      return { id: t.id, short: t.short, text: t.text, attempts: list.length, success: count("success"), helped: count("helped"), failed: count("failed"), confirmed: list.filter(confirmed).length, selfReported: list.filter((x) => /^self-reported/.test(x.notes || "")).length, confirmedRate: list.length ? round((100 * list.filter(confirmed).length) / list.length, 0) : null, completionRate: list.length ? round((100 * count("success")) / list.length, 0) : null, medianSeconds: round(median(times), 0) };
    });
    const itemSummary = APP_ITEMS.map((text, i) => {
      const values = responses.map((x) => x.items[i]).filter(Number.isFinite);
      return { text, n: values.length, median: median(values), agreePercent: values.length ? round((100 * values.filter((v) => v >= 4).length) / values.length, 0) : null };
    });
    const share = (key, values) => Object.fromEntries(values.map((v) => [v, responses.filter((x) => x[key] === v).length]));
    const caseSets = (await rows("SELECT id, submitted_at, author, role, sha256, cases, pairs FROM study_case_sets ORDER BY id"))
      .map((row) => ({ id: Number(row.id), submittedAt: row.submitted_at, author: row.author, role: row.role, sha256: row.sha256, cases: JSON.parse(row.cases).length, pairs: JSON.parse(row.pairs).length }));
    return {
      round: r,
      currentRound,
      rounds: await rounds(),
      participants: (await one(`SELECT COUNT(*)::int AS n FROM study_consents${r ? " WHERE round = $1" : ""}`, params)).n,
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
        askedChatbot: responses.filter((x) => x.asked_chatbot === 1).length,
        multiDay: responses.filter((x) => x.multi_day === 1).length,
      },
      comments: responses.map((x) => ({ code: x.code, mostUseful: x.most_useful, confusing: x.confusing })).filter((c) => c.mostUseful || c.confusing),
      acknowledgements: (await rows("SELECT name FROM study_consents WHERE credit_opt_in = 1 ORDER BY code")).map((row) => row.name),
      caseSets,
    };
  }

  const csvCell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCsv = (header, list) => [header, ...list].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";

  async function exportCsv(kind) {
    const roundOf = Object.fromEntries((await rows("SELECT code, round FROM study_consents")).map((row) => [row.code, row.round]));
    if (kind === "responses") {
      const list = await rows("SELECT * FROM study_responses ORDER BY code");
      return toCsv(
        ["code", "round", "submitted_at", "skin_type", "concern", "app_use", "asked_chatbot", "multi_day", "days_used", ...SUS_ITEMS.map((_, i) => `sus_${i + 1}`), "sus_score", ...APP_ITEMS.map((_, i) => `item_${i + 11}`), "most_useful", "confusing"],
        list.map((r) => [r.code, roundOf[r.code] ?? "", r.submitted_at, r.skin_type, r.concern, r.app_use, r.asked_chatbot, r.multi_day, r.days_used, ...JSON.parse(r.sus), r.sus_score, ...JSON.parse(r.items), r.most_useful, r.confusing]),
      );
    }
    if (kind === "tasks") {
      const list = await rows("SELECT * FROM study_task_results ORDER BY code, task_id");
      return toCsv(["code", "round", "task_id", "outcome", "confirmed", "seconds", "notes"], list.map((r) => [r.code, roundOf[r.code] ?? "", r.task_id, r.outcome, confirmed(r) ? 1 : 0, r.seconds, r.notes]));
    }
    throw new StudyInputError("Unknown export.");
  }

  async function caseSetAsIndependent(id) {
    const row = await one("SELECT * FROM study_case_sets WHERE id = $1", [Number(id) || 0]);
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

  return { currentRound, rounds, setRound, addConsent, submitQuestionnaire, saveTask, saveOwnTask, submitCases, participants, taskResults, withdraw, summary, exportCsv, caseSetAsIndependent, close: () => {} };
}
