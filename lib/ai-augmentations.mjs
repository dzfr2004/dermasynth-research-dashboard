import { callResponses } from "./openai.mjs";
import { ExternalServiceError, fetchJson } from "./http-client.mjs";

const BLOCKED = /\b(diagnos|treat|cure|prescri|dosage|dose|frequency|guarantee|you should|mg\b|%\b)/i;

function outputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) for (const content of item?.content || []) {
    if (content?.type === "output_text" && typeof content.text === "string") return content.text;
  }
  throw new ExternalServiceError("OpenAI did not return a text augmentation.", { code: "missing_model_output" });
}

export async function groundedAugmentation({ config, task, facts }) {
  if (!config.liveServicesEnabled || !config.openai.apiKey) throw new ExternalServiceError("OpenAI augmentations are not enabled.", { code: "not_enabled" });
  const response = await callResponses(config, { store: false, reasoning: { effort: config.openai.reasoningEffort }, max_output_tokens: 220,
      instructions: `Write a concise, neutral ${task} summary using only the supplied facts. Use 2 short paragraphs or up to 4 bullets. Do not diagnose, predict outcomes, claim efficacy or safety, give products, ingredients not present in facts, doses, frequencies, prescriptions, treatment advice, guarantees, or personalised recommendations. State uncertainty when facts are limited.`,
      input: JSON.stringify(facts),
    }, { service: `OpenAI ${task} augmentation` });
  const text = outputText(response).replace(/\s+/g, " ").trim();
  if (text.length < 20 || text.length > 1300 || BLOCKED.test(text)) throw new ExternalServiceError("OpenAI returned an unsuitable augmentation.", { code: "invalid_model_output" });
  return { status: "available", task, text, mode: "openai_grounded_facts", generatedAt: new Date().toISOString() };
}
