// Guided study mode. Shows one task at a time in a small card, detects when it
// is done, times it, and saves the result. It runs once a participant has
// started the tasks from /study. Before that, when the server runs with
// STUDY_MODE=on (or the link has ?study), the app shows an invitation card that
// leads to consent. Otherwise it does nothing.

const KEY = "study.guide";
const QUEUE = "study.guide.queue";
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

let guide = read(KEY);
if (guide?.active && guide.code && guide.key) start();
else if (!guide) invite();

async function invite() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("study")) { window.location.replace("/study#consent"); return; }
  let dismissed = false;
  try { dismissed = sessionStorage.getItem("study.invite.dismissed") === "1"; } catch { /* storage unavailable */ }
  if (dismissed) return;
  let config;
  try { config = await (await fetch("/api/study/config")).json(); } catch { return; }
  if (!config?.studyMode) return;
  injectStyles();
  const card = document.createElement("section");
  card.id = "study-guide";
  card.setAttribute("aria-label", "User study");
  const title = document.createElement("p"); title.className = "sg-step"; title.textContent = "User study";
  const text = document.createElement("p"); text.className = "sg-text"; text.textContent = `Help test DermaSynth: ${config.tasks?.length || 7} short tasks on your phone, then a short questionnaire (about 20 minutes).`;
  const go = document.createElement("a"); go.className = "sg-primary"; go.href = "/study#consent"; go.textContent = "Take part";
  const no = document.createElement("button"); no.type = "button"; no.className = "sg-secondary"; no.textContent = "Not now";
  no.addEventListener("click", () => { try { sessionStorage.setItem("study.invite.dismissed", "1"); } catch { /* ignore */ } card.remove(); document.body.classList.remove("has-study-guide"); });
  const actions = document.createElement("div"); actions.className = "sg-actions"; actions.append(go, no);
  card.append(title, text, actions);
  document.body.append(card);
  document.body.classList.add("has-study-guide");
  const place = () => {
    const nav = document.querySelector(".mobile-nav");
    const box = nav ? nav.getBoundingClientRect() : null;
    const navH = box && box.height > 0 && getComputedStyle(nav).display !== "none" ? window.innerHeight - box.top : 0;
    card.style.bottom = `${Math.round(navH + 10)}px`;
    document.documentElement.style.setProperty("--study-guide-h", `${card.offsetHeight || 0}px`);
  };
  place();
  const timer = setInterval(() => { if (!card.isConnected) clearInterval(timer); else place(); }, 800);
}

async function start() {
  let tasks;
  try {
    tasks = (await (await fetch("/api/study/config")).json()).tasks;
  } catch {
    return; // study server not reachable: leave the app untouched
  }
  if (!Array.isArray(tasks) || !tasks.length) return;

  injectStyles();
  const card = document.createElement("section");
  card.id = "study-guide";
  card.setAttribute("aria-label", "Study tasks");
  document.body.append(card);
  document.body.classList.add("has-study-guide");

  let storyClicked = false;
  let finishing = false;

  document.addEventListener("click", (event) => {
    if (event.target.closest?.('[data-action="story-download"], [data-action="story-share"]')) storyClicked = true;
  }, true);

  const current = () => tasks[guide.index];
  const save = () => write(KEY, guide);
  const elapsed = () => Math.max(0, Math.round((Date.now() - (guide.taskStartedAt || Date.now())) / 1000));
  if (!guide.taskStartedAt) { guide.taskStartedAt = Date.now(); save(); }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    node.append(...children.filter(Boolean));
    return node;
  }

  async function flush() {
    const queue = read(QUEUE) || [];
    const left = [];
    for (const item of queue) {
      try {
        const res = await fetch("/api/study/task", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item) });
        if (!res.ok && res.status >= 500) left.push(item);
      } catch { left.push(item); }
    }
    write(QUEUE, left);
  }

  async function record(outcome, notes = "") {
    const task = current();
    const queue = read(QUEUE) || [];
    queue.push({ code: guide.code, key: guide.key, taskId: task.id, outcome, seconds: outcome === "skipped" ? null : elapsed(), notes });
    write(QUEUE, queue);
    await flush();
  }

  async function complete(outcome, notes, message) {
    if (finishing) return;
    finishing = true;
    await record(outcome, notes);
    render(message || "Done, thank you.");
    setTimeout(() => {
      guide.index += 1;
      guide.hinted = false;
      guide.taskStartedAt = Date.now();
      save();
      storyClicked = false;
      finishing = false;
      render();
    }, 1400);
  }

  function sunAnswerOk(answer) {
    const text = document.body.innerText || "";
    const window = /Matters most from ([^.\n]+?) today/i.exec(text)?.[1] || "";
    const numbers = window.match(/\d+/g) || [];
    const sun = /sun ?screen|sun ?block|spf|sun protection|protect/i.test(answer);
    const time = numbers.length ? numbers.some((n) => new RegExp(`\\b${n}\\b`).test(answer)) : true;
    return { ok: sun && time, window };
  }

  // Tomorrow: the answer should share at least one meaningful word with what the Tomorrow card says.
  function tomorrowAnswerOk(answer) {
    const cardText = [...document.querySelectorAll(".tomorrow-card")].map((n) => n.innerText).join(" ").toLowerCase();
    const stop = new Set(["the", "and", "for", "but", "not", "are", "was", "use", "get", "can", "one", "its", "you", "any", "all", "tomorrow", "today", "your", "with", "that", "this", "will", "from", "have", "than", "more", "less", "still", "needed", "likely", "because", "skip", "routine", "skin", "weather", "data"]);
    const words = (answer.toLowerCase().match(/[a-z0-9.]{3,}/g) || []).filter((w) => !stop.has(w));
    const hit = words.find((w) => cardText.includes(w));
    return { ok: Boolean(cardText && hit), window: cardText ? `tomorrow card mentions "${hit || "none of the answer's words"}"` : "no Tomorrow card on screen" };
  }

  function detected(task) {
    switch (task.check) {
      case "routine": return Boolean(document.querySelector(".consumer-step")) && !document.querySelector(".clinical-redirect");
      case "why": return Boolean(document.querySelector('[data-action="toggle-why"][aria-expanded="true"]'));
      case "product": return Boolean(document.querySelector(".pc-verdict"));
      case "story": return storyClicked;
      case "redirect": return Boolean(document.querySelector(".clinical-redirect"));
      default: return false;
    }
  }

  function render(status = "") {
    const task = current();
    card.replaceChildren();
    if (!task) {
      card.append(
        el("p", { class: "sg-step", text: `All ${tasks.length} tasks done` }),
        el("p", { class: "sg-text", text: "Thank you! Last step: a short questionnaire about using the app (about 5 minutes)." }),
        el("div", { class: "sg-actions" }, el("a", { class: "sg-primary", href: "/study#questionnaire", onclick: () => { guide.active = false; save(); }, text: "Open the questionnaire" })),
      );
      return;
    }
    if (guide.minimised) {
      card.append(el("button", { type: "button", class: "sg-pill", "aria-expanded": "false", onclick: () => { guide.minimised = false; save(); render(); }, text: `Task ${guide.index + 1} of ${tasks.length} · Show` }));
      return;
    }
    const isAnswer = /answer$/.test(task.check);
    const add = (...nodes) => card.append(...nodes.filter(Boolean));
    const answerBox = isAnswer ? el("textarea", { class: "sg-answer", rows: "2", "aria-label": "Your answer", placeholder: task.question || "Type your answer" }) : null;
    add(
      el("div", { class: "sg-head" },
        el("p", { class: "sg-step", text: `Task ${guide.index + 1} of ${tasks.length}` }),
        el("button", { type: "button", class: "sg-min", "aria-expanded": "true", onclick: () => { guide.minimised = true; save(); render(); }, text: "Hide" })),
      el("p", { class: "sg-text", text: task.text }),
      guide.hinted ? el("p", { class: "sg-hint", text: `Hint: ${task.hint}` }) : null,
      answerBox,
      el("div", { class: "sg-actions" },
        isAnswer
          ? el("button", { type: "button", class: "sg-primary", onclick: () => {
            const answer = answerBox.value.trim();
            if (answer.length < 3) { render("Please type your answer first."); return; }
            const check = task.check === "sun-answer" ? sunAnswerOk(answer) : tomorrowAnswerOk(answer);
            const label = task.check === "sun-answer" ? "app window" : "check";
            complete(check.ok ? (guide.hinted ? "helped" : "success") : "failed", `answer: ${answer}${check.window ? ` | ${label}: ${check.window}` : ""}${check.ok ? "" : " | did not match, review"}`, "Answer saved, thank you.");
          }, text: "Submit answer" })
          : el("button", { type: "button", class: "sg-primary", onclick: () => complete(guide.hinted ? "helped" : "success", "self-reported: pressed I've done it (not detected)"), text: "I've done it" }),
        el("button", { type: "button", class: "sg-secondary", onclick: () => {
          if (!guide.hinted) { guide.hinted = true; save(); render(); return; }
          complete("failed", "gave up after the hint", "Skipped. No problem, on to the next one.");
        }, text: guide.hinted ? "Skip this task" : "I'm stuck" })),
      el("p", { class: "sg-status", role: "status", text: status }),
    );
  }

  function tick() {
    // Keep the card above the phone's bottom navigation, and out of the way of dialogs.
    const nav = document.querySelector(".mobile-nav");
    const navBox = nav ? nav.getBoundingClientRect() : null;
    const navH = navBox && navBox.height > 0 && getComputedStyle(nav).display !== "none" ? window.innerHeight - navBox.top : 0;
    card.style.bottom = `${Math.round(navH + 10)}px`;
    card.hidden = Boolean(document.querySelector("#story-modal, [role='dialog'][aria-modal='true']"));
    document.documentElement.style.setProperty("--study-guide-h", `${card.offsetHeight || 0}px`);

    const task = current();
    if (!task || finishing) return;
    if (detected(task)) complete(guide.hinted ? "helped" : "success", "detected by the app");
  }

  render();
  flush();
  setInterval(tick, 400);
}

function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
  #study-guide { position: fixed; left: 10px; right: 10px; bottom: 16px; z-index: 60; max-width: 520px; margin: 0 auto;
    background: #ffffff; color: #132927; border: 2px solid #287c70; border-radius: 16px; padding: 10px 12px;
    box-shadow: 0 10px 30px rgb(9 67 58 / 22%); font-size: 16px; line-height: 1.4; }
  #study-guide[hidden] { display: none; }
  #study-guide p { margin: 0 0 8px; }
  #study-guide .sg-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 2px; }
  #study-guide .sg-step { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #145a51; margin: 0; }
  #study-guide .sg-text { font-weight: 600; font-size: 15px; }
  #study-guide .sg-hint { background: #fff1df; color: #5e3608; border-radius: 10px; padding: 8px 10px; font-size: 15px; }
  #study-guide .sg-answer { width: 100%; box-sizing: border-box; min-height: 64px; font: inherit; font-size: 16px; padding: 8px 10px; border: 1px solid #bfd7cf; border-radius: 10px; margin-bottom: 8px; }
  #study-guide .sg-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  #study-guide button, #study-guide a.sg-primary { min-height: 44px; padding: 10px 14px; border-radius: 10px; font: inherit; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  #study-guide .sg-primary { background: #287c70; color: #fff; border: 1px solid #287c70; flex: 1 1 auto; }
  #study-guide .sg-secondary { background: #fff; color: #145a51; border: 1px solid #bfd7cf; }
  #study-guide .sg-min { background: transparent; border: 0; color: #145a51; min-height: 44px; padding: 0 6px; font-size: 14px; }
  #study-guide .sg-pill { width: 100%; background: #287c70; color: #fff; border: 0; }
  #study-guide .sg-status { margin: 6px 0 0; min-height: 0; color: #145a51; font-weight: 600; font-size: 15px; }
  #study-guide .sg-status:empty { display: none; }
  #study-guide button:focus-visible, #study-guide a:focus-visible, #study-guide textarea:focus-visible { outline: 3px solid #287c70; outline-offset: 2px; }
  body.has-study-guide { padding-bottom: calc(var(--study-guide-h, 0px) + 24px); }
  @media (prefers-reduced-motion: no-preference) { #study-guide { transition: bottom 0.2s ease; } }`;
  document.head.append(style);
}
