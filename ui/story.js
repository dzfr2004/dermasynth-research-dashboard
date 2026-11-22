// The share image: a 1080 × 1920 story in the Living Sky style, and the share/save dialog.

import { hazeBand, humidityBand, locationLabel, planningUv, temperatureBand, uvBand } from "./environment.js";
import { skyHeadline, skyPalette } from "./hero.js";
import { productNameFor, todayOneLine } from "./result.js";
import { concernSummary, plainStep } from "./routine.js";
import { showToast } from "./shell.js";
import { state } from "./state.js";
import { escapeHtml, icon, titleCase } from "./util.js";
import { buildWeekImage } from "./week.js";

// 10. "Share as story": a 1080 x 1920 Instagram Story image, drawn on a canvas.
export const STORY = Object.freeze({
  w: 1080,
  h: 1920,
  x: 84,
  safeTop: 250,
  safeBottom: 1640,
  bgTop: "#0E3B32",
  bgBottom: "#1F5A4B",
  gold: "#E8C77A",
  cream: "#F5EEDC",
  mint: "#9FE3CF",
  deep: "#0B2F28",
  sans: '"Lato", "Avenir Next", "Helvetica Neue", "Segoe UI", system-ui, sans-serif',
  serif: '"Fraunces", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
});

export function storyWrap(ctx, text, maxWidth, maxLines = 3) {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.replace(/[\s,.;·]+$/, "")}…`;
    return kept;
  }
  return lines;
}

export function storyRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function storyGlass(ctx, x, y, w, h, r = 36) {
  ctx.save();
  storyRoundRect(ctx, x, y, w, h, r);
  const fill = ctx.createLinearGradient(x, y, x, y + h);
  fill.addColorStop(0, "rgba(255,255,255,0.10)");
  fill.addColorStop(1, "rgba(255,255,255,0.05)");
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(245,238,220,0.16)";
  ctx.stroke();
  ctx.restore();
}

export function storySun(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = r * 0.22;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i += 1) {
    const a = (Math.PI / 4) * i;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.restore();
}

export function storyMoon(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.42, cy - r * 0.3, r * 0.68, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill("evenodd");
  ctx.restore();
}

export function storyData() {
  const routine = state.generatedRoutine;
  const meta = state.routineMeta;
  if (!routine || !meta) return null;
  const entries = meta.ingredientCandidates?.entries || [];
  const r = meta.environment?.readings || {};
  const uv = planningUv(r);
  const fmt = (v, unit = "") => (Number.isFinite(Number(v)) && v !== null ? `${Math.round(Number(v))}${unit}` : "—");
  const steps = (phase) =>
    (routine[phase] || []).map((step) => {
      const entry = entries.find((e) => e.categoryId === step.id && e.phase === phase);
      return {
        name: plainStep(step).name,
        ingredient: entry?.displayName || "",
        product: productNameFor(`${phase}:${step.id}`),
      };
    });
  const tomorrow = state.outlook?.data?.tomorrow;
  const tomorrowChanges = (tomorrow?.changes || []).filter((c) => c.change !== "kept");
  return {
    date: new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }),
    place: locationLabel() === "Your location" ? "Near you" : locationLabel(),
    line: todayOneLine(meta, routine) || "Your routine for today, matched to the weather.",
    tiles: [
      ["UV peak", fmt(uv), uvBand(uv)?.label || ""],
      ["Humidity", fmt(r.humidity, "%"), humidityBand(r.humidity)?.label || ""],
      ["Haze", fmt(r.pm25), hazeBand(r.pm25)?.label || "PM2.5"],
      ["Temp", fmt(r.temperature, "°"), temperatureBand(r.temperature)?.label || ""],
    ],
    am: steps("am"),
    pm: steps("pm"),
    tomorrow: tomorrow
      ? tomorrow.sameAsToday
        ? "Same routine as today."
        : tomorrowChanges.map((c) => c.text).join(" ") || tomorrow.summary || ""
      : "",
    profile: `${state.profile[0].toUpperCase()}${state.profile.slice(1)} skin · ${concernSummary()}`,
    headline: skyHeadline(r),
    sky: skyPalette(r),
    readings: [
      ["UV", Number.isFinite(uv) && uv !== null ? String(Math.round(uv)) : "—", "", uvBand(uv)?.label || ""],
      ["Haze", fmt(r.pm25), "PM2.5", hazeBand(r.pm25)?.label || ""],
      ["Humidity", fmt(r.humidity), "%", humidityBand(r.humidity)?.label || ""],
      ["Heat", fmt(r.temperature), "°C", temperatureBand(r.temperature)?.label || ""],
    ],
  };
}

// Story image in the Living Sky style: the day's sky with the headline and
// readings on it, and the routine on a paper sheet (cream by day, deep green
// at night, when the evening steps come first).
export function storyDroplet(ctx, cx, cy, h, night) {
  const w = h * 0.78;
  const top = cy - h / 2,
    bottom = cy + h / 2,
    r = w / 2;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.bezierCurveTo(cx + r * 0.25, top + h * 0.22, cx + r, bottom - r * 1.25, cx + r, bottom - r);
    ctx.arc(cx, bottom - r, r, 0, Math.PI);
    ctx.bezierCurveTo(cx - r, bottom - r * 1.25, cx - r * 0.25, top + h * 0.22, cx, top);
    ctx.closePath();
  };
  ctx.save();
  path();
  const body = ctx.createRadialGradient(cx - r * 0.35, bottom - r * 1.25, r * 0.1, cx, bottom - r, r * 1.35);
  body.addColorStop(0, night ? "rgba(230,240,255,0.42)" : "rgba(255,255,255,0.62)");
  body.addColorStop(0.55, night ? "rgba(140,175,165,0.16)" : "rgba(255,240,215,0.22)");
  body.addColorStop(1, night ? "rgba(12,26,31,0.30)" : "rgba(170,110,60,0.22)");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = night ? "rgba(230,240,255,0.42)" : "rgba(255,255,255,0.75)";
  ctx.stroke();
  ctx.clip();
  ctx.fillStyle = night ? "rgba(230,240,255,0.35)" : "rgba(255,255,255,0.65)";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.42, bottom - r * 1.15, r * 0.12, r * 0.36, -0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawStory(ctx, data, s) {
  const S = STORY;
  const W = S.w;
  const inner = W - S.x * 2;
  const sky = data.sky;
  const night = sky.state === "night";
  const sheet = night
    ? {
        bg: "#13201a",
        ink: "#efe8d8",
        muted: "#aab7ae",
        line: "rgba(239,232,216,0.14)",
        fill: "rgba(239,232,216,0.10)",
        num: "#f2c879",
        handle: "rgba(239,232,216,0.22)",
      }
    : {
        bg: "#fbf6ea",
        ink: "#16241c",
        muted: "#4c5a51",
        line: "rgba(22,36,28,0.12)",
        fill: "rgba(22,36,28,0.07)",
        num: "#9a5f12",
        handle: "rgba(22,36,28,0.16)",
      };

  // Sky: the same palette the app uses for this hour, UV and haze.
  const bg = ctx.createLinearGradient(0, 0, 0, S.h);
  bg.addColorStop(0, sky.top);
  bg.addColorStop(0.42, sky.mid);
  bg.addColorStop(0.75, sky.bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, S.h);
  const [gx, gy] = String(sky.glowAt)
    .split(" ")
    .map((v) => parseFloat(v) / 100);
  const glow = ctx.createRadialGradient(W * gx, S.h * 0.55 * gy, 10, W * gx, S.h * 0.55 * gy, 760);
  glow.addColorStop(
    0,
    sky.glow.replace(/\s*\/\s*([\d.]+)%\)/, (m, a) => ` / ${a}%)`),
  );
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, S.h);

  ctx.textBaseline = "alphabetic";
  const hs = Math.max(s, 0.8);
  const rgba = (c) =>
    String(c).replace(/rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)%\)/, (m, r, g, b, a) => `rgba(${r},${g},${b},${a / 100})`);
  storyDroplet(ctx, W - 190, S.safeTop + 230 * hs, 300 * hs, night);

  // Wordmark, with the date and place underneath.
  let y = S.safeTop + 10;
  ctx.fillStyle = sky.ink;
  ctx.font = `600 46px ${S.serif}`;
  ctx.fillText("DermaSynth", S.x, y);
  y += 46;
  ctx.fillStyle = sky.inkSoft;
  ctx.font = `700 27px ${S.sans}`;
  ctx.fillText(storyWrap(ctx, `${data.date} · ${data.place}`, inner * 0.7, 1)[0], S.x, y);

  // Headline straight on the sky, beside the droplet.
  y += Math.round(36 * hs);
  const headSize = Math.round(92 * hs);
  ctx.font = `500 ${headSize}px ${S.serif}`;
  ctx.fillStyle = sky.ink;
  for (const line of storyWrap(ctx, data.headline, inner * 0.72, 3)) {
    y += Math.round(headSize * 0.98);
    ctx.fillText(line, S.x, y);
  }
  y += Math.round(12 * hs);
  ctx.font = `400 ${Math.round(32 * hs)}px ${S.sans}`;
  ctx.fillStyle = sky.inkSoft;
  for (const line of storyWrap(ctx, data.line, inner * 0.7, 3)) {
    y += Math.round(44 * hs);
    ctx.fillText(line, S.x, y);
  }

  // Readings: four numbers under one hairline, no boxes.
  y += Math.round(34 * hs);
  ctx.strokeStyle = rgba(sky.line);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(S.x, y);
  ctx.lineTo(S.x + inner, y);
  ctx.stroke();
  const colW = inner / 4;
  const rh = Math.round(148 * hs);
  data.readings.forEach(([label, value, unit, band], i) => {
    const cx = S.x + i * colW + (i ? 22 : 0);
    if (i) {
      ctx.beginPath();
      ctx.moveTo(S.x + i * colW, y);
      ctx.lineTo(S.x + i * colW, y + rh);
      ctx.stroke();
    }
    ctx.fillStyle = sky.inkSoft;
    ctx.font = `700 ${Math.round(24 * hs)}px ${S.sans}`;
    ctx.fillText(label, cx, y + Math.round(38 * hs));
    ctx.fillStyle = sky.ink;
    ctx.font = `500 ${Math.round(70 * hs)}px ${S.serif}`;
    ctx.fillText(value, cx, y + Math.round(104 * hs));
    if (unit && value !== "—") {
      const vw = ctx.measureText(value).width;
      ctx.fillStyle = sky.inkSoft;
      ctx.font = `400 ${Math.round(22 * hs)}px ${S.sans}`;
      ctx.fillText(unit, cx + vw + 6, y + Math.round(104 * hs));
    }
    ctx.fillStyle = sky.band;
    ctx.font = `700 ${Math.round(24 * hs)}px ${S.sans}`;
    ctx.fillText(titleCase(storyWrap(ctx, band, colW - 30, 1)[0] || ""), cx, y + Math.round(138 * hs));
  });
  y += rh + Math.round(40 * hs);

  // The sheet: paper laid over the sky, running off the bottom edge.
  storyRoundRect(ctx, 0, y, W, S.h - y + 80, 64);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = -12;
  ctx.fillStyle = sheet.bg;
  ctx.fill();
  ctx.restore();
  storyRoundRect(ctx, W / 2 - 40, y + 22, 80, 10, 5);
  ctx.fillStyle = sheet.handle;
  ctx.fill();
  y += Math.round(96 * s);
  ctx.fillStyle = sheet.ink;
  ctx.font = `500 ${Math.round(58 * s)}px ${S.serif}`;
  ctx.fillText(night ? "Tonight's routine" : "Today's routine", S.x, y);
  y += Math.round(42 * s);
  ctx.fillStyle = sheet.muted;
  ctx.font = `400 ${Math.round(27 * s)}px ${S.sans}`;
  ctx.fillText(storyWrap(ctx, `${data.profile} · Safety checks passed`, inner, 1)[0], S.x, y);
  y += Math.round(16 * s);

  const section = (title, steps, drawIcon) => {
    y += Math.round(64 * s);
    drawIcon(S.x + 18, y - Math.round(13 * s), Math.round(19 * s));
    ctx.fillStyle = sheet.ink;
    ctx.font = `600 ${Math.round(40 * s)}px ${S.serif}`;
    ctx.fillText(title, S.x + Math.round(52 * s), y);
    const count = `${steps.length} step${steps.length === 1 ? "" : "s"}`;
    ctx.fillStyle = sheet.muted;
    ctx.font = `700 ${Math.round(24 * s)}px ${S.sans}`;
    ctx.fillText(count, S.x + inner - ctx.measureText(count).width, y);
    y += Math.round(20 * s);
    const rowH = Math.round(78 * s);
    steps.forEach((st, i) => {
      ctx.strokeStyle = sheet.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(S.x, y);
      ctx.lineTo(S.x + inner, y);
      ctx.stroke();
      const base = y + Math.round(54 * s);
      ctx.fillStyle = sheet.num;
      ctx.font = `400 ${Math.round(48 * s)}px ${S.serif}`;
      ctx.fillText(String(i + 1), S.x + 4, base + Math.round(2 * s));
      const tx = S.x + Math.round(62 * s);
      const sub = st.product || st.ingredient || "";
      // Ingredient (or the user's product) as a pill on the right of the same row.
      let pillW = 0;
      if (sub) {
        ctx.font = `700 ${Math.round(24 * s)}px ${S.sans}`;
        const t = storyWrap(ctx, sub, inner * 0.42, 1)[0];
        pillW = ctx.measureText(t).width + 34;
        const px = S.x + inner - pillW,
          ph = Math.round(42 * s);
        storyRoundRect(ctx, px, base - Math.round(31 * s), pillW, ph, ph / 2);
        ctx.fillStyle = sheet.fill;
        ctx.fill();
        ctx.fillStyle = sheet.ink;
        ctx.fillText(t, px + 17, base - Math.round(2 * s));
      }
      ctx.fillStyle = sheet.ink;
      ctx.font = `500 ${Math.round(36 * s)}px ${S.serif}`;
      ctx.fillText(storyWrap(ctx, st.name, inner - Math.round(62 * s) - pillW - 20, 1)[0], tx, base);
      y += rowH;
    });
  };
  const am = () => data.am.length && section("Morning", data.am, (cx, cy, r) => storySun(ctx, cx, cy, r, sheet.num));
  const pm = () => data.pm.length && section("Evening", data.pm, (cx, cy, r) => storyMoon(ctx, cx, cy, r, sheet.num));
  if (night) {
    pm();
    am();
  } else {
    am();
    pm();
  }

  if (data.tomorrow) {
    y += Math.round(46 * s);
    ctx.font = `700 ${Math.round(26 * s)}px ${S.sans}`;
    ctx.fillStyle = sheet.num;
    ctx.fillText("Tomorrow", S.x, y);
    const lw = ctx.measureText("Tomorrow  ").width;
    ctx.font = `400 ${Math.round(26 * s)}px ${S.sans}`;
    ctx.fillStyle = sheet.ink;
    const lines = storyWrap(ctx, data.tomorrow, inner - lw, 2);
    lines.forEach((l, i) => ctx.fillText(l, S.x + lw, y + i * Math.round(36 * s)));
    y += (lines.length - 1) * Math.round(36 * s);
  }

  // Footer, inside the safe zone.
  ctx.fillStyle = sheet.muted;
  ctx.font = `400 23px ${S.sans}`;
  const foot = "Made with DermaSynth · research prototype, not medical advice";
  ctx.fillText(foot, (W - ctx.measureText(foot).width) / 2, S.safeBottom);
  return y;
}

export async function buildStoryImage() {
  const data = storyData();
  if (!data) return null;
  try {
    await Promise.all(
      ["500 100px Fraunces", "600 40px Fraunces", "400 30px Lato", "700 30px Lato"].map((f) => document.fonts.load(f)),
    );
    await document.fonts?.ready;
  } catch {
    /* fonts API unavailable */
  }
  const canvas = document.createElement("canvas");
  canvas.width = STORY.w;
  canvas.height = STORY.h;
  const ctx = canvas.getContext("2d");
  // Shrink the lower sections until everything sits above the footer.
  let scale = 1;
  for (let i = 0; i < 12; i += 1) {
    ctx.clearRect(0, 0, STORY.w, STORY.h);
    const end = drawStory(ctx, data, scale);
    if (end <= STORY.safeBottom - 56 || scale <= 0.7) break;
    scale = Math.max(0.7, scale - 0.03);
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? { blob, width: canvas.width, height: canvas.height } : null;
}

export let storyReturnFocus = null;

export const SHARE_KINDS = Object.freeze({
  today: {
    build: () => buildStoryImage(),
    filename: "dermasynth-today.png",
    title: "My skin plan today",
    heading: "Your story image",
    alt: "Story image of today's skin plan: the summary line, today's weather, and the morning and evening steps.",
    hint: "1080 × 1920, sized for an Instagram Story.",
  },
  week: {
    build: () => buildWeekImage(),
    filename: "dermasynth-week.png",
    title: "My skin plan this week",
    heading: "Your weekly plan",
    alt: "Weekly skin plan: one column per day with the forecast, and which morning and evening steps to use, with changes from today highlighted.",
    hint: "1920 × 1080, landscape: fits a laptop wallpaper, a slide or a chat message.",
  },
});

export async function openStory(kind = "today") {
  const spec = SHARE_KINDS[kind] || SHARE_KINDS.today;
  storyReturnFocus = document.activeElement;
  closeStory({ restoreFocus: false });
  const image = await spec.build();
  if (!image) {
    showToast("Build a routine first.");
    return;
  }
  const url = URL.createObjectURL(image.blob);
  state.story = {
    blob: image.blob,
    url,
    width: image.width,
    height: image.height,
    filename: spec.filename,
    title: spec.title,
  };
  const canShare = (() => {
    try {
      return Boolean(navigator.canShare?.({ files: [new File([image.blob], spec.filename, { type: "image/png" })] }));
    } catch {
      return false;
    }
  })();
  const modal = document.createElement("div");
  modal.className = "story-modal";
  modal.id = "story-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "story-title");
  modal.innerHTML = `<div class="story-backdrop" data-action="story-close"></div><div class="story-sheet"><div class="story-sheet-head"><h2 id="story-title">${escapeHtml(spec.heading)}</h2><button type="button" class="story-close" data-action="story-close" aria-label="Close">×</button></div><img class="story-preview" src="${url}" width="${image.width}" height="${image.height}" alt="${escapeHtml(spec.alt)}" /><div class="story-actions">${canShare ? `<button type="button" class="primary-button" data-action="story-share">${icon("share", 15)} Share</button>` : ""}<button type="button" class="${canShare ? "ghost-button" : "primary-button"}" data-action="story-download">${icon("download", 15)} Save image</button></div><p class="story-hint">${escapeHtml(spec.hint)}</p></div>`;
  modal.classList.toggle("is-landscape", image.width > image.height);
  document.body.append(modal);
  requestAnimationFrame(() => modal.classList.add("is-open"));
  modal.querySelector(canShare ? "[data-action='story-share']" : "[data-action='story-download']")?.focus();
}

export function closeStory({ restoreFocus = true } = {}) {
  const modal = document.querySelector("#story-modal");
  if (modal) modal.remove();
  if (state.story?.url)
    setTimeout(
      (
        (url) => () =>
          URL.revokeObjectURL(url)
      )(state.story.url),
      1000,
    );
  state.story = null;
  if (restoreFocus && storyReturnFocus?.isConnected) storyReturnFocus.focus();
}

export function downloadStory() {
  if (!state.story) return;
  const link = document.createElement("a");
  link.href = state.story.url;
  link.download = state.story.filename || "dermasynth-today.png";
  document.body.append(link);
  link.click();
  link.remove();
  showToast("Image saved.");
}

export async function shareStory() {
  if (!state.story) return;
  const file = new File([state.story.blob], state.story.filename || "dermasynth-today.png", { type: "image/png" });
  try {
    await navigator.share({ files: [file], title: state.story.title || "My skin plan today" });
  } catch (error) {
    if (error?.name !== "AbortError") downloadStory();
  }
}
