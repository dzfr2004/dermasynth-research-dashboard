import { callResponses, extractOutputText } from "./openai.mjs";

/**
 * Triage layer 2: a language-model second opinion on free-text symptoms.
 *
 * It runs only when the deterministic rules CLEARED the text, and it can only
 * ESCALATE to a redirect; it can never clear something the rules redirected.
 * If the model call fails, the rules result stands (the failure is logged by
 * lib/openai.mjs). The model sees only the symptom text, nothing else.
 */

const CATEGORIES = ["none", "possible allergic reaction", "possible infection", "acute skin reaction", "possible reaction to a product", "needs clinical assessment", "urgent"];

export async function llmTriageSecondOpinion({ config, symptoms }) {
  const text = String(symptoms || "").trim().slice(0, 500);
  if (!text) return { status: "not_needed" };
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      needs_professional_care: { type: "boolean" },
      category: { type: "string", enum: CATEGORIES },
      reason: { type: "string" },
    },
    required: ["needs_professional_care", "category", "reason"],
  };
  const response = await callResponses(config, {
    store: false,
    reasoning: { effort: config.openai.reasoningEffort },
    max_output_tokens: 200,
    instructions: [
      "You are a cautious safety screen for a cosmetic skincare app. Decide whether the user's text describes symptoms that should be seen by a pharmacist or doctor instead of receiving a cosmetic routine.",
      "Answer needs_professional_care = true for: swelling of the face, lips, eyes, tongue or throat; hives; any breathing difficulty; blisters; bleeding, oozing or pus; signs of infection or fever; a changing, bleeding or new mole or lump; sores that do not heal; rashes that spread or cover large areas; burning, stinging, redness or rash that started after using a product; severe pain; symptoms that are getting worse.",
      "Answer false for ordinary cosmetic concerns (dryness, oiliness, breakouts, dark spots, dullness, large pores, mild tightness, mild or occasional redness) and for symptoms the user clearly says they do NOT have.",
      "If unsure, answer true. The reason must be one short sentence.",
    ].join(" "),
    input: JSON.stringify({ user_text: text }),
    text: { format: { type: "json_schema", name: "triage_second_opinion", strict: true, schema } },
  }, { service: "OpenAI triage second opinion" });
  const parsed = JSON.parse(extractOutputText(response));
  return {
    status: "completed",
    model: response._model || null,
    escalate: parsed.needs_professional_care === true,
    category: CATEGORIES.includes(parsed.category) ? parsed.category : "needs clinical assessment",
    reason: String(parsed.reason || "").slice(0, 240),
  };
}
