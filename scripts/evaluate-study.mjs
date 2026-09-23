import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_CONCERNS,
  ALLOWED_FINISH_PREFERENCES,
  ALLOWED_PROFILES,
  ALLOWED_REACTIVITY_LEVELS,
  ALLOWED_ROUTINE_CATEGORY_IDS,
  ROUTINE_CATEGORY_CATALOG,
  firstSafetyPass,
  secondSafetyPass,
  templateRoutine,
  triageRoutineRequest,
} from "../lib/safety.mjs";
import { retrieveEvidence } from "../lib/retrieval.mjs";
import { getIngredientKnowledgeBase } from "../lib/ingredient-knowledge.mjs";
import { categoryReferenceExamples } from "../lib/ingredients.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRelativePath = "data/evaluation/fixtures/study-evaluation.v1.json";
const fixturePath = join(root, fixtureRelativePath);
const reportsDirectory = join(root, "data/evaluation/reports");
const reportPaths = {
  json: join(reportsDirectory, "study-evaluation.latest.json"),
  csv: join(reportsDirectory, "study-evaluation.latest.csv"),
  markdown: join(reportsDirectory, "study-evaluation.latest.md"),
};

const fixtureSource = await readFile(fixturePath, "utf8");
const fixture = JSON.parse(fixtureSource);
const knowledgeBaseIngredientCandidates = getIngredientKnowledgeBase().ingredients;
const fixtureSha256 = createHash("sha256").update(fixtureSource).digest("hex");
const results = [];

function requireFixture(condition, message) {
  if (!condition) throw new Error(`Invalid study fixture: ${message}`);
}

function hasOnlyUniqueStrings(values) {
  return Array.isArray(values) && values.length > 0 && values.every((value) => typeof value === "string" && value) && new Set(values).size === values.length;
}

function validateFixture(value) {
  requireFixture(value?.schemaVersion === "1.0", "schemaVersion must be 1.0.");
  requireFixture(hasOnlyUniqueStrings(value.requiredConcernCodes), "requiredConcernCodes must be unique non-empty strings.");
  requireFixture(hasOnlyUniqueStrings(value.profiles), "profiles must be unique non-empty strings.");
  requireFixture(value?.routineContract?.minimumSteps >= 1, "routineContract.minimumSteps is required.");
  requireFixture(value?.routineContract?.maximumSteps >= value.routineContract.minimumSteps, "routineContract step bounds are invalid.");
  requireFixture(Array.isArray(value.triageCases) && value.triageCases.length === 30, "exactly 30 triage cases are required.");
  requireFixture(new Set(value.triageCases.map((item) => item.id)).size === value.triageCases.length, "triage case IDs must be unique.");
  requireFixture(Array.isArray(value.adversarialRoutineCases) && value.adversarialRoutineCases.length >= 1, "adversarialRoutineCases are required.");
  requireFixture(Array.isArray(value?.retrievalFixture?.hits) && value.retrievalFixture.hits.length >= 3, "three retrieval fixture hits are required.");

  const ingredientResearch = value?.ingredientResearch;
  requireFixture(ingredientResearch?.schemaVersion === "1.0", "ingredientResearch.schemaVersion must be 1.0.");
  requireFixture(typeof ingredientResearch?.catalogVersion === "string" && ingredientResearch.catalogVersion, "ingredientResearch.catalogVersion is required.");
  requireFixture(ingredientResearch?.outputMode === "category_only", "ingredientResearch.outputMode must be category_only.");
  requireFixture(ingredientResearch?.catalogStatus === "audit_only", "ingredientResearch.catalogStatus must be audit_only.");
  requireFixture(ingredientResearch?.routineSelectionAllowed === false, "ingredientResearch must prohibit routine selection.");
  requireFixture(Array.isArray(ingredientResearch?.evidenceRecords) && ingredientResearch.evidenceRecords.length >= 1, "ingredientResearch evidence records are required.");
  requireFixture(Array.isArray(ingredientResearch?.candidates) && ingredientResearch.candidates.length >= 1, "ingredientResearch candidates are required.");
  requireFixture(new Set(ingredientResearch.candidates.map((item) => item.id)).size === ingredientResearch.candidates.length, "ingredientResearch candidate IDs must be unique.");
  for (const record of ingredientResearch.evidenceRecords) {
    requireFixture(typeof record?.id === "string" && record.id, "ingredient evidence record ID is required.");
    requireFixture(record.productSpecific === true, `ingredient evidence record ${record.id} must be product-specific.`);
    requireFixture(record.industrySponsored === true, `ingredient evidence record ${record.id} must retain industry sponsorship.`);
    requireFixture(hasOnlyUniqueStrings(record.requiredLimitationFragments), `ingredient evidence record ${record.id} needs limitation fragments.`);
  }
  for (const candidate of ingredientResearch.candidates) {
    requireFixture(typeof candidate?.id === "string" && candidate.id, "ingredient candidate ID is required.");
    requireFixture(typeof candidate?.displayName === "string" && candidate.displayName, `ingredient candidate ${candidate.id} displayName is required.`);
    requireFixture(hasOnlyUniqueStrings(candidate.concernContexts), `ingredient candidate ${candidate.id} needs concern contexts.`);
    requireFixture(candidate.status === "held_audit_only", `ingredient candidate ${candidate.id} must be held_audit_only.`);
    requireFixture(hasOnlyUniqueStrings(candidate.evidenceRecordIds), `ingredient candidate ${candidate.id} needs evidence record IDs.`);
    requireFixture(candidate.routineSelectionAllowed === false, `ingredient candidate ${candidate.id} must prohibit routine selection.`);
    requireFixture(hasOnlyUniqueStrings(candidate.requiredBlockedReasonFragments), `ingredient candidate ${candidate.id} needs blocked-reason fragments.`);
  }
}

function displayError(error) {
  return error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "Unknown error";
}

async function evaluate({ id, category, title, expected }, callback) {
  if (results.some((result) => result.id === id)) {
    throw new Error(`Duplicate evaluation case ID: ${id}`);
  }

  try {
    await callback();
    results.push({ id, category, title, expected, status: "passed", detail: "" });
  } catch (error) {
    results.push({ id, category, title, expected, status: "failed", detail: displayError(error) });
  }
}

function routineText(routine) {
  return [
    routine?.label,
    routine?.reason,
    ...(Array.isArray(routine?.steps) ? routine.steps.flat() : []),
  ].filter(Boolean).join(" ");
}

function sortedStrings(values) {
  return [...values].map((value) => String(value)).sort();
}

function assertAuditOnlyIngredientCandidate(actual, expected) {
  assert.ok(actual && typeof actual === "object" && !Array.isArray(actual), `Missing ingredient candidate ${expected.id}.`);
  assert.equal(actual.id, expected.id);
  assert.equal(actual.displayName, expected.displayName);
  assert.deepEqual(sortedStrings(actual.concernContexts || []), sortedStrings(expected.concernContexts));
  assert.equal(actual.status, expected.status);
  assert.deepEqual(sortedStrings(actual.evidenceRecordIds || []), sortedStrings(expected.evidenceRecordIds));
  assert.equal(actual.routineSelectionAllowed, false, `${expected.id} must remain unavailable for routine selection.`);
  assert.ok(Array.isArray(actual.selectionBlockedReasons) && actual.selectionBlockedReasons.length > 0, `${expected.id} must expose a selection-blocking reason.`);
  const reasons = actual.selectionBlockedReasons.join(" ").toLowerCase();
  for (const fragment of expected.requiredBlockedReasonFragments) {
    assert.ok(reasons.includes(fragment.toLowerCase()), `${expected.id} did not preserve the ${fragment} selection blocker.`);
  }
}

function assertNoIngredientRoutineSelections(routine, candidates = [...fixture.ingredientResearch.candidates, ...knowledgeBaseIngredientCandidates]) {
  const visibleRoutineText = routineText(routine).toLowerCase();
  for (const candidate of candidates) {
    assert.equal(
      visibleRoutineText.includes(candidate.displayName.toLowerCase()),
      false,
      `Routine text must not select or display the held ingredient ${candidate.displayName}.`,
    );
  }

  const structuredSteps = [...(routine?.am || []), ...(routine?.pm || [])];
  for (const step of structuredSteps) {
    assert.equal(step?.ingredientId ?? "", "", "Category-only routine steps must not contain an ingredient ID.");
    assert.equal(step?.ingredient ?? "", "", "Category-only routine steps must not contain a named ingredient.");
  }

  for (const field of ["ingredientSelections", "selectedIngredients"]) {
    if (Array.isArray(routine?.[field])) {
      assert.equal(routine[field].length, 0, `Routine ${field} must remain empty while the ingredient catalog is audit-only.`);
    }
  }
}

function assertIngredientResearchRoutineContract(ingredientResearch, concern) {
  assert.ok(ingredientResearch && typeof ingredientResearch === "object" && !Array.isArray(ingredientResearch), "Routine response must expose ingredient research status.");
  assert.equal(ingredientResearch.schemaVersion, fixture.ingredientResearch.schemaVersion);
  assert.equal(ingredientResearch.catalogVersion, fixture.ingredientResearch.catalogVersion);
  assert.equal(ingredientResearch.outputMode, fixture.ingredientResearch.outputMode);
  assert.equal(ingredientResearch.catalogStatus, fixture.ingredientResearch.catalogStatus);
  assert.equal(ingredientResearch.concern, concern);
  assert.equal(ingredientResearch.routineSelectionAllowed, false, "Audit-only candidates must not be selectable in a routine.");
  assert.ok(typeof ingredientResearch.rationale === "string" && ingredientResearch.rationale, "Ingredient research status must explain its scope.");
  assert.ok(Array.isArray(ingredientResearch.limitations) && ingredientResearch.limitations.length > 0, "Ingredient research status must retain limitations.");
  assert.ok(ingredientResearch.knowledgeBase && typeof ingredientResearch.knowledgeBase === "object", "Routine response must expose the ingredient knowledge-base review queue.");
  assert.equal(ingredientResearch.knowledgeBase.deploymentScope, "research_only_noncommercial");
  assert.equal(ingredientResearch.knowledgeBase.corpusStatus, "review_pending");
  assert.equal(ingredientResearch.knowledgeBase.routineSelectionAllowed, false);
  assert.equal(ingredientResearch.knowledgeBase.pineconeUploadAllowed, false);
  assert.ok(Array.isArray(ingredientResearch.knowledgeBase.candidates), "Knowledge-base candidates must be an array.");
  assert.ok(ingredientResearch.knowledgeBase.candidates.every((candidate) => candidate?.routineSelectionAllowed === false), "Knowledge-base candidates must remain non-selectable.");

  if (concern === "barrier") {
    assert.equal(ingredientResearch.status, "held_audit_only");
    assert.equal(ingredientResearch.candidates?.length, fixture.ingredientResearch.candidates.length);
    for (const expected of fixture.ingredientResearch.candidates) {
      assertAuditOnlyIngredientCandidate(ingredientResearch.candidates.find((candidate) => candidate?.id === expected.id), expected);
    }
  } else {
    assert.equal(ingredientResearch.status, "no_candidates_for_concern");
    assert.deepEqual(ingredientResearch.candidates, []);
  }
}

function assertRoutineContract(routine, { allowResearchReason = true } = {}) {
  const { minimumSteps, maximumSteps, restrictedContentPattern } = fixture.routineContract;
  assert.ok(routine && typeof routine === "object" && !Array.isArray(routine), "Expected a routine object.");
  assert.equal(typeof routine.label, "string", "Routine label must be a string.");
  assert.ok(routine.label.trim(), "Routine label must not be empty.");
  assert.equal(typeof routine.reason, "string", "Routine reason must be a string.");
  assert.ok(routine.reason.trim(), "Routine reason must not be empty.");
  if (allowResearchReason) assert.match(routine.reason, /research/i, "Routine reason must retain research-only context.");
  assert.ok(Array.isArray(routine.steps), "Routine steps must be an array.");
  assert.ok(routine.steps.length >= minimumSteps && routine.steps.length <= maximumSteps, `Routine must have ${minimumSteps}–${maximumSteps} steps.`);
  for (const [index, step] of routine.steps.entries()) {
    assert.ok(Array.isArray(step) && step.length === 2, `Step ${index + 1} must be a [title, note] pair.`);
    assert.equal(typeof step[0], "string", `Step ${index + 1} title must be a string.`);
    assert.equal(typeof step[1], "string", `Step ${index + 1} note must be a string.`);
    assert.ok(step[0].trim() && step[1].trim(), `Step ${index + 1} must not be empty.`);
  }
  assert.ok(Array.isArray(routine.am) && routine.am.length >= 2, "Routine must include at least two morning category steps.");
  assert.ok(Array.isArray(routine.pm) && routine.pm.length >= 2, "Routine must include at least two evening category steps.");
  const phaseSteps = [...routine.am, ...routine.pm];
  for (const [index, step] of phaseSteps.entries()) {
    assert.ok(step && typeof step === "object" && !Array.isArray(step), `Structured step ${index + 1} must be an object.`);
    assert.ok(ALLOWED_ROUTINE_CATEGORY_IDS.has(step.id), `Structured step ${index + 1} used a category outside the allowlist.`);
    assert.equal(typeof step.title, "string", `Structured step ${index + 1} title must be a string.`);
    assert.equal(typeof step.note, "string", `Structured step ${index + 1} note must be a string.`);
    assert.ok(Array.isArray(step.evidenceIds), `Structured step ${index + 1} must expose evidence IDs as an array.`);
    assert.ok(Array.isArray(step.ruleIds) && step.ruleIds.length > 0, `Structured step ${index +1} must expose at least one rule ID.`);
  }
  assert.deepEqual(
    routine.steps,
    phaseSteps.map((step) => [step.title, step.note]),
    "Legacy tuple steps must remain in the same order as the AM/PM structure.",
  );
  assert.equal(routine.generation?.categoryOnly, true, "Routine must retain the category-only generation marker.");
  assert.doesNotMatch(routineText(routine), new RegExp(restrictedContentPattern, "i"), "Routine must not contain restricted medical or prescription content.");
  assertNoIngredientRoutineSelections(routine);
}

function createAdversarialRoutine(text) {
  return {
    label: "Research preview",
    steps: [["Gentle cleansing category", "Non-prescriptive research context"]],
    reason: text,
  };
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  if (!port) throw new Error("Could not reserve an isolated evaluation port.");
  return port;
}

async function startOfflineServer() {
  const port = await reservePort();
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: {
      PATH: process.env.PATH || "",
      PORT: String(port),
      LIVE_SERVICES_ENABLED: "false",
      // Keep this reproducible regression pack independent from a developer's
      // locally approved knowledge-base state. Database selection has its own
      // dedicated regression suite.
      INGREDIENT_DB_ENABLED: "false",
      INGREDIENT_SELECTION_ENABLED: "false",
      OPENAI_API_KEY: "",
      OPENWEATHER_API_KEY: "",
      IQAIR_API_KEY: "",
      PINECONE_API_KEY: "",
      PINECONE_INDEX: "",
      PINECONE_INDEX_HOST: "",
      PINECONE_NAMESPACE: "__offline_evaluation__",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });

  await new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => rejectPromise(new Error(`Isolated server did not start within five seconds. ${output}`)), 5_000);
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("error", onError);
      child.off("exit", onExit);
      child.stdout.off("data", onOutput);
    };
    const onError = (error) => {
      cleanup();
      rejectPromise(error);
    };
    const onExit = (code) => {
      cleanup();
      rejectPromise(new Error(`Isolated server exited early (${code}). ${output}`));
    };
    const onOutput = (chunk) => {
      if (String(chunk).includes(`:${port}`)) {
        cleanup();
        resolvePromise();
      }
    };
    child.once("error", onError);
    child.once("exit", onExit);
    child.stdout.on("data", onOutput);
  });

  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill("SIGINT");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000)),
  ]);
  if (child.exitCode === null && !child.signalCode) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

async function postJson(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const payload = await response.json();
  return { response, payload };
}

function expectedConcernCodes() {
  return [...new Set([...fixture.requiredConcernCodes, ...ALLOWED_CONCERNS])].sort();
}

function compactSummary(items) {
  const grouped = new Map();
  for (const item of items) {
    const entry = grouped.get(item.category) || { category: item.category, total: 0, passed: 0, failed: 0 };
    entry.total += 1;
    if (item.status === "passed") entry.passed += 1;
    else entry.failed += 1;
    grouped.set(item.category, entry);
  }
  return [...grouped.values()].sort((left, right) => left.category.localeCompare(right.category));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function reportMarkdown(report) {
  const categoryRows = report.summary.byCategory
    .map((item) => `| ${item.category} | ${item.passed} | ${item.failed} | ${item.total} |`)
    .join("\n");
  const failures = report.cases.filter((item) => item.status === "failed");
  const failureSection = failures.length
    ? ["## Failures", "", "| Case | Category | Detail |", "| --- | --- | --- |", ...failures.map((item) => `| ${item.id} | ${item.category} | ${item.detail.replaceAll("|", "\\|")} |`)].join("\n")
    : "## Failures\n\nNone.";

  return [
    "# DermaSynth offline study evaluation report",
    "",
    `Fixture: \`${report.fixture.path}\``,
    `Fixture SHA-256: \`${report.fixture.sha256}\``,
    "",
    `Result: **${report.summary.passed}/${report.summary.total} passed; ${report.summary.failed} failed.**`,
    "",
    "## Coverage",
    "",
    "| Category | Passed | Failed | Total |",
    "| --- | ---: | ---: | ---: |",
    categoryRows,
    "",
    failureSection,
    "",
    "## Scope and limitations",
    "",
    ...report.limitations.map((item) => `- ${item}`),
    "",
    "The accompanying JSON and CSV contain the full deterministic case-level export.",
    "",
  ].join("\n");
}

async function writeReports() {
  const failures = results.filter((result) => result.status === "failed");
  const report = {
    schemaVersion: "1.0",
    suite: fixture.suiteId,
    fixture: {
      path: fixtureRelativePath,
      version: fixture.fixtureVersion,
      sha256: fixtureSha256,
    },
    execution: {
      mode: "offline deterministic regression",
      liveProvidersCalled: false,
      deterministicRunMarker: `${fixture.suiteId}:${fixture.fixtureVersion}`,
    },
    summary: {
      total: results.length,
      passed: results.length - failures.length,
      failed: failures.length,
      byCategory: compactSummary(results),
    },
    limitations: [
      "This suite verifies implementation behaviour with synthetic fixtures; it is not clinical validation or a measure of treatment effectiveness.",
      "The isolated server runs with live services disabled and provider credentials explicitly blank; no live provider calls are made.",
      "It is not a dermatologist audit, a blinded study, an inter-rater reliability assessment, or a user-acceptance test.",
      "The retrieval check verifies provenance-field preservation and a deterministic coverage proxy; it does not establish retrieval relevance, faithfulness, or calibration against a judged corpus.",
    ],
    cases: results,
  };

  const csvRows = [
    ["case_id", "category", "status", "title", "expected", "detail"],
    ...results.map((result) => [result.id, result.category, result.status, result.title, result.expected, result.detail]),
  ].map((row) => row.map(csvCell).join(",")).join("\n").concat("\n");

  await mkdir(reportsDirectory, { recursive: true });
  await Promise.all([
    writeFile(reportPaths.json, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(reportPaths.csv, csvRows, "utf8"),
    writeFile(reportPaths.markdown, reportMarkdown(report), "utf8"),
  ]);

  console.log(JSON.stringify({
    suite: report.suite,
    total: report.summary.total,
    passed: report.summary.passed,
    failed: report.summary.failed,
    reports: Object.fromEntries(Object.entries(reportPaths).map(([key, value]) => [key, value.replace(`${root}/`, "")])),
  }, null, 2));

  if (failures.length) process.exitCode = 1;
}

validateFixture(fixture);

await evaluate({
  id: "catalogue-required-concerns",
  category: "catalogue",
  title: "All required concern codes are exported by the safety module",
  expected: `Includes ${fixture.requiredConcernCodes.join(", ")}`,
}, () => {
  const missing = fixture.requiredConcernCodes.filter((concern) => !ALLOWED_CONCERNS.has(concern));
  assert.deepEqual(missing, [], `Missing concern codes: ${missing.join(", ")}`);
});

await evaluate({
  id: "catalogue-profiles",
  category: "catalogue",
  title: "All fixture profile codes are exported by the safety module",
  expected: `Includes ${fixture.profiles.join(", ")}`,
}, () => {
  const missing = fixture.profiles.filter((profile) => !ALLOWED_PROFILES.has(profile));
  assert.deepEqual(missing, [], `Missing profile codes: ${missing.join(", ")}`);
});

await evaluate({
  id: "catalogue-profile-modifiers",
  category: "catalogue",
  title: "Optional cosmetic profile modifiers retain their fixed enum contract",
  expected: "finish: matte/dewy/no-preference; reactivity: low/moderate/high",
}, () => {
  assert.deepEqual([...ALLOWED_FINISH_PREFERENCES].sort(), ["dewy", "matte", "no-preference"]);
  assert.deepEqual([...ALLOWED_REACTIVITY_LEVELS].sort(), ["high", "low", "moderate"]);
});

await evaluate({
  id: "category-reference-static-contract",
  category: "category_reference",
  title: "Every general category reference is static, bounded, and detached from individual routine inputs",
  expected: "one-argument category lookup, 2–4 class examples per allowlisted category, and defensive copies",
}, () => {
  assert.equal(categoryReferenceExamples.length, 1, "Category reference lookup must accept only a category ID.");
  const categoryIds = Object.keys(ROUTINE_CATEGORY_CATALOG);
  assert.ok(categoryIds.length > 0, "Expected at least one allowlisted routine category.");
  for (const categoryId of categoryIds) {
    const expected = categoryReferenceExamples(categoryId);
    assert.ok(Array.isArray(expected) && expected.length >= 2 && expected.length <= 4, `${categoryId} must have 2–4 static examples.`);
    assert.ok(expected.every((example) => typeof example === "string" && example.trim()), `${categoryId} examples must be non-empty strings.`);
    expected[0] = "mutated caller copy";
    assert.notEqual(categoryReferenceExamples(categoryId)[0], "mutated caller copy", `${categoryId} must return a defensive copy.`);
  }
  assert.deepEqual(categoryReferenceExamples("unknown-category"), [], "Unknown categories must not return a reference example.");
});

for (const concern of expectedConcernCodes()) {
  await evaluate({
    id: `template-${concern}`,
    category: "routine_template",
    title: `Generic ${concern} template has a safe research-only routine contract`,
    expected: "3–8 non-empty category steps with AM/PM rule traces; no restricted content; high-UV pass clears",
  }, () => {
    const routine = templateRoutine(concern);
    assertRoutineContract(routine);
    const environment = { readings: { uvi: 8, humidity: 70, temperature: 30, pm25: 15 } };
    const firstPass = firstSafetyPass({ concern, environment });
    assert.equal(firstPass.status, "cleared");
    assert.ok(firstPass.checks.some((check) => check.startsWith("High UV rule:")), "High-UV check was not recorded.");
    const secondPass = secondSafetyPass(routine, { concern, environment });
    assert.equal(secondPass.status, "cleared", secondPass.flags.join(" "));
  });
}

for (const item of fixture.triageCases) {
  await evaluate({
    id: item.id,
    category: "triage",
    title: `Triage routes fixture ${item.id}`,
    expected: item.expectedStatus,
  }, () => {
    const result = triageRoutineRequest({ symptoms: item.input });
    assert.equal(result.status, item.expectedStatus);
    if (item.expectedStatus === "medical_redirect") {
      assert.ok(result.notices.length > 0, "A medical redirect must include a user-facing notice.");
    }
  });
}

for (const item of fixture.adversarialRoutineCases) {
  await evaluate({
    id: item.id,
    category: "output_guardrail",
    title: `Second safety pass blocks ${item.expectedFlag}`,
    expected: `review_required with a ${item.expectedFlag} flag`,
  }, () => {
    const environment = { readings: { uvi: item.context?.uvi ?? 2 } };
    const result = secondSafetyPass(createAdversarialRoutine(item.text), {
      concern: item.context?.concern,
      environment,
    });
    assert.equal(result.status, "review_required");
    assert.ok(result.flags.some((flag) => flag.includes(item.expectedFlag)), `Missing ${item.expectedFlag} flag.`);
  });
}

await evaluate({
  id: "retrieval-seed-disabled",
  category: "retrieval_provenance",
  title: "Disabled retrieval returns a labelled seed response",
  expected: "seed mode, zero score and evidence, no live provider call",
}, async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("Fetch should not be called in disabled mode.");
  };
  try {
    const result = await retrieveEvidence({
      config: { liveServicesEnabled: false },
      profile: fixture.profiles[0],
      concern: fixture.requiredConcernCodes[0],
      environment: { readings: {} },
    });
    assert.equal(result.mode, "seed");
    assert.equal(result.sufficiencyScore, 0);
    assert.equal(fetchCalled, false);
    assert.equal(result.evidence.length, 0);
    assert.equal(result.scoreType, "evidence_sufficiency_coverage");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await evaluate({
  id: "retrieval-citation-contract",
  category: "retrieval_provenance",
  title: "Mocked retrieval preserves usable source, citation, locator, tier, and jurisdiction fields",
  expected: "three eligible evidence notes across two documents; evidence-sufficiency score 1.00; unsafe URL omitted",
}, async () => {
  const originalFetch = globalThis.fetch;
  const retrieval = fixture.retrievalFixture;
  let discoveryRequested = false;
  let searchRequested = false;

  globalThis.fetch = async (requestUrl, options = {}) => {
    const url = new URL(requestUrl);
    if (url.origin === "https://api.pinecone.io") {
      discoveryRequested = true;
      assert.equal(url.pathname, `/indexes/${encodeURIComponent(retrieval.indexName)}`);
      return new Response(JSON.stringify(retrieval.descriptor), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (url.hostname === retrieval.descriptor.host) {
      searchRequested = true;
      assert.equal(url.pathname, `/records/namespaces/${encodeURIComponent(retrieval.namespace)}/search`);
      assert.equal(options.method, "POST");
      const body = JSON.parse(String(options.body));
      assert.equal(body.query.top_k, 8);
      assert.match(body.query.inputs.text, /acne skincare/i);
      assert.match(body.query.inputs.text, /combination skin profile/i);
      for (const field of ["chunk_text", "citation_text", "source_locator", "evidence_tier", "jurisdiction"]) {
        assert.ok(body.fields.includes(field), `Missing requested retrieval field: ${field}`);
      }
      return new Response(JSON.stringify({ result: { hits: retrieval.hits } }), { status: 200, headers: { "content-type": "application/json" } });
    }

    throw new Error(`Unexpected mocked URL: ${url}`);
  };

  try {
    const result = await retrieveEvidence({
      config: {
        liveServicesEnabled: true,
        requestTimeoutMs: 1_000,
        pinecone: {
          apiKey: "offline-fixture-key",
          index: retrieval.indexName,
          indexHost: "",
          namespace: retrieval.namespace,
          textField: "chunk_text",
          titleField: "title",
          sourceField: "source",
        },
      },
      profile: "combination",
      concern: "acne",
      environment: { readings: { uvi: 8, humidity: 70, pm25: 10 } },
    });

    assert.equal(discoveryRequested, true);
    assert.equal(searchRequested, true);
    assert.equal(result.mode, "pinecone");
    assert.equal(result.sufficiencyScore, 1);
    assert.equal(result.evidence.length, 3);
    assert.equal(new Set(result.evidence.map((item) => item.documentId)).size, 2);
    for (const item of result.evidence) {
      assert.ok(item.title && item.source && item.documentId && item.citation && item.sourceLocator && item.evidenceTier && item.jurisdiction, "Evidence provenance metadata was incomplete.");
    }
    assert.equal(result.evidence[0].sourceUrl, "https://example.org/fixture-a");
    assert.equal(result.evidence[2].sourceUrl, "", "Unsafe source URLs must be omitted from the response.");
    assert.equal(result.scoreType, "evidence_sufficiency_coverage");
    assert.equal(result.gate?.passed, true);
    assert.equal(result.eligibleEvidence?.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await evaluate({
  id: "retrieval-unqualified-approval-hold",
  category: "retrieval_provenance",
  title: "User-confirmed or anonymous approval cannot satisfy the strict category gate",
  expected: "unqualified approval remains visible but all affected records are withheld from strict CUE and live synthesis",
}, async () => {
  const originalFetch = globalThis.fetch;
  const retrieval = fixture.retrievalFixture;
  const hits = structuredClone(retrieval.hits);
  for (const hit of hits) {
    hit.fields.clinical_review_status = "approved: user-confirmed; reviewer identity not captured";
  }

  globalThis.fetch = async (requestUrl) => {
    const url = new URL(requestUrl);
    if (url.origin === "https://api.pinecone.io") {
      return new Response(JSON.stringify(retrieval.descriptor), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname === retrieval.descriptor.host) {
      return new Response(JSON.stringify({ result: { hits } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected mocked URL: ${url}`);
  };

  try {
    const result = await retrieveEvidence({
      config: {
        liveServicesEnabled: true,
        requestTimeoutMs: 1_000,
        pinecone: {
          apiKey: "offline-fixture-key",
          index: retrieval.indexName,
          indexHost: "",
          namespace: retrieval.namespace,
          textField: "chunk_text",
          titleField: "title",
          sourceField: "source",
        },
      },
      profile: "combination",
      concern: "acne",
      environment: { readings: { uvi: 8, humidity: 70, pm25: 10 } },
    });
    assert.equal(result.eligibleEvidence.length, 0);
    assert.equal(result.gate.passed, false);
    assert.ok(result.evidence.every((item) => item.eligibility.blockers.includes("review-approval-not-qualified")));
    assert.ok(result.notices.some((notice) => /user confirmation or a source-card status cannot activate/i.test(notice)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await evaluate({
  id: "retrieval-ingredient-activation-hold",
  category: "ingredient_knowledge_base",
  title: "Ingredient-tagged evidence cannot satisfy the generic category gate before explicit activation",
  expected: "the tagged source remains visible for audit, is excluded from eligibility, and prevents the CUE gate from passing",
}, async () => {
  const originalFetch = globalThis.fetch;
  const retrieval = fixture.retrievalFixture;
  const hits = structuredClone(retrieval.hits);
  hits[0].fields.ingredient_evidence_role = "ingredient_specific_clinical_context";
  hits[0].fields.ingredient_ids = ["niacinamide"];

  globalThis.fetch = async (requestUrl) => {
    const url = new URL(requestUrl);
    if (url.origin === "https://api.pinecone.io") {
      return new Response(JSON.stringify(retrieval.descriptor), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname === retrieval.descriptor.host) {
      return new Response(JSON.stringify({ result: { hits } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected mocked URL: ${url}`);
  };

  try {
    const result = await retrieveEvidence({
      config: {
        liveServicesEnabled: true,
        requestTimeoutMs: 1_000,
        pinecone: {
          apiKey: "offline-fixture-key",
          index: retrieval.indexName,
          indexHost: "",
          namespace: retrieval.namespace,
          textField: "chunk_text",
          titleField: "title",
          sourceField: "source",
        },
      },
      profile: "combination",
      concern: "acne",
      environment: { readings: { uvi: 8, humidity: 70, pm25: 10 } },
    });
    assert.equal(result.evidence[0].ingredientEvidenceRole, "ingredient_specific_clinical_context");
    assert.ok(result.evidence[0].eligibility.blockers.includes("ingredient-evidence-not-activated"));
    assert.equal(result.eligibleEvidence.length, 2);
    assert.equal(result.gate.passed, false);
    assert.ok(result.notices.some((notice) => /ingredient-tagged research notes remain audit-only/i.test(notice)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

let offlineServer;
let offlineRoutineRequestCount = 0;
const OFFLINE_ROUTINE_REQUEST_BUDGET = 6;

// Keep every API assertion independent of the production per-client routine
// guard. The isolated server is restarted before the next request would hit
// that guard; it never enables a provider or a credential.
async function postOfflineRoutine(body) {
  if (!offlineServer || offlineRoutineRequestCount >= OFFLINE_ROUTINE_REQUEST_BUDGET) {
    if (offlineServer) await stopServer(offlineServer.child);
    offlineServer = await startOfflineServer();
    offlineRoutineRequestCount = 0;
  }
  offlineRoutineRequestCount += 1;
  return postJson(offlineServer.baseUrl, "/api/routine", body);
}

await evaluate({
  id: "api-isolated-server-start",
  category: "api_contract",
  title: "An isolated offline server starts with provider credentials blank",
  expected: "server listens in demo mode without contacting providers",
}, async () => {
  offlineServer = await startOfflineServer();
});

if (offlineServer) {
  try {
    await evaluate({
      id: "api-category-reference-static",
      category: "category_reference",
      title: "Static category references are cacheable and absent from individual routine responses",
      expected: "cacheable category-ID map with bounded class examples, no request-specific body fields, and no routine-selection permission",
    }, async () => {
      const { response, payload } = await getJson(offlineServer.baseUrl, "/api/category-reference");
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control") || "", /public/i, "Category references should be cacheable static data.");
      assert.equal(payload.routineSelectionAllowed, false, "Category reference content must not enable routine selection.");
      assert.equal(Object.hasOwn(payload, "requestId"), false, "Static body must not include a request-specific ID.");
      assert.deepEqual(Object.keys(payload.categories || {}).sort(), Object.keys(ROUTINE_CATEGORY_CATALOG).sort());
      for (const categoryId of Object.keys(ROUTINE_CATEGORY_CATALOG)) {
        assert.deepEqual(payload.categories[categoryId]?.examples, categoryReferenceExamples(categoryId), `${categoryId} reference examples must be static.`);
      }
      const repeated = await getJson(offlineServer.baseUrl, "/api/category-reference");
      assert.equal(repeated.response.status, 200);
      assert.deepEqual(repeated.payload, payload, "Repeated static category-reference fetches must be input-independent and identical.");
    });

    await evaluate({
      id: "api-ingredients-audit-catalog",
      category: "ingredient_catalog",
      title: "Ingredient endpoint exposes only held, product-specific research candidates",
      expected: "versioned category-only audit catalog with four non-selectable candidates linked to the product-specific sponsored evidence record",
    }, async () => {
      const { response, payload } = await getJson(offlineServer.baseUrl, "/api/ingredients");
      assert.equal(response.status, 200);
      assert.equal(payload.schemaVersion, fixture.ingredientResearch.schemaVersion);
      assert.equal(payload.catalogVersion, fixture.ingredientResearch.catalogVersion);
      assert.equal(payload.outputMode, fixture.ingredientResearch.outputMode);
      assert.equal(payload.catalogStatus, fixture.ingredientResearch.catalogStatus);
      assert.equal(payload.routineSelectionAllowed, false);
      assert.ok(typeof payload.scope === "string" && payload.scope, "Ingredient catalog must state its research scope.");
      assert.equal(payload.selectionPolicy?.status, "blocked", "Ingredient catalog must block named-ingredient routine selection.");
      assert.ok(typeof payload.selectionPolicy?.rationale === "string" && payload.selectionPolicy.rationale, "Ingredient catalog must state why selection is blocked.");
      assert.ok(Array.isArray(payload.limitations) && payload.limitations.length > 0, "Ingredient catalog must retain limitations.");
      assert.ok(typeof payload.requestId === "string" && payload.requestId, "Ingredient catalog must include a request ID.");

      assert.equal(payload.evidenceRecords?.length, fixture.ingredientResearch.evidenceRecords.length);
      for (const expectedRecord of fixture.ingredientResearch.evidenceRecords) {
        const actualRecord = payload.evidenceRecords.find((record) => record?.id === expectedRecord.id);
        assert.ok(actualRecord, `Missing ingredient evidence record ${expectedRecord.id}.`);
        assert.equal(actualRecord.productSpecific, true, "Product-specific evidence must remain labelled.");
        assert.equal(actualRecord.industrySponsored, true, "Industry sponsorship must remain labelled.");
        const limitations = Array.isArray(actualRecord.limitations) ? actualRecord.limitations.join(" ").toLowerCase() : "";
        for (const fragment of expectedRecord.requiredLimitationFragments) {
          assert.ok(limitations.includes(fragment.toLowerCase()), `Evidence record ${expectedRecord.id} lost its ${fragment} limitation.`);
        }
      }

      assert.equal(payload.ingredients?.length, fixture.ingredientResearch.candidates.length);
      for (const expectedCandidate of fixture.ingredientResearch.candidates) {
        assertAuditOnlyIngredientCandidate(payload.ingredients.find((candidate) => candidate?.id === expectedCandidate.id), expectedCandidate);
      }
    });

    await evaluate({
      id: "api-ingredient-knowledge-review-queue",
      category: "ingredient_knowledge_base",
      title: "Ingredient knowledge endpoint preserves research-only CIR, EWG, and journal boundaries",
      expected: "held named ingredients and source metadata are available for audit, while routine selection and Pinecone upload remain blocked",
    }, async () => {
      const { response, payload } = await getJson(offlineServer.baseUrl, "/api/ingredient-knowledge");
      assert.equal(response.status, 200);
      assert.equal(payload.deploymentScope, "research_only_noncommercial");
      assert.equal(payload.corpusStatus, "review_pending");
      assert.equal(payload.routineSelectionAllowed, false);
      assert.equal(payload.pineconeUploadAllowed, false);
      assert.ok(Array.isArray(payload.ingredients) && payload.ingredients.length >= 10, "Knowledge base must expose held named ingredient records.");
      assert.ok(payload.ingredients.every((ingredient) => ingredient.status === "held_research_only" && ingredient.routineSelectionAllowed === false), "All knowledge-base ingredients must remain held.");
      assert.ok(Array.isArray(payload.sourceRecords) && payload.sourceRecords.some((source) => source.sourceFamily === "CIR"), "CIR provenance must be represented.");
      assert.ok(payload.sourceRecords.some((source) => source.sourceFamily === "EWG" && source.useMode === "external_link_only"), "EWG must remain external-link only.");
      assert.ok(payload.sourceRecords.some((source) => source.sourceFamily === "medical_journal" && /pending/.test(source.clinicalReviewStatus)), "Medical-journal records must remain review pending.");
      assert.ok(typeof payload.requestId === "string" && payload.requestId, "Knowledge-base endpoint must include a request ID.");
    });

    for (const profile of fixture.profiles) {
      for (const concern of expectedConcernCodes()) {
        await evaluate({
          id: `api-routine-${profile}-${concern}`,
          category: "api_contract",
          title: `Offline routine endpoint returns the generic contract for ${profile}/${concern}`,
          expected: "HTTP 200 cleared category fallback, AM/PM routine, labelled demo environment, and preserved selected location",
        }, async () => {
          const { response, payload } = await postOfflineRoutine({
            profile,
            concern,
            location: fixture.routineContract.testLocation,
          });
          assert.equal(response.status, 200, payload.error || "Expected HTTP 200.");
          assert.equal(payload.profile, profile);
          assert.equal(payload.concern, concern);
          assert.equal(payload.mode, "deterministic_synthesis");
          assert.equal(payload.outputMode, fixture.ingredientResearch.outputMode);
          assert.equal(payload.status, "cleared");
          assert.equal(payload.synthesisStatus, "not_requested");
          assert.deepEqual(payload.environment?.location, fixture.routineContract.testLocation);
          assert.equal(payload.environment?.mode, "demo");
          assert.equal(payload.grounding?.sufficiencyScore, 0);
          assert.equal(payload.grounding?.scoreType, "evidence_sufficiency_coverage");
          assert.equal(payload.safety?.status, "cleared");
          assertRoutineContract(payload.routine);
          assert.equal(Object.hasOwn(payload, "categoryReferences"), false, "Static category references must not be attached to an individual routine response.");
          assert.deepEqual(payload.evidence, []);
          assert.equal(payload.runReport?.researchOnly, true);
          assert.equal(payload.runReport?.outputMode, fixture.ingredientResearch.outputMode);
          assert.ok(Array.isArray(payload.runReport?.stages) && payload.runReport.stages.some((stage) => stage.id === "evidence_sufficiency_gate"), "The run report must preserve the evidence-sufficiency stage.");
          assert.ok(Array.isArray(payload.trace?.stages) && payload.trace.stages.some((stage) => stage.id === "second_safety"), "The compact trace must preserve the second safety stage.");
          assertIngredientResearchRoutineContract(payload.ingredientResearch, concern);
          assert.equal(payload.runReport?.ingredientResearch?.status, payload.ingredientResearch.status, "Run report must mirror the ingredient research status.");
          assert.equal(payload.runReport?.ingredientResearch?.routineSelectionAllowed, false, "Run report must preserve the ingredient selection block.");
        });
      }
    }

    await evaluate({
      id: "api-profile-modifiers",
      category: "api_contract",
      title: "Optional finish and reactivity modifiers stay category-only and apply the conservative guardrail",
      expected: "HTTP 200 fallback with echoed valid modifiers, a low-irritation rule, and no texture-renewal category at high reactivity",
    }, async () => {
      const { response, payload } = await postOfflineRoutine({
        profile: "combination",
        concern: "acne",
        finishPreference: "matte",
        reactivityLevel: "high",
        location: fixture.routineContract.testLocation,
      });
      assert.equal(response.status, 200, payload.error || "Expected HTTP 200.");
      assert.equal(payload.mode, "deterministic_synthesis");
      assert.deepEqual(payload.profileModifiers, { finishPreference: "matte", reactivityLevel: "high" });
      assert.equal(payload.runReport?.input?.finishPreference, "matte");
      assert.equal(payload.runReport?.input?.reactivityLevel, "high");
      assert.equal(payload.routine?.generation?.finishPreference, "matte");
      assert.equal(payload.routine?.generation?.reactivityLevel, "high");
      assert.ok(!payload.routine?.pm?.some((step) => step.id === "texture-renewal"), "High self-reported reactivity must exclude texture-renewal.");
      assert.ok([...payload.routine.am, ...payload.routine.pm].some((step) => step.ruleIds?.includes("low-irritation-barrier-guardrail")), "High self-reported reactivity must retain the conservative rule ID.");
      assertRoutineContract(payload.routine);
      assertNoIngredientRoutineSelections(payload.routine);
    });

    await evaluate({
      id: "api-new-concern-fallbacks",
      category: "api_contract",
      title: "New cosmetic research concerns fall back to deterministic category-only previews without evidence",
      expected: "HTTP 200 generic fallbacks for redness, radiance, and visible-pore appearance; no fabricated retrieval evidence",
    }, async () => {
      for (const concern of ["redness", "radiance", "pores"]) {
        const { response, payload } = await postOfflineRoutine({
          profile: "combination",
          concern,
          location: fixture.routineContract.testLocation,
        });
        assert.equal(response.status, 200, `${concern} did not return HTTP 200.`);
        assert.equal(payload.mode, "deterministic_synthesis", `${concern} should complete deterministic synthesis without eligible evidence.`);
        assert.equal(payload.concern, concern);
        assert.deepEqual(payload.evidence, [], `${concern} must not fabricate retrieval evidence.`);
        assertRoutineContract(payload.routine);
      }
    });

    await evaluate({
      id: "api-triage-medical-redirect",
      category: "api_contract",
      title: "Routine endpoint stops before environment, retrieval, and synthesis for a triage redirect",
      expected: "HTTP 200 medical_redirect with no routine or evidence",
    }, async () => {
      const { response, payload } = await postOfflineRoutine({
        profile: fixture.profiles[0],
        concern: fixture.requiredConcernCodes[0],
        symptoms: fixture.triageCases[0].input,
      });
      assert.equal(response.status, 200);
      assert.equal(payload.status, "medical_redirect");
      assert.equal(payload.synthesisStatus, "not_requested");
      assert.equal(payload.routine, null);
      assert.equal(payload.environment, null);
      assert.deepEqual(payload.evidence, []);
      assert.equal(payload.ingredientResearch?.status, "withheld_after_triage");
      assert.equal(payload.ingredientResearch?.routineSelectionAllowed, false);
      assert.deepEqual(payload.ingredientResearch?.candidates, []);
      assert.equal(payload.runReport?.ingredientResearch?.status, "withheld_after_triage");
    });

    await evaluate({
      id: "api-invalid-profile-and-concern",
      category: "api_contract",
      title: "Routine endpoint rejects unsupported profile and concern codes",
      expected: "HTTP 400 for unsupported profile and concern",
    }, async () => {
      const invalidProfile = await postOfflineRoutine({
        profile: "unsupported-profile",
        concern: fixture.requiredConcernCodes[0],
      });
      assert.equal(invalidProfile.response.status, 400);
      const invalidConcern = await postOfflineRoutine({
        profile: fixture.profiles[0],
        concern: "unsupported-concern",
      });
      assert.equal(invalidConcern.response.status, 400);
    });

    await evaluate({
      id: "api-invalid-profile-modifiers",
      category: "api_contract",
      title: "Routine endpoint rejects unknown optional profile modifier values",
      expected: "HTTP 400 for unknown finish preference and reactivity level",
    }, async () => {
      const invalidFinish = await postOfflineRoutine({
        profile: fixture.profiles[0],
        concern: fixture.requiredConcernCodes[0],
        finishPreference: "glossy",
      });
      assert.equal(invalidFinish.response.status, 400);
      const invalidReactivity = await postOfflineRoutine({
        profile: fixture.profiles[0],
        concern: fixture.requiredConcernCodes[0],
        reactivityLevel: "variable",
      });
      assert.equal(invalidReactivity.response.status, 400);
    });

    await evaluate({
      id: "api-invalid-location",
      category: "api_contract",
      title: "Routine endpoint rejects out-of-range selected coordinates",
      expected: "HTTP 400 before any environment request",
    }, async () => {
      const { response } = await postOfflineRoutine({
        profile: fixture.profiles[0],
        concern: fixture.requiredConcernCodes[0],
        location: { name: "Invalid evaluation point", lat: 91, lon: 0 },
      });
      assert.equal(response.status, 400);
    });
  } finally {
    await stopServer(offlineServer.child);
  }
} else {
  for (const profile of fixture.profiles) {
    for (const concern of expectedConcernCodes()) {
      await evaluate({
        id: `api-routine-${profile}-${concern}`,
        category: "api_contract",
        title: `Offline routine endpoint returns the generic contract for ${profile}/${concern}`,
        expected: "HTTP 200 fallback, AM/PM category-only routine, labelled demo environment, and preserved selected location",
      }, () => {
        throw new Error("Isolated server did not start, so this contract was not evaluated.");
      });
    }
  }
}

await writeReports();
