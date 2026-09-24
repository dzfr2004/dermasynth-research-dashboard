import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Headless browser smoke test (G7).
 *
 * Starts an isolated offline server and opens the app in Chromium at phone
 * (375 px) and desktop (1280 px) widths. Checks, per page and width:
 *   - no JavaScript errors;
 *   - no sideways scrolling;
 *   - zero serious or critical accessibility violations (axe-core, WCAG 2 A/AA);
 * and on the routine page:
 *   - the skin question is visible, in plain words, before the build button;
 *   - a routine builds and every step shows a one-line reason;
 *   - "Why?" opens and closes (aria-expanded) and keeps keyboard focus;
 *   - symptoms that need care show the "get this checked" screen and no routine;
 *   - Expert view shows the scoring panels and hides again;
 *   - no configuration text (.env, API key names, raw status codes) is shown
 *     to a consumer.
 *
 * Needs the dev dependencies (npm install) and a Chromium build
 * (npx playwright install chromium). If either is missing the test says so
 * and is skipped, unless --require is passed.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const requireDeps = process.argv.includes("--require");
const require = createRequire(import.meta.url);

let chromium;
let axeSource;
try {
  ({ chromium } = await import("playwright"));
  axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
} catch {
  const message = "Browser smoke test skipped: run `npm install` to add playwright and axe-core.";
  if (requireDeps) { console.error(message); process.exit(1); }
  console.log(message);
  process.exit(0);
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const port = await reservePort();
const child = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: {
    PATH: process.env.PATH || "",
    PORT: String(port),
    LIVE_SERVICES_ENABLED: "false",
    INGREDIENT_DB_ENABLED: "true",
    INGREDIENT_SELECTION_ENABLED: "true",
    SELECTION_LOG_ENABLED: "false",
    OPENAI_API_KEY: "",
    OPENWEATHER_API_KEY: "",
    IQAIR_API_KEY: "",
    PINECONE_API_KEY: "",
    PINECONE_INDEX: "",
    FEEDBACK_LOG_PATH: "tmp/smoke-feedback.jsonl",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Server did not start. ${serverOutput}`)), 8000);
  child.stdout.on("data", (chunk) => { serverOutput += chunk; if (String(chunk).includes(`:${port}`)) { clearTimeout(timer); resolve(); } });
  child.stderr.on("data", (chunk) => { serverOutput += chunk; });
  child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited (${code}). ${serverOutput}`)); });
});
const base = `http://127.0.0.1:${port}/`;

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  child.kill();
  const message = `Browser smoke test skipped: no Chromium build (run \`npx playwright install chromium\`). ${String(error?.message || "").split("\n")[0]}`;
  if (requireDeps) { console.error(message); process.exit(1); }
  console.log(message);
  process.exit(0);
}

const results = [];
async function check(id, title, fn) {
  try { await fn(); results.push({ id, title, status: "passed" }); }
  catch (error) { results.push({ id, title, status: "failed", detail: String(error?.message || error).split("\n")[0] }); }
}
const expect = (cond, message) => { if (!cond) throw new Error(message); };
const CONFIG_LEAK = /\.env\b|LIVE_SERVICES_ENABLED|OPENAI_API_KEY|OPENWEATHER_API_KEY|not_configured|api\.openai\.com/;

async function openPage(width) {
  // bypassCSP only so the axe script can be injected; the app itself is unchanged.
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 812 : 900 }, bypassCSP: true, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.waitForTimeout(900);
  return { page, context, errors };
}
async function goTo(page, view) {
  await page.evaluate((v) => { const el = [...document.querySelectorAll(`[data-view="${v}"]`)].find((e) => e.offsetParent); el?.click(); }, view);
  await page.waitForTimeout(700);
}
async function axeViolations(page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return result.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target?.join(" ")}`);
  });
}

for (const width of [375, 1280]) {
  const label = width < 500 ? "phone" : "desktop";
  const { page, context, errors } = await openPage(width);
  await check(`${label}-landing`, `${label}: a consumer lands on the routine page`, async () => {
    expect((await page.locator("#page-title").innerText()).trim() === "Your routine", "Landing page is not the routine page.");
  });
  const views = width < 500 ? ["simulator", "monitor", "knowledge"] : ["simulator", "monitor", "dashboard", "knowledge"];
  for (const view of views) {
    await goTo(page, view);
    if (width < 500) await check(`${label}-${view}-reached`, `${label}: the ${view} page is reachable from the bottom navigation`, async () => {
      expect(await page.evaluate((v) => document.querySelector(`.mobile-nav [data-view="${v}"]`)?.classList.contains("is-active"), view), "Nav item not active.");
    });
    if (view === "knowledge") await page.waitForTimeout(1200);
    await check(`${label}-${view}-layout`, `${label}: ${view} page has no sideways scroll`, async () => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow <= 1, `Page is ${overflow}px wider than the screen.`);
    });
    await check(`${label}-${view}-a11y`, `${label}: ${view} page has no serious accessibility violations`, async () => {
      const violations = await axeViolations(page);
      expect(!violations.length, violations.join("; "));
    });
  }
  if (width < 500) {
    await check("phone-nav", "phone: the bottom navigation is Today / Weather / Ingredients", async () => {
      const labels = await page.locator(".mobile-nav-item span").allInnerTexts();
      expect(labels.join("/") === "Today/Weather/Ingredients", `Nav is ${labels.join("/")}`);
    });
    await goTo(page, "monitor");
    await check("phone-weather", "phone: the Weather page is plain (no research terms) and shows today's readings", async () => {
      await page.waitForSelector(".today-card", { timeout: 5000 });
      const text = await page.locator(".view").innerText();
      const leak = text.match(/not_configured|Shapley|surrogate|\bGPT\b|research context/i);
      expect(!leak, `Found "${leak?.[0]}".`);
    });
    await goTo(page, "simulator");
    await check("phone-no-zoom", "phone: form fields use at least 16 px text (no zoom on focus in iOS)", async () => {
      const small = await page.evaluate(() => [...document.querySelectorAll("input, select, textarea")].filter((el) => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.id || el.className));
      expect(!small.length, `Under 16 px: ${small.join(", ")}`);
    });
    await check("phone-tap-targets", "phone: buttons and fields are at least 44 px tall", async () => {
      const small = await page.evaluate(() => [...document.querySelectorAll(".view button, .view input, .view select, .mobile-nav button, .topbar button")].filter((el) => el.offsetParent).map((el) => ({ t: (el.innerText || el.id || el.className).trim().slice(0, 24), h: el.getBoundingClientRect().height })).filter((x) => x.h < 43.5));
      expect(!small.length, small.map((x) => `${x.t} (${Math.round(x.h)} px)`).join(", "));
    });
  }
  await goTo(page, "simulator");
  await check(`${label}-safety-question`, `${label}: the skin question is shown in plain words before the build button`, async () => {
    const labelText = await page.locator('label[for="symptoms"]').innerText();
    expect(/anything unusual with your skin/i.test(labelText), `Unexpected label: ${labelText}`);
    expect(await page.locator("#symptoms").isVisible(), "Symptom box is not visible.");
  });
  await check(`${label}-routine`, `${label}: a routine builds and every step has a reason`, async () => {
    await page.locator('[data-action="simulate"]').first().click();
    await page.waitForSelector(".consumer-step", { timeout: 15000 });
    const steps = await page.locator(".consumer-step").count();
    const reasons = await page.locator(".consumer-step-main p").evaluateAll((els) => els.map((e) => e.textContent.trim()).filter((text) => text.length > 15).length);
    expect(steps >= 4 && reasons === steps, `${steps} steps, ${reasons} with a reason.`);
    expect(await page.locator(".today-card").count() === 1, "Today's conditions card missing.");
    await page.waitForTimeout(1400); // let the entrance animation and background updates settle
  });
  await check(`${label}-why`, `${label}: "Why?" opens, closes and keeps focus`, async () => {
    const button = page.locator('[data-action="toggle-why"]').first();
    await button.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const again = page.locator('[data-action="toggle-why"]').first();
    expect(await again.getAttribute("aria-expanded") === "true", "Did not open.");
    expect(await page.evaluate(() => document.activeElement?.dataset?.action) === "toggle-why", "Focus was lost.");
    const panel = await again.getAttribute("aria-controls");
    expect(await page.locator(`#${panel}`).isVisible(), "Panel not visible.");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    expect(await page.locator('[data-action="toggle-why"]').first().getAttribute("aria-expanded") === "false", "Did not close.");
  });
  await check(`${label}-why-panel`, `${label}: the Why? panel explains what it is, why today, label names and references`, async () => {
    const button = page.locator('[data-action="toggle-why"]').first();
    await button.click();
    await page.waitForTimeout(500);
    const labels = await page.locator(".consumer-why:not([hidden]) .why-row dt").allInnerTexts();
    expect(["What it is", "Why today", "On labels", "References"].every((l) => labels.includes(l)), `Rows: ${labels.join(", ")}`);
    expect(await page.locator(".consumer-why:not([hidden]) .reference-list li").count() >= 1, "No journal-style reference shown.");
    const text = await page.locator(".consumer-why:not([hidden])").innerText();
    expect(!/picked from|approved ingredients|score|rank|retriev/i.test(text), "System wording in the Why? panel.");
    await page.locator('[data-action="toggle-why"]').first().click();
    await page.waitForTimeout(400);
  });
  await check(`${label}-one-disclaimer`, `${label}: the routine page shows the disclaimer once`, async () => {
    const count = (await page.locator("body").innerText()).match(/not medical advice/gi)?.length || 0;
    expect(count === 1, `Disclaimer appears ${count} times.`);
  });
  await check(`${label}-no-config-text`, `${label}: no configuration text is shown to a consumer`, async () => {
    const text = await page.locator("body").innerText();
    const leak = text.match(CONFIG_LEAK);
    expect(!leak, `Found "${leak?.[0]}".`);
  });
  await check(`${label}-one-line`, `${label}: "Today in one line" summarises the day above the routine`, async () => {
    const text = (await page.locator(".hero-text").innerText()).trim();
    expect(text.length > 15 && /sunscreen|UV/i.test(text), `Summary missing or unexpected: "${text}"`);
  });
  await check(`${label}-collapsed`, `${label}: the form folds into "Edit my skin details" and the result is in view`, async () => {
    expect(await page.locator(".form-panel.is-collapsed").count() === 1, "Form did not collapse.");
    const top = await page.locator("#routine-result").evaluate((el) => el.getBoundingClientRect().top);
    expect(top < 400, `Result starts ${Math.round(top)} px down the screen.`);
  });
  await check(`${label}-my-routine`, `${label}: the routine can be saved as "my routine" with product names`, async () => {
    await page.locator('[data-action="save-my-routine"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-action="my-product"]').first().fill("My cleanser");
    await page.locator('[data-action="products-done"]').click();
    await page.waitForTimeout(500);
    expect((await page.locator(".my-product").first().innerText()).includes("My cleanser"), "Product name not shown on the step.");
  });
  await check(`${label}-product-check`, `${label}: "Check a product" reads an ingredient list`, async () => {
    expect(await page.locator("#pc-text").isVisible(), "The product check is not visible without a click.");
    await page.locator("#pc-text").fill("Aqua, Glycerin, Niacinamide, Unknownium Extract");
    await page.locator('[data-action="pc-run"]').click();
    await page.waitForSelector(".pc-verdict", { timeout: 10000 });
    expect(/1 of 3 ingredients/.test(await page.locator(".pc-note").innerText()), "Unrecognised ingredient not reported.");
  });
  await check(`${label}-product-example`, `${label}: "Check my product" is one tap from the summary and the example runs`, async () => {
    await page.locator('[data-action="pc-focus"]').click();
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => document.activeElement?.id) === "pc-text", "The ingredient box was not focused.");
    await page.locator('[data-action="pc-example"]').click();
    await page.waitForSelector(".pc-result.is-good", { timeout: 10000 });
  });
  await check(`${label}-checkin`, `${label}: the one-tap check-in is sent`, async () => {
    const posted = page.waitForRequest((r) => r.url().endsWith("/api/feedback") && r.method() === "POST");
    await page.locator('[data-action="checkin"][data-value="good"]').click();
    await page.locator('[data-action="checkin-follow"][data-value="partly"]').click();
    const body = JSON.parse((await posted).postData() || "{}");
    expect(body.rating === "good" && body.followed === "partly", "Check-in body wrong.");
    await page.waitForSelector(".checkin-card.is-done", { timeout: 5000 });
  });
  await check(`${label}-reminders`, `${label}: reminders download as a calendar file`, async () => {
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator('[data-action="reminders"]').click()]);
    expect(download.suggestedFilename() === "dermasynth-reminders.ics", "Wrong file name.");
    const text = await readFile(await download.path(), "utf8");
    expect(text.startsWith("BEGIN:VCALENDAR") && text.includes("BEGIN:VEVENT"), "Not a calendar file.");
  });
  await check(`${label}-story`, `${label}: the story image is 1080 x 1920 and the dialog closes with Escape`, async () => {
    await page.locator('[data-action="story-open"]').click();
    await page.waitForSelector(".story-preview", { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector(".story-preview")?.naturalWidth > 0);
    const size = await page.locator(".story-preview").evaluate((img) => [img.naturalWidth, img.naturalHeight]);
    expect(size[0] === 1080 && size[1] === 1920, `Image is ${size.join(" x ")}.`);
    await page.waitForTimeout(800); // let the dialog finish its entrance before checking contrast
    const violations = await axeViolations(page);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    expect(await page.locator("#story-modal").count() === 0, "Dialog did not close.");
    expect(!violations.length, violations.join("; "));
  });
  await check(`${label}-result-a11y`, `${label}: the routine result has no serious accessibility violations`, async () => {
    const violations = await axeViolations(page);
    expect(!violations.length, violations.join("; "));
  });
  await check(`${label}-redirect`, `${label}: symptoms that need care show the check-up screen and no routine`, async () => {
    await page.locator('[data-action="edit-form"]').click();
    await page.waitForSelector("#symptoms", { timeout: 5000 });
    await page.fill("#symptoms", "my lips started swelling after a new cream");
    await page.locator('[data-action="simulate"]').first().click();
    await page.waitForSelector(".clinical-redirect", { timeout: 15000 });
    expect(await page.locator(".consumer-step").count() === 0, "A routine was shown with the redirect.");
  });
  await check(`${label}-expert`, `${label}: Expert view shows the scoring and hides it again`, async () => {
    await page.fill("#symptoms", "");
    await page.locator('[data-action="simulate"]').first().click();
    await page.waitForSelector(".consumer-step", { timeout: 15000 });
    await page.locator(".expert-toggle-top").click();
    await page.waitForTimeout(500);
    expect(await page.locator(".ingredient-attr-row").count() > 0, "No scoring rows in Expert view.");
    await page.locator(".expert-toggle-top").click();
    await page.waitForTimeout(500);
    expect(await page.locator(".ingredient-attr-row").count() === 0, "Scoring still shown after leaving Expert view.");
  });
  await check(`${label}-errors`, `${label}: no JavaScript errors`, async () => {
    expect(!errors.length, errors.slice(0, 3).join(" | "));
  });
  await context.close();
}

await browser.close();
child.kill();
const passed = results.filter((r) => r.status === "passed").length;
const md = ["# Browser smoke test", "", `Generated ${new Date().toISOString().slice(0, 10)} by \`npm run test:browser\` (Chromium, 375 px and 1280 px, axe-core WCAG 2.1 A/AA, serious and critical only). Result: **${passed}/${results.length} passed**.`, "", "| Check | Result |", "| --- | --- |", ...results.map((r) => `| ${r.title} | ${r.status}${r.detail ? `: ${r.detail.replaceAll("|", "/")}` : ""} |`), ""];
const out = new URL("../data/evaluation/reports/", import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL("browser-smoke.latest.md", out), `${md.join("\n")}\n`);
console.log(JSON.stringify({ suite: "browser-smoke", total: results.length, passed, failures: results.filter((r) => r.status !== "passed") }, null, 2));
if (passed !== results.length) process.exitCode = 1;
