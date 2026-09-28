import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { susAdjective, susScore } from "../lib/study.mjs";

/**
 * Tests the user-study site (/study) end to end against an isolated server
 * with a throwaway database:
 *   - SUS scoring against hand-worked examples;
 *   - consent gives P01, P02... and refuses incomplete consent;
 *   - questionnaire validation and the stored SUS score;
 *   - researcher routes: off without a token, 401 with a wrong one;
 *   - task recording, summary numbers, CSV exports contain no names;
 *   - case sets convert to the independent-set format and install safely;
 *   - withdraw deletes everything for that code;
 *   - in a phone-sized browser (if Playwright is installed): consent and the
 *     questionnaire work by tapping, no sideways scroll, no JS errors, no
 *     serious accessibility issues.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const TOKEN = "study-test-token-0123456789";
const results = [];
const expect = (cond, message) => { if (!cond) throw new Error(message); };
async function check(title, fn) {
  try { await fn(); results.push({ title, ok: true }); }
  catch (error) { results.push({ title, ok: false, detail: String(error?.message || error).split("\n").slice(0, process.env.VERBOSE ? 12 : 1).join(" | ") }); }
}

// ---- pure scoring ----
await check("SUS: all 3s score 50", () => expect(susScore(Array(10).fill(3)) === 50, "expected 50"));
await check("SUS: best answers score 100", () => expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]) === 100, "expected 100"));
await check("SUS: worked example scores 85", () => expect(susScore([5, 2, 4, 1, 4, 2, 5, 1, 4, 2]) === 85, `got ${susScore([5, 2, 4, 1, 4, 2, 5, 1, 4, 2])}`));
await check("SUS: out-of-range answer refused", () => { let threw = false; try { susScore([6, 1, 1, 1, 1, 1, 1, 1, 1, 1]); } catch { threw = true; } expect(threw, "accepted 6"); });
await check("SUS adjective: 72 is Good, 86 is Excellent", () => expect(susAdjective(72) === "Good" && susAdjective(86) === "Excellent", "wrong adjective"));

// ---- server ----
async function reservePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}
async function startServer(extraEnv) {
  const port = await reservePort();
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: { PATH: process.env.PATH || "", PORT: String(port), LIVE_SERVICES_ENABLED: "false", INGREDIENT_DB_ENABLED: "true", INGREDIENT_SELECTION_ENABLED: "true", SELECTION_LOG_ENABLED: "false", FEEDBACK_LOG_PATH: "tmp/study-site-feedback.jsonl", OPENAI_API_KEY: "", OPENWEATHER_API_KEY: "", IQAIR_API_KEY: "", PINECONE_API_KEY: "", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start. ${out}`)), 8000);
    child.stdout.on("data", (c) => { out += c; if (String(c).includes(`:${port}`)) { clearTimeout(timer); resolve(); } });
    child.stderr.on("data", (c) => { out += c; });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited (${code}). ${out}`)); });
  });
  return { child, base: `http://127.0.0.1:${port}` };
}

const dir = await mkdtemp(join(tmpdir(), "dermasynth-study-"));
const env = { STUDY_DB_PATH: join(dir, "study.sqlite"), STUDY_CASES_PATH: join(dir, "cases.json") };

// Server without a token: researcher page must be off.
{
  const { child, base } = await startServer({ ...env, STUDY_ADMIN_TOKEN: "" });
  await check("Researcher routes are off without STUDY_ADMIN_TOKEN (403)", async () => {
    const res = await fetch(`${base}/api/study/admin/summary`, { headers: { "x-study-token": "anything-anything-1234" } });
    expect(res.status === 403, `status ${res.status}`);
  });
  child.kill();
}

const { child, base } = await startServer({ ...env, STUDY_ADMIN_TOKEN: TOKEN, STUDY_MODE: "on" });
const post = (path, body, token) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-study-token": token } : {}) }, body: JSON.stringify(body) });
const get = (path, token) => fetch(`${base}${path}`, { headers: token ? { "x-study-token": token } : {} });
const consent = (name, extra = {}) => ({ readInfo: true, adult: true, prototype: true, agree: true, name, signature: name, date: "2026-10-01", ...extra });
const answers = (sus) => ({ sus, items: [4, 5, 4, 3, 5, 4, 5], skinType: "oily", appUse: "rarely", askedChatbot: true, multiDay: false });

try {
  await check("Study page, script and styles are served with the app's CSP", async () => {
    for (const path of ["/study", "/study.js", "/study.css"]) {
      const res = await get(path);
      expect(res.ok, `${path} ${res.status}`);
      expect((res.headers.get("content-security-policy") || "").includes("script-src 'self'"), `${path} missing CSP`);
    }
  });
  await check("Config lists 7 tasks, 10 SUS items, 7 app items and the ingredients", async () => {
    const c = await (await get("/api/study/config")).json();
    expect(c.tasks.length === 7 && c.susItems.length === 10 && c.appItems.length === 7, "wrong counts");
    expect(c.ingredients.length >= 40 && c.ingredients.every((i) => i.id && i.name), "ingredients missing");
    expect(c.adminEnabled === true, "adminEnabled should be true");
  });
  await check("Consent without all four boxes is refused (400)", async () => {
    const res = await post("/api/study/consent", consent("Aina", { adult: false }));
    expect(res.status === 400, `status ${res.status}`);
  });
  let codes = [];
  await check("Consent gives P01 then P02", async () => {
    codes = [];
    for (const [name, credit] of [["Aina Test", true], ["Ben Test", false]]) {
      const res = await post("/api/study/consent", consent(name, { creditOptIn: credit }));
      expect(res.status === 201, `status ${res.status}`);
      codes.push((await res.json()).code);
    }
    expect(codes.join() === "P01,P02", `got ${codes}`);
  });
  await check("A participant's phone can save its own task only with its key", async () => {
    const res = await post("/api/study/consent", consent("Key Test"));
    const { code, key } = await res.json();
    expect(typeof key === "string" && key.length >= 20, "no session key returned");
    const wrong = await post("/api/study/task", { code, key: "x".repeat(key.length), taskId: "t1", outcome: "success", seconds: 12 });
    const other = await post("/api/study/task", { code: "P01", key, taskId: "t1", outcome: "success", seconds: 12 });
    const right = await post("/api/study/task", { code, key, taskId: "t1", outcome: "success", seconds: 12, notes: "detected by the app" });
    expect(wrong.status === 400 && other.status === 400 && right.ok, `statuses ${wrong.status}, ${other.status}, ${right.status}`);
    const saved = await (await get(`/api/study/admin/tasks?code=${code}`, TOKEN)).json();
    expect(saved.results.length === 1 && saved.results[0].seconds === 12, "task not stored");
    await post("/api/study/admin/withdraw", { code, confirm: code }, TOKEN);
  });
  await check("Questionnaire with a missing rating is refused", async () => {
    const res = await post("/api/study/questionnaire", { code: "P01", ...answers([5, 2, 4, 1, 4, 2, 5, 1, 4]) });
    expect(res.status === 400, `status ${res.status}`);
  });
  await check("Questionnaire for an unknown code is refused", async () => {
    const res = await post("/api/study/questionnaire", { code: "P99", ...answers(Array(10).fill(3)) });
    expect(res.status === 400, `status ${res.status}`);
  });
  await check("Questionnaires save with the right SUS scores", async () => {
    const a = await (await post("/api/study/questionnaire", { code: "p01", ...answers([5, 2, 4, 1, 4, 2, 5, 1, 4, 2]), mostUseful: "The Why? panels" })).json();
    const b = await (await post("/api/study/questionnaire", { code: "P02", ...answers(Array(10).fill(3)), confusing: "Tomorrow tab" })).json();
    expect(a.susScore === 85 && b.susScore === 50, `got ${a.susScore}, ${b.susScore}`);
  });
  await check("Researcher routes refuse a missing or wrong token (401)", async () => {
    const none = await get("/api/study/admin/summary");
    const wrong = await get("/api/study/admin/summary", "x".repeat(TOKEN.length));
    expect(none.status === 401 && wrong.status === 401, `status ${none.status}, ${wrong.status}`);
  });
  await check("Task results save and update", async () => {
    for (const body of [
      { code: "P01", taskId: "t1", outcome: "success", seconds: 42 },
      { code: "P01", taskId: "t4", outcome: "helped", seconds: 90, notes: "Needed a hint" },
      { code: "P02", taskId: "t1", outcome: "failed", seconds: 120 },
      { code: "P02", taskId: "t1", outcome: "success", seconds: 60 },
    ]) {
      const res = await post("/api/study/admin/task", body, TOKEN);
      expect(res.ok, `status ${res.status}`);
    }
    const bad = await post("/api/study/admin/task", { code: "P01", taskId: "t9", outcome: "success" }, TOKEN);
    expect(bad.status === 400, "unknown task accepted");
  });
  await check("Summary: SUS mean 67.5, adjective, benchmark, task completion", async () => {
    const s = await (await get("/api/study/admin/summary", TOKEN)).json();
    expect(s.sus.n === 2 && s.sus.mean === 67.5 && s.sus.median === 67.5 && s.sus.aboveBenchmark === 1, JSON.stringify(s.sus));
    expect(s.sus.adjective === "Good", s.sus.adjective);
    const t1 = s.tasks.find((t) => t.id === "t1");
    expect(t1.attempts === 2 && t1.success === 2 && t1.completionRate === 100 && t1.medianSeconds === 51, JSON.stringify(t1));
    expect(s.items[1].median === 5 && s.items[3].agreePercent === 0, JSON.stringify(s.items[1]));
    expect(s.acknowledgements.join() === "Aina Test", `acks ${s.acknowledgements}`);
    expect(s.profile.skinType.oily === 2 && s.profile.askedChatbot === 2, "profile counts");
  });
  await check("CSV exports use codes only, never names", async () => {
    for (const kind of ["responses", "tasks"]) {
      const res = await get(`/api/study/admin/export?kind=${kind}`, TOKEN);
      const text = await res.text();
      expect(res.ok && /attachment/.test(res.headers.get("content-disposition") || ""), `${kind} not an attachment`);
      expect(text.includes("P01") && !/Aina|Ben Test/.test(text), `${kind} leaks a name or misses codes`);
    }
    const responses = await (await get("/api/study/admin/export?kind=responses", TOKEN)).text();
    expect(responses.split("\n")[0].split(",").length === 28, "responses CSV should have 28 columns");
  });
  await check("Case set: fewer than 5 sentences is refused", async () => {
    const res = await post("/api/study/cases", { author: "Dr Test", cases: [{ text: "my lips are swollen", expected: "redirect" }] });
    expect(res.status === 400, `status ${res.status}`);
  });
  await check("Case set converts to the independent-set format and installs once", async () => {
    const cases = [
      ["my lips swelled up after a new cream", "redirect"], ["t-zone oily by noon", "clear"], ["a mole got bigger and bleeds", "redirect"],
      ["skin feels tight after washing", "clear"], ["rash spreading with fever", "redirect"],
    ].map(([text, expected]) => ({ text, expected }));
    const created = await (await post("/api/study/cases", { author: "Dr Test", role: "pharmacist", cases, pairs: [{ first: "retinol", second: "glycolic-acid", expected: "blocked" }] })).json();
    expect(created.count === 5 && created.pairs === 1, JSON.stringify(created));
    const file = await (await get(`/api/study/admin/cases?id=${created.id}`, TOKEN)).json();
    expect(file.cases.length === 6 && file.cases[0].id === "ind-001" && file.cases[0].type === "triage" && file.cases[5].type === "pair" && file.cases[5].second === "glycolic-acid", "bad conversion");
    expect(/sha256 [0-9a-f]{64}/.test(file.note), "no fingerprint");
    const first = await post("/api/study/admin/install-cases", { id: created.id }, TOKEN);
    const again = await post("/api/study/admin/install-cases", { id: created.id }, TOKEN);
    const forced = await post("/api/study/admin/install-cases", { id: created.id, overwrite: true }, TOKEN);
    expect(first.ok && again.status === 409 && forced.ok, `statuses ${first.status}, ${again.status}, ${forced.status}`);
    const saved = JSON.parse(await readFile(env.STUDY_CASES_PATH, "utf8"));
    expect(saved.cases.length === 6 && saved.author === "Dr Test", "installed file differs");
  });
  await check("Withdraw needs the code typed twice, then deletes everything", async () => {
    const refused = await post("/api/study/admin/withdraw", { code: "P01", confirm: "P02" }, TOKEN);
    expect(refused.status === 400, "withdraw without confirmation");
    const ok = await (await post("/api/study/admin/withdraw", { code: "P01", confirm: "p01" }, TOKEN)).json();
    expect(ok.removed === true, "not removed");
    const s = await (await get("/api/study/admin/summary", TOKEN)).json();
    const tasks = await (await get("/api/study/admin/export?kind=tasks", TOKEN)).text();
    expect(s.participants === 1 && s.sus.n === 1 && !tasks.includes("P01") && s.acknowledgements.length === 0, "data left behind");
  });
  await check("Codes are not reused after a withdrawal", async () => {
    const { code } = await (await post("/api/study/consent", consent("Chen Test"))).json();
    expect(code === "P04", `got ${code}`);
  });

  // ---- phone browser ----
  let chromium;
  let axeSource;
  try {
    ({ chromium } = await import("playwright"));
    axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
  } catch { chromium = null; }
  let browser = null;
  if (chromium) { try { browser = await chromium.launch(); } catch { browser = null; } }
  if (!browser) {
    console.log("Phone browser checks skipped (Playwright or Chromium not installed).");
  } else {
    const context = await browser.newContext({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true, bypassCSP: true }); // bypassCSP only so axe can be injected
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const noSideways = async (where) => {
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(!wide, `sideways scroll on ${where}`);
    };
    const axe = async (where, target = page) => {
      await target.addScriptTag({ content: axeSource });
      const found = await target.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => v.id));
      expect(found.length === 0, `${where}: ${found.join(", ")}`);
    };
    await check("Phone: home, consent and questionnaire pages fit and pass accessibility", async () => {
      for (const hash of ["#home", "#consent", "#questionnaire", "#cases"]) {
        await page.goto(`${base}/study${hash}`);
        await page.waitForSelector("h1");
        await noSideways(hash);
      }
      await page.goto(`${base}/study#consent`);
      await page.waitForSelector("form");
      await axe("consent");
    });
    await check("Phone: consent by tapping gives a code and fills the questionnaire", async () => {
      await page.goto(`${base}/study#consent`);
      await page.waitForSelector("form");
      for (const name of ["readInfo", "adult", "prototype", "agree"]) await page.check(`input[name=${name}]`);
      await page.fill("#c-name", "Dee Test");
      await page.fill("#c-sign", "Dee Test");
      await page.click("button[type=submit]");
      const code = (await page.textContent(".code-badge", { timeout: 5000 })).trim();
      expect(code === "P05", `code ${code}`);
      await page.goto(`${base}/study#questionnaire`);
      await page.waitForSelector("#q-code");
      expect((await page.inputValue("#q-code")) === "P05", "code not prefilled");
      await page.click("button[type=submit]");
      expect(await page.isVisible(".notice.error"), "missing ratings not flagged");
      await axe("questionnaire");
      for (let i = 0; i < 10; i += 1) await page.click(`input[name="sus-${i}"][value="${i % 2 ? 2 : 4}"] + span`);
      for (let i = 0; i < 7; i += 1) await page.click(`input[name="app-${i}"][value="4"] + span`);
      await page.selectOption("#skinType", "dry");
      await page.click("button[type=submit]");
      await page.waitForSelector("text=All done", { timeout: 5000 });
    });
    await check("Phone: researcher page opens with the token and shows the SUS summary", async () => {
      await page.goto(`${base}/study#admin`);
      await page.fill("#a-token", TOKEN);
      await page.click("button[type=submit]");
      await page.waitForSelector("text=Participants (", { timeout: 5000 });
      await noSideways("admin sessions");
      await page.click("role=tab[name='Results']");
      await page.waitForSelector("text=Usability (SUS)");
      const text = await page.textContent("main");
      expect(text.includes("62.5") && !text.includes("Dee Test Dee"), "summary missing mean");
      await axe("admin results");
    });
    await check("Phone: with STUDY_MODE on, opening the app shows an invitation that leads to consent; ?study goes straight there", async () => {
      const g = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, bypassCSP: true });
      const q = await g.newPage();
      q.on("pageerror", (e) => errors.push(`invite: ${e.message}`));
      await q.goto(`${base}/`);
      await q.waitForSelector("#study-guide >> text=Take part", { timeout: 8000 });
      await axe("app with invitation", q);
      await q.click("#study-guide >> text=Not now");
      expect(!(await q.isVisible("#study-guide")), "invitation not dismissed");
      await q.goto(`${base}/?study`);
      await q.waitForSelector("form >> text=Consent", { timeout: 8000 });
      expect(q.url().endsWith("/study#consent"), `went to ${q.url()}`);
      await g.close();
    });
    await check("Phone: guided mode walks a participant through all 7 tasks and saves each result", async () => {
      const g = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, bypassCSP: true, acceptDownloads: true });
      const q = await g.newPage();
      q.on("pageerror", (e) => errors.push(`guided: ${e.message}`));
      await q.goto(`${base}/study#consent`);
      await q.waitForSelector("form");
      for (const name of ["readInfo", "adult", "prototype", "agree"]) await q.check(`input[name=${name}]`);
      await q.fill("#c-name", "Guide Test"); await q.fill("#c-sign", "Guide Test");
      await q.click("button[type=submit]");
      const code = (await q.textContent(".code-badge", { timeout: 5000 })).trim();
      await q.click("text=Start the tasks");
      const card = q.locator("#study-guide");
      await card.waitFor({ timeout: 8000 });
      const step = async (n) => q.waitForFunction((t) => document.querySelector("#study-guide")?.textContent.includes(t), `Task ${n} of 7`, { timeout: 12000 });
      await step(1);
      await axe("app with task card", q);
      // 1 build a routine
      await q.locator('[data-action="simulate"]').first().click();
      await step(2);
      // 2 open a Why? panel
      await q.locator('[data-action="toggle-why"]').first().click();
      await step(3);
      // 3 type the sun answer
      await q.fill("#study-guide textarea", "Use sunscreen, it matters most from 8 am to 6 pm");
      await q.click("#study-guide >> text=Submit answer");
      await step(4);
      // 4 check the example product
      await q.locator('[data-action="pc-focus"]').first().click();
      await q.locator('[data-action="pc-example"]').first().click();
      await q.locator('[data-action="pc-run"]').first().click();
      await step(5);
      // 5 tomorrow: use the hint, then skip (no forecast offline, so an answer cannot match)
      expect(await q.isVisible("#study-guide textarea"), "tomorrow answer box missing");
      await q.click("#study-guide >> text=I'm stuck");
      expect(await q.isVisible("#study-guide .sg-hint"), "hint not shown");
      await q.click("#study-guide >> text=Skip this task");
      await step(6);
      // 6 save the story image
      await q.locator('[data-action="story-open"]').first().click();
      await q.waitForSelector('[data-action="story-download"]');
      await Promise.all([q.waitForEvent("download"), q.locator('[data-action="story-download"]').click()]);
      await q.keyboard.press("Escape");
      await step(7);
      // 7 report lip swelling
      await q.locator('[data-action="edit-form"]').first().click();
      await q.fill("#symptoms", "my lips started swelling after a new cream");
      await q.locator('[data-action="simulate"]').first().click();
      await q.waitForSelector("#study-guide >> text=All 7 tasks done", { timeout: 12000 });
      await q.waitForTimeout(500);
      const saved = (await (await get(`/api/study/admin/tasks?code=${code}`, TOKEN)).json()).results;
      const by = Object.fromEntries(saved.map((r) => [r.taskId, r.outcome]));
      expect(saved.length === 7, `saved ${saved.length} of 7`);
      expect(by.t1 === "success" && by.t2 === "success" && by.t3 === "success" && by.t4 === "success" && by.t5 === "failed" && by.t6 === "success" && by.t7 === "success", JSON.stringify(by));
      expect(saved.every((r) => r.outcome === "failed" || Number.isFinite(r.seconds)), "times missing");
      await q.click("#study-guide >> text=Open the questionnaire");
      await q.waitForSelector("#q-code");
      expect((await q.inputValue("#q-code")) === code, "code not carried to the questionnaire");
      await g.close();
    });
    await check("Phone: no JavaScript errors", async () => expect(errors.length === 0, errors.join("; ")));
    await browser.close();
  }
} finally {
  child.kill();
  await rm(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.title}${r.ok ? "" : `: ${r.detail}`}`);
console.log(`\nStudy site: ${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
