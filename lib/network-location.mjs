import { fetchJson } from "./http-client.mjs";

/**
 * Approximate location of the network the server is on, used when a phone
 * cannot share its own location. The common case is the user study: phones
 * open the app over the campus Wi-Fi at http://192.168.x.x, which browsers do
 * not treat as a secure origin, so they refuse to share GPS at all.
 *
 * Privacy: this looks up the SERVER's public address only, and only answers
 * requests that come from the same private network (or the same machine), so
 * a visitor's own address is never sent to a third party. On a public
 * deployment, remote visitors get { available: false }.
 */

const CACHE_MS = 60 * 60 * 1000;
let cache = null;

const PRIVATE = [
  /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
  /^::1$/, /^f[cd][0-9a-f]{2}:/i, /^fe80:/i,
];

export function isPrivateAddress(address) {
  const a = String(address || "").replace(/^::ffff:/i, "");
  return PRIVATE.some((re) => re.test(a));
}

const round = (v) => Math.round(Number(v) * 100) / 100;
const clean = (v, n) => String(v || "").replace(/[^\p{L}\p{N} .,'()-]/gu, "").trim().slice(0, n);

async function lookup(timeoutMs) {
  // Two keyless providers, tried in order.
  try {
    const p = await fetchJson("https://ipwho.is/?fields=success,city,region,country_code,latitude,longitude", { service: "Network location", timeoutMs });
    if (p?.success && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))) {
      return { city: p.city, region: p.region, country: p.country_code, lat: Number(p.latitude), lon: Number(p.longitude) };
    }
  } catch { /* try the next provider */ }
  const q = await fetchJson("https://ipapi.co/json/", { service: "Network location", timeoutMs });
  if (!Number.isFinite(Number(q?.latitude)) || !Number.isFinite(Number(q?.longitude))) throw new Error("No location in the reply.");
  return { city: q.city, region: q.region, country: q.country_code || q.country, lat: Number(q.latitude), lon: Number(q.longitude) };
}

export async function networkLocation(config, remoteAddress, { reverse } = {}) {
  if (!config.liveServicesEnabled || config.networkLocationEnabled === false) return { available: false, reason: "off" };
  if (!isPrivateAddress(remoteAddress)) return { available: false, reason: "remote" };
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const found = await lookup(config.requestTimeoutMs || 9000);
    const lat = round(found.lat);
    const lon = round(found.lon);
    let name = null;
    if (reverse) { try { name = await reverse(lat, lon); } catch { name = null; } }
    if (!name) name = [clean(found.city || found.region, 60), clean(found.country, 4)].filter(Boolean).join(", ") || "Near you";
    const value = { available: true, approximate: true, name, lat, lon };
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return { available: false, reason: "lookup_failed" };
  }
}
