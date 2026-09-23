import { createConfig, loadDotEnv } from "../lib/config.mjs";

/**
 * Confirms that the OpenAI key and model in .env work, without printing the
 * key. Run on the machine that holds .env: `npm run check:openai`.
 *
 * 1. GET /v1/models/{model}  — the key is valid and the model is available.
 * 2. A tiny Responses call with a strict JSON schema — structured output works
 *    (the ingredient selection, rationale and CUE judge all rely on it).
 */

loadDotEnv(process.cwd());
const config = createConfig();
const key = config.openai.apiKey;
const model = config.openai.model;

function line(ok, label, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

if (!key) {
  line(false, "OPENAI_API_KEY is empty in .env");
  process.exit(1);
}
line(true, "OPENAI_API_KEY is set", `${key.slice(0, 7)}… (${key.length} characters)`);
line(config.liveServicesEnabled, "LIVE_SERVICES_ENABLED", config.liveServicesEnabled ? "true" : "false — the app will not call OpenAI until this is true");
console.log(`      model: ${model} · reasoning effort: ${config.openai.reasoningEffort} · CUE method: ${config.cue.method}`);

async function call(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(options.headers || {}) }, signal: AbortSignal.timeout(20_000) });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  return { status: response.status, body };
}

let failed = false;
try {
  const models = await call(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`);
  if (models.status === 200) line(true, `Model ${model} is available to this key`);
  else {
    failed = true;
    line(false, `Model ${model} lookup returned HTTP ${models.status}`, models.body?.error?.message || "");
    if (models.status === 404) {
      const list = await call("https://api.openai.com/v1/models");
      const ids = (list.body?.data || []).map((item) => item.id).filter((id) => /^(gpt|o\d)/.test(id)).sort();
      if (ids.length) console.log(`      Models this key can use include: ${ids.slice(-15).join(", ")}\n      Set OPENAI_MODEL in .env to one of them.`);
    }
  }

  const schema = { type: "object", additionalProperties: false, properties: { ok: { type: "boolean" } }, required: ["ok"] };
  const response = await call("https://api.openai.com/v1/responses", {
    method: "POST",
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: config.openai.reasoningEffort },
      max_output_tokens: 40,
      instructions: "Return {\"ok\": true}.",
      input: "health check",
      text: { format: { type: "json_schema", name: "health_check", strict: true, schema } },
    }),
  });
  if (response.status === 200) line(true, "Structured Responses call succeeded", `usage: ${JSON.stringify(response.body?.usage || {})}`);
  else {
    failed = true;
    const message = response.body?.error?.message || "";
    line(false, `Responses call returned HTTP ${response.status}`, message);
    if (response.status === 429 && /quota/i.test(message)) console.log("      The account has no available quota: add credit or check the project's usage limits.");
    if (response.status === 400 && /reasoning/i.test(message)) console.log("      This model does not accept the reasoning setting: set OPENAI_REASONING_EFFORT to a supported value (or remove it).");
  }
} catch (error) {
  failed = true;
  line(false, "Could not reach api.openai.com", error instanceof Error ? error.message : String(error));
}
process.exit(failed ? 1 : 0);
