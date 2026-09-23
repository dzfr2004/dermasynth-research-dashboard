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

  // The app itself goes through lib/openai.mjs, which falls back to
  // OPENAI_FALLBACK_MODELS when OPENAI_MODEL is not available to this key.
  const { callResponses } = await import("../lib/openai.mjs");
  const schema = { type: "object", additionalProperties: false, properties: { ok: { type: "boolean" } }, required: ["ok"] };
  try {
    const result = await callResponses(config, {
      store: false,
      reasoning: { effort: config.openai.reasoningEffort },
      max_output_tokens: 60,
      instructions: "Return {\"ok\": true}.",
      input: "health check",
      text: { format: { type: "json_schema", name: "health_check", strict: true, schema } },
    }, { service: "check:openai" });
    failed = false;
    line(true, `The app will use model ${result._model}`, result._model === model ? "the configured OPENAI_MODEL" : `OPENAI_MODEL (${model}) is not available to this key, so the first working fallback is used. Set OPENAI_MODEL=${result._model} in .env to skip the failed attempt.`);
  } catch (error) {
    failed = true;
    const { describeOpenAiError } = await import("../lib/openai.mjs");
    line(false, "No configured model answered", `${describeOpenAiError(error)} Tried: ${[model, ...config.openai.fallbackModels].join(", ")}. Details: data/logs/provider-errors.jsonl`);
  }
} catch (error) {
  failed = true;
  line(false, "Could not reach api.openai.com", error instanceof Error ? error.message : String(error));
}
process.exit(failed ? 1 : 0);
