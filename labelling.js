// Expert labelling tool. Ratings stay in this browser until the rater
// downloads the CSV and sends it to the researcher, who places it in
// data/models/labelling/responses/ and runs `npm run labelling:import`.

const STORAGE_KEY = "dermasynth-labelling-v1";
const state = { scenarios: [], concernLabels: {}, rater: "", ratings: {}, notes: {} };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.rater = String(saved.rater || "");
    state.ratings = saved.ratings && typeof saved.ratings === "object" ? saved.ratings : {};
    state.notes = saved.notes && typeof saved.notes === "object" ? saved.notes : {};
  } catch {
    // Storage is optional; the page still works for one session.
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rater: state.rater, ratings: state.ratings, notes: state.notes }));
  } catch {
    // Ignore storage errors (private mode, quota).
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function render() {
  const rows = document.getElementById("rows");
  rows.innerHTML = state.scenarios.map((s) => {
    const current = Number(state.ratings[s.scenario_id]) || 0;
    const buttons = [1, 2, 3, 4, 5].map((n) => `<button type="button" data-id="${escapeHtml(s.scenario_id)}" data-rating="${n}" aria-pressed="${current === n}" aria-label="Rate ${n}">${n}</button>`).join("");
    return `<div class="row"><span class="id">${escapeHtml(s.scenario_id)}</span><div><div class="context">${escapeHtml(state.concernLabels[s.concern] || s.concern)}</div><div class="readings">UV index ${escapeHtml(s.uvi)} · humidity ${escapeHtml(s.humidity)}% · PM2.5 ${escapeHtml(s.pm25)} µg/m³ · ${escapeHtml(s.temperature)} °C</div></div><div class="ratings">${buttons}</div><div class="note"><input type="text" maxlength="200" placeholder="Optional note" data-note="${escapeHtml(s.scenario_id)}" value="${escapeHtml(state.notes[s.scenario_id] || "")}" /></div></div>`;
  }).join("");
  status();
}

function status() {
  const done = state.scenarios.filter((s) => state.ratings[s.scenario_id]).length;
  const total = state.scenarios.length;
  const el = document.getElementById("status");
  const raterOk = /^[A-Za-z0-9_-]{1,24}$/.test(state.rater);
  el.textContent = `${done} of ${total} rated${raterOk ? "" : " · enter a rater ID (letters, numbers, - or _)"}`;
  el.classList.toggle("warn", !raterOk);
  document.getElementById("export").disabled = !(raterOk && done === total && total > 0);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportCsv() {
  const header = ["scenario_id", "concern", "uvi", "humidity", "pm25", "temperature", "rater_id", "rating_1_to_5", "note"];
  const lines = [header.join(",")].concat(state.scenarios.map((s) => [s.scenario_id, s.concern, s.uvi, s.humidity, s.pm25, s.temperature, state.rater, state.ratings[s.scenario_id], state.notes[s.scenario_id] || ""].map(csvCell).join(",")));
  const url = URL.createObjectURL(new Blob([`${lines.join("\n")}\n`], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `labels-${state.rater}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-rating]");
  if (button) {
    state.ratings[button.dataset.id] = Number(button.dataset.rating);
    save();
    for (const sibling of button.parentElement.querySelectorAll("button")) sibling.setAttribute("aria-pressed", String(sibling === button));
    status();
    return;
  }
  if (event.target.id === "export") exportCsv();
  if (event.target.id === "clear" && window.confirm("Clear all ratings stored in this browser?")) {
    state.ratings = {};
    state.notes = {};
    save();
    render();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "rater") {
    state.rater = event.target.value.trim();
    save();
    status();
  } else if (event.target.dataset.note) {
    state.notes[event.target.dataset.note] = event.target.value;
    save();
  }
});

load();
document.getElementById("rater").value = state.rater;
try {
  const response = await fetch("/api/labelling/scenarios");
  if (!response.ok) throw new Error("unavailable");
  const payload = await response.json();
  state.scenarios = payload.scenarios || [];
  state.concernLabels = payload.concernLabels || {};
  render();
} catch {
  document.getElementById("rows").innerHTML = "<p>The scenario sheet could not be loaded. Run <code>npm run labelling:sheet</code> and restart the server.</p>";
}
