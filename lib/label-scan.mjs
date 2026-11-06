import { ExternalServiceError } from "./http-client.mjs";
import { callResponses, extractOutputText, parseStructuredOutput } from "./openai.mjs";
import { PRODUCT_TYPES } from "./shelf.mjs";

/**
 * Reads a product label photo with an OpenAI vision model. The model only
 * transcribes what is printed (name, brand, type, ingredient list); every
 * judgement about the product is then made by the deterministic product
 * check. Nothing is stored. The user reviews the text before saving it.
 */

export const LABEL_SCAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["legible", "product_name", "brand", "product_type", "ingredients_text"],
  properties: {
    legible: { type: "boolean" },
    product_name: { type: "string" },
    brand: { type: "string" },
    product_type: { type: "string", enum: [...PRODUCT_TYPES] },
    ingredients_text: { type: "string" },
  },
};

const IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_IMAGE_CHARS = 2_800_000;

export function validLabelImage(value) {
  return typeof value === "string" && value.length <= MAX_IMAGE_CHARS && IMAGE_PATTERN.test(value);
}

export async function scanProductLabel({ config, image }) {
  if (!config?.liveServicesEnabled || !config?.openai?.apiKey) {
    throw new ExternalServiceError("Label scanning needs the live AI service.", { code: "not_enabled" });
  }
  if (!validLabelImage(image)) throw new ExternalServiceError("The photo could not be read.", { code: "invalid_image" });
  const response = await callResponses(config, {
    store: false,
    max_output_tokens: 1200,
    reasoning: { effort: "low" },
    instructions: [
      "You transcribe skincare product labels for a research prototype.",
      "Copy only text that is printed on the label in the photo. Never guess, complete, translate or add ingredients.",
      "ingredients_text: the full ingredient (INCI) list exactly as printed, comma-separated, in label order. Leave it empty if no ingredient list is visible.",
      "Set legible to false when the ingredient list is cut off, blurred or too small to read reliably; then leave ingredients_text empty.",
      "product_type: the closest type from the list, based on what the label says the product is. Use other when unsure.",
      "Leave product_name or brand empty if they are not printed.",
    ].join(" "),
    input: [{ role: "user", content: [{ type: "input_text", text: "Transcribe this product label." }, { type: "input_image", image_url: image, detail: "high" }] }],
    text: { format: { type: "json_schema", name: "label_transcription", strict: true, schema: LABEL_SCAN_SCHEMA } },
  }, { service: "OpenAI label scan" });
  if (response?.status === "incomplete") throw new ExternalServiceError("The label reading did not finish.", { code: "incomplete_model_output" });
  const parsed = parseStructuredOutput(extractOutputText(response), LABEL_SCAN_SCHEMA, "Label scan");
  const ingredients = String(parsed.ingredients_text || "").replace(/\s+/g, " ").trim().slice(0, 4000);
  const legible = Boolean(parsed.legible) && ingredients.length >= 3;
  return {
    legible,
    name: String(parsed.product_name || "").replace(/\s+/g, " ").trim().slice(0, 80),
    brand: String(parsed.brand || "").replace(/\s+/g, " ").trim().slice(0, 60),
    type: PRODUCT_TYPES.includes(parsed.product_type) ? parsed.product_type : "other",
    ingredientsText: legible ? ingredients : "",
  };
}
