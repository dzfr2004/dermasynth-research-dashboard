// Small shared helpers: HTML escaping, the icon set, number and date formatting, colour mixing.

import { hexToRgb01 } from "../sky.js";

export function safelyNumber(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "—";
}

export function icon(name, size = 18, stroke = 1.8) {
  const paths = {
    shield: '<path d="M12 3 19 6v5c0 5-3.3 8.7-7 10-3.7-1.3-7-5-7-10V6l7-3Z"/><path d="m9.5 12 1.6 1.6 3.5-3.7"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    activity: '<path d="M3 12h4l2.2-7 4.2 14L16 12h5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    flask:
      '<path d="M9 3h6M10 3v6l-5.1 8.8A2.2 2.2 0 0 0 6.8 21h10.4a2.2 2.2 0 0 0 1.9-3.2L14 9V3"/><path d="M8 15h8"/>',
    layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z"/><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>',
    pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    refresh:
      '<path d="M20 11a8 8 0 0 0-14.9-3.9L3 9"/><path d="M3 4v5h5M4 13a8 8 0 0 0 14.9 3.9L21 15"/><path d="M21 20v-5h-5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    droplet: '<path d="M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
    thermometer: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 9v7"/>',
    wind: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
    sparkles:
      '<path d="m12 3-1.2 4.2L7 8.5l3.8 1.3L12 14l1.2-4.2L17 8.5l-3.8-1.3L12 3Z"/><path d="m19 14-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7L19 14ZM5 14l-.6 2L2 16.6l2.4.7L5 20l.6-2 2.4-.7-2.4-.7L5 14Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    upload: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
    download: '<path d="M12 3v12M7 11l5 5 5-5"/><path d="M5 21h14"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    bottle:
      '<path d="M10 2h4v3.5c1.8.7 3 2.3 3 4.2V20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9.7c0-1.9 1.2-3.5 3-4.2Z"/><path d="M7 14h10"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}

// G6: technical failures become one plain sentence; the detail stays in Expert view.
export function plainMessage(text, fallback = "This part isn't available right now.") {
  const value = String(text || "");
  if (!value) return fallback;
  if (
    /\.env|LIVE_SERVICES|OPENAI|api\.openai|provider|not_configured|quota|model|HTTP|timeout|timed out|budget|rate limit/i.test(
      value,
    )
  )
    return "Friendlier explanations aren't available right now, so the standard reasons are shown.";
  return value;
}

export function sameText(a, b) {
  const n = (t) =>
    String(t || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return Boolean(n(a)) && n(a) === n(b);
}

export function shortPublisher(name) {
  const text = String(name || "").trim();
  if (/cochrane/i.test(text)) return "Cochrane";
  return text.length > 42 ? `${text.slice(0, 40).replace(/\s+\S*$/, "")}…` : text;
}

export function hourLabel(time) {
  const h = Number(String(time || "").slice(11, 13));
  if (!Number.isFinite(h)) return "";
  return h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`;
}

export function relativeDay(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "last time";
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(then).setHours(0, 0, 0, 0)) / 864e5);
  return days <= 0 ? "earlier today" : days === 1 ? "yesterday" : `${days} days ago`;
}

export function titleCase(text) {
  return String(text || "").replace(/^./, (c) => c.toUpperCase());
}

// ---- Living Sky: the page background is today's sky -------------------------
// Colour comes from the local hour, UV and haze. Text on the sky uses --sky-ink,
// which is dark on the light day sky and cream on the dusk and night sky.
export function mixHex(a, b, t) {
  const pa = hexToRgb01(a),
    pb = hexToRgb01(b);
  if (!pa || !pb) return a;
  return (
    "#" +
    pa
      .map((v, i) =>
        Math.round((v + (pb[i] - v) * Math.max(0, Math.min(1, t))) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char],
  );
}
