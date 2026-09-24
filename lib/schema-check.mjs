/**
 * C2: GPT output schema contract.
 *
 * Every GPT call uses OpenAI structured output (json_schema, strict). Two
 * things can silently break that contract:
 *   1. a schema edit that OpenAI's strict mode rejects (this happened once:
 *      `uniqueItems` made every category selection fail);
 *   2. a reply that does not match the schema the code expects (a model or
 *      API change, or a schema edited without updating the parser).
 * strictSchemaProblems() checks (1) and is used by the schema test;
 * validateAgainstSchema() checks (2) and is applied to every GPT reply at run
 * time, so a mismatched reply is treated as a failed call (and the
 * rule-based result is used) instead of being half-read.
 */

// Keywords OpenAI strict structured output does not accept.
const UNSUPPORTED = ["uniqueItems", "patternProperties", "propertyNames", "if", "then", "else", "not", "allOf", "oneOf", "dependentRequired", "dependentSchemas", "contains", "minContains", "maxContains", "unevaluatedProperties", "unevaluatedItems", "minProperties", "maxProperties", "default"];
const MAX_DEPTH = 10;

export function strictSchemaProblems(schema) {
  const problems = [];
  if (schema?.type !== "object") problems.push("root: must be an object schema");
  const walk = (node, path, depth) => {
    if (!node || typeof node !== "object") { problems.push(`${path}: not a schema`); return; }
    if (depth > MAX_DEPTH) problems.push(`${path}: nested deeper than ${MAX_DEPTH}`);
    for (const key of UNSUPPORTED) if (key in node) problems.push(`${path}: "${key}" is not supported in strict mode`);
    if (Array.isArray(node.anyOf)) { node.anyOf.forEach((sub, i) => walk(sub, `${path}.anyOf[${i}]`, depth + 1)); return; }
    const types = Array.isArray(node.type) ? node.type : [node.type];
    if (!node.type && !node.enum) problems.push(`${path}: missing type`);
    if (types.includes("object")) {
      const props = node.properties || {};
      if (node.additionalProperties !== false) problems.push(`${path}: additionalProperties must be false`);
      const required = Array.isArray(node.required) ? node.required : [];
      for (const key of Object.keys(props)) if (!required.includes(key)) problems.push(`${path}.${key}: every property must be listed in required`);
      for (const key of required) if (!(key in props)) problems.push(`${path}: required "${key}" has no property`);
      for (const [key, sub] of Object.entries(props)) walk(sub, `${path}.${key}`, depth + 1);
    }
    if (types.includes("array")) {
      if (!node.items) problems.push(`${path}: array needs items`);
      else walk(node.items, `${path}[]`, depth + 1);
    }
  };
  walk(schema, "root", 0);
  return problems;
}

const typeOf = (value) => (value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value);

export function validateAgainstSchema(value, schema, path = "root") {
  const errors = [];
  if (Array.isArray(schema?.anyOf)) {
    if (!schema.anyOf.some((sub) => !validateAgainstSchema(value, sub, path).length)) errors.push(`${path}: matches none of anyOf`);
    return errors;
  }
  if (schema?.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} is not one of the allowed values`);
  if (schema?.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const ok = types.some((t) => t === actual || (t === "number" && actual === "integer"));
    if (!ok) { errors.push(`${path}: expected ${types.join(" or ")}, got ${actual}`); return errors; }
  }
  if (typeOf(value) === "object" && schema?.properties) {
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${path}: missing "${key}"`);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!(key in schema.properties)) errors.push(`${path}: unexpected "${key}"`);
    for (const [key, sub] of Object.entries(schema.properties)) if (key in value) errors.push(...validateAgainstSchema(value[key], sub, `${path}.${key}`));
  }
  if (Array.isArray(value) && schema?.items) value.forEach((item, i) => errors.push(...validateAgainstSchema(item, schema.items, `${path}[${i}]`)));
  return errors;
}

/**
 * Shape of a schema for the snapshot test: property names, types, required
 * lists and nesting. Enum values that come from the request (category or
 * ingredient ids) are summarised as "enum", fixed enums are kept.
 */
export function schemaShape(schema, { keepEnums = true } = {}) {
  const shape = (node) => {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node.anyOf)) return { anyOf: node.anyOf.map(shape) };
    const out = { type: node.type };
    if (node.enum) out.enum = keepEnums ? [...node.enum] : "enum";
    if (node.properties) {
      out.properties = Object.fromEntries(Object.keys(node.properties).sort().map((key) => [key, shape(node.properties[key])]));
      out.required = [...(node.required || [])].sort();
    }
    if (node.items) out.items = shape(node.items);
    return out;
  };
  return shape(schema);
}
