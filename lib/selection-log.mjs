import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Append-only JSONL log of every routine run's ingredient selection: the pool
 * each slot offered, what the language model picked (including invalid picks
 * that were rejected), what was finally shown, why any fallback happened, the
 * post-selection safety removals and the CUE results. `npm run
 * report:selection-log` summarises it for the dissertation.
 *
 * The log never stores free-text symptoms, API keys or precise coordinates
 * (location is rounded to 1 decimal place, about 11 km).
 */

function roundCoordinate(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

export function selectionLogRecord({ runId, startedAt, concern, profile, reactivityLevel, environment, routineMode, synthesisStatus, selection, postSafety, cue, llm, gptBudget = null, stages = [] }) {
  const slots = (selection?.pool || []).map((slot) => {
    const entry = (selection?.entries || []).find((item) => item.categoryId === slot.categoryId && item.phase === slot.phase);
    const removed = (postSafety?.removed || []).find((item) => item.categoryId === slot.categoryId && item.phase === slot.phase);
    return {
      categoryId: slot.categoryId,
      phase: slot.phase,
      retrievalMode: slot.retrieval?.mode || null,
      retrievalQuery: slot.retrieval?.query || null,
      poolSource: slot.poolSource,
      pool: (slot.candidates || []).map((candidate) => ({ id: candidate.ingredientId, score: candidate.score, retrievalRank: candidate.retrievalRank ?? null })),
      llmPick: slot.llmPick ?? null,
      llmPickStatus: slot.llmPickStatus || "not_requested",
      selected: entry ? entry.ingredientId : null,
      selectedBy: entry ? entry.selectedBy : null,
      surrogateTopPick: slot.candidates?.[0]?.ingredientId || null,
      agreesWithSurrogate: entry ? Boolean(entry.attribution?.agreesWithSurrogate) : null,
      selectedPoolRank: entry ? entry.attribution?.poolRank ?? null : null,
      removedByPostSafety: removed ? removed.reasons.map((reason) => reason.rule) : [],
    };
  });
  return {
    schemaVersion: "1.0",
    at: new Date().toISOString(),
    runId,
    latencyMs: startedAt ? Date.now() - new Date(startedAt).getTime() : null,
    input: { concern, profile, reactivityLevel: reactivityLevel || "low" },
    environment: {
      mode: environment?.mode || null,
      readings: environment?.readings || {},
      location: environment?.location ? { lat: roundCoordinate(environment.location.lat), lon: roundCoordinate(environment.location.lon) } : null,
    },
    routineMode,
    synthesisStatus,
    selectionMode: selection?.selectionMode || null,
    llm: llm || { requested: false },
    slots,
    postSafety: { status: postSafety?.status || "not_run", removed: (postSafety?.removed || []).map((item) => ({ id: item.ingredientId, rules: item.reasons.map((reason) => reason.rule) })) },
    cue: cue || null,
    gptBudget,
    stages,
  };
}

export async function appendSelectionLog(config, record) {
  if (!config?.selectionLog?.enabled) return false;
  try {
    const path = resolve(process.cwd(), config.selectionLog.path);
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * One record per GPT explanation request: every draft, its facts and its CUE
 * verdict. No user text is stored: the facts are the run's readings, rules and
 * knowledge-base records. Used by `npm run eval:live` and the CUE rating sheet.
 */
export async function appendContextLog(config, record) {
  if (!config?.selectionLog?.enabled) return false;
  try {
    const path = resolve(process.cwd(), config.selectionLog.contextPath || "data/logs/context-log.jsonl");
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify({ schemaVersion: "1.0", at: new Date().toISOString(), ...record })}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}
