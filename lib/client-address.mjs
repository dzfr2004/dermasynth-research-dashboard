/**
 * The visitor's address for rate limiting.
 *
 * Behind a host's reverse proxy (Railway, Render, Fly) the socket address is
 * the proxy's, so every visitor would share one rate-limit bucket. Set
 * TRUST_PROXY_HOPS to the number of proxies in front of the app (usually 1)
 * and the address is read from X-Forwarded-For, counting that many entries
 * from the right, which a visitor cannot forge. With 0 (the default, for
 * local runs) the header is ignored. On Vercel (process.env.VERCEL is set by
 * the platform) this defaults to 1 even without TRUST_PROXY_HOPS set, since
 * every request there passes through Vercel's own edge proxy.
 */
export function clientAddress(request, hops = Number(process.env.TRUST_PROXY_HOPS ?? (process.env.VERCEL ? 1 : 0))) {
  const socket = request?.socket?.remoteAddress || "unknown";
  const n = Number.isInteger(hops) && hops > 0 ? hops : 0;
  if (!n) return socket;
  const header = request?.headers?.["x-forwarded-for"];
  const list = (Array.isArray(header) ? header.join(",") : String(header || ""))
    .split(",").map((item) => item.trim()).filter(Boolean);
  if (!list.length) return socket;
  return list[Math.max(0, list.length - n)] || socket;
}
