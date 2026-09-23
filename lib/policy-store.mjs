import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const seedUrl = new URL("../data/governance/policy.seed.json", import.meta.url);
const localUrl = new URL("../data/governance/policy.local.json", import.meta.url);
let cached = null;
let cachedMtime = -1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isStringList(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && /^[a-z][a-z0-9-]{1,100}$/.test(item));
}

function validatePolicy(value) {
  if (!value || value.schemaVersion !== "1.0" || typeof value.policyVersion !== "string") throw new Error("Invalid runtime policy version.");
  const environment = value.environment;
  if (!environment || !Number.isFinite(environment.highUvThreshold) || environment.highUvThreshold < 0 || environment.highUvThreshold > 20
    || !Number.isFinite(environment.highPm25Threshold) || environment.highPm25Threshold < 0 || environment.highPm25Threshold > 500) {
    throw new Error("Runtime policy has invalid environmental thresholds.");
  }
  const selection = value.ingredientSelection;
  if (!selection || !Number.isInteger(selection.maxCandidatesPerRun) || selection.maxCandidatesPerRun < 1 || selection.maxCandidatesPerRun > 12
    || !isStringList(selection.eligibleCategories)
    || !isStringList(selection.highReactivityAllowedCategories)) {
    throw new Error("Runtime policy has invalid ingredient-selection configuration.");
  }
  return value;
}

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function localMtime() {
  try {
    return existsSync(localUrl) ? statSync(localUrl).mtimeMs : 0;
  } catch {
    return 0;
  }
}

export function getRuntimePolicy() {
  const mtime = localMtime();
  if (cached && cachedMtime === mtime) return clone(cached);
  const source = mtime ? localUrl : seedUrl;
  cached = Object.freeze(validatePolicy(readJson(source)));
  cachedMtime = mtime;
  return clone(cached);
}

export async function saveRuntimePolicy(nextPolicy) {
  const validated = validatePolicy(clone(nextPolicy));
  await mkdir(dirname(localUrl.pathname), { recursive: true });
  const tempUrl = new URL(`../data/governance/policy.${Date.now()}.tmp`, import.meta.url);
  await writeFile(tempUrl, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  await rename(tempUrl, localUrl);
  cached = Object.freeze(validated);
  cachedMtime = localMtime();
  return clone(cached);
}

export function publicRuntimePolicy(policy = getRuntimePolicy()) {
  return {
    schemaVersion: policy.schemaVersion,
    policyVersion: policy.policyVersion,
    environment: { ...policy.environment },
    ingredientSelection: {
      maxCandidatesPerRun: policy.ingredientSelection.maxCandidatesPerRun,
      eligibleCategories: [...policy.ingredientSelection.eligibleCategories],
      highReactivityAllowedCategories: [...policy.ingredientSelection.highReactivityAllowedCategories],
    },
    mode: localMtime() ? "local_override" : "seed_policy",
  };
}
