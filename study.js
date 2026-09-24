// DermaSynth user-study site. Hash routes: #home, #consent, #questionnaire, #cases, #admin.
// All text from people is added with textContent, never innerHTML.

const RESEARCHER = "Firdaus (Universiti Teknologi PETRONAS, Computer Science)";
const SUPERVISOR = "Dr. Emelia Akashah Bt Patah Akhir";
const LIKERT_ENDS = ["Strongly disagree", "Strongly agree"];

const view = document.getElementById("view");
let config = null;

// ---------- small helpers ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === false || value === null || value === undefined) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}
const store = {
  get(area, key) { try { return window[area].getItem(key); } catch { return null; } },
  set(area, key, value) { try { window[area].setItem(key, value); } catch { /* storage unavailable */ } },
  remove(area, key) { try { window[area].removeItem(key); } catch { /* storage unavailable */ } },
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function api(path, { method = "GET", body, token } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers["x-study-token"] = token;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const type = res.headers.get("content-type") || "";
  if (!res.ok) {
    const data = type.includes("json") ? await res.json().catch(() => ({})) : {};
    const err = new Error(data.error || `Something went wrong (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  if (type.includes("json") && !res.headers.get("content-disposition")) return res.json();
  return { blob: await res.blob(), filename: /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || "download" };
}

function notice(kind, text) {
  return h("div", { class: `notice ${kind}`, role: kind === "error" ? "alert" : "status", text });
}
function showError(slot, error) {
  slot.replaceChildren(notice("error", error.message || String(error)));
  slot.scrollIntoView({ block: "center", behavior: "smooth" });
}
function render(...nodes) {
  view.replaceChildren(...nodes.flat().filter((n) => n !== null && n !== undefined && n !== false));
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
function tableWrap(label, table) {
  return h("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-label": label }, table);
}
function saveBlob({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function likertSet(name, index, statement, number) {
  return h("fieldset", { class: "likert", "data-name": `${name}-${index}` },
    h("legend", {}, h("span", { class: "num", text: `${number}.` }), statement),
    h("div", { class: "scale" }, [1, 2, 3, 4, 5].map((v) =>
      h("label", {}, h("input", { type: "radio", name: `${name}-${index}`, value: String(v), "aria-label": `${v} of 5` }), h("span", { text: String(v) })))),
    h("div", { class: "ends", "aria-hidden": "true" }, h("span", { text: LIKERT_ENDS[0] }), h("span", { text: LIKERT_ENDS[1] })));
}
function readLikert(form, name, count) {
  const values = [];
  let firstMissing = null;
  for (let i = 0; i < count; i += 1) {
    const checked = form.querySelector(`input[name="${name}-${i}"]:checked`);
    const set = form.querySelector(`[data-name="${name}-${i}"]`);
    set.classList.toggle("missing", !checked);
    if (!checked && !firstMissing) firstMissing = set;
    values.push(checked ? Number(checked.value) : null);
  }
  return { values, firstMissing };
}

// ---------- home ----------
function homeView() {
  const code = store.get("localStorage", "study.code");
  render(
    h("h1", { text: "Help test DermaSynth" }),
    h("p", { class: "muted", text: "DermaSynth is a final-year student project that suggests a daily skincare routine from today's weather. Thank you for helping to test it." }),
    code ? notice("ok", `Your participant code on this phone is ${code}.`) : null,
    h("div", { class: "choices" },
      h("a", { class: "card choice", href: "#consent" }, h("strong", { text: "1. Take part" }), h("span", { class: "muted", text: "Read what the test involves and give consent. About 2 minutes." })),
      h("a", { class: "card choice", href: "#questionnaire" }, h("strong", { text: "2. Questionnaire" }), h("span", { class: "muted", text: "After the tasks: 17 quick ratings and two optional comments. About 5 minutes." })),
      h("a", { class: "card choice", href: "#cases" }, h("strong", { text: "Write test sentences" }), h("span", { class: "muted", text: "Only if the researcher asked you to write safety test cases." }))),
    h("p", { class: "small muted" }, "Researcher? ", h("a", { href: "#admin", text: "Open the researcher page" }), "."),
  );
}

// ---------- consent ----------
function consentView() {
  const slot = h("div");
  const box = (name, text, required = true) => h("label", { class: "check" }, h("input", { type: "checkbox", name, required }), h("span", {}, text, required ? "" : h("span", { class: "muted", text: " (optional)" })));
  const form = h("form", { class: "card", novalidate: true, onsubmit: submit },
    h("h2", { text: "Consent" }),
    box("readInfo", "I have read the information above and could ask questions."),
    box("adult", "I am 18 years old or older."),
    box("prototype", "I understand DermaSynth is a student prototype and not medical advice."),
    box("agree", "I agree to take part, and for my answers to be used in the dissertation without my name."),
    box("creditOptIn", "You may thank me by name in the dissertation acknowledgements.", false),
    h("div", { class: "field" }, h("label", { for: "c-name", text: "Your name" }), h("input", { id: "c-name", name: "name", type: "text", autocomplete: "name", maxlength: "80" })),
    h("div", { class: "field" }, h("label", { for: "c-sign", text: "Signature (type your name again)" }), h("input", { id: "c-sign", name: "signature", type: "text", maxlength: "80", autocapitalize: "words" })),
    h("div", { class: "field" }, h("label", { for: "c-date", text: "Date" }), h("input", { id: "c-date", name: "date", type: "date", value: today() })),
    slot,
    h("button", { class: "primary wide", type: "submit", text: "I agree, give me my code" }));

  async function submit(event) {
    event.preventDefault();
    const f = new FormData(form);
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const { code } = await api("/api/study/consent", { method: "POST", body: {
        readInfo: f.has("readInfo"), adult: f.has("adult"), prototype: f.has("prototype"), agree: f.has("agree"), creditOptIn: f.has("creditOptIn"),
        name: f.get("name"), signature: f.get("signature"), date: f.get("date"),
      } });
      store.set("localStorage", "study.code", code);
      render(
        h("h1", { text: "Thank you" }),
        h("div", { class: "card" },
          h("p", { text: "Your participant code is" }),
          h("div", { class: "code-badge", text: code }),
          h("p", { text: "Please keep it. You need it for the questionnaire, and to withdraw later if you want to. It is saved on this phone too." }),
          h("div", { class: "row" },
            h("a", { class: "button primary", href: "/", target: "_blank", rel: "noopener", text: "Open DermaSynth" }),
            h("a", { class: "button", href: "#home", text: "Back" }))),
        h("p", { class: "small muted", text: "The researcher will now read you the tasks one at a time." }));
    } catch (error) {
      showError(slot, error);
      button.disabled = false;
    }
  }

  render(
    h("h1", { text: "Taking part in the DermaSynth test" }),
    h("div", { class: "card" },
      h("h2", { text: "What this is" }),
      h("p", { text: "DermaSynth is a student prototype built for a final-year project. It suggests a morning and evening skincare routine from today's weather (UV, humidity, haze and temperature) and your skin type, and explains each choice in plain English." }),
      h("h2", { text: "What you will do" }),
      h("ul", {},
        h("li", { text: "Use DermaSynth on your own phone for about 15 minutes while the researcher reads out 7 short tasks." }),
        h("li", { text: "The researcher notes whether each task worked and how long it took. The app is being tested, not you." }),
        h("li", { text: "Fill in a short questionnaire at the end (about 5 minutes)." })),
      h("h2", { text: "Your information" }),
      h("ul", {},
        h("li", { text: "Your name and signature are kept only on this consent record, on the researcher's laptop." }),
        h("li", { text: "Your answers are stored under a code such as P03. The dissertation reports grouped results and never names you, unless you tick the optional box to be thanked by name." }),
        h("li", { text: "You can type any city in the app. You do not need to share your exact location." }),
        h("li", { text: "All study records are deleted after the project is graded." })),
      h("h2", { text: "Your choice" }),
      h("ul", {},
        h("li", { text: "Taking part is voluntary. You can stop at any time without giving a reason." }),
        h("li", { text: "To withdraw your answers later, give the researcher your code before the dissertation is submitted." })),
      h("h2", { text: "Safety" }),
      h("p", { text: "DermaSynth does not give medical advice. Please do not start a new product because of this test. If you have a skin problem, speak to a pharmacist or doctor." }),
      h("p", { class: "small muted", text: `Researcher: ${RESEARCHER}. Supervisor: ${SUPERVISOR}.` })),
    form);
}

// ---------- questionnaire ----------
function questionnaireView() {
  const slot = h("div");
  const choice = (id, label, values, labels) => h("div", { class: "field" },
    h("label", { for: id, text: label }),
    h("select", { id, name: id }, h("option", { value: "", text: "Choose…" }), values.map((v, i) => h("option", { value: v, text: labels[i] }))));
  const yesNo = (name, label) => h("div", { class: "field" },
    h("span", { class: "label", text: label }),
    h("div", { class: "row" },
      h("label", { class: "check" }, h("input", { type: "radio", name, value: "yes" }), h("span", { text: "Yes" })),
      h("label", { class: "check" }, h("input", { type: "radio", name, value: "no" }), h("span", { text: "No" }))));
  const days = h("div", { class: "field", hidden: true }, h("label", { for: "q-days", text: "About how many days?" }), h("input", { id: "q-days", name: "daysUsed", type: "number", inputmode: "numeric", min: "1", max: "60" }));

  const form = h("form", { novalidate: true, onsubmit: submit },
    h("div", { class: "card" },
      h("div", { class: "field" }, h("label", { for: "q-code", text: "Participant code" }), h("input", { id: "q-code", name: "code", type: "text", value: store.get("localStorage", "study.code") || "", placeholder: "For example P07", autocapitalize: "characters", maxlength: "4" }))),
    h("div", { class: "card" },
      h("h2", { text: "Part 1. About you" }),
      choice("skinType", "Your skin type", config.choices.skinType, ["Dry", "Combination", "Oily", "Sensitive", "Not sure"]),
      h("div", { class: "field" }, h("label", { for: "q-concern", text: "Your main skin concern (optional)" }), h("input", { id: "q-concern", name: "concern", type: "text", maxlength: "60", placeholder: "For example acne, dryness, dark spots" })),
      choice("appUse", "How often do you use skincare apps or websites?", config.choices.appUse, ["Never", "Rarely", "About monthly", "About weekly", "Daily"]),
      yesNo("askedChatbot", "Have you ever asked an AI chatbot for skincare advice?"),
      yesNo("multiDay", "Did you use DermaSynth on more than one day?"),
      days),
    h("div", { class: "card" },
      h("h2", { text: "Part 2. Using the app" }),
      h("p", { class: "muted small", text: "Rate each statement from 1 (strongly disagree) to 5 (strongly agree). Go with your first reaction." }),
      config.susItems.map((s, i) => likertSet("sus", i, s, i + 1))),
    h("div", { class: "card" },
      h("h2", { text: "Part 3. About DermaSynth" }),
      config.appItems.map((s, i) => likertSet("app", i, s, i + 11))),
    h("div", { class: "card" },
      h("h2", { text: "Part 4. Your comments (optional)" }),
      h("div", { class: "field" }, h("label", { for: "q-useful", text: "What was most useful?" }), h("textarea", { id: "q-useful", name: "mostUseful", maxlength: "1000" })),
      h("div", { class: "field" }, h("label", { for: "q-confusing", text: "What was confusing or could be better?" }), h("textarea", { id: "q-confusing", name: "confusing", maxlength: "1000" }))),
    slot,
    h("button", { class: "primary wide", type: "submit", text: "Submit my answers" }));

  form.addEventListener("change", (event) => {
    if (event.target.name === "multiDay") days.hidden = event.target.value !== "yes";
    const set = event.target.closest?.(".likert");
    if (set) set.classList.remove("missing");
  });

  async function submit(event) {
    event.preventDefault();
    const f = new FormData(form);
    const sus = readLikert(form, "sus", config.susItems.length);
    const items = readLikert(form, "app", config.appItems.length);
    const missing = sus.firstMissing || items.firstMissing;
    if (missing) {
      slot.replaceChildren(notice("error", "Please rate every statement in Parts 2 and 3. Missing ones are outlined in red."));
      missing.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const yn = (name) => (f.get(name) === "yes" ? true : f.get(name) === "no" ? false : null);
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await api("/api/study/questionnaire", { method: "POST", body: {
        code: f.get("code"), skinType: f.get("skinType") || null, concern: f.get("concern"), appUse: f.get("appUse") || null,
        askedChatbot: yn("askedChatbot"), multiDay: yn("multiDay"), daysUsed: f.get("daysUsed") ? Number(f.get("daysUsed")) : null,
        sus: sus.values, items: items.values, mostUseful: f.get("mostUseful"), confusing: f.get("confusing"),
      } });
      render(
        h("h1", { text: "All done, thank you!" }),
        h("div", { class: "card" },
          h("p", { text: `Your answers are saved under ${result.code}. You can close this page.` }),
          h("p", { class: "muted", text: "If you want to change an answer, just submit the questionnaire again with the same code. The newest answers are kept." })));
    } catch (error) {
      showError(slot, error);
      button.disabled = false;
    }
  }

  render(h("h1", { text: "Questionnaire" }), h("p", { class: "muted", text: "There are no right or wrong answers. Honest answers help most." }), form);
}

// ---------- independent case writer ----------
const DRAFT_KEY = "study.cases.draft";
function casesView() {
  let draft;
  try { draft = JSON.parse(store.get("localStorage", DRAFT_KEY) || "null"); } catch { draft = null; }
  const state = draft && Array.isArray(draft.cases) ? draft : { author: "", role: "", cases: Array.from({ length: 5 }, () => ({ text: "", expected: null })), pairs: [] };
  const slot = h("div");
  const caseList = h("div");
  const pairList = h("div");
  const counter = h("span", { class: "muted small" });
  const persist = () => {
    store.set("localStorage", DRAFT_KEY, JSON.stringify(state));
    const done = state.cases.filter((c) => c.text.trim() && c.expected).length;
    counter.textContent = `${done} sentence${done === 1 ? "" : "s"} ready (aim for 30 or more)`;
  };
  const seg = (options, current, onPick) => {
    const wrap = h("div", { class: "seg", role: "group" });
    for (const [value, label, cls] of options) {
      wrap.append(h("button", { type: "button", class: cls || "", "aria-pressed": String(current === value), text: label, onclick: () => {
        onPick(value);
        wrap.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === label)));
      } }));
    }
    return wrap;
  };

  function drawCases() {
    caseList.replaceChildren(...state.cases.map((c, i) => h("div", { class: "case" },
      h("label", { for: `case-${i}`, text: `Sentence ${i + 1}` }),
      h("textarea", { id: `case-${i}`, maxlength: "400", placeholder: "Write what a person might type about their skin today", oninput: (e) => { c.text = e.target.value; persist(); } }, c.text),
      h("p", { class: "q", text: "Should the app stop and send this person to a pharmacist or doctor?" }),
      h("div", { class: "row" },
        seg([["redirect", "Yes, get it checked", "bad"], ["clear", "No, a routine is fine"]], c.expected, (v) => { c.expected = v; persist(); }),
        h("button", { type: "button", class: "small", "aria-label": `Remove sentence ${i + 1}`, text: "Remove", onclick: () => { state.cases.splice(i, 1); drawCases(); persist(); } })))));
  }
  function drawPairs() {
    const options = (selected) => [h("option", { value: "", text: "Choose…" }), ...config.ingredients.map((ing) => h("option", { value: ing.id, selected: ing.id === selected, text: ing.name }))];
    pairList.replaceChildren(...state.pairs.map((p, i) => h("div", { class: "case" },
      h("div", { class: "field" }, h("label", { for: `pa-${i}`, text: `Pair ${i + 1}: first ingredient` }), h("select", { id: `pa-${i}`, onchange: (e) => { p.first = e.target.value; persist(); } }, options(p.first))),
      h("div", { class: "field" }, h("label", { for: `pb-${i}`, text: "Second ingredient" }), h("select", { id: `pb-${i}`, onchange: (e) => { p.second = e.target.value; persist(); } }, options(p.second))),
      h("p", { class: "q", text: "Should these two be kept apart in the same routine?" }),
      h("div", { class: "row" },
        seg([["blocked", "Yes, keep apart", "bad"], ["allowed", "No, fine together"]], p.expected, (v) => { p.expected = v; persist(); }),
        h("button", { type: "button", text: "Remove", onclick: () => { state.pairs.splice(i, 1); drawPairs(); persist(); } })))));
  }

  const authorInput = h("input", { id: "w-author", type: "text", maxlength: "80", value: state.author, autocomplete: "name", oninput: (e) => { state.author = e.target.value; persist(); } });
  const roleInput = h("input", { id: "w-role", type: "text", maxlength: "80", value: state.role, placeholder: "For example pharmacist, pharmacy student, supervisor", oninput: (e) => { state.role = e.target.value; persist(); } });

  async function submit() {
    const button = document.getElementById("w-submit");
    button.disabled = true;
    try {
      const result = await api("/api/study/cases", { method: "POST", body: {
        author: state.author, role: state.role,
        cases: state.cases.filter((c) => c.text.trim() && c.expected),
        pairs: state.pairs.filter((p) => p.first && p.second && p.expected),
      } });
      store.remove("localStorage", DRAFT_KEY);
      render(h("h1", { text: "Thank you!" }), h("div", { class: "card" },
        h("p", { text: `Your ${result.count} sentences${result.pairs ? ` and ${result.pairs} pairs` : ""} were saved as set ${result.id}.` }),
        h("p", { class: "muted", text: "They are stored exactly as you wrote them and are only used to test the app's safety checks." })));
    } catch (error) {
      showError(slot, error);
      button.disabled = false;
    }
  }

  drawCases();
  drawPairs();
  persist();
  render(
    h("h1", { text: "Write test sentences" }),
    h("div", { class: "card" },
      h("h2", { text: "Why this matters" }),
      h("p", { text: "DermaSynth has a skin box where people can describe how their skin is today. If what they write sounds like it needs a pharmacist or doctor, the app should not give a routine and should tell them to get it checked. The researcher wrote the current rules, so they need sentences written by someone else to test them fairly." }),
      h("h2", { text: "What to do" }),
      h("ul", {},
        h("li", { text: "Write short sentences the way a real person would type them, in your own words. Typos, slang and Manglish are welcome." }),
        h("li", { text: "For each one, choose whether the app should stop and send them to a pharmacist or doctor." }),
        h("li", { text: "Mix both kinds: some that clearly need a check, some ordinary ones (oily T-zone, a few spots), and some borderline ones." }),
        h("li", { text: "Please do not look at the app or its rules first. Aim for 30 or more. Your draft is kept on this device until you submit." }))),
    h("div", { class: "card" },
      h("div", { class: "field" }, h("label", { for: "w-author", text: "Your name" }), authorInput),
      h("div", { class: "field" }, h("label", { for: "w-role", text: "Your background (optional)" }), roleInput)),
    h("div", { class: "card" }, h("h2", { text: "Sentences" }), caseList,
      h("button", { type: "button", class: "wide", text: "+ Add a sentence", onclick: () => { state.cases.push({ text: "", expected: null }); drawCases(); persist(); document.getElementById(`case-${state.cases.length - 1}`)?.focus(); } })),
    h("div", { class: "card soft" },
      h("h2", { text: "Ingredient pairs (optional)" }),
      h("p", { class: "muted small", text: "If you know of two skincare ingredients that should not be used together in the same routine, or pairs that are fine, add them here." }),
      pairList,
      h("button", { type: "button", class: "wide", text: "+ Add a pair", onclick: () => { state.pairs.push({ first: "", second: "", expected: null }); drawPairs(); persist(); } })),
    slot,
    h("div", { class: "counter row" }, counter, h("button", { id: "w-submit", class: "primary", type: "button", text: "Submit sentences", onclick: submit })));
}

// ---------- researcher ----------
function adminView() {
  const token = store.get("sessionStorage", "study.token");
  if (!token) return adminLogin();
  const tabs = [["sessions", "Sessions"], ["results", "Results"], ["cases", "Case sets"]];
  const current = store.get("sessionStorage", "study.tab") || "sessions";
  const body = h("div");
  const bar = h("div", { class: "tabs", role: "tablist" }, tabs.map(([id, label]) =>
    h("button", { type: "button", role: "tab", "aria-selected": String(id === current), text: label, onclick: () => { store.set("sessionStorage", "study.tab", id); adminView(); } })));
  render(
    h("div", { class: "row", style: "justify-content: space-between" }, h("h1", { text: "Researcher" }),
      h("button", { type: "button", text: "Lock", onclick: () => { store.remove("sessionStorage", "study.token"); adminView(); } })),
    bar, body);
  const run = { sessions: adminSessions, results: adminResults, cases: adminCases }[current] || adminSessions;
  run(body, token).catch((error) => {
    if (error.status === 401) { store.remove("sessionStorage", "study.token"); return adminLogin(error.message); }
    showError(body, error);
  });
}

function adminLogin(message) {
  const slot = h("div", {}, message ? notice("error", message) : null);
  if (config && !config.adminEnabled) slot.append(notice("warn", "The researcher page is switched off. Add STUDY_ADMIN_TOKEN (16 or more characters) to .env and restart the server."));
  const input = h("input", { id: "a-token", type: "password", autocomplete: "current-password" });
  const form = h("form", { class: "card", onsubmit: async (event) => {
    event.preventDefault();
    try {
      await api("/api/study/admin/check", { token: input.value.trim() });
      store.set("sessionStorage", "study.token", input.value.trim());
      adminView();
    } catch (error) { showError(slot, error); }
  } }, h("div", { class: "field" }, h("label", { for: "a-token", text: "Researcher token" }), input), slot, h("button", { class: "primary", type: "submit", text: "Open" }));
  render(h("h1", { text: "Researcher" }), h("p", { class: "muted", text: "The token is the STUDY_ADMIN_TOKEN value in .env. It is kept only for this browser tab." }), form);
}

async function adminSessions(body, token) {
  const { participants } = await api("/api/study/admin/participants", { token });
  const selected = store.get("sessionStorage", "study.selected");
  const pick = (code) => { store.set("sessionStorage", "study.selected", code); adminView(); };
  body.replaceChildren(
    h("div", { class: "card" },
      h("h2", { text: `Participants (${participants.length})` }),
      participants.length ? h("div", {}, participants.map((p) => h("div", { class: "person" },
        h("div", {}, h("strong", { text: p.code }), " ", h("span", { text: p.name }),
          h("div", { class: "row small" },
            h("span", { class: p.questionnaire ? "pill" : "pill no", text: p.questionnaire ? "Questionnaire done" : "No questionnaire" }),
            h("span", { class: "muted", text: `Tasks ${p.tasksRecorded}/${config.tasks.length}` }))),
        h("button", { type: "button", "aria-pressed": String(p.code === selected), text: p.code === selected ? "Recording" : "Record tasks", onclick: () => pick(p.code) })))) :
        h("p", { class: "muted", text: "No one yet. Participants start at the Take part page on their phone." }),
      h("div", { class: "row" }, h("button", { type: "button", text: "Refresh", onclick: () => adminView() }))));
  const known = participants.find((p) => p.code === selected);
  if (known) body.append(await taskRecorder(known.code, token), withdrawCard(known.code, token));
}

async function taskRecorder(code, token) {
  const { results } = await api(`/api/study/admin/tasks?code=${encodeURIComponent(code)}`, { token });
  const byTask = Object.fromEntries(results.map((r) => [r.taskId, r]));
  const outcomes = [["success", "Success"], ["helped", "With help"], ["failed", "Failed", "bad"], ["skipped", "Skipped"]];
  const card = h("div", { class: "card" }, h("h2", { text: `Tasks for ${code}` }), h("p", { class: "muted small", text: "Read each task aloud, press Start, and press an outcome when they finish. The time stops and saves on the outcome." }));
  for (const [index, task] of config.tasks.entries()) {
    const saved = byTask[task.id] || {};
    let started = null;
    let elapsed = Number.isFinite(saved.seconds) ? saved.seconds : null;
    let tick = null;
    const clock = h("span", { class: "timer", text: elapsed === null ? "0 s" : `${Math.round(elapsed)} s` });
    const status = h("span", { class: "saved", "aria-live": "polite", text: saved.outcome ? `Saved: ${saved.outcome}` : "" });
    const notes = h("input", { type: "text", maxlength: "500", placeholder: "Notes (optional)", value: saved.notes || "", "aria-label": `Notes for task ${index + 1}` });
    let outcome = saved.outcome || null;
    const startBtn = h("button", { type: "button", text: "Start", onclick: () => {
      started = Date.now();
      clearInterval(tick);
      tick = setInterval(() => { clock.textContent = `${Math.round((Date.now() - started) / 1000)} s`; }, 500);
      startBtn.textContent = "Restart";
    } });
    const save = async () => {
      if (started) { elapsed = (Date.now() - started) / 1000; started = null; clearInterval(tick); clock.textContent = `${Math.round(elapsed)} s`; }
      if (!outcome) { status.textContent = "Choose an outcome first"; return; }
      try {
        await api("/api/study/admin/task", { method: "POST", token, body: { code, taskId: task.id, outcome, seconds: outcome === "skipped" ? null : elapsed, notes: notes.value } });
        status.textContent = `Saved: ${outcome}`;
      } catch (error) { status.textContent = error.message; }
    };
    const seg = h("div", { class: "seg", role: "group", "aria-label": `Outcome for task ${index + 1}` }, outcomes.map(([value, label, cls]) =>
      h("button", { type: "button", class: cls || "", "aria-pressed": String(outcome === value), text: label, onclick: (e) => {
        outcome = value;
        seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
        save();
      } })));
    notes.addEventListener("change", () => { if (outcome) save(); });
    card.append(h("div", { class: "task" },
      h("h3", { text: `${index + 1}. ${task.text}` }),
      h("p", { class: "muted small", text: `Counts as success: ${task.success}` }),
      h("div", { class: "row" }, startBtn, clock, status),
      h("div", { class: "field", style: "margin-top: 8px" }, seg),
      notes));
  }
  return card;
}

function withdrawCard(code, token) {
  const slot = h("div");
  const input = h("input", { id: "wd", type: "text", placeholder: code, autocapitalize: "characters", maxlength: "4" });
  return h("div", { class: "card soft" },
    h("h2", { text: "Withdraw this participant" }),
    h("p", { class: "muted small", text: "Deletes their consent record, tasks and questionnaire for good. Type the code to confirm." }),
    h("div", { class: "field" }, h("label", { for: "wd", text: `Type ${code} to confirm` }), input),
    slot,
    h("button", { type: "button", class: "danger", text: "Delete all their data", onclick: async () => {
      try {
        await api("/api/study/admin/withdraw", { method: "POST", token, body: { code, confirm: input.value } });
        store.remove("sessionStorage", "study.selected");
        adminView();
      } catch (error) { showError(slot, error); }
    } }));
}

async function adminResults(body, token) {
  const s = await api("/api/study/admin/summary", { token });
  const stat = (value, label) => h("div", { class: "stat" }, h("b", { text: value ?? "–" }), h("span", { text: label }));
  const download = (kind) => h("button", { type: "button", text: kind === "responses" ? "Questionnaire CSV" : "Tasks CSV", onclick: async () => saveBlob(await api(`/api/study/admin/export?kind=${kind}`, { token })) });
  const label = { dry: "Dry", combination: "Combination", oily: "Oily", sensitive: "Sensitive", "not-sure": "Not sure", never: "Never", rarely: "Rarely", monthly: "Monthly", weekly: "Weekly", daily: "Daily" };
  body.replaceChildren(
    h("div", { class: "card" },
      h("h2", { text: "Usability (SUS)" }),
      h("div", { class: "stats" },
        stat(s.sus.n, "questionnaires"),
        stat(s.sus.mean, "mean score (0 to 100)"),
        stat(s.sus.sd, "standard deviation"),
        stat(s.sus.median, "median"),
        stat(s.sus.n ? `${s.sus.min} to ${s.sus.max}` : null, "range"),
        stat(s.sus.adjective, "closest adjective")),
      h("p", { class: "muted small", text: s.sus.n ? `${s.sus.aboveBenchmark} of ${s.sus.n} scored above the average of ${s.sus.benchmark}. Adjective from Bangor, Kortum and Miller (2009). With fewer than about 12 people, report the mean with care.` : "No questionnaires yet." })),
    h("div", { class: "card" },
      h("h2", { text: "Task results" }),
      h("p", { class: "muted small", text: "Done = success without help. Rate = done ÷ tried (skipped tasks left out). Time = median seconds, failed attempts left out." }),
      tableWrap("Task results", h("table", {},
        h("thead", {}, h("tr", {}, ["Task", "Tried", "Done", "Help", "Failed", "Rate", "Time"].map((t, i) => h("th", { class: i ? "num" : "", text: t })))),
        h("tbody", {}, s.tasks.map((t, i) => h("tr", {},
          h("td", { title: t.text, text: `${i + 1}. ${t.short}` }),
          h("td", { class: "num", text: t.attempts }), h("td", { class: "num", text: t.success }), h("td", { class: "num", text: t.helped }), h("td", { class: "num", text: t.failed }),
          h("td", { class: "num", text: t.completionRate === null ? "–" : `${t.completionRate}%` }),
          h("td", { class: "num", text: t.medianSeconds === null ? "–" : `${t.medianSeconds} s` }))))))),
    h("div", { class: "card" },
      h("h2", { text: "About DermaSynth (items 11 to 17)" }),
      tableWrap("App statements", h("table", {},
        h("thead", {}, h("tr", {}, ["Statement", "Median", "Agree (4 or 5)"].map((t, i) => h("th", { class: i ? "num" : "", text: t })))),
        h("tbody", {}, s.items.map((it, i) => h("tr", {},
          h("td", { text: `${i + 11}. ${it.text}` }),
          h("td", { class: "num", text: it.median ?? "–" }),
          h("td", { class: "num", text: it.agreePercent === null ? "–" : `${it.agreePercent}%` }))))))),
    h("div", { class: "card" },
      h("h2", { text: "Participants" }),
      h("p", { text: `Consented: ${s.participants}. Questionnaires: ${s.questionnaires}. Asked a chatbot before: ${s.profile.askedChatbot}. Used on more than one day: ${s.profile.multiDay}.` }),
      h("p", { class: "small", text: `Skin type: ${Object.entries(s.profile.skinType).filter(([, n]) => n).map(([k, n]) => `${label[k]} ${n}`).join(", ") || "none yet"}.` }),
      h("p", { class: "small", text: `Skincare app use: ${Object.entries(s.profile.appUse).filter(([, n]) => n).map(([k, n]) => `${label[k]} ${n}`).join(", ") || "none yet"}.` })),
    h("div", { class: "card" },
      h("h2", { text: "Comments" }),
      s.comments.length ? h("div", {}, s.comments.map((c) => h("div", { class: "task" },
        h("strong", { text: c.code }),
        c.mostUseful ? h("p", {}, h("span", { class: "muted", text: "Most useful: " }), c.mostUseful) : null,
        c.confusing ? h("p", {}, h("span", { class: "muted", text: "Confusing: " }), c.confusing) : null))) : h("p", { class: "muted", text: "No comments yet." })),
    h("div", { class: "card soft" },
      h("h2", { text: "For your acknowledgements" }),
      h("p", { text: s.acknowledgements.length ? s.acknowledgements.join(", ") : "No one has opted in yet." }),
      h("p", { class: "muted small", text: "Only people who ticked the optional box are listed." })),
    h("div", { class: "card" },
      h("h2", { text: "Export for analysis" }),
      h("p", { class: "muted small", text: "Exports use participant codes only, never names." }),
      h("div", { class: "row" }, download("responses"), download("tasks"), h("button", { type: "button", text: "Print / save PDF", onclick: () => window.print() }))));
}

async function adminCases(body, token) {
  const s = await api("/api/study/admin/summary", { token });
  const slot = h("div");
  body.replaceChildren(h("div", { class: "card" },
    h("h2", { text: "Independent case sets" }),
    h("p", { class: "muted small" }, "Send the case writer to ", h("strong", { text: "/study#cases" }), ". Each submission is stored unchanged with a fingerprint (sha256)."),
    s.caseSets.length ? h("div", {}, s.caseSets.map((set) => {
      const overwrite = h("input", { type: "checkbox" });
      return h("div", { class: "task" },
        h("h3", { text: `Set ${set.id}: ${set.author}${set.role ? `, ${set.role}` : ""}` }),
        h("p", { class: "muted small", text: `${set.cases} sentences, ${set.pairs} pairs, ${set.submittedAt.slice(0, 16).replace("T", " ")}. sha256 ${set.sha256.slice(0, 12)}…` }),
        h("div", { class: "row" },
          h("button", { type: "button", text: "Download JSON", onclick: async () => saveBlob(await api(`/api/study/admin/cases?id=${set.id}`, { token })) }),
          h("button", { type: "button", class: "primary", text: "Use for eval:independent", onclick: async () => {
            try {
              const r = await api("/api/study/admin/install-cases", { method: "POST", token, body: { id: set.id, overwrite: overwrite.checked } });
              slot.replaceChildren(notice("ok", `Saved ${r.cases} cases to data/evaluation/independent/cases.json. Now run: ${r.next}`));
            } catch (error) { showError(slot, error); }
          } })),
        h("label", { class: "check" }, overwrite, h("span", { text: "Replace the existing cases.json" })));
    })) : h("p", { class: "muted", text: "No case sets yet." }),
    slot));
}

// ---------- router ----------
const routes = { home: homeView, consent: consentView, questionnaire: questionnaireView, cases: casesView, admin: adminView };
function route() {
  const name = location.hash.replace(/^#/, "") || "home";
  (routes[name] || homeView)();
}

async function start() {
  try {
    config = await api("/api/study/config");
  } catch (error) {
    render(notice("error", `The study server is not reachable. ${error.message}`));
    return;
  }
  window.addEventListener("hashchange", route);
  route();
}
start();
