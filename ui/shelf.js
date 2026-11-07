// My shelf: the user's products, label scanning, the shelf scene and which product fits each step.

import { currentStepKeys } from "./result.js";
import {
  navigateView,
  prefersReducedMotion,
  render,
  renderAnimated,
  scheduleRender,
  shell,
  showToast,
} from "./shell.js";
import { readStore, state, writeStore } from "./state.js";
import { escapeHtml, icon, titleCase } from "./util.js";

// ---- My shelf: the products the user owns, on a real-looking shelf ---------
export const SHELF_KEY = "dermasynth.shelf.v1";

export const SHELF_MAX = 20;

export const SHELF_TYPES = [
  ["cleanser", "Cleanser"],
  ["toner", "Toner or essence"],
  ["serum", "Serum"],
  ["moisturiser", "Moisturiser"],
  ["sunscreen", "Sunscreen"],
  ["exfoliant", "Exfoliant"],
  ["mask", "Mask"],
  ["oil", "Face oil"],
  ["other", "Other"],
];

// Soft label colours that sit well on the cream shelf: [body, ink].
export const SHELF_COLOURS = [
  ["#dcebdc", "#2f7a57"],
  ["#f3dfd6", "#a65a3f"],
  ["#efe3c4", "#8a6418"],
  ["#dbe6ef", "#3d6a8a"],
  ["#e7def0", "#6c5a8a"],
  ["#f7f3ea", "#56645b"],
  ["#e8d7b8", "#7a5a2a"],
];

export const STEP_TO_TYPE = {
  "low-irritation-cleansing": "cleanser",
  "daytime-photoprotection": "sunscreen",
  "texture-renewal": "exfoliant",
  "antioxidant-context": "serum",
  "comfort-hydration": "serum",
  "light-hydration": "toner",
  "supportive-hydration": "serum",
  "barrier-support-moisturising": "moisturiser",
  "lightweight-moisturising": "moisturiser",
  "supportive-moisturising": "moisturiser",
  "overnight-comfort": "moisturiser",
};

export function loadShelf() {
  const list = readStore(SHELF_KEY, []);
  return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string" && p.name).slice(0, SHELF_MAX) : [];
}

export function saveShelf() {
  writeStore(SHELF_KEY, state.shelf);
}

export function shelfProduct(id) {
  return state.shelf.find((p) => p.id === id) || null;
}

export function shelfTypeLabel(type) {
  return (SHELF_TYPES.find(([id]) => id === type) || SHELF_TYPES[SHELF_TYPES.length - 1])[1];
}

export function shelfDisplayName(p) {
  return [p.brand, p.name].filter(Boolean).join(" ");
}

export function shelfColour(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SHELF_COLOURS[h % SHELF_COLOURS.length];
}

export function bottleSvg(type, id, size = 64) {
  const [body, ink] = shelfColour(id);
  const h = Math.round(size * 1.55);
  const gloss = `<rect x="18" y="40" width="4" height="40" rx="2" fill="#fff" opacity=".45"/>`;
  const label = (y, height) =>
    `<rect x="17" y="${y}" width="26" height="${height}" rx="3" fill="#fffdf7" opacity=".9"/><rect x="21" y="${y + 5}" width="18" height="2.4" rx="1.2" fill="${ink}" opacity=".85"/><rect x="21" y="${y + 10}" width="12" height="2" rx="1" fill="${ink}" opacity=".45"/>`;
  const shapes = {
    cleanser: `<rect x="14" y="36" width="32" height="58" rx="9" fill="${body}" stroke="${ink}" stroke-opacity=".25"/><rect x="25" y="27" width="10" height="10" rx="2" fill="${ink}"/><rect x="28" y="17" width="4" height="11" fill="${ink}"/><rect x="21" y="12" width="18" height="6" rx="2" fill="${ink}"/><rect x="37" y="12" width="13" height="4" rx="2" fill="${ink}"/>${label(52, 22)}${gloss}`,
    toner: `<path d="M17 38c0-6 5-9 13-9s13 3 13 9v54a2 2 0 0 1-2 2H19a2 2 0 0 1-2-2Z" fill="${body}" stroke="${ink}" stroke-opacity=".25"/><rect x="23" y="12" width="14" height="18" rx="3" fill="${ink}"/>${label(50, 24)}${gloss}`,
    serum: `<rect x="15" y="46" width="30" height="48" rx="10" fill="${body}" stroke="${ink}" stroke-opacity=".25"/><rect x="23" y="38" width="14" height="9" rx="2" fill="${ink}"/><ellipse cx="30" cy="25" rx="7" ry="13" fill="${ink}"/>${label(58, 20)}<rect x="19" y="52" width="3.5" height="34" rx="1.75" fill="#fff" opacity=".45"/>`,
    oil: `<rect x="15" y="46" width="30" height="48" rx="10" fill="#d9b06a" stroke="${ink}" stroke-opacity=".25"/><rect x="23" y="38" width="14" height="9" rx="2" fill="${ink}"/><ellipse cx="30" cy="25" rx="7" ry="13" fill="${ink}"/>${label(58, 20)}<rect x="19" y="52" width="3.5" height="34" rx="1.75" fill="#fff" opacity=".45"/>`,
    moisturiser: `<rect x="7" y="60" width="46" height="34" rx="9" fill="${body}" stroke="${ink}" stroke-opacity=".25"/><rect x="5" y="47" width="50" height="15" rx="5" fill="${ink}"/>${label(68, 18)}<rect x="11" y="66" width="3.5" height="22" rx="1.75" fill="#fff" opacity=".45"/>`,
    mask: `<rect x="5" y="66" width="50" height="28" rx="8" fill="${body}" stroke="${ink}" stroke-opacity=".25"/><rect x="3" y="55" width="54" height="13" rx="5" fill="${ink}"/>${label(72, 16)}`,
    sunscreen: `<path d="M15 10h30l-3 62H18Z" fill="${body}" stroke="${ink}" stroke-opacity=".25"/><rect x="15" y="8" width="30" height="5" rx="1.5" fill="${ink}" opacity=".55"/><rect x="18" y="71" width="24" height="23" rx="5" fill="${ink}"/><rect x="20" y="26" width="20" height="26" rx="3" fill="#fffdf7" opacity=".9"/><circle cx="30" cy="34" r="4" fill="#c9a55a"/><rect x="24" y="42" width="12" height="2.4" rx="1.2" fill="${ink}" opacity=".7"/><rect x="19" y="16" width="3.5" height="44" rx="1.75" fill="#fff" opacity=".45"/>`,
    exfoliant: `<path d="M18 34h24v58a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2Z" fill="${body}" stroke="${ink}" stroke-opacity=".25"/><path d="M20 22h20l2 12H18Z" fill="${ink}"/><rect x="26" y="15" width="8" height="8" rx="2" fill="${ink}"/>${label(52, 22)}${gloss}`,
  };
  const shape =
    shapes[type] ||
    `<path d="M18 40c0-5 4-8 12-8s12 3 12 8v52a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2Z" fill="${body}" stroke="${ink}" stroke-opacity=".25"/><rect x="24" y="18" width="12" height="15" rx="3" fill="${ink}"/>${label(50, 24)}${gloss}`;
  return `<svg class="bottle-svg" width="${size}" height="${h}" viewBox="0 0 60 96" aria-hidden="true"><ellipse cx="30" cy="94" rx="20" ry="2.6" fill="#3b2a12" opacity=".18"/>${shape}</svg>`;
}

export function shelfRoutinePayload() {
  const meta = state.routineMeta;
  if (!state.generatedRoutine || !meta || !["cleared", "review_required"].includes(meta.status)) return null;
  const entries = (meta.ingredientCandidates?.entries || []).map((e) => ({
    ingredientId: e.ingredientId,
    displayName: e.displayName,
    phase: e.phase,
    categoryId: e.categoryId,
  }));
  return {
    entries,
    steps: currentStepKeys(),
    concern: state.concern,
    reactivityLevel: meta.routine?.generation?.reactivityLevel || state.reactivityLevel || "low",
  };
}

export function shelfRunKey() {
  const meta = state.routineMeta;
  return `${meta?.requestId || meta?.routineContext?.runId || "none"}|${state.shelf.map((p) => `${p.id}:${p.updatedAt || ""}`).join(",")}`;
}

export let shelfCheckVersion = 0;

export async function refreshShelfCheck({ force = false } = {}) {
  if (!state.shelf.length) {
    state.shelfCheck = null;
    state.shelfCheckStatus = "idle";
    return;
  }
  const key = shelfRunKey();
  if (!force && state.shelfCheck?.key === key) return;
  const version = ++shelfCheckVersion;
  state.shelfCheckStatus = "loading";
  try {
    const routine = shelfRoutinePayload();
    const response = await fetch("/api/shelf/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        products: state.shelf.map((p) => ({ id: p.id, name: shelfDisplayName(p), type: p.type, text: p.text || "" })),
        routine: routine || {},
      }),
    });
    if (!response.ok) throw new Error("The shelf check couldn't run.");
    const data = await response.json();
    if (version !== shelfCheckVersion) return;
    if (!state.shelfCheck || state.shelfCheck.withRoutine !== Boolean(routine) || force)
      state.shelfEnterUntil = Date.now() + 1400;
    state.shelfCheck = { ...data, key, withRoutine: Boolean(routine) };
    state.shelfCheckStatus = "done";
  } catch {
    if (version !== shelfCheckVersion) return;
    state.shelfCheckStatus = "error";
  }
  scheduleRender();
}

export function shelfStepFor(key) {
  const step = state.shelfCheck?.withRoutine ? state.shelfCheck.steps?.find((s) => s.key === key) : null;
  return step?.productId ? { step, product: shelfProduct(step.productId) } : null;
}

export function shelfItemButton(product, { tag = "", today = false, dim = false, index = 0, clash = false } = {}) {
  const selected = state.shelfSelected === product.id;
  return `<li class="shelf-slot" style="--i: ${index}"><button type="button" class="shelf-item ${today ? "is-today" : ""} ${dim ? "is-dim" : ""} ${clash ? "has-clash" : ""} ${selected ? "is-selected" : ""}" data-action="shelf-select" data-id="${escapeHtml(product.id)}" aria-pressed="${selected}" aria-label="${escapeHtml(`${shelfDisplayName(product)}${tag ? `, ${tag}` : ""}${clash ? ", clashes with another product" : ""}`)}"><span class="shelf-bottle">${bottleSvg(product.type, product.id)}</span>${clash ? `<span class="shelf-clash-dot" aria-hidden="true">!</span>` : ""}${tag ? `<span class="shelf-tag">${escapeHtml(tag)}</span>` : ""}<span class="shelf-name">${escapeHtml(shelfDisplayName(product))}</span></button></li>`;
}

export function shelfGapButton(step, index) {
  const type = STEP_TO_TYPE[step.categoryId] || "other";
  return `<li class="shelf-slot" style="--i: ${index}"><button type="button" class="shelf-gap" data-action="shelf-add" data-type="${escapeHtml(type)}"><span class="shelf-gap-outline" aria-hidden="true">+</span><span class="shelf-name">No ${escapeHtml(step.step)} yet</span></button></li>`;
}

export function shelfRow({ title, iconName, note, items }) {
  return `<section class="shelf-row" aria-label="${escapeHtml(title)}"><div class="shelf-row-head"><span>${icon(iconName, 15)} ${escapeHtml(title)}</span>${note ? `<small>${escapeHtml(note)}</small>` : ""}</div><ul class="shelf-items">${items.join("")}</ul><div class="shelf-ledge" aria-hidden="true"></div></section>`;
}

export function shelfScene() {
  const check = state.shelfCheck;
  const clashIds = new Set((check?.clashes || []).flatMap((c) => [c.a, c.b]));
  if (!check?.withRoutine) {
    return shelfRow({
      title: "Your shelf",
      iconName: "layers",
      note: `${state.shelf.length} product${state.shelf.length === 1 ? "" : "s"}`,
      items: state.shelf.map((p, i) => shelfItemButton(p, { index: i, clash: clashIds.has(p.id) })),
    });
  }
  const rows = [];
  let n = 0;
  for (const [phase, title, iconName] of [
    ["am", "Morning", "sun"],
    ["pm", "Evening", "sparkles"],
  ]) {
    const steps = check.steps.filter((s) => s.phase === phase);
    const covered = steps.filter((s) => s.productId).length;
    const items = steps.map((s, i) => {
      const product = s.productId ? shelfProduct(s.productId) : null;
      return product
        ? shelfItemButton(product, {
            tag: `Step ${i + 1} · ${titleCase(s.step)}`,
            today: true,
            index: n++,
            clash: clashIds.has(product.id),
          })
        : shelfGapButton(s, n++);
    });
    rows.push(shelfRow({ title, iconName, note: `${covered} of ${steps.length} from your shelf`, items }));
  }
  const used = new Set(check.steps.map((s) => s.productId).filter(Boolean));
  const rest = state.shelf.filter((p) => !used.has(p.id));
  if (rest.length)
    rows.push(
      shelfRow({
        title: "Not needed today",
        iconName: "layers",
        note: "Rest these today",
        items: rest.map((p) => shelfItemButton(p, { dim: true, index: n++, clash: clashIds.has(p.id) })),
      }),
    );
  return rows.join("");
}

export function shelfDetail() {
  const product = shelfProduct(state.shelfSelected);
  if (!product) return "";
  const info = state.shelfCheck?.products?.find((p) => p.id === product.id) || null;
  const steps = (state.shelfCheck?.withRoutine ? state.shelfCheck.steps : []).filter((s) => s.productId === product.id);
  const clashes = (state.shelfCheck?.clashes || []).filter((c) => c.a === product.id || c.b === product.id);
  const recognised = info?.recognised || [];
  const confirming = state.shelfConfirmRemove === product.id;
  const stepList = steps.length
    ? `<ul class="shelf-detail-list">${steps.map((s) => `<li class="is-good">${icon("check", 14)} <span>${escapeHtml(s.text)}</span></li>`).join("")}</ul>`
    : state.shelfCheck?.withRoutine
      ? `<p class="shelf-detail-muted">Not needed in today's routine.</p>`
      : `<p class="shelf-detail-muted">Build today's routine to see where this fits.</p>`;
  const cautions = [
    ...(info?.cautions || []).map((c) => ({ level: c.level, text: c.text })),
    ...clashes.map((c) => ({ level: "warn", text: c.text })),
    ...(info?.conflicts || []).map((c) => ({ level: "warn", text: c.text })),
  ];
  return `<section class="panel shelf-detail" aria-labelledby="shelf-detail-title"><div class="shelf-detail-head"><span class="shelf-detail-bottle">${bottleSvg(product.type, product.id, 78)}</span><div><p class="shelf-detail-kicker">${escapeHtml(shelfTypeLabel(product.type))}</p><h3 id="shelf-detail-title">${escapeHtml(shelfDisplayName(product))}</h3>${info?.verdict && state.shelfCheck?.withRoutine ? `<p class="shelf-detail-verdict">${escapeHtml(info.verdict)}</p>` : ""}</div><button type="button" class="icon-button" data-action="shelf-close" aria-label="Close product details">${icon("close", 16)}</button></div>
  <div class="shelf-detail-body"><h4>Today</h4>${stepList}${cautions.length ? `<h4>Good to know</h4><ul class="shelf-detail-list">${cautions.map((c) => `<li class="is-${escapeHtml(c.level)}">${icon(c.level === "info" ? "info" : "shield", 14)} <span>${escapeHtml(c.text)}</span></li>`).join("")}</ul>` : ""}
  <h4>Ingredients DermaSynth knows</h4>${
    recognised.length
      ? `<div class="shelf-chips">${recognised
          .slice(0, 14)
          .map((r) => `<span>${escapeHtml(r.name)}</span>`)
          .join("")}</div>`
      : `<p class="shelf-detail-muted">${product.text ? "None of its ingredients are in DermaSynth's records yet." : "Add the ingredient list so DermaSynth can check it."}</p>`
  }${info?.note ? `<p class="shelf-detail-muted">${escapeHtml(info.note)}</p>` : ""}</div>
  <div class="shelf-detail-actions"><button type="button" class="ghost-button" data-action="shelf-edit" data-id="${escapeHtml(product.id)}">${icon("sliders", 14)} Edit</button><button type="button" class="shelf-remove ${confirming ? "is-confirming" : ""}" data-action="shelf-remove" data-id="${escapeHtml(product.id)}">${icon("close", 14)} ${confirming ? "Tap again to remove" : "Remove from shelf"}</button></div></section>`;
}

export function shelfEditor() {
  const ed = state.shelfEditor;
  if (!ed) return "";
  const d = ed.draft;
  const scanning = ed.scanStatus === "scanning";
  return `<section class="panel shelf-editor" aria-labelledby="shelf-editor-title"><div class="panel-header"><h3 class="panel-title" id="shelf-editor-title">${icon("layers", 17)} ${ed.mode === "edit" ? "Edit product" : "Add a product"}</h3><p class="panel-note">Saved only in this browser</p></div>
  <div class="shelf-scan ${scanning ? "is-busy" : ""}"><span class="shelf-scan-icon" aria-hidden="true">${scanning ? `<span class="shelf-scan-spinner"></span>` : icon("upload", 20)}</span><div class="shelf-scan-copy"><strong>${scanning ? "Reading the label…" : "Scan the ingredient list"}</strong><span>Take a clear photo of the back of the product. The AI only copies the text, the photo isn't stored, and you check it before saving.</span></div><label class="primary-button shelf-scan-button" for="shelf-scan-input">${scanning ? "Reading…" : "Take or choose a photo"}</label><input id="shelf-scan-input" class="sr-only" type="file" accept="image/*" capture="environment" data-action="shelf-scan" ${scanning ? "disabled" : ""} /></div>${ed.scanMessage ? `<p class="shelf-scan-msg ${ed.scanStatus === "error" ? "is-error" : ""}" role="status">${icon(ed.scanStatus === "error" ? "info" : "check", 14)} <span>${escapeHtml(ed.scanMessage)}</span></p>` : ""}<p class="shelf-or" aria-hidden="true"><span>or type it in</span></p>
  <div class="form-grid shelf-form"><div class="field"><label for="shelf-name">Product name</label><input id="shelf-name" type="text" maxlength="60" autocomplete="off" data-action="shelf-field" data-field="name" value="${escapeHtml(d.name)}" placeholder="e.g. Hydrating Gel Cleanser" /></div>
  <div class="field"><label for="shelf-brand">Brand (optional)</label><input id="shelf-brand" type="text" maxlength="40" autocomplete="off" data-action="shelf-field" data-field="brand" value="${escapeHtml(d.brand)}" /></div>
  <fieldset class="field shelf-type-field"><legend>Type</legend><div class="shelf-type-chips">${SHELF_TYPES.map(([id, label]) => `<button type="button" class="shelf-type-chip ${d.type === id ? "is-selected" : ""}" data-action="shelf-type" data-value="${id}" aria-pressed="${d.type === id}"><span class="shelf-type-art" aria-hidden="true">${bottleSvg(id, `type-${id}`, 22)}</span><span>${escapeHtml(label)}</span></button>`).join("")}</div></fieldset>
  <div class="field shelf-text-field"><label for="shelf-text">Ingredient list</label><textarea id="shelf-text" maxlength="4000" data-action="shelf-field" data-field="text" placeholder="Aqua, Glycerin, Niacinamide, …">${escapeHtml(d.text)}</textarea><p class="field-help">Copy it from the label or the brand's website. Without it, DermaSynth can only place the product by its type.</p></div></div>
  ${ed.error ? `<p class="shelf-scan-msg is-error" role="alert">${escapeHtml(ed.error)}</p>` : ""}
  <div class="form-actions"><button type="button" class="primary-button" data-action="shelf-save">${icon("check", 15)} ${ed.mode === "edit" ? "Save changes" : "Put it on my shelf"}</button><button type="button" class="ghost-button" data-action="shelf-cancel">Cancel</button></div></section>`;
}

export function shelfView() {
  const check = state.shelfCheck;
  const hasRoutine = Boolean(shelfRoutinePayload());
  const gaps = check?.withRoutine ? check.gaps.length : 0;
  const clashes = check?.clashes || [];
  const intro = !state.shelf.length
    ? `<section class="panel shelf-empty"><div class="shelf-empty-art" aria-hidden="true">${bottleSvg("cleanser", "a1", 46)}${bottleSvg("serum", "b2", 46)}${bottleSvg("moisturiser", "c3", 46)}${bottleSvg("sunscreen", "d4", 46)}</div><h3>Your shelf is empty</h3><p>Add the products you already own. DermaSynth will line up the ones to use for today's routine, warn you about any that clash, and show the steps you have nothing for.</p><button type="button" class="primary-button" data-action="shelf-add">${icon("upload", 15)} Add your first product</button></section>`
    : "";
  const status =
    state.shelfCheckStatus === "loading" && !check
      ? `<p class="shelf-status" role="status">${icon("sparkles", 13)} <span class="shimmer-text">Checking your products…</span></p>`
      : state.shelfCheckStatus === "error"
        ? `<p class="shelf-status is-error" role="status">${icon("info", 13)} The shelf check couldn't run. Your products are still saved.</p>`
        : "";
  const summary = state.shelf.length
    ? `<div class="shelf-summary">${hasRoutine ? `<span>${icon("check", 14)} ${check?.withRoutine ? `${check.steps.length - gaps} of ${check.steps.length} steps covered today` : "Matching to today's routine…"}</span>` : `<span>${icon("info", 14)} Build today's routine to see which products to use.</span><button type="button" class="text-button" data-action="navigate" data-view="simulator">Build it</button>`}${clashes.length ? `<span class="is-warn">${icon("shield", 14)} ${clashes.length} pair${clashes.length === 1 ? "" : "s"} shouldn't be layered</span>` : ""}</div>`
    : "";
  return shell(
    `<div class="view-heading"><div><h2>Your products, lined up for today</h2><p>${state.shelf.length ? `${state.shelf.length} of ${SHELF_MAX} spaces used. Tap a product to see where it fits.` : "Everything stays in this browser."}</p></div>${state.shelf.length && state.shelf.length < SHELF_MAX && !state.shelfEditor ? `<button type="button" class="primary-button" data-action="shelf-add">${icon("upload", 15)} Add product</button>` : ""}</div>${shelfEditor()}${intro}${state.shelf.length ? `${summary}${status}<div class="shelf-scene ${(state.shelfEnterUntil || 0) > Date.now() ? "is-entering" : ""}">${shelfScene()}</div>${shelfDetail()}` : ""}`,
  );
}

export function shelfTodayCard(meta) {
  if (!meta || meta.status !== "cleared") return "";
  if (!state.shelf.length)
    return `<section class="shelf-today-card"><div class="shelf-today-art" aria-hidden="true">${bottleSvg("serum", "x1", 34)}${bottleSvg("sunscreen", "x2", 34)}</div><div><p class="shelf-today-title">Use what you already own</p><p>Add your products to your shelf and DermaSynth will pick the right one for each step.</p></div><button type="button" class="ghost-button" data-action="navigate" data-view="shelf">Open my shelf</button></section>`;
  const check = state.shelfCheck;
  if (!check?.withRoutine) return "";
  const missing = check.steps.filter((s) => !s.productId).map((s) => s.step);
  const covered = check.steps.length - missing.length;
  return `<section class="shelf-today-card"><div class="shelf-today-art" aria-hidden="true">${check.steps
    .filter((s) => s.productId)
    .slice(0, 3)
    .map((s) => {
      const p = shelfProduct(s.productId);
      return p ? bottleSvg(p.type, p.id, 30) : "";
    })
    .join(
      "",
    )}</div><div><p class="shelf-today-title">Your shelf covers ${covered} of ${check.steps.length} steps today</p>${missing.length ? `<p>Nothing yet for: ${escapeHtml([...new Set(missing)].join(", "))}.</p>` : `<p>Everything today comes from products you own.</p>`}${check.clashes?.length ? `<p class="is-warn">${icon("shield", 13)} ${check.clashes.length} pair${check.clashes.length === 1 ? "" : "s"} on your shelf shouldn't be layered.</p>` : ""}</div><button type="button" class="ghost-button" data-action="navigate" data-view="shelf">Open my shelf</button></section>`;
}

export async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("That file isn't a photo DermaSynth can read. Try a JPEG or PNG."));
      image.src = url;
    });
    let max = 1600,
      quality = 0.85;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length < 2_700_000) return data;
      max *= 0.8;
      quality -= 0.08;
    }
    throw new Error("That photo is too large. Try a closer photo of just the ingredient list.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function scanShelfLabel(file) {
  const ed = state.shelfEditor;
  if (!ed || !file) return;
  ed.scanStatus = "scanning";
  ed.scanMessage = "";
  ed.error = "";
  render();
  try {
    const image = await shrinkPhoto(file);
    const response = await fetch("/api/shelf/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(data?.error || "The label couldn't be read. Type or paste the ingredient list instead.");
    if (state.shelfEditor !== ed) return;
    if (data.error) throw new Error(data.error);
    const d = ed.draft;
    if (data.name && !d.name) d.name = data.name;
    if (data.brand && !d.brand) d.brand = data.brand;
    if (data.type && data.type !== "other" && (d.type === "other" || !d.text)) d.type = data.type;
    if (data.legible) {
      d.text = data.ingredientsText;
      ed.scanMessage = "Label read. Check the ingredients against the label, then save.";
      ed.scanStatus = "done";
    } else {
      ed.scanMessage = "The ingredient list wasn't clear enough to read. Try a closer, sharper photo, or type it in.";
      ed.scanStatus = "error";
    }
  } catch (error) {
    if (state.shelfEditor !== ed) return;
    ed.scanStatus = "error";
    ed.scanMessage = error instanceof Error ? error.message : "The label couldn't be read.";
  }
  render();
}

export function openShelfEditor(product = null, type = "other") {
  state.shelfSelected = null;
  state.shelfEditor = product
    ? {
        mode: "edit",
        id: product.id,
        draft: {
          name: product.name,
          brand: product.brand || "",
          type: product.type || "other",
          text: product.text || "",
        },
      }
    : { mode: "add", draft: { name: "", brand: "", type, text: "" } };
  if (state.activeView !== "shelf") {
    navigateView("shelf");
  }
  renderAnimated().then(() => {
    const box = document.querySelector(".shelf-editor");
    box?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    document.querySelector("#shelf-name")?.focus({ preventScroll: true });
  });
}

export function saveShelfEditor() {
  const ed = state.shelfEditor;
  if (!ed) return;
  const d = ed.draft;
  const name = String(d.name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  const brand = String(d.brand || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  if (!name && !brand) {
    ed.error = "Give the product a name so you can find it on your shelf.";
    render();
    document.querySelector("#shelf-name")?.focus();
    return;
  }
  const now = new Date().toISOString();
  const record = {
    name: name || brand,
    brand: name ? brand : "",
    type: SHELF_TYPES.some(([id]) => id === d.type) ? d.type : "other",
    text: String(d.text || "").slice(0, 4000),
    updatedAt: now,
  };
  let id = ed.id;
  if (ed.mode === "edit" && shelfProduct(id)) {
    state.shelf = state.shelf.map((p) => (p.id === id ? { ...p, ...record } : p));
  } else {
    if (state.shelf.length >= SHELF_MAX) {
      ed.error = `Your shelf is full (${SHELF_MAX} products). Remove one first.`;
      render();
      return;
    }
    id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    state.shelf = [...state.shelf, { id, ...record, addedAt: now }];
  }
  saveShelf();
  state.shelfEditor = null;
  state.shelfSelected = id;
  state.shelfJustAdded = ed.mode === "add" ? id : null;
  renderAnimated();
  showToast(ed.mode === "edit" ? "Saved." : "Added to your shelf.");
  refreshShelfCheck({ force: true });
}

export function removeShelfProduct(id) {
  if (state.shelfConfirmRemove !== id) {
    state.shelfConfirmRemove = id;
    render();
    return;
  }
  const product = shelfProduct(id);
  state.shelf = state.shelf.filter((p) => p.id !== id);
  state.shelfConfirmRemove = null;
  state.shelfSelected = null;
  saveShelf();
  renderAnimated();
  showToast(`${product ? shelfDisplayName(product) : "Product"} removed.`);
  refreshShelfCheck({ force: true });
}
