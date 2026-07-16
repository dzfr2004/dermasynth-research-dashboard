import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SCHEMA_VERSION = "1.0";
const MIN_TOKEN_LENGTH = 24;
const VALID_ACTIONS = new Set(["approve", "reject", "annotate", "needs_changes"]);
const MAX_SOURCE_ID_LENGTH = 160;
const MAX_NOTE_LENGTH = 1_800;
const MAX_REVIEWER_LABEL_LENGTH = 80;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

let writeChain = Promise.resolve();

export class ReviewerQueueStorageError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "ReviewerQueueStorageError";
  }
}

export class ReviewerQueueInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReviewerQueueInputError";
  }
}

function initialStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    scope: "local_reviewer_annotations_only",
    annotations: [],
  };
}

function cleanText(value, name, maximum, { required = false, singleLine = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new ReviewerQueueInputError(`${name} is required.`);
    return "";
  }
  if (typeof value !== "string" || value.length > maximum || CONTROL_CHARACTER.test(value)) {
    throw new ReviewerQueueInputError(`Invalid ${name}.`);
  }
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (singleLine && /[\n\t]/.test(text)) throw new ReviewerQueueInputError(`Invalid ${name}.`);
  if (required && !text) throw new ReviewerQueueInputError(`${name} is required.`);
  return text;
}

function normaliseSourceId(value) {
  const sourceId = cleanText(value, "sourceId", MAX_SOURCE_ID_LENGTH, { required: true, singleLine: true });
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(sourceId)) throw new ReviewerQueueInputError("Invalid sourceId.");
  return sourceId;
}

function normaliseAction(value) {
  const action = cleanText(value, "action", 40, { required: true, singleLine: true }).toLowerCase();
  if (!VALID_ACTIONS.has(action)) throw new ReviewerQueueInputError("Invalid action.");
  return action;
}

function normaliseReviewerLabel(value) {
  const label = cleanText(value, "reviewerLabel", MAX_REVIEWER_LABEL_LENGTH, { singleLine: true });
  if (!label) return "local-reviewer";
  if (!/^[a-z0-9 ._-]+$/i.test(label)) {
    throw new ReviewerQueueInputError("reviewerLabel may only use letters, numbers, spaces, periods, underscores, and hyphens.");
  }
  return label;
}

function normaliseInput(value, sourceRecords) {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new ReviewerQueueInputError("Review annotation must be an object.");
  const sourceId = normaliseSourceId(value.sourceId);
  const source = sourceRecords.find((record) => record.id === sourceId);
  if (!source) throw new ReviewerQueueInputError("Unknown sourceId.");

  return {
    source,
    action: normaliseAction(value.action),
    note: cleanText(value.note, "note", MAX_NOTE_LENGTH),
    reviewerLabel: normaliseReviewerLabel(value.reviewerLabel),
  };
}

function annotationShape(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  if (typeof value.id !== "string" || typeof value.sourceId !== "string" || typeof value.action !== "string") return false;
  if (typeof value.note !== "string" || typeof value.reviewerLabel !== "string" || typeof value.createdAt !== "string") return false;
  return VALID_ACTIONS.has(value.action);
}

function validateStore(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new ReviewerQueueStorageError("Local reviewer queue storage has an invalid structure.");
  if (value.schemaVersion !== SCHEMA_VERSION || value.scope !== "local_reviewer_annotations_only" || !Array.isArray(value.annotations)) {
    throw new ReviewerQueueStorageError("Local reviewer queue storage has an unsupported schema.");
  }
  if (!value.annotations.every(annotationShape)) {
    throw new ReviewerQueueStorageError("Local reviewer queue storage contains an invalid annotation.");
  }
  return value;
}

async function readStore(storagePath) {
  try {
    return validateStore(JSON.parse(await readFile(storagePath, "utf8")));
  } catch (error) {
    if (error && error.code === "ENOENT") return initialStore();
    if (error instanceof ReviewerQueueStorageError) throw error;
    throw new ReviewerQueueStorageError("Local reviewer queue storage could not be read.", error);
  }
}

async function writeStore(storagePath, store) {
  const directory = dirname(storagePath);
  const temporaryPath = `${storagePath}.${randomUUID()}.tmp`;
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, storagePath);
  } catch (error) {
    throw new ReviewerQueueStorageError("Local reviewer queue storage could not be written.", error);
  }
}

function runExclusive(task) {
  const current = writeChain.then(task);
  // Keep the queue usable after a failed write while still returning the
  // original failure to this request.
  writeChain = current.catch(() => undefined);
  return current;
}

function annotationForResponse(annotation) {
  return {
    id: annotation.id,
    sourceId: annotation.sourceId,
    action: annotation.action,
    note: annotation.note,
    reviewerLabel: annotation.reviewerLabel,
    createdAt: annotation.createdAt,
    effect: "local_annotation_only",
  };
}

function sourceCard(source, annotations) {
  const history = annotations
    .filter((annotation) => annotation.sourceId === source.id)
    .map(annotationForResponse);
  const latest = history.at(-1) || null;

  return {
    sourceId: source.id,
    title: source.title,
    publisher: source.publisher,
    sourceFamily: source.sourceFamily,
    sourceType: source.sourceType,
    publishedYear: source.publishedYear ?? null,
    sourceUrl: source.sourceUrl,
    ingredientIds: Array.isArray(source.ingredientIds) ? [...source.ingredientIds] : [],
    evidenceRole: source.evidenceRole,
    useMode: source.useMode,
    corpusEligibility: source.corpusEligibility,
    atlasClinicalReviewStatus: source.clinicalReviewStatus,
    queueState: latest ? "annotated" : "awaiting_annotation",
    latestAnnotation: latest,
    annotationHistory: history,
    immutableBoundary: "This queue never changes the Atlas record, clinicalReviewStatus, corpus eligibility, Pinecone data, or routine-selection status.",
  };
}

function summary(cards) {
  const actions = Object.fromEntries([...VALID_ACTIONS].map((action) => [action, 0]));
  let awaitingAnnotation = 0;
  for (const card of cards) {
    if (!card.latestAnnotation) {
      awaitingAnnotation += 1;
    } else {
      actions[card.latestAnnotation.action] += 1;
    }
  }
  return { sourceCards: cards.length, awaitingAnnotation, latestActions: actions };
}

/**
 * The reviewer workflow deliberately has a stricter boundary than ordinary
 * demo routes: it is disabled by default, only works in non-production local
 * runs, and requires a locally configured secret header for every request.
 */
export function reviewerQueueAvailability(queueConfig) {
  if (!queueConfig?.requested) {
    return { active: false, mode: "disabled", message: "Reviewer queue is disabled. Set REVIEWER_QUEUE_ENABLED=true for a local review session." };
  }
  if (!queueConfig.localOnly) {
    return { active: false, mode: "refused_nonproduction_only", message: "Reviewer queue is intentionally unavailable when NODE_ENV=production." };
  }
  if (typeof queueConfig.token !== "string" || queueConfig.token.length < MIN_TOKEN_LENGTH) {
    return { active: false, mode: "disabled_missing_token", message: `Reviewer queue requires a locally configured REVIEWER_QUEUE_TOKEN of at least ${MIN_TOKEN_LENGTH} characters.` };
  }
  return { active: true, mode: "local_only_token_protected", message: "Local reviewer queue is active." };
}

/** Constant-time equality prevents token-length/timing leaks on local requests. */
export function reviewerTokenMatches(headers, expectedToken) {
  const candidate = headers?.["x-reviewer-token"];
  if (typeof candidate !== "string" || typeof expectedToken !== "string" || !candidate || !expectedToken) return false;
  const actual = Buffer.from(candidate, "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function getReviewerQueue({ sourceRecords, storagePath }) {
  if (!Array.isArray(sourceRecords) || typeof storagePath !== "string" || !storagePath) {
    throw new ReviewerQueueStorageError("Reviewer queue was not configured with source cards.");
  }
  const store = await readStore(storagePath);
  const cards = sourceRecords.map((source) => sourceCard(source, store.annotations));
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: "local_reviewer_workflow_not_clinical_approval",
    storage: "local_ignored_json_only",
    summary: summary(cards),
    cards,
    limitations: [
      "Recorded actions are local annotations only; they are not clinical approval, a governance decision, or a source-quality conclusion.",
      "The queue does not write to the research Atlas, evidence corpus, Pinecone namespace, strict CUE gate, or routine synthesis path.",
      "Do not enter patient data, identifiers, symptoms, or other sensitive information in review notes.",
    ],
  };
}

export async function appendReviewerAnnotation({ sourceRecords, storagePath, input }) {
  if (!Array.isArray(sourceRecords) || typeof storagePath !== "string" || !storagePath) {
    throw new ReviewerQueueStorageError("Reviewer queue was not configured with source cards.");
  }
  const requested = normaliseInput(input, sourceRecords);
  const annotation = {
    id: `review-${randomUUID()}`,
    sourceId: requested.source.id,
    action: requested.action,
    note: requested.note,
    reviewerLabel: requested.reviewerLabel,
    createdAt: new Date().toISOString(),
    effect: "local_annotation_only",
  };

  await runExclusive(async () => {
    const store = await readStore(storagePath);
    store.annotations.push(annotation);
    await writeStore(storagePath, store);
  });

  return {
    annotation: annotationForResponse(annotation),
    sourceCard: {
      sourceId: requested.source.id,
      title: requested.source.title,
      atlasClinicalReviewStatus: requested.source.clinicalReviewStatus,
      immutableBoundary: "No Atlas, corpus, Pinecone, strict-CUE, or routine-selection field was changed.",
    },
    notice: "The reviewer action was appended to local storage only. It has no automatic clinical, retrieval, or synthesis effect.",
  };
}
