const app = document.querySelector("#app");

const defaultLocation = Object.freeze({
  name: "Kuala Lumpur, MY",
  lat: 3.139,
  lon: 101.6869,
});

const VIEW_META = Object.freeze({
  dashboard: { title: "Overview", subtitle: "Source-linked skincare research intelligence", hash: "overview" },
  monitor: { title: "Environment", subtitle: "Live location-aware research context", hash: "environment" },
  simulator: { title: "Routine Preview", subtitle: "Explainable category preview", hash: "routine" },
  knowledge: { title: "Ingredient Atlas", subtitle: "Source-linked research records", hash: "atlas" },
  evaluation: { title: "Evaluation", subtitle: "Reproducible final-review evidence", hash: "evaluation" },
  bulk: { title: "Cohort Analysis", subtitle: "Deterministic de-identified processing", hash: "cohort" },
  reviewer: { title: "Reviewer Queue", subtitle: "Local source-card annotations", hash: "reviewer" },
});

const CORE_VIEWS = Object.freeze(["dashboard", "monitor", "simulator", "knowledge", "evaluation"]);
const ADVANCED_VIEWS = Object.freeze(["bulk", "reviewer"]);

function viewFromHash() {
  if (typeof window === "undefined") return "dashboard";
  const requested = String(window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
  if (!requested) return "dashboard";
  return Object.entries(VIEW_META).find(([, meta]) => meta.hash === requested)?.[0] || null;
}

function viewHash(view) {
  return `#${VIEW_META[view]?.hash || VIEW_META.dashboard.hash}`;
}

const demoEnvironment = {
  mode: "demo",
  location: { ...defaultLocation },
  updatedAt: "demo",
  readings: { uvi: 9, humidity: 84, temperature: 32, pm25: 58 },
  sources: {
    weather: { provider: "OpenWeather", status: "demo" },
    airQuality: { provider: "IQAir", status: "demo" },
  },
  notices: ["Demo readings are shown until live services are enabled."],
};

const pipeline = [
  { id: "input", number: "01", name: "Input", meta: "Profile + environment", detail: "Profile context and current environmental readings are normalised before processing." },
  { id: "triage", number: "02", name: "Triage", meta: "Intent + medical redirect", detail: "Potentially clinical intents are identified and redirected before any skincare advisory is generated." },
  { id: "retrieval", number: "03", name: "Retrieval", meta: "Indexed evidence search", detail: "The server queries configured indexed evidence before it permits model synthesis." },
  { id: "cue", number: "04", name: "Coverage Gate", meta: "CUE proxy threshold", detail: "Responses only continue when the prototype's evidence-coverage proxy satisfies the configured threshold. It is not a calibrated clinical-validity score." },
  { id: "safety", number: "05", name: "Safety", meta: "Dual deterministic passes", detail: "Clinical redirect and restricted-content checks run before and after synthesis." },
  { id: "synthesis", number: "06", name: "Synthesis", meta: "Structured response", detail: "A server-only structured model response is allowed only after retrieval and safety gates pass." },
];

const profileRoutines = {
  acne: {
    label: "Breakout-prone appearance research preview",
    am: [["Gentle cleansing category", "Low-irritation research context"], ["Light hydration category", "Supportive non-prescriptive category"], ["Daytime photoprotection category", "Research context only"]],
    pm: [["Gentle cleansing category", "Low-irritation research context"], ["Lightweight moisturising category", "Humidity-aware finish context"]],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  barrier: {
    label: "Barrier comfort research preview",
    am: [["Low-stripping cleansing category", "Research preview category"], ["Comfort-focused hydration category", "Non-prescriptive context"], ["Daytime photoprotection category", "Research context only"]],
    pm: [["Low-stripping cleansing category", "Research preview category"], ["Barrier-support moisturising category", "Research preview category"]],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  pigment: {
    label: "Uneven-tone context research preview",
    am: [["Gentle cleansing category", "Low-irritation research context"], ["Comfort-focused hydration category", "Non-prescriptive context"], ["Daytime photoprotection category", "Research context only"]],
    pm: [["Gentle cleansing category", "Low-irritation research context"], ["Supportive moisturising category", "Low-irritation support context"]],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  dryness: {
    label: "Dry-feeling comfort research preview",
    am: [["Comfort-focused cleansing category", "Low-stripping research context"], ["Hydration category", "Non-prescriptive comfort context"], ["Daytime photoprotection category", "Research context only"]],
    pm: [["Comfort-focused cleansing category", "Low-stripping research context"], ["Barrier-support moisturising category", "Research preview category"]],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  oil: {
    label: "Oil/shine context research preview",
    am: [["Gentle cleansing category", "Low-irritation research context"], ["Light hydration category", "Supportive non-prescriptive category"], ["Daytime photoprotection category", "Research context only"]],
    pm: [["Gentle cleansing category", "Low-irritation research context"], ["Lightweight moisturising category", "Humidity-aware finish context"]],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  sensitivity: {
    label: "Sensitivity context research preview",
    am: [["Low-stripping cleansing category", "Research preview category"], ["Comfort-focused hydration category", "Non-prescriptive context"], ["Daytime photoprotection category", "Research context only"]],
    pm: [["Low-stripping cleansing category", "Research preview category"], ["Barrier-support moisturising category", "Research preview category"]],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  texture: {
    label: "Texture appearance research preview",
    am: [["Gentle cleansing category", "Low-irritation research context"], ["Light hydration category", "Supportive non-prescriptive category"], ["Daytime photoprotection category", "Research context only"]],
    pm: [["Gentle cleansing category", "Low-irritation research context"], ["Supportive moisturising category", "Low-irritation support context"]],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  redness: {
    label: "Redness-prone appearance research preview",
    am: [["Low-irritation cleansing category", "Research preview category"], ["Comfort-focused hydration category", "Non-prescriptive context"], ["Daytime photoprotection category", "Research context only"]],
    pm: [["Low-irritation cleansing category", "Research preview category"], ["Barrier-support moisturising category", "Research preview category"]],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  radiance: {
    label: "Dullness/radiance appearance research preview",
    am: [["Gentle cleansing category", "Low-irritation research context"], ["Light hydration category", "Supportive non-prescriptive category"], ["Daytime photoprotection category", "Research context only"]],
    pm: [["Gentle cleansing category", "Low-irritation research context"], ["Supportive moisturising category", "Low-irritation support context"]],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  pores: {
    label: "Visible-pore appearance research preview",
    am: [["Gentle cleansing category", "Low-irritation research context"], ["Light hydration category", "Supportive non-prescriptive category"], ["Daytime photoprotection category", "Research context only"]],
    pm: [["Gentle cleansing category", "Low-irritation research context"], ["Lightweight moisturising category", "Humidity-aware finish context"]],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
};

const concernOptions = [
  { id: "acne", label: "Breakout-prone appearance", description: "Simple research context" },
  { id: "barrier", label: "Barrier comfort", description: "Low-irritation context" },
  { id: "pigment", label: "Uneven tone", description: "Appearance research context" },
  { id: "dryness", label: "Dry-feeling comfort", description: "Comfort-focused context" },
  { id: "oil", label: "Oil / shine", description: "Lightweight finish context" },
  { id: "sensitivity", label: "Sensitivity context", description: "Low-irritation context" },
  { id: "texture", label: "Texture appearance", description: "Cosmetic appearance context" },
  { id: "redness", label: "Redness-prone appearance", description: "Self-reported comfort context" },
  { id: "radiance", label: "Dullness / radiance appearance", description: "Cosmetic appearance context" },
  { id: "pores", label: "Visible-pore appearance", description: "Cosmetic appearance context" },
];

// These records mirror the versioned category-source coverage report. They are
// intentionally kept separate from the strict CUE gate: every card is a
// non-clinical, source-attributed research-context record awaiting qualified
// clinical review.
const CONTEXT_COVERAGE_FALLBACK = Object.freeze({
  acne: { cards: 3, documents: 3 },
  barrier: { cards: 3, documents: 3 },
  pigment: { cards: 3, documents: 3 },
  dryness: { cards: 3, documents: 3 },
  oil: { cards: 3, documents: 3 },
  sensitivity: { cards: 3, documents: 3 },
  texture: { cards: 3, documents: 2 },
});

const presentationSteps = Object.freeze([
  {
    view: "monitor",
    anchor: "monitor-location",
    eyebrow: "01 · Location",
    title: "Set the environmental context",
    detail: "Kuala Lumpur is ready as the demonstrator context, or search for a city or area. Selected coordinates are used only for labelled weather and air-quality readings.",
  },
  {
    view: "monitor",
    anchor: "monitor-readings",
    eyebrow: "02 · Environment",
    title: "Inspect the measured inputs",
    detail: "Read UV, humidity, temperature, and PM2.5 as context inputs. They are not skin measurements or medical outcomes.",
  },
  {
    view: "simulator",
    anchor: "routine-preview",
    requiresRun: true,
    eyebrow: "03 · Routine",
    title: "Run the gated category preview",
    detail: "The routine remains broad and category-only. Retrieval, the evidence-coverage gate, and deterministic safety checks are shown separately.",
  },
  {
    view: "knowledge",
    anchor: "relationship-explorer-title",
    eyebrow: "04 · Ingredient evidence",
    title: "Trace the research Atlas",
    detail: "Browse source-linked ingredient metadata and the isolated non-clinical context cards without turning a source map into a treatment rule.",
  },
  {
    view: "evaluation",
    anchor: "coverage-map-title",
    eyebrow: "05 · Evaluation",
    title: "Close with reproducible checks",
    detail: "Show the deterministic test packs, the 7-context coverage map, and the boundary between software checks and pending human review.",
  },
]);

const INCORPORATED_INGREDIENTS = Object.freeze([
  { name: "Niacinamide", inci: "Niacinamide" },
  { name: "Ceramide NP", inci: "Ceramide NP" },
  { name: "Ceramide EOP", inci: "Ceramide EOP" },
  { name: "Cholesterol", inci: "Cholesterol" },
  { name: "Ceramide 1", inci: "Legacy INCI" },
  { name: "Ceramide 3", inci: "Legacy INCI" },
  { name: "Ceramide 6 II", inci: "Legacy INCI" },
  { name: "Dexpanthenol", inci: "Panthenol" },
  { name: "Glycerin", inci: "Glycerin" },
  { name: "Salicylic Acid", inci: "Salicylic Acid" },
  { name: "Urea", inci: "Urea" },
  { name: "Sodium Hyaluronate", inci: "Sodium Hyaluronate" },
  { name: "Ascorbic Acid", inci: "Ascorbic Acid" },
  { name: "Tocopherol", inci: "Tocopherol" },
  { name: "Azelaic Acid", inci: "Azelaic Acid" },
  { name: "Tranexamic Acid", inci: "Tranexamic Acid" },
  { name: "Kojic Acid", inci: "Kojic Acid" },
  { name: "Glycolic Acid", inci: "Glycolic Acid" },
  { name: "Lactic Acid", inci: "Lactic Acid" },
  { name: "Colloidal Oatmeal", inci: "Avena Sativa Kernel Flour" },
  { name: "Retinol", inci: "Retinol" },
  { name: "Retinal", inci: "Retinal" },
  { name: "Retinyl Palmitate", inci: "Retinyl Palmitate" },
  { name: "Alpha-Arbutin", inci: "Alpha-Arbutin" },
  { name: "Ectoin", inci: "Ectoin" },
  { name: "Beta-Glucan", inci: "Beta-Glucan" },
  { name: "Centella Asiatica Extract", inci: "Centella Asiatica Extract" },
  { name: "Madecassoside", inci: "Madecassoside" },
  { name: "Asiaticoside", inci: "Asiaticoside" },
  { name: "Squalane", inci: "Squalane" },
  { name: "Dimethicone", inci: "Dimethicone" },
  { name: "Petrolatum", inci: "Petrolatum" },
  { name: "Mineral Oil", inci: "Paraffinum Liquidum" },
  { name: "Propylene Glycol", inci: "Propylene Glycol" },
  { name: "Lanolin", inci: "Lanolin" },
  { name: "Caprylic/Capric Triglyceride", inci: "Caprylic/Capric Triglyceride" },
  { name: "Allantoin", inci: "Allantoin" },
  { name: "Bisabolol", inci: "Bisabolol" },
  { name: "Piroctone Olamine", inci: "Piroctone Olamine" },
  { name: "Zinc Oxide", inci: "Zinc Oxide" },
  { name: "Titanium Dioxide", inci: "Titanium Dioxide" },
  { name: "Gluconolactone", inci: "Gluconolactone" },
  { name: "Mandelic Acid", inci: "Mandelic Acid" },
  { name: "Citric Acid", inci: "Citric Acid" },
  { name: "Linoleic Acid", inci: "Linoleic Acid" },
  { name: "Phytosphingosine", inci: "Phytosphingosine" },
  { name: "Ceramide AP", inci: "Ceramide AP" },
  { name: "Licorice Root Extract", inci: "Glycyrrhiza Glabra (Licorice) Root Extract" },
  { name: "Caffeine", inci: "Caffeine" },
  { name: "Resveratrol", inci: "Resveratrol" },
]);

const RUN_HISTORY_STORAGE_KEY = "dermasynth.deidentified-run-history.v1";

function loadRunHistory() {
  try {
    const saved = typeof window === "undefined" ? null : window.localStorage.getItem(RUN_HISTORY_STORAGE_KEY);
    const history = JSON.parse(saved || "[]");
    return Array.isArray(history) ? history.slice(0, 12).filter((item) => item && typeof item === "object") : [];
  } catch {
    return [];
  }
}

const state = {
  activeView: viewFromHash() || "dashboard",
  selectedStage: null,
  profile: "combination",
  finishPreference: "",
  reactivityLevel: "",
  exposureContext: "mixed",
  concern: "acne",
  symptoms: "",
  generatedRoutine: null,
  routineMeta: null,
  runStatus: "idle",
  runStartedAt: null,
  runHistory: loadRunHistory(),
  environment: demoEnvironment,
  forecast: { status: "idle", next24Hours: [], next7Days: [], providerReliability: [] },
  forecastSynthesis: { status: "idle", text: "", generatedAt: "" },
  forecastSynthesisKey: "",
  ingredientRationales: {},
  ingredientRationaleStatus: "idle",
  ingredientRationaleKey: "",
  selectedLocation: { ...defaultLocation },
  locationQuery: "",
  locationResults: [],
  locationSearchStatus: "idle",
  locationSearchNotice: "",
  locationSearchVersion: 0,
  locationSearchController: null,
  locationVersion: 0,
  environmentRequestVersion: 0,
  comparison: {
    selectedLocation: { name: "Singapore, SG", lat: 1.3521, lon: 103.8198 },
    environment: null,
    explainability: null,
    updatedAt: "not loaded",
    query: "",
    results: [],
    status: "idle",
    notice: "Choose a second location to compare the same research-context inputs.",
    requestVersion: 0,
    searchVersion: 0,
    controller: null,
  },
  presentation: { active: false, step: 0 },
  relationshipFocus: "all",
  relationshipSelectedId: "",
  mobileMoreOpen: false,
  routineRequestVersion: 0,
  lastUpdated: "demo",
  reasonOpen: false,
  bulkConfirmed: false,
  bulkFeedback: { tone: "neutral", message: "No file imported in this browser session." },
  bulkReport: null,
  knowledgeExplorer: null,
  knowledgeStatus: "idle",
  knowledgeNotice: "",
  knowledgeConcern: "all",
  knowledgeQuery: "",
  knowledgeSearchResult: null,
  knowledgeSearchStatus: "idle",
  corpusSummary: null,
  evaluation: null,
  evaluationStatus: "idle",
  reviewer: {
    token: "",
    reviewerLabel: "",
    note: "",
    action: "annotate",
    selectedSourceId: "",
    queue: null,
    status: "idle",
    notice: "Enter the local reviewer token only for this browser session. It is never stored in browser storage.",
  },
  explainability: null,
  bulkRows: [
    ["SP-0142", "Breakout-prone appearance", "—", "Awaiting run"],
    ["SP-0143", "Barrier comfort", "—", "Awaiting run"],
    ["SP-0144", "Uneven tone", "—", "Awaiting run"],
    ["SP-0145", "Oil / shine", "—", "Awaiting run"],
    ["SP-0146", "Texture appearance", "—", "Awaiting run"],
  ],
};

function activeEnvironment() {
  return state.environment || demoEnvironment;
}

function environmentValue(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function severityFor(key, value) {
  if (value === null || value === undefined) return { severity: "low", severityLabel: "Unavailable" };
  const thresholds = {
    uvi: [8, 6],
    humidity: [90, 75],
    temperature: [35, 30],
    pm25: [35, 15],
  };
  const [high, medium] = thresholds[key] || [Infinity, Infinity];
  if (Number(value) >= high) return { severity: "high", severityLabel: "High" };
  if (Number(value) >= medium) return { severity: "medium", severityLabel: "Moderate" };
  return { severity: "low", severityLabel: "Lower" };
}

function environmentCardsFor(environment = activeEnvironment()) {
  const readings = environment?.readings || {};
  return [
    { key: "uvi", icon: "sun", value: environmentValue(readings.uvi), unit: "UVI", label: "UV Index" },
    { key: "humidity", icon: "droplet", value: environmentValue(readings.humidity), unit: "%", label: "Humidity" },
    { key: "temperature", icon: "thermometer", value: environmentValue(readings.temperature), unit: "°C", label: "Temperature" },
    { key: "pm25", icon: "wind", value: environmentValue(readings.pm25), unit: "µg/m³", label: "PM2.5 Pollution" },
  ].map((item) => ({ ...item, ...severityFor(item.key, readings[item.key]) }));
}

function environmentCards() {
  return environmentCardsFor(activeEnvironment());
}

function environmentModeLabel() {
  const mode = activeEnvironment().mode;
  if (mode === "live") return "Live environment";
  if (mode === "degraded") return "Degraded environment";
  return "Demo environment";
}

function environmentSourceLabel() {
  const sources = activeEnvironment().sources || {};
  const weather = sources.weather?.status || "demo";
  const air = sources.airQuality?.status || "demo";
  return `Weather ${weather} · Air ${air}`;
}

function locationLabel() {
  return state.selectedLocation?.name || activeEnvironment().location?.name || defaultLocation.name;
}

function cueLabel() {
  const cue = Number(state.routineMeta?.grounding?.cueScore);
  return Number.isFinite(cue) ? `Evidence coverage ${cue.toFixed(2)}` : "Evidence coverage not run";
}

function routineStatusLabel() {
  if (state.runStatus === "running") return "Run in progress";
  if (state.runStatus === "error") return "Local fallback";
  const status = state.routineMeta?.status;
  if (isQuotaFallback()) return "Live synthesis unavailable";
  if (status === "cleared") return "Cleared";
  if (status === "medical_redirect") return "Clinical redirect";
  if (status === "review_required") return "Review required";
  return "Preview only";
}

function isQuotaFallback() {
  return state.routineMeta?.synthesisStatus === "quota_unavailable";
}

function concernOption(id = state.concern) {
  return concernOptions.find((option) => option.id === id) || concernOptions[0];
}

function normaliseRoutineStep(step, index) {
  if (Array.isArray(step)) {
    return { title: String(step[0] || `Research category ${index + 1}`), note: String(step[1] || "Research-only category"), sourceIds: [] };
  }
  if (typeof step === "string") return { title: step, note: "Research-only category", sourceIds: [] };
  if (step && typeof step === "object") {
    const sourceIds = Array.isArray(step.evidenceIds)
      ? step.evidenceIds
      : Array.isArray(step.sourceIds)
        ? step.sourceIds
        : Array.isArray(step.sources)
          ? step.sources
          : [];
    return {
      title: String(step.title || step.name || step.category || `Research category ${index + 1}`),
      note: String(step.note || step.rationale || step.reason || step.description || "Research-only category"),
      sourceIds: sourceIds.map((value) => String(value)).slice(0, 3),
    };
  }
  return { title: `Research category ${index + 1}`, note: "Research-only category", sourceIds: [] };
}

function normaliseRoutine(rawRoutine = state.generatedRoutine, concern = state.concern) {
  const fallback = profileRoutines[concern] || profileRoutines.acne;
  const candidate = rawRoutine && typeof rawRoutine === "object" ? rawRoutine : fallback;
  const legacySteps = Array.isArray(candidate.steps) ? candidate.steps.map(normaliseRoutineStep) : [];
  const fallbackAm = fallback.am.map(normaliseRoutineStep);
  const fallbackPm = fallback.pm.map(normaliseRoutineStep);
  const am = Array.isArray(candidate.am) && candidate.am.length ? candidate.am.map(normaliseRoutineStep) : legacySteps.length ? legacySteps.slice(0, Math.max(1, Math.ceil(legacySteps.length / 2))) : fallbackAm;
  const pm = Array.isArray(candidate.pm) && candidate.pm.length ? candidate.pm.map(normaliseRoutineStep) : legacySteps.length ? legacySteps.slice(Math.max(1, Math.ceil(legacySteps.length / 2))) : fallbackPm;
  return {
    label: String(candidate.label || candidate.title || fallback.label),
    reason: String(candidate.reason || candidate.rationale || fallback.reason),
    am: am.length ? am : fallbackAm,
    pm: pm.length ? pm : fallbackPm,
  };
}

function routineStepList(steps, { dark = false, ingredientCandidates = [], phase = "" } = {}) {
  return `<ol class="${dark ? "synth-step-list" : "routine-list"}">${steps.map((step, index) => {
    const sourceText = step.sourceIds?.length ? ` · evidence ${step.sourceIds.join(", ")}` : "";
    const names = ingredientCandidates
      .filter((entry) => entry?.categoryId === step?.id && (!phase || entry?.phase === phase))
      .map((entry) => entry.displayName)
      .filter(Boolean);
    const recommendation = names.length ? `<span class="routine-step-ingredients">Recommended: ${escapeHtml(names.join(", "))}</span>` : "";
    return `<li><span class="routine-step-title">${escapeHtml(step.title)}</span><small>${escapeHtml(step.note)}${escapeHtml(sourceText)}</small>${recommendation}${!dark ? "" : `<span class="synth-step-number">${index + 1}</span>`}</li>`;
  }).join("")}</ol>`;
}

function approvedIngredientCandidatePanel(meta = state.routineMeta) {
  const selection = meta?.ingredientCandidates;
  const entries = Array.isArray(selection?.entries) ? selection.entries : [];
  if (selection?.status !== "available" || !entries.length) return "";
  return `<section class="research-context-card ingredient-candidate-panel"><div class="ingredient-card-top"><div><p class="ingredient-eyebrow">${icon("shield", 14)} Approved ingredient recommendations</p><h3>Named AM/PM recommendations</h3></div><span class="ingredient-output-mode">${escapeHtml(selection.registryVersion || "live database")}</span></div><p class="ingredient-card-summary">Approved database ingredients matched to each safety-cleared category.</p><div class="research-context-list">${entries.map((entry) => { const source = Array.isArray(entry.sourceRecords) ? entry.sourceRecords[0] : null; const url = safeEvidenceUrl(source?.sourceUrl); const trace = entry.selectionTrace || {}; const checked = Array.isArray(trace.compatibility?.checkedAgainst) && trace.compatibility.checkedAgainst.length ? trace.compatibility.checkedAgainst.map((item) => item.displayName).join(", ") : "No earlier named recommendation"; const llm = state.ingredientRationales?.[entry.ingredientId]; const rationaleText = (llm && llm.text) ? llm.text : (entry.rationale || "Matched from the approved knowledge base."); const rationaleTag = (llm && llm.text) ? ('<span class="ingredient-rationale-tag">' + icon("sparkles", 11) + ' GPT · grounded' + (llm.source ? (' · ' + escapeHtml(llm.source)) : '') + '</span>') : (state.ingredientRationaleStatus === "loading" ? '<span class="ingredient-rationale-tag is-loading">Explaining…</span>' : ''); const attr = entry.attribution; const pickChip = entry.selectedBy === 'llm_from_rag_pool' ? ('<span class="ingredient-pick-chip">' + icon('sparkles', 10) + ' LLM · from RAG pool</span>') : '<span class="ingredient-pick-chip is-rule">rule-based</span>'; const attrMarkup = (attr && Array.isArray(attr.features)) ? ('<div class="ingredient-attr"><span class="ingredient-attr-head">' + icon('activity', 11) + ' Why chosen · ' + escapeHtml((attr.dominant && attr.dominant.label) || '') + '</span>' + attr.features.map(function (f) { return '<span class="ingredient-attr-row"><i>' + escapeHtml(f.label) + '</i><b class="ingredient-attr-bar"><b style="width:' + (f.influencePercent || 0) + '%"></b></b></span>'; }).join('') + '</div>') : ''; return `<article><div><strong>${escapeHtml(entry.displayName || "Approved ingredient")}</strong><small>${escapeHtml(`${entry.phase === "am" ? "Morning" : "Evening"} · ${entry.categoryTitle || entry.categoryId || "routine category"}`)} ${pickChip}</small></div>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Evidence ${icon("arrow", 12)}</a>` : ""}<p class="ingredient-rationale ${llm && llm.text ? "is-grounded" : ""}">${escapeHtml(rationaleText)}</p>${rationaleTag}${attrMarkup}<details class="selection-trace"><summary>Selection trace</summary><span>Category: ${escapeHtml(trace.category?.title || entry.categoryId || "—")}</span><span>Record: ${escapeHtml(trace.selectedRecord?.ingredientId || entry.ingredientId || "—")} · v${escapeHtml(String(trace.selectedRecord?.version || "—"))}</span><span>Compatibility: ${escapeHtml(trace.compatibility?.status || "not reported")} · checked against ${escapeHtml(checked)}</span></details></article>`; }).join("")}</div></section>`;
}

function safelyNumber(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "—";
}

function icon(name, size = 18, stroke = 1.8) {
  const paths = {
    shield: '<path d="M12 3 19 6v5c0 5-3.3 8.7-7 10-3.7-1.3-7-5-7-10V6l7-3Z"/><path d="m9.5 12 1.6 1.6 3.5-3.7"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    activity: '<path d="M3 12h4l2.2-7 4.2 14L16 12h5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.1 8.8A2.2 2.2 0 0 0 6.8 21h10.4a2.2 2.2 0 0 0 1.9-3.2L14 9V3"/><path d="M8 15h8"/>',
    layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z"/><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>',
    pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.9L3 9"/><path d="M3 4v5h5M4 13a8 8 0 0 0 14.9 3.9L21 15"/><path d="M21 20v-5h-5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    droplet: '<path d="M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
    thermometer: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 9v7"/>',
    wind: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
    sparkles: '<path d="m12 3-1.2 4.2L7 8.5l3.8 1.3L12 14l1.2-4.2L17 8.5l-3.8-1.3L12 3Z"/><path d="m19 14-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7L19 14ZM5 14l-.6 2L2 16.6l2.4.7L5 20l.6-2 2.4-.7-2.4-.7L5 14Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    upload: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
    download: '<path d="M12 3v12M7 11l5 5 5-5"/><path d="M5 21h14"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}

function navItem(id, label, subtitle, iconName) {
  const isActive = state.activeView === id;
  return `<button class="nav-item ${isActive ? "is-active" : ""}" type="button" data-action="navigate" data-view="${id}" ${isActive ? 'aria-current="page"' : ""}>
    ${icon(iconName, 18)}
    <span class="nav-copy"><span>${label}</span><small>${subtitle}</small></span>
  </button>`;
}

function mobileNavItem(id, label, iconName) {
  const isActive = state.activeView === id;
  return `<button class="mobile-nav-item ${isActive ? "is-active" : ""}" type="button" data-action="navigate" data-view="${id}" ${isActive ? 'aria-current="page"' : ""}>
    ${icon(iconName, 17)}<span>${escapeHtml(label)}</span>
  </button>`;
}

function mobileNavigation() {
  const moreActive = ADVANCED_VIEWS.includes(state.activeView) || state.mobileMoreOpen;
  const sheet = state.mobileMoreOpen
    ? `<div class="mobile-more-layer"><button type="button" class="mobile-more-scrim" data-action="mobile-more-close" aria-label="Close more navigation"></button><section class="mobile-more-sheet" id="mobile-more-sheet" aria-label="More research tools"><div class="mobile-more-sheet-head"><div><span>Research tools</span><strong>More ways to inspect the study</strong></div><button type="button" class="presentation-close" data-action="mobile-more-close" aria-label="Close more navigation">×</button></div><button class="mobile-more-link ${state.activeView === "evaluation" ? "is-active" : ""}" type="button" data-action="navigate" data-view="evaluation">${icon("check", 16)}<span><strong>Evaluation</strong><small>Reproducible checks and coverage</small></span></button><button class="mobile-more-link ${state.activeView === "bulk" ? "is-active" : ""}" type="button" data-action="navigate" data-view="bulk">${icon("layers", 16)}<span><strong>Cohort Analysis</strong><small>De-identified batch workflow</small></span></button><button class="mobile-more-link ${state.activeView === "reviewer" ? "is-active" : ""}" type="button" data-action="navigate" data-view="reviewer">${icon("shield", 16)}<span><strong>Reviewer Queue</strong><small>Local source-card review tool</small></span></button></section></div>`
    : "";
  return `${sheet}<nav class="mobile-nav" aria-label="Primary navigation">${mobileNavItem("dashboard", "Overview", "grid")}${mobileNavItem("monitor", "Environment", "activity")}${mobileNavItem("simulator", "Routine", "flask")}${mobileNavItem("knowledge", "Atlas", "file")}<button class="mobile-nav-item ${moreActive ? "is-active" : ""}" type="button" data-action="mobile-more" aria-expanded="${state.mobileMoreOpen}" aria-controls="mobile-more-sheet">${icon("layers", 17)}<span>More</span></button></nav>`;
}

function shell(view) {
  const ingredientCount = Number(state.knowledgeExplorer?.overview?.ingredientCount) || incorporatedIngredientRecords().length;
  const currentMeta = VIEW_META[state.activeView] || VIEW_META.dashboard;
  const title = currentMeta.title;
  const modeClass = activeEnvironment().mode === "live" ? "" : activeEnvironment().mode === "degraded" ? "is-warning" : "is-neutral";
  const cueClass = state.routineMeta?.status === "cleared" ? "" : "is-warning";
  const locationUpdating = isLocationUpdating();
  return `<div class="app-shell">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark"><img src="/assets/dermasynth-mark.svg" alt="" /></span><span class="brand-copy"><strong>DermaSynth</strong><small>Environment-aware research</small></span></div>
      <div class="sidebar-navigation">
        <div class="sidebar-navigation-group">
          <p class="side-section-label">Core workflow</p>
          <nav class="nav-list" aria-label="Core research workflow">
            ${navItem("dashboard", "Overview", "At a glance", "grid")}
            ${navItem("monitor", "Environment", "Live conditions", "activity")}
            ${navItem("simulator", "Routine", "Build routine", "flask")}
            ${navItem("knowledge", "Ingredient Atlas", `${ingredientCount} ingredients`, "file")}
            ${navItem("evaluation", "Evaluation", "System checks", "check")}
          </nav>
        </div>
        <div class="sidebar-navigation-group is-advanced">
          <p class="side-section-label">Research tools</p>
          <nav class="nav-list" aria-label="Advanced research tools">
            ${navItem("bulk", "Cohort Analysis", "Batch runs", "layers")}
            ${navItem("reviewer", "Reviewer Queue", "Source review", "shield")}
          </nav>
        </div>
      </div>
      <section class="knowledge-card" aria-label="Knowledge base status">
        <p>Research knowledge base</p><strong>${escapeHtml(String(state.knowledgeExplorer?.overview?.ingredientCount || 50))} mapped ingredients</strong>
        <span class="source-count"><i class="source-dot"></i>${escapeHtml(String(state.knowledgeExplorer?.overview?.sourceCount || 52))} attributed source records</span>
      </section>
    </aside>
    <main class="main-content" id="main-content" tabindex="-1">
      <header class="topbar">
        <div class="page-title"><h1 id="page-title" tabindex="-1">${title}</h1><p class="location-line">${icon("pin", 15)}<span>${escapeHtml(locationLabel())}</span><span>· ${escapeHtml(environmentModeLabel())}</span></p></div>
        <div class="topbar-actions">
          <button class="presentation-button" type="button" data-action="presentation-start">${icon("sparkles", 14)} Defence walkthrough</button>
          <span class="pill ${cueClass}">${icon("sparkles", 14)} ${escapeHtml(cueLabel())}</span>
          <span class="pill ${modeClass}">${escapeHtml(environmentSourceLabel())}</span>
          <button class="refresh-button" type="button" data-action="refresh" aria-label="Refresh environment readings" ${locationUpdating ? "disabled" : ""}>${icon("refresh", 16)} <span>Refresh environment</span></button>
        </div>
      </header>
      <div class="scope-banner" role="note">${icon("shield", 14)}<span><strong>Non-clinical research preview.</strong> Environment-aware ingredient suggestions with source-linked safety context — not medical advice, diagnosis, or treatment.</span></div>
      <div class="content"><div class="view">${view}</div></div>
    </main>
    <div class="toast" role="status" aria-live="polite" id="toast"></div>
    ${presentationGuide()}
    ${mobileNavigation()}
  </div>`;
}

function presentationGuide() {
  if (!state.presentation.active) return "";
  const step = presentationSteps[state.presentation.step] || presentationSteps[0];
  const isFirst = state.presentation.step === 0;
  const isLast = state.presentation.step === presentationSteps.length - 1;
  const runRequired = Boolean(step.requiresRun && !state.routineMeta);
  const primaryAction = runRequired ? "presentation-run" : "presentation-next";
  const primaryLabel = runRequired ? state.runStatus === "running" ? "Preview is running…" : "Run gated preview" : isLast ? "Finish walkthrough" : "Next section";
  return `<aside class="presentation-guide" id="presentation-guide" tabindex="-1" aria-label="Guided presentation mode">
    <div class="presentation-guide-top">
      <div><span class="presentation-kicker">${escapeHtml(step.eyebrow)}</span><strong>${escapeHtml(step.title)}</strong></div>
      <button type="button" class="presentation-close" data-action="presentation-close" aria-label="Exit guided presentation">×</button>
    </div>
    <p>${escapeHtml(step.detail)}</p>
    ${runRequired ? `<p class="presentation-gate">${icon("info", 14)} <span>Run the preview to show an actual gate trace, or skip this proof point for rehearsal.</span></p>` : ""}
    <div class="presentation-progress" aria-label="Presentation progress">${presentationSteps.map((item, index) => `<span class="${index === state.presentation.step ? "is-current" : index < state.presentation.step ? "is-complete" : ""}" title="${escapeHtml(item.title)}"></span>`).join("")}</div>
    <div class="presentation-actions">
      <button type="button" class="ghost-button" data-action="presentation-back" ${isFirst ? "disabled" : ""}>Back</button>
      <div class="presentation-primary-actions">${runRequired ? `<button type="button" class="text-button presentation-skip" data-action="presentation-skip">Skip proof</button>` : ""}<button type="button" class="primary-button" data-action="${primaryAction}" ${state.runStatus === "running" ? "disabled" : ""}>${primaryLabel} ${runRequired ? icon("sparkles", 14) : isLast ? icon("check", 14) : icon("arrow", 14)}</button></div>
    </div>
  </aside>`;
}

function focusPresentationGuide() {
  window.requestAnimationFrame(() => document.querySelector("#presentation-guide")?.focus());
}

function setPresentationStep(step) {
  const next = Math.max(0, Math.min(presentationSteps.length - 1, Number(step) || 0));
  state.presentation = { active: true, step: next };
  const presentationStep = presentationSteps[next];
  if (presentationStep.view === "knowledge") {
    state.knowledgeConcern = state.concern;
    state.relationshipFocus = state.concern;
    state.relationshipSelectedId = "";
    state.knowledgeSearchResult = null;
  }
  navigateView(presentationStep.view, { source: "presentation", history: "replace", focus: false, scroll: true });
  window.requestAnimationFrame(() => {
    document.getElementById(presentationStep.anchor || "main-content")?.scrollIntoView({ block: "center", behavior: "smooth" });
    focusPresentationGuide();
  });
}

function startPresentation() {
  setPresentationStep(0);
  showToast("Defence walkthrough started. Follow the labelled research journey.");
}

function endPresentation({ completed = false } = {}) {
  state.presentation = { active: false, step: 0 };
  render();
  window.requestAnimationFrame(() => document.querySelector("[data-action='presentation-start']")?.focus());
  showToast(completed ? "Guided presentation complete." : "Guided presentation closed.");
}

function advancePresentation({ skipProof = false } = {}) {
  const current = presentationSteps[state.presentation.step] || presentationSteps[0];
  if (current.requiresRun && !state.routineMeta && !skipProof) {
    showToast("Run the gated preview to continue, or choose Skip proof for a rehearsal-only walkthrough.");
    return;
  }
  if (state.presentation.step >= presentationSteps.length - 1) endPresentation({ completed: true });
  else setPresentationStep(state.presentation.step + 1);
}

function metricStrip() {
  const meta = state.routineMeta;
  const grounding = meta?.grounding;
  const metrics = [
    ["Evidence coverage", grounding ? `CUE proxy ${safelyNumber(grounding.cueScore)}` : "—", grounding ? `Prototype threshold ${safelyNumber(grounding.threshold)}` : "Not run"],
    ["Safety", routineStatusLabel(), "Two deterministic passes"],
    ["Environment", activeEnvironment().mode || "demo", environmentSourceLabel()],
    ["Retrieval", meta?.grounding?.evidenceCount ?? "—", meta?.grounding?.scoreType || "Awaiting index"],
    ["Profiles", String(state.bulkRows.length), "Deterministic batch preview"],
  ];
  return `<section class="panel metric-strip" aria-label="Model quality overview">${metrics.map(([label, value, foot]) => `<div class="metric"><span class="metric-label">${escapeHtml(label)}</span><strong class="metric-value">${escapeHtml(value)}</strong><span class="metric-foot">${escapeHtml(foot)}</span></div>`).join("")}</section>`;
}

function dashboardHero() {
  const overview = state.knowledgeExplorer?.overview || {};
  const environment = activeEnvironment();
  const readings = environment.readings || {};
  const ingredientCount = Number(overview.ingredientCount) || 50;
  const sourceCount = Number(overview.sourceCount) || 52;
  const cardCount = Number(overview.demoEvidenceCards) || 31;
  return `<section class="dashboard-hero" aria-labelledby="dashboard-hero-title">
    <div class="dashboard-hero-copy">
      <p class="hero-kicker">${icon("sparkles", 15)} Final-review research system</p>
      <h2 id="dashboard-hero-title">Environment-aware insight,<span>made visibly explainable.</span></h2>
      <p class="hero-description">DermaSynth connects live environmental context, source-linked ingredient research, safety traces, and transparent reasoning in one final-review experience.</p>
      <div class="hero-actions">
        <button class="primary-button" type="button" data-action="navigate" data-view="simulator">${icon("sparkles", 15)} Start a preview</button>
        <button class="ghost-button" type="button" data-action="presentation-start">Begin defence walkthrough</button>
        <button class="hero-secondary-action" type="button" data-action="navigate" data-view="knowledge">Browse Ingredient Atlas ${icon("arrow", 15)}</button>
      </div>
      <div class="hero-proof-row" aria-label="System coverage">
        <span><strong>${escapeHtml(String(ingredientCount))}</strong> ingredients</span>
        <span><strong>${escapeHtml(String(sourceCount))}</strong> source records</span>
        <span><strong>${escapeHtml(String(cardCount))}</strong> Pinecone cards</span>
      </div>
    </div>
    <div class="hero-visual">
      <div class="hero-mark-orbit"><img src="/assets/dermasynth-mark.svg" alt="" /></div>
      <div class="hero-context-card">
        <span>Active environment</span>
        <strong>${escapeHtml(locationLabel())}</strong>
        <div class="hero-context-readings"><span>UV <b>${escapeHtml(environmentValue(readings.uvi))}</b></span><span>Humidity <b>${escapeHtml(environmentValue(readings.humidity))}%</b></span><span>PM2.5 <b>${escapeHtml(environmentValue(readings.pm25))}</b></span></div>
        <small>${escapeHtml(environmentModeLabel())} · ${escapeHtml(environmentSourceLabel())}</small>
      </div>
    </div>
  </section>`;
}

function pipelinePanel() {
  const selected = pipeline.find((step) => step.id === state.selectedStage);
  return `<section class="panel pipeline">
    <div class="panel-header"><h2 class="panel-title">${icon("activity", 17)} Synthesis Pipeline</h2><p class="panel-note">Six gates before a routine is shown</p></div>
    <ol class="pipeline-list">${pipeline.map((step) => `<li><button type="button" class="pipeline-step ${selected?.id === step.id ? "is-selected" : ""}" data-action="stage" data-stage="${step.id}" aria-pressed="${selected?.id === step.id}"><span class="step-number">${step.number}</span><span class="step-name">${step.name}</span><span class="step-meta">${step.meta}</span><span class="step-check">${icon("check", 10, 2.4)}</span></button></li>`).join("")}</ol>
    ${selected ? `<p class="pipeline-detail">${icon("info", 16)} <span><strong>${selected.name}:</strong> ${selected.detail}</span></p>` : ""}
  </section>`;
}

function incorporatedIngredientRecords() {
  return INCORPORATED_INGREDIENTS;
}

function ingredientSystemPanel() {
  const ingredients = incorporatedIngredientRecords();
  return `<section class="ingredient-system-panel" aria-labelledby="ingredient-system-title">
    <div class="ingredient-system-copy">
      <p class="hero-kicker">${icon("layers", 15)} Incorporated ingredient system</p>
      <h2 id="ingredient-system-title">${escapeHtml(String(ingredients.length))} ingredients, one inspectable research layer.</h2>
      <p>Every incorporated record is listed here. The Atlas distinguishes the source-mapped explorer subset from staged, review-pending research metadata for final-review inspection.</p>
      <button class="hero-secondary-action" type="button" data-action="navigate" data-view="knowledge">Open full Ingredient Atlas ${icon("arrow", 15)}</button>
    </div>
    <div class="ingredient-system-roster">
      <div class="ingredient-system-roster-head"><span>Incorporated records</span><strong>${ingredients.length} listed</strong></div>
      <div class="ingredient-system-grid">${ingredients.map((ingredient) => `<article class="ingredient-system-chip"><strong>${escapeHtml(ingredient.name)}</strong><small>${escapeHtml(ingredient.inci)}</small></article>`).join("")}</div>
    </div>
  </section>`;
}

function environmentPanel() {
  return `<section class="panel environment-panel">
    <div class="panel-header"><h2 class="panel-title">${icon("sun", 17)} Environment</h2><p class="panel-note">${escapeHtml(locationLabel())} · ${escapeHtml(state.lastUpdated)}</p></div>
    <div class="environment-grid">${environmentCards().map((item) => `<article class="env-card"><div class="env-card-top">${icon(item.icon, 17)}<span class="severity ${item.severity}">${item.severityLabel}</span></div><div class="env-card-value"><strong>${escapeHtml(item.value)}</strong><span>${item.unit}</span></div><p class="env-card-label">${item.label}</p></article>`).join("")}</div>
  </section>`;
}

function routinePanel() {
  if (!state.routineMeta && state.runStatus !== "running") {
    return `<section class="panel routine-panel routine-panel-empty"><div class="panel-header"><h2 class="panel-title">${icon("sparkles", 17)} Preview ready</h2><p class="panel-note">No gated run yet</p></div><div class="routine-empty-state"><span>${icon("flask", 22)}</span><div><strong>Set your research inputs, then run the preview.</strong><p>The dashboard deliberately withholds routine categories until the selected profile, concern, location context, evidence gate, and deterministic checks have been requested.</p></div></div><button class="ghost-button" type="button" data-action="navigate" data-view="simulator">Open Routine Preview ${icon("arrow", 14)}</button></section>`;
  }
  const routine = normaliseRoutine();
  const cleared = state.routineMeta?.status === "cleared";
  const quotaFallback = isQuotaFallback();
  const statusLine = cleared
    ? "Two deterministic safety passes cleared the current result."
    : quotaFallback
      ? "Live AI synthesis is unavailable because the API account has no available quota. Showing a generic research preview; no personalised routine was generated."
    : "Generic research preview only — a live result has not cleared all gates.";
  return `<section class="panel routine-panel">
    <div class="panel-header"><h2 class="panel-title">${icon("sparkles", 17)} Category preview</h2><p class="panel-note">${escapeHtml(routineStatusLabel())}</p></div>
    <div class="routine-layout">
      <div class="routine-slot"><p class="routine-label">${icon("sun", 13)} Morning</p>${routineStepList(routine.am)}</div>
      <div class="routine-slot"><p class="routine-label">${icon("sparkles", 13)} Evening</p>${routineStepList(routine.pm)}</div>
    </div>
    ${approvedIngredientCandidatePanel()}
    <p class="screening-pass ${cleared ? "" : "is-warning"}">${icon("shield", 15)} ${escapeHtml(statusLine)}</p>
  </section>`;
}

function safeEvidenceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function textList(value, { limit = 8 } = {}) {
  const values = (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]).flat(Infinity);
  const entries = values.map((entry) => {
    if (typeof entry === "string" || typeof entry === "number") return String(entry).trim();
    if (!entry || typeof entry !== "object") return "";
    return String(entry.displayName || entry.name || entry.title || entry.label || entry.text || "").trim();
  }).filter(Boolean);
  return [...new Set(entries)].slice(0, limit);
}

function researchContextPanel(meta = state.routineMeta) {
  const research = meta?.researchEvidence;
  const evidence = Array.isArray(research?.evidence) ? research.evidence.slice(0, 6) : [];
  const coverage = research?.coverage || {};
  if (!research) {
    const atlasCount = Number(state.knowledgeExplorer?.overview?.ingredientCount) || 50;
    return `<section class="research-context-card is-empty"><div><p class="ingredient-eyebrow">${icon("layers", 14)} Research corpus</p><h3>Ingredient source retrieval awaits a run</h3></div><p>Run the simulator to retrieve the selected concern from the ${escapeHtml(String(atlasCount))}-ingredient final-review Atlas. It combines the existing isolated demo segment with local, review-pending metadata; neither is a treatment selector.</p></section>`;
  }
  return `<section class="research-context-card"><div class="ingredient-card-top"><div><p class="ingredient-eyebrow">${icon("layers", 14)} Research context</p><h3>${escapeHtml(String(coverage.uniqueIngredients || 0))} mapped ingredient record${Number(coverage.uniqueIngredients) === 1 ? "" : "s"}</h3></div><span class="ingredient-output-mode">${escapeHtml(research.mode || "research retrieval")}</span></div><p class="ingredient-card-summary">${escapeHtml(coverage.rationale || "Source-linked context for this preview.")}</p><div class="research-context-list">${evidence.map((item) => { const url = safeEvidenceUrl(item.sourceUrl); return `<article><div><strong>${escapeHtml((item.ingredientNames || []).join(" · ") || item.title || "Ingredient record")}</strong><small>${escapeHtml(item.source || "Source metadata")}</small></div>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Source ${icon("arrow", 12)}</a>` : ""}</article>`; }).join("") || `<p>No matching record was returned for this context.</p>`}</div></section>`;
}

function evidencePanel() {
  const meta = state.routineMeta;
  const grounding = meta?.grounding;
  const evidence = Array.isArray(meta?.evidence) ? meta.evidence.slice(0, 4) : [];
  const cue = Number(grounding?.cueScore);
  const cueText = Number.isFinite(cue) ? `CUE proxy ${cue.toFixed(2)}` : "CUE proxy not run";
  const detail = String(grounding?.scoreType || "").includes("retrieval_coverage_proxy")
    ? "A source-coverage check, not a diagnosis score."
    : "No indexed evidence was used for this preview.";

  if (!evidence.length) {
    return `<section class="panel evidence-panel"><div class="panel-header"><h2 class="panel-title">${icon("file", 17)} Evidence grounding</h2><p class="panel-note">${escapeHtml(cueText)}</p></div><div class="evidence-empty"><strong>No retrieved sources yet.</strong><span>Run the gated preview to inspect the limited research notes used by this prototype.</span></div></section>`;
  }

  return `<section class="panel evidence-panel"><div class="panel-header"><h2 class="panel-title">${icon("file", 17)} Evidence grounding</h2><p class="panel-note">${escapeHtml(cueText)} · ${evidence.length} sources</p></div><p class="evidence-summary">${escapeHtml(detail)}</p><div class="evidence-list">${evidence.map((item) => {
    const sourceUrl = safeEvidenceUrl(item.sourceUrl);
    const tags = [item.evidenceTier, item.jurisdiction, item.conflictFlag || item.conflictOfInterest ? "Conflict flag" : "", item.productSpecific ? "Product-specific" : ""].filter(Boolean);
    const score = Number(item.score ?? item.relevanceScore);
    return `<article class="evidence-item"><div class="evidence-item-head"><div><strong>${escapeHtml(item.title || "Indexed evidence")}</strong><span>${escapeHtml(item.source || "Source unavailable")}${Number.isFinite(score) ? ` · relevance ${escapeHtml(score.toFixed(2))}` : ""}</span></div>${sourceUrl ? `<a class="evidence-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">Open source ${icon("arrow", 13)}</a>` : ""}</div>${tags.length ? `<div class="evidence-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}</article>`;
  }).join("")}</div></section>`;
}

function traceEntries(meta = state.routineMeta) {
  const raw = meta?.runReport?.stages || meta?.runReport?.trace || meta?.trace?.stages || meta?.trace || [];
  if (Array.isArray(raw)) return raw.filter((entry) => entry && typeof entry === "object");
  if (raw && typeof raw === "object") return Object.entries(raw).map(([id, value]) => ({ id, ...(value && typeof value === "object" ? value : { status: value }) }));
  return [];
}

function inferredStage(step, index, meta = state.routineMeta) {
  const stageAliases = {
    input: [],
    triage: ["triage"],
    retrieval: ["retrieval"],
    cue: ["cue_gate"],
    safety: ["first_safety", "second_safety"],
    synthesis: ["synthesis"],
  };
  const matches = traceEntries(meta).filter((entry) => stageAliases[step.id]?.includes(String(entry.id || entry.stage || entry.name || "").toLowerCase()));
  if (matches.length) {
    const matched = matches.at(-1);
    const raw = String(matched.status || matched.state || "reported").toLowerCase();
    const kind = /pass|clear|complete|allow|success/.test(raw) ? "passed" : /block|redirect|fail|error/.test(raw) ? "blocked" : /skip/.test(raw) ? "skipped" : "reported";
    const ruleIds = matches.flatMap((entry) => Array.isArray(entry.ruleIds) ? entry.ruleIds : []);
    const detail = matched.detail || matched.message
      || (ruleIds.length ? `${[...new Set(ruleIds)].length} rule trace${ruleIds.length === 1 ? "" : "s"} reported by the server.` : matched.durationMs !== undefined ? `${matched.durationMs} ms server stage.` : "Server trace");
    return { kind, label: String(matched.label || matched.status || "Reported by server"), detail: String(detail) };
  }
  if (state.runStatus === "running") return index === 0
    ? { kind: "active", label: "Request submitted", detail: "Waiting for the server to report progress." }
    : { kind: "waiting", label: "Awaiting server", detail: "Not marked complete by this interface." };
  if (!meta) return { kind: "waiting", label: "Not run", detail: "Start a preview to create a run report." };
  if (step.id === "input") return { kind: "reported", label: "Normalised", detail: "Profile, concern, location, and optional safety text were sent for this run." };
  if (meta.status === "medical_redirect") {
    if (step.id === "triage") return { kind: "blocked", label: "Redirected", detail: "Routine generation stopped before advice." };
    if (index > 1) return { kind: "skipped", label: "Skipped", detail: "Triage did not permit this stage." };
  }
  if (step.id === "retrieval" && meta.grounding?.evidenceCount) return { kind: "passed", label: "Evidence returned", detail: `${meta.grounding.evidenceCount} indexed note(s) reported.` };
  if (step.id === "cue" && meta.grounding) return { kind: meta.status === "cleared" ? "passed" : "reported", label: `CUE proxy ${safelyNumber(meta.grounding.cueScore)}`, detail: `Proxy threshold ${safelyNumber(meta.grounding.threshold)}` };
  if (step.id === "safety" && meta.safety) return { kind: meta.safety.status === "cleared" ? "passed" : "reported", label: String(meta.safety.status || "Reported"), detail: "Deterministic safety result from server." };
  if (step.id === "synthesis" && meta.synthesisStatus) return { kind: meta.synthesisStatus === "completed" ? "passed" : "reported", label: String(meta.synthesisStatus).replaceAll("_", " "), detail: "Provider status reported by server." };
  return { kind: meta.status === "cleared" ? "passed" : "reported", label: meta.status === "cleared" ? "Completed" : "Reported", detail: "Client-side fallback inferred from the response." };
}

function progressPanel() {
  const busy = state.runStatus === "running";
  return `<section class="panel run-progress" aria-label="Research run progress" aria-busy="${busy}"><div class="panel-header"><h3 class="panel-title">${icon("activity", 17)} Run progress</h3><p class="panel-note">${busy ? "Server request in flight" : "Server trace when available"}</p></div><ol class="run-stage-list">${pipeline.map((step, index) => {
    const status = inferredStage(step, index);
    return `<li class="run-stage is-${escapeHtml(status.kind)}"><span class="run-stage-dot" aria-hidden="true"></span><div><strong>${escapeHtml(step.name)}</strong><small>${escapeHtml(status.label)} · ${escapeHtml(status.detail)}</small></div></li>`;
  }).join("")}</ol></section>`;
}

function reportPanel() {
  const meta = state.routineMeta;
  const grounding = meta?.grounding || {};
  const safetyFlags = Array.isArray(meta?.safety?.flags) ? meta.safety.flags : [];
  const reportTime = meta?.runReport?.completedAt || meta?.runReport?.startedAt || meta?.generatedAt;
  const parsedReportTime = reportTime ? new Date(reportTime) : null;
  const generatedAt = parsedReportTime && Number.isFinite(parsedReportTime.getTime())
    ? parsedReportTime.toLocaleString()
    : state.runStartedAt
      ? new Date(state.runStartedAt).toLocaleString()
      : "Not run";
  const reportRows = [
    ["Concern", concernOption().label],
    ["Environment", `${locationLabel()} · ${environmentModeLabel()}`],
    ["Evidence", grounding.evidenceCount ?? "—"],
    ["Coverage gate", Number.isFinite(Number(grounding.cueScore)) ? `CUE proxy ${safelyNumber(grounding.cueScore)}` : "Not reported"],
    ["Safety flags", safetyFlags.length ? safetyFlags.length : "None reported"],
    ["Run time", generatedAt],
  ];
  return `<section class="panel run-report"><div class="panel-header"><div><h3 class="panel-title">${icon("file", 17)} Explainable run report</h3></div><div class="run-report-actions"><button class="ghost-button" type="button" data-action="print-research-report" ${meta ? "" : "disabled"}>${icon("file", 14)} Print / Save PDF</button><button class="ghost-button" type="button" data-action="export-current-run" ${meta?.runReport ? "" : "disabled"}>${icon("download", 14)} Export JSON</button></div></div><dl class="run-report-grid">${reportRows.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>${safetyFlags.length ? `<p class="report-flags"><strong>Reported safety flags:</strong> ${escapeHtml(safetyFlags.join(" · "))}</p>` : ""}</section>`;
}

function historyPanel() {
  const runs = state.runHistory.slice(0, 5);
  return `<section class="panel history-panel"><div class="panel-header"><div><h2 class="panel-title">${icon("layers", 17)} Local research run history</h2><p class="panel-note">De-identified summary only · newest first</p></div><div class="history-actions"><button class="ghost-button" type="button" data-action="export-run-history" ${runs.length ? "" : "disabled"}>${icon("download", 14)} Export</button><button class="text-button" type="button" data-action="clear-run-history" ${runs.length ? "" : "disabled"}>Clear</button></div></div>${runs.length ? `<div class="history-list">${runs.map((run) => `<article class="history-item"><div><strong>${escapeHtml(run.concern || "Research run")}</strong><small>${escapeHtml(run.timestamp || "Time unavailable")} · ${escapeHtml(run.profile || "Profile unavailable")}</small></div><div><span class="table-status ${run.status === "Cleared" ? "" : "review"}">${escapeHtml(run.status || "Reported")}</span><small>CUE proxy ${escapeHtml(run.cue || "—")} · ${escapeHtml(run.evidenceCount ?? "—")} notes</small></div></article>`).join("")}</div>` : `<div class="evidence-empty"><strong>No local run summaries yet.</strong><span>Completed requests can be exported as a de-identified research record from this browser.</span></div>`}<p class="history-privacy">Stored locally: time, profile, concern, city/area context, status, evidence-coverage proxy and evidence count. Never stored: free-text symptoms, source excerpts, or identifiers.</p></section>`;
}

function locationResultLabel(location) {
  return location?.label || [location?.name, location?.state, location?.country].filter(Boolean).join(", ") || "Unnamed location";
}

function locationPicker({ label = "Weather location", compact = false } = {}) {
  const results = state.locationResults || [];
  const expanded = results.length > 0;
  const searching = state.locationSearchStatus === "searching";
  const updating = isLocationUpdating();
  const busy = searching || updating || state.runStatus === "running";
  const notice = searching
    ? "Searching OpenWeather locations…"
    : state.locationSearchNotice || `Active demonstrator location: ${locationLabel()} · change it if needed.`;

  return `<div class="field location-picker ${compact ? "is-compact" : ""}"><label for="location-search">${escapeHtml(label)}</label><div class="location-input-row"><input id="location-search" type="search" value="${escapeHtml(state.locationQuery)}" placeholder="Search city or area" autocomplete="off" data-action="location-query" role="combobox" aria-autocomplete="list" aria-controls="location-results" aria-expanded="${expanded}" aria-busy="${busy}" ${busy ? "disabled" : ""} /><button class="location-search-button" type="button" data-action="location-search" ${busy ? "disabled" : ""}>${icon("pin", 14)} Search</button></div>${expanded ? `<div class="location-results" id="location-results" role="listbox" aria-label="Matching locations">${results.map((location, index) => `<button type="button" class="location-option" role="option" aria-selected="false" data-action="select-location" data-location-index="${index}" ${busy ? "disabled" : ""}><span>${escapeHtml(locationResultLabel(location))}</span><small>${Number(location.lat).toFixed(4)}, ${Number(location.lon).toFixed(4)}</small></button>`).join("")}</div>` : ""}<div class="location-status" role="status" aria-live="polite"><span>${escapeHtml(notice)}</span><button type="button" data-action="reset-location" ${busy ? "disabled" : ""}>Use demo Kuala Lumpur</button></div>${compact ? "" : `<p class="location-privacy">Kuala Lumpur is preselected for the demonstrator. Search text goes to OpenWeather; after selection, chosen coordinates go to the enabled OpenWeather and IQAir services for labelled readings.</p>`}</div>`;
}

function comparisonLocationLabel() {
  return state.comparison?.selectedLocation?.name || "Second location";
}

function comparisonBusy() {
  return ["searching", "updating"].includes(state.comparison?.status);
}

function comparisonLocationPicker() {
  const comparison = state.comparison;
  const results = comparison.results || [];
  const expanded = results.length > 0;
  const busy = comparisonBusy();
  const notice = comparison.status === "searching"
    ? "Searching locations…"
    : comparison.notice || `Comparison location: ${comparisonLocationLabel()}`;
  return `<div class="comparison-location-picker"><label for="comparison-location-search">Second location</label><div class="location-input-row"><input id="comparison-location-search" type="search" value="${escapeHtml(comparison.query)}" placeholder="Search another city or area" autocomplete="off" data-action="comparison-location-query" role="combobox" aria-autocomplete="list" aria-controls="comparison-location-results" aria-expanded="${expanded}" aria-busy="${busy}" ${busy ? "disabled" : ""} /><button class="location-search-button" type="button" data-action="comparison-location-search" ${busy ? "disabled" : ""}>${icon("pin", 14)} Compare</button></div>${expanded ? `<div class="location-results comparison-location-results" id="comparison-location-results" role="listbox" aria-label="Matching comparison locations">${results.map((location, index) => `<button type="button" class="location-option" role="option" aria-selected="false" data-action="comparison-location-select" data-comparison-location-index="${index}" ${busy ? "disabled" : ""}><span>${escapeHtml(locationResultLabel(location))}</span><small>${Number(location.lat).toFixed(4)}, ${Number(location.lon).toFixed(4)}</small></button>`).join("")}</div>` : ""}<div class="comparison-location-status" role="status" aria-live="polite"><span>${escapeHtml(notice)}</span><button type="button" class="text-button" data-action="comparison-refresh" ${busy ? "disabled" : ""}>Refresh</button></div><p>Comparison requests use the same environment and transparent explanation endpoint; no GPT synthesis is invoked.</p></div>`;
}

function numericalDelta(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "—";
  const difference = b - a;
  return `${difference > 0 ? "+" : ""}${Number.isInteger(difference) ? difference : difference.toFixed(1)}`;
}

function comparisonFeatureRows() {
  const primary = Array.isArray(state.explainability?.features) ? state.explainability.features : [];
  const comparison = Array.isArray(state.comparison?.explainability?.features) ? state.comparison.explainability.features : [];
  if (!primary.length || !comparison.length) return "";
  return primary.slice(0, 4).map((feature) => {
    const other = comparison.find((item) => item.key === feature.key || item.label === feature.label) || {};
    const current = Number(feature.shapValue);
    const alternate = Number(other.shapValue);
    const delta = Number.isFinite(current) && Number.isFinite(alternate) ? alternate - current : NaN;
    return `<div class="comparison-explanation-row"><span>${escapeHtml(feature.label || "Environmental input")}</span><b>${escapeHtml(safelyNumber(current, 3))}</b><b>${escapeHtml(safelyNumber(alternate, 3))}</b><strong class="${Number(delta) > 0 ? "is-positive" : Number(delta) < 0 ? "is-negative" : ""}">${Number.isFinite(delta) ? `${delta > 0 ? "+" : ""}${delta.toFixed(3)}` : "—"}</strong></div>`;
  }).join("");
}

function environmentComparisonPanel() {
  const comparison = state.comparison;
  const alternate = comparison.environment;
  const primaryCards = environmentCardsFor(activeEnvironment()).filter((item) => ["uvi", "humidity", "pm25"].includes(item.key));
  const alternateCards = environmentCardsFor(alternate || { readings: {} }).filter((item) => ["uvi", "humidity", "pm25"].includes(item.key));
  const alternateByKey = new Map(alternateCards.map((item) => [item.key, item]));
  const explanationRows = comparisonFeatureRows();
  const comparisonReady = Boolean(alternate);
  return `<section class="panel environment-comparison" aria-labelledby="comparison-title"><div class="panel-header"><div><h3 class="panel-title" id="comparison-title">${icon("activity", 17)} Location comparison</h3><p class="panel-note">Two locations · no GPT synthesis</p></div><span class="pill is-neutral">Same ${escapeHtml(concernOption().label)} context</span></div><div class="comparison-picker-row">${comparisonLocationPicker()}</div>${comparisonReady ? `<div class="comparison-sides"><article class="comparison-side"><div class="comparison-side-head"><span>Primary</span><strong>${escapeHtml(locationLabel())}</strong><small>${escapeHtml(environmentModeLabel())} · ${escapeHtml(state.lastUpdated)}</small></div>${primaryCards.map((item) => { const other = alternateByKey.get(item.key); return `<div class="comparison-metric"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)} <small>${escapeHtml(item.unit)}</small></strong><em>${escapeHtml(numericalDelta(item.value, other?.value))} vs comparison</em></div>`; }).join("")}</article><article class="comparison-side is-alternate"><div class="comparison-side-head"><span>Comparison</span><strong>${escapeHtml(comparisonLocationLabel())}</strong><small>${escapeHtml(comparison.environment?.mode || "labelled")} · ${escapeHtml(comparison.updatedAt || "not reported")}</small></div>${alternateCards.map((item) => { const original = primaryCards.find((candidate) => candidate.key === item.key); return `<div class="comparison-metric"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)} <small>${escapeHtml(item.unit)}</small></strong><em>${escapeHtml(numericalDelta(original?.value, item.value))} vs primary</em></div>`; }).join("")}</article></div>${explanationRows ? `<div class="comparison-explanation"><div><strong>Transparent contribution comparison</strong><span>Configured additive-surrogate Shapley values; this visual does not express clinical risk or a treatment decision.</span></div><div class="comparison-explanation-head"><span>Input</span><span>${escapeHtml(locationLabel())}</span><span>${escapeHtml(comparisonLocationLabel())}</span><span>Δ</span></div>${explanationRows}</div>` : `<p class="comparison-empty">The comparison location has labelled environmental readings. Contribution values will appear when both transparent explanation responses are available.</p>`}` : `<div class="comparison-empty"><strong>Preparing a second environmental snapshot.</strong><span>Select another location to compare UV, humidity, PM2.5, and the same configured non-clinical contribution model.</span></div>`}</section>`;
}

function forecastSynthesisCard() {
  const synth = state.forecastSynthesis || {};
  if (synth.status === "available" && synth.text) {
    const when = synth.generatedAt ? new Date(synth.generatedAt) : null;
    const stamp = when && !Number.isNaN(when.getTime()) ? when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
    return `<article class="forecast-synthesis is-available"><div class="forecast-synthesis-head"><span>${icon("sparkles", 15)} Weather synthesis</span><small>GPT${stamp ? ` · ${escapeHtml(stamp)}` : ""}</small></div><p>${escapeHtml(synth.text)}</p></article>`;
  }
  if (synth.status === "loading") return `<article class="forecast-synthesis is-loading"><div class="forecast-synthesis-head"><span>${icon("sparkles", 15)} Weather synthesis</span><small>GPT</small></div><p>Synthesising the next-24-hour outlook…</p></article>`;
  return `<article class="forecast-synthesis is-empty"><div class="forecast-synthesis-head"><span>${icon("sparkles", 15)} Weather synthesis</span><small>GPT</small></div><p>A GPT weather synthesis will appear here when live services are available.</p></article>`;
}

let forecastHoverData = null;

function forecastSmoothPath(points) {
  if (!points.length) return "";
  if (points.length < 3) return `M ${points.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ")}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function forecastRoutinePanel() {
  const forecast = state.forecast || {};
  const hourly = Array.isArray(forecast.next24Hours) ? forecast.next24Hours : [];
  const reliability = Array.isArray(forecast.providerReliability) ? forecast.providerReliability : [];
  const provider = reliability.find((item) => item.provider === "OpenWeather");
  const pm = Number(activeEnvironment().readings?.pm25);
  const head = `<div class="panel-header"><div><h3 class="panel-title">${icon("activity", 17)} Forecast outlook</h3><p class="panel-note">Next 24 hours · adaptive routine</p></div><span class="pill is-neutral">${escapeHtml(forecast.status || "labelled")}</span></div>`;
  if (!hourly.length) return `<section class="panel forecast-panel">${head}<p class="forecast-empty">No 24-hour forecast trend is available from the current weather provider.</p>${forecastSynthesisCard()}</section>`;

  // Plot area within a 100 x VBH viewBox; lines are inset from the edges and each
  // metric is scaled to its own 24-hour range so the shapes stay comparable.
  const VBH = 42;
  const TOP = 5;
  const BOTTOM = 37;
  const span = BOTTOM - TOP;
  const n = hourly.length;
  const xAt = (index) => (index / Math.max(1, n - 1)) * 100;
  const series = (key) => {
    const values = hourly.map((period) => Number(period.environment?.readings?.[key]));
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return null;
    const low = Math.min(...finite);
    const high = Math.max(...finite);
    const range = high - low || 1;
    const points = [];
    const cells = values.map((value, index) => {
      if (!Number.isFinite(value)) return { value: null, y: null };
      const y = BOTTOM - ((value - low) / range) * span;
      points.push({ x: xAt(index), y });
      return { value, y };
    });
    return { low, high, points, cells };
  };

  const defs = [
    { key: "uvi", label: "UV", color: "var(--warning)", unit: "UVI", digits: 1 },
    { key: "humidity", label: "Humidity", color: "var(--accent)", unit: "%", digits: 0 },
    { key: "temperature", label: "Temperature", color: "var(--danger)", unit: "°C", digits: 1 },
  ];
  const lines = [];
  const legend = [];
  const hoverSeries = [];
  for (const def of defs) {
    const s = series(def.key);
    if (!s) { legend.push(`<span class="forecast-key is-off"><i style="--dot:${def.color}"></i>${escapeHtml(def.label)} · n/a</span>`); continue; }
    lines.push(`<path class="forecast-line" d="${forecastSmoothPath(s.points)}" style="stroke:${def.color}" />`);
    legend.push(`<span class="forecast-key"><i style="--dot:${def.color}"></i>${escapeHtml(def.label)} · ${s.low.toFixed(def.digits)}–${s.high.toFixed(def.digits)} ${def.unit}</span>`);
    hoverSeries.push({ label: def.label, color: def.color, unit: def.unit, digits: def.digits, cells: s.cells });
  }
  // PM2.5 has no hourly series; draw it as a horizontal reference line placed on a 0–150 µg/m³ scale.
  const pmColor = "var(--faint)";
  if (Number.isFinite(pm)) {
    const y = (BOTTOM - Math.max(0, Math.min(1, pm / 150)) * span).toFixed(2);
    lines.push(`<line class="forecast-ref" x1="0" y1="${y}" x2="100" y2="${y}" style="stroke:${pmColor}" />`);
    legend.push(`<span class="forecast-key"><i class="is-dashed" style="--dot:${pmColor}"></i>PM2.5 · ${pm.toFixed(1)} µg/m³ now</span>`);
  } else {
    legend.push(`<span class="forecast-key is-off"><i class="is-dashed" style="--dot:${pmColor}"></i>PM2.5 · n/a</span>`);
  }

  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line class="grid" x1="0" y1="${(TOP + span * f).toFixed(2)}" x2="100" y2="${(TOP + span * f).toFixed(2)}" />`).join("");
  const vgrid = [25, 50, 75].map((x) => `<line class="grid vgrid" x1="${x}" y1="${TOP}" x2="${x}" y2="${BOTTOM}" />`).join("");
  const timeShort = (index) => { const at = hourly[index]?.at; const d = at ? new Date(at) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString(undefined, { hour: "numeric" }) : ""; };
  const timeLong = (index) => { const at = hourly[index]?.at; const d = at ? new Date(at) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }) : ""; };
  const midIndex = Math.floor((n - 1) / 2);
  const axis = `<div class="forecast-axis"><span>${escapeHtml(timeShort(0))}</span><span>${escapeHtml(timeShort(midIndex))}</span><span>${escapeHtml(timeShort(n - 1))}</span></div>`;

  // Data used by the shared hover handler (see setupForecastHover).
  forecastHoverData = {
    n, top: TOP, bottom: BOTTOM, vbh: VBH,
    times: hourly.map((_, index) => timeLong(index)),
    xFracs: hourly.map((_, index) => xAt(index) / 100),
    series: hoverSeries,
    pm: Number.isFinite(pm) ? { color: pmColor, value: pm } : null,
  };

  const overlay = `<div class="forecast-hover" aria-hidden="true"><div class="forecast-guide"></div><div class="forecast-dots"></div><div class="forecast-tooltip"></div></div>`;

  return `<section class="panel forecast-panel">${head}<div class="forecast-legend">${legend.join("")}</div><div class="forecast-timeline" data-forecast-hover><svg viewBox="0 0 100 ${VBH}" preserveAspectRatio="none" role="img" aria-label="Next 24-hour UV, humidity, temperature, and PM2.5 timeline">${vgrid}${gridlines}${lines.join("")}</svg>${overlay}</div>${axis}<p class="forecast-scale-note">Each line is scaled to its own 24-hour range; PM2.5 is a current reference on a 0–150 µg/m³ scale. Hover the chart for hourly readings.</p>${forecastSynthesisCard()}<div class="forecast-reliability">OpenWeather: ${escapeHtml(provider?.successRate === null || provider?.successRate === undefined ? "not observed" : `${provider.successRate}% available`)}${provider?.averageLatencyMs ? ` · ${provider.averageLatencyMs} ms` : ""}</div></section>`;
}

function safetyDecisionTrace(safety) {
  const rules = Array.isArray(safety?.rules) ? safety.rules : [];
  if (!rules.length) return `<details class="safety-decision-trace"><summary>Safety decision trace <span>Awaiting server rule details</span></summary><p>Run a server preview to inspect the deterministic rule IDs, statuses, and any reported detail.</p></details>`;
  return `<details class="safety-decision-trace"><summary>Safety decision trace <span>${rules.length} deterministic rule${rules.length === 1 ? "" : "s"}</span></summary><p>Inspectable server rule trace. A reported pass describes this configured research guardrail, not a clinical safety guarantee.</p><div class="safety-trace-list">${rules.map((rule) => { const status = String(rule?.status || "reported").replaceAll("_", " "); return `<article class="safety-trace-rule is-${escapeHtml(status.replaceAll(" ", "-"))}"><div><code>${escapeHtml(rule?.id || "rule-not-reported")}</code><strong>${escapeHtml(rule?.label || "Deterministic rule")}</strong><small>${escapeHtml(rule?.detail || "No additional detail was reported by this rule.")}</small></div><span>${escapeHtml(status)}</span></article>`; }).join("")}</div></details>`;
}

function safetyPanel() {
  const safety = state.routineMeta?.safety;
  const checks = safety?.checks?.length ? safety.checks : ["No live safety result yet — generate a preview to run the server safety gates."];
  const level = safety?.status === "cleared" ? "low" : "medium";
  const label = safety?.status === "cleared" ? "Cleared" : "Pending";
  return `<section class="panel safety-panel"><div class="panel-header"><h2 class="panel-title">${icon("shield", 17)} Safety Gates</h2><p class="panel-note">${escapeHtml(routineStatusLabel())}</p></div><div class="safety-list">${checks.map((check) => `<div class="safety-item"><div><strong>${escapeHtml(check)}</strong><small>${safety?.flags?.length ? escapeHtml(safety.flags.join(" ")) : "Deterministic check status from the current result."}</small></div><span class="severity ${level}">${label}</span></div>`).join("")}</div>${safetyDecisionTrace(safety)}</section>`;
}

function insightPanel() {
  const explanation = state.routineMeta?.explainability || state.explainability;
  const features = Array.isArray(explanation?.features) ? explanation.features : [];
  const peg = explanation?.peg;
  const label = explanation?.method === "exact_shapley_values_for_additive_environmental_surrogate"
    ? "Exact Shapley values · configured additive study-demo surrogate"
    : "Loading contribution model";
  if (!features.length) {
    return `<section class="panel insight-panel"><div class="panel-header"><h2 class="panel-title">${icon("sparkles", 17)} Environmental contribution</h2><p class="panel-note">${escapeHtml(label)}</p></div><div class="evidence-empty"><strong>Contribution profile is loading.</strong><span>The final-review model decomposes UV, humidity, PM2.5, and temperature against a transparent baseline.</span></div></section>`;
  }
  return `<section class="panel insight-panel"><div class="panel-header"><h2 class="panel-title">${icon("sparkles", 17)} What drove the context?</h2><p class="panel-note">${escapeHtml(label)}</p></div><p class="explainability-score">Research-context score <strong>${escapeHtml(safelyNumber(explanation?.model?.contextScore))}</strong><span>baseline ${escapeHtml(safelyNumber(explanation?.model?.baselineScore))}</span></p>${features.map((feature) => {
    const value = Number(feature.influencePercent);
    const percentage = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    const direction = feature.direction === "above_baseline" ? "+" : feature.direction === "below_baseline" ? "−" : "·";
    const raw = feature.rawValue === null || feature.rawValue === undefined ? "Unavailable" : `${feature.rawValue}${feature.unit ? ` ${feature.unit}` : ""}`;
    return `<div class="influence-row"><span>${escapeHtml(feature.label)}<small>${escapeHtml(raw)}</small></span><div class="influence-bar"><div class="influence-fill ${feature.direction === "below_baseline" ? "is-negative" : ""}" style="width:${percentage}%"></div></div><b>${escapeHtml(direction)}${escapeHtml(safelyNumber(Math.abs(Number(feature.shapValue) || 0), 3))}</b></div>`;
  }).join("")}<div class="insight-callout">${icon("info", 17)}<span><strong>${escapeHtml(peg?.headline || "Transparent environmental decomposition")}</strong><br />${escapeHtml(peg?.rationale || "This is a non-clinical research explanation, not a treatment decision.")} ${escapeHtml(peg?.limitations || "")}</span></div></section>`;
}

function dashboardView() {
  return shell(`${dashboardHero()}<section class="dashboard-spotlight"><div>${routinePanel()}</div>${environmentPanel()}</section>${metricStrip()}${pipelinePanel()}${ingredientSystemPanel()}<div class="dashboard-grid">${safetyPanel()}${insightPanel()}${evidencePanel()}${historyPanel()}</div>`);
}

function monitorView() {
  const env = activeEnvironment();
  const uvi = environmentValue(env.readings?.uvi);
  const weatherStatus = env.sources?.weather?.status || "demo";
  const notice = env.notices?.[0] || "Refresh readings to check the current source state.";
  const locationLabelText = state.presentation.active && state.presentation.step === 0 ? "Choose or confirm weather location" : "Weather location";
  return shell(`<div class="view-heading"><div><h2>Live environmental context.</h2><p>Weather and air-quality inputs update the routine view.</p></div><button type="button" class="primary-button" data-action="refresh" ${isLocationUpdating() ? "disabled" : ""}>${icon("refresh", 15)} Refresh</button></div><section class="panel monitor-location-panel" id="monitor-location">${locationPicker({ label: locationLabelText, compact: true })}</section><div class="module-hero" id="monitor-readings"><section class="panel monitor-card"><div class="panel-header"><h3 class="panel-title">${icon("sun", 17)} UV index</h3><p class="panel-note">${escapeHtml(environmentModeLabel())}</p></div><div class="monitor-readout"><strong>${escapeHtml(uvi)}</strong><span>${uvi === "—" ? "Unavailable" : "Current reading"}<br />${escapeHtml(state.lastUpdated)}</span></div><div class="monitor-chip-row"><span class="monitor-chip">${escapeHtml(locationLabel())}</span><span class="monitor-chip">OpenWeather ${escapeHtml(weatherStatus)}</span></div></section><section class="panel guidance-panel"><div class="panel-header"><h3 class="panel-title">${icon("sparkles", 17)} Active signals</h3><p class="panel-note">Routine inputs</p></div><div class="guidance-list"><div class="guidance"><span class="guidance-icon">${icon("sun", 16)}</span><div><strong>UV</strong><p>Daytime protection category.</p></div></div><div class="guidance"><span class="guidance-icon">${icon("droplet", 16)}</span><div><strong>Humidity</strong><p>Finish and hydration context.</p></div></div><div class="guidance"><span class="guidance-icon">${icon("wind", 16)}</span><div><strong>PM2.5</strong><p>Antioxidant context when available.</p></div></div></div></section></div>${forecastRoutinePanel()}${environmentComparisonPanel()}<div class="dashboard-grid">${environmentPanel()}${insightPanel()}</div>`);
}

function concernPicker() {
  const disabled = state.runStatus === "running";
  return `<div class="field concern-field"><label id="concern-label">Primary research concern</label><div class="concern-grid" role="group" aria-labelledby="concern-label">${concernOptions.map((option) => `<button type="button" class="concern-choice ${state.concern === option.id ? "is-selected" : ""}" data-action="concern-choice" data-concern="${option.id}" aria-pressed="${state.concern === option.id}" ${disabled ? "disabled" : ""}><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.description)}</small></button>`).join("")}</div><p class="field-help">These are non-medical research contexts, not diagnoses or treatment categories.</p></div>`;
}

function profilePreferenceFields() {
  const disabled = state.runStatus === "running";
  const finishPreference = ["matte", "dewy", "no-preference"].includes(state.finishPreference) ? state.finishPreference : "";
  const reactivityLevel = ["low", "moderate", "high"].includes(state.reactivityLevel) ? state.reactivityLevel : "";
  return `<div class="profile-secondary-fields" aria-label="Optional self-report context">
    <div class="field"><label for="finish-preference">Finish preference <span class="field-optional">(optional)</span></label><select id="finish-preference" data-action="finish-preference" ${disabled ? "disabled" : ""}><option value="" ${finishPreference ? "" : "selected"}>Not specified</option><option value="matte" ${finishPreference === "matte" ? "selected" : ""}>Matte</option><option value="dewy" ${finishPreference === "dewy" ? "selected" : ""}>Dewy</option><option value="no-preference" ${finishPreference === "no-preference" ? "selected" : ""}>No preference</option></select><p class="field-help">Optional self-described finish context; it only helps select between existing category variants.</p></div>
    <div class="field"><label for="reactivity-level">How easily does your skin usually react to new products? <span class="field-optional">(optional)</span></label><select id="reactivity-level" data-action="reactivity-level" ${disabled ? "disabled" : ""}><option value="" ${reactivityLevel ? "" : "selected"}>Not specified</option><option value="low" ${reactivityLevel === "low" ? "selected" : ""}>Low</option><option value="moderate" ${reactivityLevel === "moderate" ? "selected" : ""}>Moderate</option><option value="high" ${reactivityLevel === "high" ? "selected" : ""}>High</option></select><p class="field-help">Self-reported cosmetic context only; it does not change the primary research concern.</p></div>
    <div class="field"><label for="exposure-context">Today’s exposure</label><select id="exposure-context" data-action="exposure-context" ${disabled ? "disabled" : ""}><option value="indoors" ${state.exposureContext === "indoors" ? "selected" : ""}>Mostly indoors</option><option value="mixed" ${state.exposureContext === "mixed" ? "selected" : ""}>Mixed</option><option value="outdoors" ${state.exposureContext === "outdoors" ? "selected" : ""}>Mostly outdoors</option></select><p class="field-help">Adjusts the UV activation threshold.</p></div></div>`;
}

function synthesizedRoutineCard(routine, meta) {
  const redirect = meta?.status === "medical_redirect";
  const cleared = meta?.status === "cleared";
  const running = state.runStatus === "running";
  if (!meta && !running) {
    return `<section class="synthesized-routine-card is-ready" aria-live="polite"><div class="synth-card-top"><div><p class="routine-eyebrow">${icon("sparkles", 14)} Ready to run</p><h3>Your category preview will appear here</h3><p>${escapeHtml(state.profile[0].toUpperCase() + state.profile.slice(1))} profile · ${escapeHtml(concernOption().label)} · ${escapeHtml(locationLabel())}</p></div><span class="synth-status is-review">Awaiting run</span></div><div class="synth-ready-content"><span>${icon("flask", 24)}</span><div><strong>One gated request, then an inspectable result.</strong><p>Choose a research context and run the preview to see the category output, evidence grounding, safety trace, and environmental explanation together.</p></div></div><div class="synth-card-footer"><p>${icon("shield", 15)} <span>No routine categories are shown before a gated research run.</span></p></div></section>`;
  }
  const notices = "";
  const variant = redirect ? "is-redirect" : cleared ? "is-cleared" : "is-review";
  if (redirect) {
    return `<section class="clinical-redirect" role="alert"><span class="clinical-redirect-icon">${icon("shield", 23)}</span><div><p class="routine-eyebrow">Safety redirect</p><h3>Routine generation stopped</h3><p>${escapeHtml(notices)}</p><small>This research interface cannot assess symptoms or replace in-person care. Seek an appropriate healthcare professional for urgent, worsening, or concerning symptoms.</small></div></section>`;
  }
  const statusMessage = running
    ? "Building your routine…"
    : cleared
      ? "Safety checks cleared. Approved database ingredients are shown in the matching AM/PM steps."
      : isQuotaFallback()
      ? "Live synthesis is unavailable; this is a generic research preview, not a personalised result."
        : (notices || "Routine ready.");
  const aiRationale = meta?.aiCategoryRationale;
  const aiRationaleAvailable = Boolean(aiRationale?.status && aiRationale?.text);
  const aiRationaleMarkup = aiRationaleAvailable
    ? `<section class="ai-category-rationale"><div><span>${icon("sparkles", 14)} AI category rationale</span><small>${escapeHtml(aiRationale.label || String(aiRationale.status).replaceAll("_", " "))}</small></div><p>${escapeHtml(aiRationale.text)}</p><strong>${escapeHtml(aiRationale.boundary || "Deterministic safety checks remain the final authority for every displayed category.")}</strong></section>`
    : `<section class="ai-category-rationale is-unavailable"><div><span>${icon("info", 14)} AI category rationale</span><small>Not available</small></div><p>No AI category rationale is shown because the configured gate did not permit it or the GPT billing/provider connection is unavailable.</p><strong>Deterministic safety checks remain the final authority for every displayed category.</strong></section>`;
  const candidates = Array.isArray(meta?.ingredientCandidates?.entries) ? meta.ingredientCandidates.entries : [];
  return `<section class="synthesized-routine-card ${variant}" aria-live="polite" aria-busy="${running}"><div class="synth-card-top"><div><p class="routine-eyebrow">${icon("sparkles", 14)} Routine recommendations</p><h3>${escapeHtml(routine.label)}</h3><p>${escapeHtml(state.profile[0].toUpperCase() + state.profile.slice(1))} profile · ${escapeHtml(concernOption().label)} · ${escapeHtml(locationLabel())}</p></div><span class="synth-status ${variant}">${escapeHtml(routineStatusLabel())}</span></div>${approvedIngredientCandidatePanel(meta)}<div class="synth-structure-label">${icon("layers", 13)} Routine structure by category</div><div class="synth-time-grid"><section class="synth-time-slot"><div class="synth-time-heading">${icon("sun", 16)}<span>Morning</span></div>${routineStepList(routine.am, { dark: true, ingredientCandidates: candidates, phase: "am" })}</section><section class="synth-time-slot"><div class="synth-time-heading">${icon("sparkles", 16)}<span>Evening</span></div>${routineStepList(routine.pm, { dark: true, ingredientCandidates: candidates, phase: "pm" })}</section></div><div class="synth-card-footer"><p>${icon("shield", 15)} <span>${escapeHtml(statusMessage)}</span></p><button class="reason-button is-dark" type="button" data-action="reason">${state.reasonOpen ? "Hide rationale" : "Why these recommendations?"}</button></div>${state.reasonOpen ? `<div class="synth-rationale"><strong>Result rationale</strong><p>${escapeHtml(routine.reason)}</p>${aiRationaleMarkup}</div>` : ""}</section>`;
}

function simulatorView() {
  const routine = normaliseRoutine();
  const profileChoices = ["dry", "combination", "oily", "sensitive"].map((profile) => `<button class="profile-choice ${state.profile === profile ? "is-selected" : ""}" type="button" data-action="profile" data-profile="${profile}" aria-pressed="${state.profile === profile}" ${state.runStatus === "running" ? "disabled" : ""}>${profile[0].toUpperCase()}${profile.slice(1)}</button>`).join("");
  const locationUpdating = isLocationUpdating();
  const running = state.runStatus === "running";
  const inputs = `<section class="panel form-panel" id="routine-preview"><div class="panel-header"><h3 class="panel-title">${icon("flask", 17)} Build your routine</h3><p class="panel-note">Profile · concern · location</p></div><div class="form-grid"><div class="field"><label>Skin profile</label><div class="profile-pills">${profileChoices}</div></div>${concernPicker()}${profilePreferenceFields()}<div class="field safety-input"><label for="symptoms">Safety context <span class="field-optional">(optional)</span></label><textarea id="symptoms" data-action="symptoms" maxlength="280" aria-describedby="symptoms-help" placeholder="Anything that should pause this routine?"></textarea><p class="field-help" id="symptoms-help">Used only for this safety check.</p></div>${locationPicker({ label: "Location" })}</div><div class="form-actions"><button class="primary-button" type="button" data-action="simulate" ${locationUpdating || running ? "disabled" : ""}>${icon("sparkles", 15)} ${running ? "Building…" : "Build routine"}</button><button class="ghost-button" type="button" data-action="navigate" data-view="monitor">Environment</button></div></section>`;
  const result = `<section class="sim-result">${synthesizedRoutineCard(routine, state.routineMeta)}${researchContextPanel(state.routineMeta)}</section>`;
  return shell(`<div class="view-heading"><div><h2>Your environment-aware routine</h2><p>Built from live context, approved records, and safety checks.</p></div></div><div class="simulator-grid">${inputs}${result}</div><div class="simulator-report-grid">${progressPanel()}${reportPanel()}${evidencePanel()}</div>`);
}

function concernLabelFromId(value) {
  if (value === "all") return "All research contexts";
  return concernOption(value).label;
}

function sourceFamilyLabel(value) {
  const labels = { CIR: "CIR provenance", EWG: "EWG external link", medical_journal: "Journal source" };
  return labels[value] || String(value || "Source").replaceAll("_", " ");
}

function atlasSourceCard(source) {
  const url = safeEvidenceUrl(source?.sourceUrl);
  return `<article class="atlas-source"><div><span class="atlas-source-family">${escapeHtml(sourceFamilyLabel(source?.sourceFamily))}</span><strong>${escapeHtml(source?.title || "Source record")}</strong><small>${escapeHtml(source?.source || "")}${source?.sourceLocator ? ` · ${escapeHtml(source.sourceLocator)}` : ""}</small></div>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open source ${icon("arrow", 12)}</a>` : ""}</article>`;
}

function contextCoverageEntries() {
  const reported = state.evaluation?.categoryCoverage?.coverage || {};
  const mappedContextIds = new Set([...Object.keys(CONTEXT_COVERAGE_FALLBACK), ...Object.keys(reported)]);
  return concernOptions.filter((context) => mappedContextIds.has(context.id)).map((context) => {
    const fallback = CONTEXT_COVERAGE_FALLBACK[context.id] || { cards: 0, documents: 0 };
    const record = reported[context.id] || fallback;
    return {
      ...context,
      cards: Number(record.cards ?? fallback.cards) || 0,
      documents: Number(record.documents ?? fallback.documents) || 0,
      reported: Boolean(reported[context.id]),
    };
  });
}

function contextCoverageMap() {
  const entries = contextCoverageEntries();
  const report = state.evaluation?.categoryCoverage?.summary || {};
  const totalCards = Number(report.categorySourceCards) || entries.reduce((sum, item) => sum + item.cards, 0);
  const mappedContexts = Number(report.mappedContexts) || entries.filter((item) => item.cards > 0).length;
  return `<section class="panel context-coverage-map" aria-labelledby="coverage-map-title">
    <div class="panel-header"><div><h3 class="panel-title" id="coverage-map-title">${icon("layers", 17)} Context Coverage Map</h3><p class="panel-note">${mappedContexts}/7 research contexts · ${totalCards} source-mapped non-clinical cards</p></div><button class="ghost-button" type="button" data-action="coverage-atlas">View source-linked Atlas ${icon("arrow", 14)}</button></div>
    <p class="coverage-map-intro">Each node is an inspectable, source-attributed category context. It is not a clinical-coverage claim and remains excluded from strict CUE, live category selection, ingredient activation, and routine selection.</p>
    <div class="coverage-map-grid" role="list" aria-label="Research-context source-card coverage">${entries.map((item) => `<button class="coverage-context-node" type="button" role="listitem" data-action="coverage-context" data-concern="${escapeHtml(item.id)}" aria-label="View ${escapeHtml(item.label)} in the Ingredient Atlas"><span class="coverage-node-check">${icon("check", 13)}</span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(String(item.cards))} source-mapped non-clinical card${item.cards === 1 ? "" : "s"} · ${escapeHtml(String(item.documents))} document${item.documents === 1 ? "" : "s"}</small><span>Inspect Atlas ${icon("arrow", 12)}</span></button>`).join("")}</div>
    <div class="coverage-map-legend"><span><i class="coverage-legend-dot"></i>Source-mapped research context</span><span><i class="coverage-legend-dot is-held"></i>Pending qualified clinical review</span></div>
  </section>`;
}

function relationshipSourceFamilies(ingredient) {
  const families = (ingredient?.sources || []).map((source) => String(source?.sourceFamily || "")).filter(Boolean);
  return [...new Set(families)];
}

function relationshipIngredients() {
  const atlasIngredients = Array.isArray(state.knowledgeExplorer?.ingredients) ? state.knowledgeExplorer.ingredients : [];
  const focus = state.relationshipFocus || "all";
  return atlasIngredients.filter((ingredient) => {
    if (focus === "all") return true;
    if (focus.startsWith("family:")) return relationshipSourceFamilies(ingredient).includes(focus.slice(7));
    return (ingredient.concernContexts || []).includes(focus);
  });
}

function compactGraphLabel(value, limit = 16) {
  const text = String(value || "Record");
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1))}…` : text;
}

function relationshipFocusName(focus) {
  if (focus === "all") return "All source-mapped records";
  if (focus.startsWith("family:")) return sourceFamilyLabel(focus.slice(7));
  return concernLabelFromId(focus);
}

function ingredientRelationshipExplorer() {
  const atlasIngredients = Array.isArray(state.knowledgeExplorer?.ingredients) ? state.knowledgeExplorer.ingredients : [];
  const filteredIngredients = relationshipIngredients();
  const graphIngredients = filteredIngredients.slice(0, 12);
  const focus = state.relationshipFocus || "all";
  const sourceFamilies = ["CIR", "EWG", "medical_journal"];
  const selectedIngredient = filteredIngredients.find((ingredient) => ingredient.id === state.relationshipSelectedId) || filteredIngredients[0] || null;
  const totalAtlasRecords = Number(state.knowledgeExplorer?.overview?.ingredientCount) || 50;
  const sourceX = 842;
  const contextX = 92;
  const graphRows = Math.max(1, Math.ceil(graphIngredients.length / 3));
  const graphHeight = Math.max(402, graphRows * 78 + 54);
  const contextY = (index) => 28 + index * 50;
  const sourceY = (index) => 104 + index * 112;
  const ingredientX = (index) => 260 + (index % 3) * 178;
  const ingredientY = (index) => 30 + Math.floor(index / 3) * 76;
  const contextIndex = new Map(concernOptions.map((item, index) => [item.id, index]));
  const familyIndex = new Map(sourceFamilies.map((item, index) => [item, index]));
  const activeContexts = new Set(selectedIngredient?.concernContexts || []);
  const activeFamilies = new Set(relationshipSourceFamilies(selectedIngredient));
  const graphEdges = graphIngredients.flatMap((ingredient, index) => {
    const cx = ingredientX(index) + 57;
    const cy = ingredientY(index) + 20;
    const highlighted = selectedIngredient?.id === ingredient.id ? " is-highlighted" : "";
    const contextEdges = (ingredient.concernContexts || []).filter((id) => contextIndex.has(id)).map((id) => `<path class="relationship-edge is-context${highlighted}" d="M ${contextX + 54} ${contextY(contextIndex.get(id)) + 17} C 170 ${contextY(contextIndex.get(id)) + 17}, 203 ${cy}, ${cx} ${cy}" />`);
    const sourceEdges = relationshipSourceFamilies(ingredient).filter((family) => familyIndex.has(family)).map((family) => `<path class="relationship-edge is-source${highlighted}" d="M ${cx} ${cy} C 676 ${cy}, 717 ${sourceY(familyIndex.get(family)) + 17}, ${sourceX - 58} ${sourceY(familyIndex.get(family)) + 17}" />`);
    return [...contextEdges, ...sourceEdges];
  }).join("");
  const graphIngredientNodes = graphIngredients.map((ingredient, index) => {
    const x = ingredientX(index);
    const y = ingredientY(index);
    const selected = selectedIngredient?.id === ingredient.id;
    return `<g class="relationship-node is-ingredient ${selected ? "is-selected" : ""}"><rect x="${x}" y="${y}" width="114" height="40" rx="11"></rect><text x="${x + 10}" y="${y + 17}">${escapeHtml(compactGraphLabel(ingredient.displayName, 17))}</text><text class="relationship-status-label" x="${x + 10}" y="${y + 31}">${escapeHtml(String(ingredient.researchUseStatus || ingredient.status || "mapped").replaceAll("_", " ").slice(0, 18))}</text></g>`;
  }).join("");
  const graphContexts = concernOptions.map((context, index) => `<g class="relationship-node is-context ${(focus === context.id || activeContexts.has(context.id)) ? "is-selected" : ""}"><rect x="${contextX - 60}" y="${contextY(index)}" width="122" height="34" rx="9"></rect><text x="${contextX - 50}" y="${contextY(index) + 21}">${escapeHtml(compactGraphLabel(context.label, 18))}</text></g>`).join("");
  const graphSources = sourceFamilies.map((family, index) => `<g class="relationship-node is-source ${(focus === `family:${family}` || activeFamilies.has(family)) ? "is-selected" : ""}"><rect x="${sourceX - 58}" y="${sourceY(index)}" width="116" height="34" rx="9"></rect><text x="${sourceX - 48}" y="${sourceY(index) + 21}">${escapeHtml(compactGraphLabel(sourceFamilyLabel(family), 17))}</text></g>`).join("");
  const contextFilters = [`<button type="button" class="relationship-filter ${focus === "all" ? "is-selected" : ""}" data-action="relationship-filter" data-relationship-focus="all" aria-pressed="${focus === "all"}">All records</button>`, ...concernOptions.map((context) => `<button type="button" class="relationship-filter ${focus === context.id ? "is-selected" : ""}" data-action="relationship-filter" data-relationship-focus="${escapeHtml(context.id)}" aria-pressed="${focus === context.id}">${escapeHtml(context.label)}</button>`)].join("");
  const familyFilters = sourceFamilies.map((family) => `<button type="button" class="relationship-filter is-source-filter ${focus === `family:${family}` ? "is-selected" : ""}" data-action="relationship-filter" data-relationship-focus="family:${escapeHtml(family)}" aria-pressed="${focus === `family:${family}`}">${escapeHtml(sourceFamilyLabel(family))}</button>`).join("");
  const recordButtons = graphIngredients.map((ingredient) => `<button type="button" class="relationship-record ${selectedIngredient?.id === ingredient.id ? "is-selected" : ""}" data-action="relationship-select" data-relationship-id="${escapeHtml(ingredient.id)}" aria-pressed="${selectedIngredient?.id === ingredient.id}"><span class="relationship-record-mark">${icon("layers", 14)}</span><span><strong>${escapeHtml(ingredient.displayName)}</strong><small>${escapeHtml((ingredient.concernContexts || []).map(concernLabelFromId).slice(0, 2).join(" · ") || "Source-mapped record")}</small></span></button>`).join("");
  const selectedContexts = (selectedIngredient?.concernContexts || []).map((context) => `<span>${escapeHtml(concernLabelFromId(context))}</span>`).join("");
  const selectedFamilies = relationshipSourceFamilies(selectedIngredient).map((family) => `<span>${escapeHtml(sourceFamilyLabel(family))}</span>`).join("");
  const selectedSources = (selectedIngredient?.sources || []).slice(0, 3).map((source) => `<li><span>${escapeHtml(sourceFamilyLabel(source?.sourceFamily))}</span><strong>${escapeHtml(source?.title || source?.source || "Attributed source")}</strong></li>`).join("");
  const recordSummary = filteredIngredients.length ? `${graphIngredients.length} of ${filteredIngredients.length} filtered explorer record${filteredIngredients.length === 1 ? "" : "s"} shown` : "No explorer record matches this filter";

  return `<section class="panel relationship-explorer" aria-labelledby="relationship-explorer-title"><div class="panel-header"><div><h3 class="panel-title" id="relationship-explorer-title">${icon("activity", 17)} Ingredient Relationship Explorer</h3><p class="panel-note">Contexts, ingredients, and source families</p></div><span class="pill is-neutral">${escapeHtml(String(atlasIngredients.length))} records</span></div>${atlasIngredients.length ? `<div class="relationship-filter-groups"><div class="relationship-filter-group"><span>Research context</span><div role="group" aria-label="Filter relationship map by research context">${contextFilters}</div></div><div class="relationship-filter-group"><span>Source family</span><div role="group" aria-label="Filter relationship map by source family">${familyFilters}</div></div></div><div class="relationship-workspace"><section class="relationship-map-panel" aria-label="Relationship topology map"><div class="relationship-map-head"><div><span>Relationship topology</span><small>${escapeHtml(recordSummary)}</small></div><div class="relationship-legend"><span><i></i>Context</span><span><i class="is-source"></i>Source family</span><span><i class="is-record"></i>Ingredient</span></div></div><div class="relationship-canvas"><svg viewBox="0 0 920 ${graphHeight}" role="img" aria-label="Visual relationship topology for ${escapeHtml(relationshipFocusName(focus))}"><title>Ingredient provenance relationship topology</title><desc>Visual map of linked ingredient records.</desc><g class="relationship-edge-layer">${graphEdges}</g><g class="relationship-context-nodes">${graphContexts}</g><g class="relationship-ingredient-nodes">${graphIngredientNodes}</g><g class="relationship-source-nodes">${graphSources}</g></svg></div></section><aside class="relationship-inspector" aria-live="polite">${selectedIngredient ? `<span class="relationship-inspector-kicker">Selected ingredient</span><h4>${escapeHtml(selectedIngredient.displayName)}</h4><p>${escapeHtml((selectedIngredient.inciNames || []).join(" · ") || selectedIngredient.id)}</p><div class="relationship-inspector-tags"><div><span>Contexts</span><p>${selectedContexts || "—"}</p></div><div><span>Source families</span><p>${selectedFamilies || "—"}</p></div></div><ul class="relationship-source-list">${selectedSources || "<li><strong>No source summary recorded.</strong></li>"}</ul>` : `<div class="relationship-inspector-empty"><span>${icon("layers", 22)}</span><strong>No record in this view.</strong></div>`}</aside></div><div class="relationship-record-section"><div><span>Select an ingredient</span><small>${escapeHtml(recordSummary)}</small></div><div class="relationship-record-list" role="list">${recordButtons || `<div class="relationship-no-records">No records match this filter.</div>`}</div></div><div class="relationship-summary" role="status"><strong>${escapeHtml(relationshipFocusName(focus))}</strong><span>${escapeHtml(recordSummary)}</span><button type="button" class="text-button" data-action="relationship-filter" data-relationship-focus="all">Reset</button></div>` : `<div class="evidence-empty"><strong>No relationship records available.</strong></div>`}</section>`;
}

function knowledgeExplorerView() {
  const atlas = state.knowledgeExplorer;
  const overview = atlas?.overview || {};
  const query = state.knowledgeQuery.trim().toLowerCase();
  const allIngredients = Array.isArray(atlas?.ingredients) ? atlas.ingredients : [];
  const filtered = allIngredients.filter((ingredient) => {
    if (!query) return true;
    return [ingredient.displayName, ...(ingredient.inciNames || []), ...(ingredient.aliases || [])]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  const results = Array.isArray(state.knowledgeSearchResult?.evidence) ? state.knowledgeSearchResult.evidence : [];
  const retrieval = state.knowledgeSearchResult;
  const sourceFamilies = Object.entries(overview.sourceFamilies || {});
  const liveResearchIndex = overview.liveResearchIndex || { enabled: false, namespace: overview.demoNamespace || "research index" };
  const statusText = state.knowledgeStatus === "loading" ? "Updating Atlas…" : state.knowledgeNotice;
  const cards = filtered.map((ingredient) => {
    const contexts = (ingredient.concernContexts || []).map((context) => `<span>${escapeHtml(concernLabelFromId(context))}</span>`).join("");
    const inci = (ingredient.inciNames || []).join(" · ");
    const sources = Array.isArray(ingredient.sources) ? ingredient.sources : [];
    const primarySource = sources[0];
    const sourceCount = sources.length;
    return `<article class="atlas-ingredient"><div class="atlas-ingredient-head"><div><h3>${escapeHtml(ingredient.displayName)}</h3><p>${escapeHtml(inci || ingredient.id)}</p></div><span class="atlas-state">${sourceCount} source${sourceCount === 1 ? "" : "s"}</span></div><div class="atlas-contexts">${contexts}</div>${primarySource ? `<div class="atlas-primary-source">${atlasSourceCard(primarySource)}</div>` : ""}${sources.length > 1 ? `<details class="atlas-limitations"><summary>View ${sources.length - 1} more source${sources.length === 2 ? "" : "s"}</summary><div class="atlas-sources">${sources.slice(1).map(atlasSourceCard).join("")}</div></details>` : ""}</article>`;
  }).join("");
  const retrievalCards = results.slice(0, 8).map((item) => {
    const sourceUrl = safeEvidenceUrl(item.sourceUrl);
    const names = textList(item.ingredientNames, { limit: 3 }).join(" · ");
    return `<article class="research-hit"><div><span class="atlas-state">${escapeHtml(retrieval?.mode || "research retrieval")}</span><strong>${escapeHtml(item.title || "Research record")}</strong><small>${escapeHtml(names || "Ingredient mapping")} · ${escapeHtml(item.source || "Source record")}</small></div>${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">Source ${icon("arrow", 12)}</a>` : ""}<p>${escapeHtml(item.excerpt || "No metadata excerpt returned.")}</p></article>`;
  }).join("");
  const ingredientCount = Number(overview.ingredientCount) || allIngredients.length;
  const sourceMappedCount = allIngredients.length;
  const showRetrieval = Boolean(state.knowledgeQuery.trim() && retrieval);
  const corpus = state.corpusSummary;
  const corpusCard = corpus ? `<section class="panel corpus-digest"><div><p class="ingredient-eyebrow">${icon("layers", 14)} ${escapeHtml(corpus.title || "Corpus summary")}</p><h3>${escapeHtml(corpus.digest || "Live database facts are loading.")}</h3></div><div class="corpus-digest-tags">${(corpus.highlights || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></section>` : "";
  return shell(`<div class="view-heading atlas-heading"><div><p class="hero-kicker">Knowledge base</p><h2>Ingredient Atlas</h2><p>Search ingredients, filter by context, and open the linked sources.</p></div><button class="ghost-button" type="button" data-action="knowledge-refresh" ${state.knowledgeStatus === "loading" ? "disabled" : ""}>${icon("refresh", 15)} Refresh</button></div><section class="atlas-summary panel"><div class="atlas-summary-stat"><span>Ingredients</span><strong>${escapeHtml(String(ingredientCount || "—"))}</strong><small>incorporated records</small></div><div class="atlas-summary-stat"><span>Sources</span><strong>${escapeHtml(String(overview.sourceCount || "—"))}</strong><small>${sourceFamilies.map(([family, count]) => `${sourceFamilyLabel(family)} ${count}`).join(" · ") || "linked records"}</small></div><div class="atlas-summary-stat"><span>Index</span><strong>${liveResearchIndex.enabled ? "Live" : "Local"}</strong><small>${escapeHtml(liveResearchIndex.namespace || "metadata index")}</small></div></section>${corpusCard}<section class="panel atlas-controls"><div class="atlas-search"><label for="knowledge-query">Find an ingredient</label><div><input id="knowledge-query" value="${escapeHtml(state.knowledgeQuery)}" placeholder="Search Atlas" data-action="knowledge-query" /><button type="button" class="primary-button" data-action="knowledge-search" ${state.knowledgeSearchStatus === "searching" ? "disabled" : ""}>${state.knowledgeSearchStatus === "searching" ? "Searching…" : "Search"}</button></div></div><div class="atlas-filter"><span>Filter by context</span><div>${["all", ...concernOptions.map((option) => option.id)].map((concern) => `<button type="button" data-action="knowledge-concern" data-concern="${escapeHtml(concern)}" class="filter-chip ${state.knowledgeConcern === concern ? "is-selected" : ""}" aria-pressed="${state.knowledgeConcern === concern}">${escapeHtml(concernLabelFromId(concern))}</button>`).join("")}</div></div>${statusText ? `<p class="atlas-notice" role="status">${escapeHtml(statusText)}</p>` : ""}</section>${showRetrieval ? `<section class="panel atlas-retrieval"><div class="panel-header"><div><h3 class="panel-title">Search results</h3><p class="panel-note">${escapeHtml(String(retrieval.coverage?.uniqueIngredients ?? 0))} matches</p></div></div><div class="research-hit-grid">${retrievalCards || `<div class="evidence-empty"><strong>No source match found.</strong></div>`}</div></section>` : ""}<details class="atlas-explorer-details"><summary>${icon("activity", 16)} Explore ingredient relationships</summary>${ingredientRelationshipExplorer()}</details><section class="atlas-grid" aria-live="polite">${cards || `<div class="panel evidence-empty"><strong>No ingredients match this view.</strong></div>`}</section>`);
}

function evaluationView() {
  const evaluation = state.evaluation;
  const summary = evaluation?.summary || {};
  const retrievalSummary = evaluation?.retrieval?.summary || {};
  const safety50Summary = evaluation?.safety50?.summary || {};
  const categoryCoverageSummary = evaluation?.categoryCoverage?.summary || {};
  const categories = Array.isArray(summary.byCategory) ? summary.byCategory : [];
  const total = Number(summary.total || 0);
  const passed = Number(summary.passed || 0);
  const failures = Number(summary.failed || 0);
  const hasSummary = Number.isFinite(Number(summary.total));
  const totalLabel = hasSummary ? String(total) : "—";
  const passedLabel = hasSummary ? String(passed) : "—";
  const failureLabel = hasSummary ? String(failures) : "—";
  return shell(`<div class="view-heading"><div><h2>Final-review evaluation evidence</h2><p>Reproducible implementation checks, source-atlas retrieval scoring, safety regression, and a clear boundary between completed software evaluation and pending human studies.</p></div><button class="primary-button" type="button" data-action="evaluation-refresh" ${state.evaluationStatus === "loading" ? "disabled" : ""}>${icon("refresh", 15)} Refresh report</button></div><section class="evaluation-summary"><article class="panel evaluation-stat"><span>Automated checks</span><strong>${escapeHtml(totalLabel)}</strong><small>deterministic implementation cases</small></article><article class="panel evaluation-stat"><span>Passed</span><strong>${escapeHtml(passedLabel)}</strong><small>latest reproducible report</small></article><article class="panel evaluation-stat"><span>Failures</span><strong>${escapeHtml(failureLabel)}</strong><small>report status</small></article><article class="panel evaluation-stat"><span>Execution</span><strong>${escapeHtml(evaluation?.execution?.mode?.includes("offline") ? "Offline" : "Recorded")}</strong><small>no live provider calls required</small></article></section><section class="evaluation-supplemental"><article class="panel evaluation-mini"><span>30-query retrieval pack</span><strong>${escapeHtml(String(retrievalSummary.passed ?? "—"))}/${escapeHtml(String(retrievalSummary.total ?? "—"))}</strong><small>Recall@5 ${escapeHtml(safelyNumber(Number(retrievalSummary.recallAt5) * 100, 1))}% · MRR ${escapeHtml(safelyNumber(retrievalSummary.meanReciprocalRank, 3))}</small></article><article class="panel evaluation-mini"><span>50-case safety pack</span><strong>${escapeHtml(String(safety50Summary.passed ?? "—"))}/${escapeHtml(String(safety50Summary.total ?? "—"))}</strong><small>${escapeHtml(String(safety50Summary.failed ?? "—"))} failed · deterministic guardrail regression</small></article><article class="panel evaluation-mini"><span>Research retrieval</span><strong>${escapeHtml(evaluation?.retrieval?.execution?.retrievalStrategy ? "BM25" : "—")}</strong><small>Local fixture evaluation; live Pinecone fusion is shown in the Atlas.</small></article><article class="panel evaluation-mini"><span>Source coverage</span><strong>${escapeHtml(String(categoryCoverageSummary.mappedContexts ?? "—"))}/7</strong><small>${escapeHtml(String(categoryCoverageSummary.categorySourceCards ?? "—"))} mapped cards · non-clinical only</small></article></section>${contextCoverageMap()}<div class="evaluation-grid"><section class="panel evaluation-categories"><div class="panel-header"><h3 class="panel-title">${icon("check", 17)} Coverage by implementation area</h3><p class="panel-note">${escapeHtml(evaluation?.suite || "Loading report")}</p></div><div class="evaluation-category-list">${categories.map((category) => `<div><span>${escapeHtml(String(category.category || "category").replaceAll("_", " "))}</span><strong>${escapeHtml(String(category.passed || 0))}/${escapeHtml(String(category.total || 0))}</strong><small>${escapeHtml(String(category.failed || 0))} failed</small></div>`).join("") || `<div class="evidence-empty"><strong>Evaluation report is loading.</strong><span>Refresh this view after running the offline suite.</span></div>`}</div></section><section class="panel evaluation-scope"><div class="panel-header"><h3 class="panel-title">${icon("info", 17)} Scope and next evidence</h3><p class="panel-note">Honest final-review boundary</p></div><ul>${(evaluation?.limitations || ["Run npm run eval:study to load the current report."]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><div class="evaluation-protocol"><strong>Human-review protocol</strong><p>Use the provided source links and exported run reports for a later blinded domain review and user-acceptance study. No human-study, clinician, or treatment outcome is claimed by this dashboard.</p></div></section></div>`);
}

function bulkView() {
  const feedback = state.bulkFeedback || { tone: "neutral", message: "No file imported in this browser session." };
  const detailById = new Map((state.bulkReport?.results || []).map((item) => [item.profileId, item]));
  const batchRows = state.bulkRows.map(([id, concern, cue, status]) => {
    const detail = detailById.get(id);
    return `<tr><td>${escapeHtml(id)}</td><td>${escapeHtml(concern)}</td><td class="cue-score">${escapeHtml(cue)}</td><td>${escapeHtml(detail?.safetyStatus || "Awaiting run")}</td><td>${escapeHtml(detail?.topDriver || "—")}</td><td><span class="table-status ${status === "Review" ? "review" : ""}">${escapeHtml(status)}</span></td></tr>`;
  }).join("");
  const summary = state.bulkReport?.summary;
  return shell(`<div class="view-heading"><div><h2>Bulk analysis suite</h2><p>Process up to 100 de-identified profiles through the same environment, retrieval/evidence-coverage proxy, research-atlas, safety, and explainability paths—without live LLM fan-out.</p></div></div><div class="bulk-layout"><section class="panel upload-panel"><div class="panel-header"><h3 class="panel-title">${icon("upload", 17)} Import profiles</h3><p class="panel-note">CSV prototype · browser-only read</p></div><div class="dropzone" data-dropzone><div>${icon("file", 30)}<strong>Drop a profile CSV here</strong><p>Use locally de-identified rows only. The preview reads the file in your browser.</p><label class="upload-label">${icon("upload", 14)} Choose CSV<input type="file" accept=".csv,text/csv" data-action="upload" /></label></div></div><div class="bulk-feedback is-${escapeHtml(feedback.tone)}" role="status" aria-live="polite">${icon(feedback.tone === "success" ? "check" : "info", 15)}<span>${escapeHtml(feedback.message)}</span></div><label class="bulk-confirm"><input type="checkbox" data-action="bulk-confirm" ${state.bulkConfirmed ? "checked" : ""} /> <span>I confirm these rows are de-identified and permitted for this local research preview.</span></label><p class="form-disclaimer">Expected columns: profile ID, concern. Quoted cells are supported; blank profile IDs are skipped; imports are capped at 100 rows.</p></section><section class="panel batch-panel"><div class="batch-topline"><div><h3>Current batch</h3><p>${state.bulkRows.length} profiles · ${summary ? `${escapeHtml(String(summary.researchEvidenceRecords || 0))} mapped research records · average CUE proxy ${escapeHtml(safelyNumber(summary.averageCue))}` : "awaiting deterministic analysis"}</p></div><span class="pill is-neutral">No LLM fan-out</span></div><div class="batch-table-scroll"><table class="batch-table"><thead><tr><th>Profile</th><th>Concern</th><th>CUE proxy</th><th>Safety</th><th>Top driver</th><th>Status</th></tr></thead><tbody>${batchRows}</tbody></table></div><div class="batch-actions"><button class="ghost-button" type="button" data-action="export">${icon("download", 15)} Export CSV</button><button class="ghost-button" type="button" data-action="export-batch-audit" ${state.bulkReport?.results?.length ? "" : "disabled"}>${icon("file", 15)} Export audit JSON</button><button class="primary-button" type="button" data-action="batch" ${state.bulkConfirmed ? "" : "disabled"}>${icon("sparkles", 15)} Run deterministic batch</button></div></section></div>`);
}

function reviewerView() {
  const reviewer = state.reviewer;
  const queue = reviewer.queue;
  const cards = Array.isArray(queue?.cards) ? queue.cards : [];
  const selectedSourceId = cards.some((card) => card.sourceId === reviewer.selectedSourceId)
    ? reviewer.selectedSourceId
    : cards[0]?.sourceId || "";
  const selectedCard = cards.find((card) => card.sourceId === selectedSourceId) || null;
  const summary = queue?.summary || {};
  const connected = reviewer.status === "ready" && Boolean(queue);
  const canSubmit = connected && Boolean(selectedCard) && Boolean(reviewer.token.trim());
  const actionLabels = {
    annotate: "Add local annotation",
    needs_changes: "Mark needs changes (local)",
    approve: "Record approve action (local only)",
    reject: "Record reject action (local only)",
  };
  const actionOptions = Object.entries(actionLabels).map(([value, label]) => `<option value="${value}" ${reviewer.action === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  const sourceOptions = cards.map((card) => `<option value="${escapeHtml(card.sourceId)}" ${card.sourceId === selectedSourceId ? "selected" : ""}>${escapeHtml(card.sourceFamily)} · ${escapeHtml(card.title)}</option>`).join("");
  const cardRows = cards.map((card) => {
    const sourceUrl = safeEvidenceUrl(card.sourceUrl);
    const latest = card.latestAnnotation;
    const ingredientNames = Array.isArray(card.ingredientIds) && card.ingredientIds.length ? card.ingredientIds.join(" · ") : "No ingredient mapping";
    return `<article class="reviewer-source-card"><div class="reviewer-source-head"><div><span class="atlas-state">${escapeHtml(card.sourceFamily || "source")}</span><h3>${escapeHtml(card.title || card.sourceId)}</h3><p>${escapeHtml(card.publisher || "Publisher not recorded")} · ${escapeHtml(String(card.publishedYear || "year not recorded"))}</p></div><span class="reviewer-queue-state ${latest ? "is-annotated" : ""}">${escapeHtml(String(card.queueState || "awaiting_annotation").replaceAll("_", " "))}</span></div><p class="reviewer-source-meta"><strong>Mapped records:</strong> ${escapeHtml(ingredientNames)}<br /><strong>Atlas review status:</strong> ${escapeHtml(String(card.atlasClinicalReviewStatus || "not recorded").replaceAll("_", " "))}</p>${latest ? `<div class="reviewer-latest"><strong>Latest local annotation</strong><span>${escapeHtml(String(latest.action).replaceAll("_", " "))} · ${escapeHtml(latest.reviewerLabel || "local-reviewer")} · ${escapeHtml(new Date(latest.createdAt).toLocaleString())}</span>${latest.note ? `<p>${escapeHtml(latest.note)}</p>` : ""}</div>` : `<p class="reviewer-awaiting">No local annotation recorded.</p>`}${sourceUrl ? `<a class="evidence-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">Open attributed source ${icon("arrow", 13)}</a>` : ""}</article>`;
  }).join("");
  const latestActions = summary.latestActions || {};
  const statusTone = reviewer.status === "error" ? "is-danger" : connected ? "" : "is-warning";

  return shell(`<div class="view-heading"><div><h2>Protected reviewer workflow</h2><p>Local, token-protected annotations for a future source-card review. This is an instrument-ready workflow, not completed clinical review or evidence activation.</p></div></div><section class="panel reviewer-boundary"><div><h3>${icon("shield", 17)} Immutable research boundary</h3><p>Every action is append-only in an ignored local file. It cannot modify the Atlas, clinical-review status, Pinecone data, CUE proxy, safety checks, or synthesis path.</p></div><span class="pill is-neutral">Local only · disabled by default</span></section><section class="reviewer-layout"><section class="panel reviewer-connect-panel"><div class="panel-header"><div><h3 class="panel-title">${icon("shield", 17)} Session access</h3><p class="panel-note">Token stays in memory for this browser session only</p></div><span class="pill ${statusTone}">${connected ? "Connected locally" : reviewer.status === "loading" ? "Connecting…" : "Not connected"}</span></div><label for="reviewer-token">Local reviewer token</label><input id="reviewer-token" type="password" autocomplete="off" spellcheck="false" value="${escapeHtml(reviewer.token)}" data-action="reviewer-token" placeholder="Configured REVIEWER_QUEUE_TOKEN" /><p class="field-help">Enable the queue locally with <code>REVIEWER_QUEUE_ENABLED=true</code> and a 24+ character token. The server refuses this workflow in production.</p><div class="reviewer-access-actions"><button class="primary-button" type="button" data-action="reviewer-connect" ${reviewer.status === "loading" ? "disabled" : ""}>${icon("shield", 14)} ${connected ? "Refresh local queue" : "Connect local queue"}</button>${reviewer.token || queue ? `<button class="ghost-button" type="button" data-action="reviewer-disconnect">Disconnect</button>` : ""}</div><p class="reviewer-status" role="status">${escapeHtml(reviewer.notice)}</p></section><section class="panel reviewer-summary-panel"><div class="panel-header"><div><h3 class="panel-title">${icon("layers", 17)} Review queue state</h3><p class="panel-note">Source-card annotations only</p></div></div>${connected ? `<div class="reviewer-summary-grid"><div><span>Source cards</span><strong>${escapeHtml(String(summary.sourceCards || 0))}</strong></div><div><span>Awaiting note</span><strong>${escapeHtml(String(summary.awaitingAnnotation || 0))}</strong></div><div><span>Latest annotations</span><strong>${escapeHtml(String(Object.values(latestActions).reduce((total, value) => total + Number(value || 0), 0)))}</strong></div></div><p>Latest local actions: ${Object.entries(latestActions).map(([action, count]) => `${String(action).replaceAll("_", " ")} ${Number(count || 0)}`).join(" · ")}</p>` : `<div class="evidence-empty"><strong>Connect a local review session to load source cards.</strong><span>No reviewer credential or source annotation is stored by the standard dashboard.</span></div>`}</section></section>${connected ? `<section class="panel reviewer-annotation-panel"><div class="panel-header"><div><h3 class="panel-title">${icon("file", 17)} Record a local source-card annotation</h3><p class="panel-note">It does not approve an ingredient, clinical claim, corpus upload, or routine.</p></div></div><div class="reviewer-form-grid"><label for="reviewer-source">Source card<select id="reviewer-source" data-action="reviewer-source">${sourceOptions}</select></label><label for="reviewer-action">Local action<select id="reviewer-action" data-action="reviewer-action">${actionOptions}</select></label><label for="reviewer-label">Pseudonymous reviewer label<input id="reviewer-label" maxlength="80" autocomplete="off" value="${escapeHtml(reviewer.reviewerLabel)}" data-action="reviewer-label" placeholder="e.g. reviewer-01" /></label><label class="reviewer-note-field" for="reviewer-note">Bounded review note<textarea id="reviewer-note" maxlength="1800" data-action="reviewer-note" placeholder="Do not enter patient data, identifiers, symptoms, or treatment instructions.">${escapeHtml(reviewer.note)}</textarea></label></div>${selectedCard ? `<p class="reviewer-selection">Selected: <strong>${escapeHtml(selectedCard.title)}</strong> · ${escapeHtml(selectedCard.sourceFamily)} · Atlas status ${escapeHtml(String(selectedCard.atlasClinicalReviewStatus || "not recorded").replaceAll("_", " "))}</p>` : ""}<div class="reviewer-submit-row"><p>Actions remain local annotations and are never used by automated eligibility or safety gates.</p><button class="primary-button" type="button" data-action="reviewer-submit" ${canSubmit ? "" : "disabled"}>${icon("check", 14)} Record local annotation</button></div></section><section class="reviewer-card-section"><div class="view-heading reviewer-card-heading"><div><h3>Source cards</h3><p>${escapeHtml(String(cards.length))} records available to this local session. The list is for inspection; its status labels do not alter Atlas records.</p></div></div><div class="reviewer-card-grid">${cardRows}</div></section>` : ""}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function render() {
  const views = { dashboard: dashboardView, monitor: monitorView, simulator: simulatorView, bulk: bulkView, knowledge: knowledgeExplorerView, evaluation: evaluationView, reviewer: reviewerView };
  app.innerHTML = views[state.activeView]();
  document.title = `DermaSynth | ${(VIEW_META[state.activeView] || VIEW_META.dashboard).title}`;
}

let toastTimer;
function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.innerHTML = `${icon("check", 16, 2.2)} <span>${escapeHtml(message)}</span>`;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3000);
}

function settleViewNavigation({ focus = true, scroll = true } = {}) {
  window.requestAnimationFrame(() => {
    if (scroll) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (focus) document.querySelector("#page-title")?.focus({ preventScroll: true });
  });
}

function writeViewRoute(view, history = "push") {
  if (history === "none" || typeof window === "undefined") return;
  const hash = viewHash(view);
  if (window.location.hash === hash) return;
  if (history === "replace") window.history.replaceState(null, "", hash);
  else window.history.pushState(null, "", hash);
}

function navigateView(view, { source = "user", history = source === "presentation" ? "replace" : "push", focus = true, scroll = true } = {}) {
  if (!VIEW_META[view]) return;
  state.activeView = view;
  state.reasonOpen = false;
  state.mobileMoreOpen = false;
  writeViewRoute(view, history);
  render();
  settleViewNavigation({ focus, scroll });
  if (view === "knowledge") {
    loadKnowledgeExplorer();
  }
  if (view === "evaluation") loadEvaluation();
}

function applyRoute() {
  const routeView = viewFromHash();
  if (!routeView || routeView === state.activeView) return;
  navigateView(routeView, { source: "route", history: "none", focus: true, scroll: true });
}

function selectedKnowledgeConcern() {
  return state.knowledgeConcern === "all" ? "" : state.knowledgeConcern;
}

async function loadKnowledgeExplorer({ force = false } = {}) {
  if (state.knowledgeStatus === "loading" && !force) return;
  state.knowledgeStatus = "loading";
  state.knowledgeNotice = "Loading versioned source metadata…";
  if (state.activeView === "knowledge") render();
  try {
    const concern = selectedKnowledgeConcern();
    const response = await fetch(`/api/knowledge-explorer${concern ? `?concern=${encodeURIComponent(concern)}` : ""}`);
    if (!response.ok) throw new Error("Knowledge atlas is unavailable");
    const payload = await response.json();
    state.knowledgeExplorer = payload;
    state.knowledgeStatus = "ready";
    const liveIndex = payload.overview?.liveResearchIndex;
    state.knowledgeNotice = `${payload.overview?.ingredientCount || 0} ingredients · ${payload.overview?.sourceCount || 0} linked sources · ${liveIndex?.enabled ? `live index: ${liveIndex.namespace}` : "local index"}`;
  } catch {
    state.knowledgeStatus = "error";
    state.knowledgeNotice = "The source registry could not be loaded. Retry when the local server is available.";
  }
  if (state.activeView === "knowledge") render();
}

async function loadCorpusSummary() {
  try {
    const response = await fetch("/api/corpus-summary");
    if (!response.ok) return;
    state.corpusSummary = await response.json();
    if (state.activeView === "knowledge") render();
  } catch {
    // The Atlas stays usable if this compact optional summary is unavailable.
  }
}

async function loadResearchSearch({ background = false } = {}) {
  if (state.knowledgeSearchStatus === "searching") return;
  state.knowledgeSearchStatus = "searching";
  if (!background && state.activeView === "knowledge") render();
  try {
    const params = new URLSearchParams();
    const concern = selectedKnowledgeConcern();
    if (concern) params.set("concern", concern);
    if (state.knowledgeQuery.trim()) params.set("q", state.knowledgeQuery.trim());
    const response = await fetch(`/api/research-search?${params}`);
    if (!response.ok) throw new Error("Research search unavailable");
    state.knowledgeSearchResult = await response.json();
    state.knowledgeSearchStatus = "ready";
  } catch {
    state.knowledgeSearchStatus = "error";
    state.knowledgeSearchResult = null;
    state.knowledgeNotice = "Research search is unavailable right now; the local atlas remains browseable.";
  }
  if (state.activeView === "knowledge") render();
}

async function loadEvaluation({ force = false } = {}) {
  if (state.evaluationStatus === "loading" && !force) return;
  state.evaluationStatus = "loading";
  if (state.activeView === "evaluation") render();
  try {
    const response = await fetch("/api/evaluation");
    if (!response.ok) throw new Error("Evaluation report unavailable");
    state.evaluation = await response.json();
    state.evaluationStatus = "ready";
  } catch {
    state.evaluationStatus = "error";
  }
  if (state.activeView === "evaluation") render();
}

async function reviewerErrorMessage(response, fallback) {
  try {
    const payload = await response.json();
    return String(payload?.error || payload?.message || fallback);
  } catch {
    return fallback;
  }
}

async function loadReviewerQueue({ successNotice = "" } = {}) {
  const reviewer = state.reviewer;
  if (!reviewer.token.trim()) {
    reviewer.status = "error";
    reviewer.queue = null;
    reviewer.notice = "Enter the local reviewer token before connecting.";
    if (state.activeView === "reviewer") render();
    return;
  }
  reviewer.status = "loading";
  reviewer.notice = "Connecting to the local reviewer queue…";
  if (state.activeView === "reviewer") render();
  try {
    const response = await fetch("/api/reviewer-queue", { headers: { "x-reviewer-token": reviewer.token } });
    if (!response.ok) throw new Error(await reviewerErrorMessage(response, "Reviewer queue is unavailable."));
    const queue = await response.json();
    reviewer.queue = queue;
    reviewer.status = "ready";
    const cards = Array.isArray(queue.cards) ? queue.cards : [];
    if (!cards.some((card) => card.sourceId === reviewer.selectedSourceId)) reviewer.selectedSourceId = cards[0]?.sourceId || "";
    reviewer.notice = successNotice || "Local reviewer queue connected. Annotations remain local and do not activate evidence.";
  } catch (error) {
    reviewer.queue = null;
    reviewer.status = "error";
    reviewer.notice = error instanceof Error ? error.message : "Reviewer queue is unavailable.";
  }
  if (state.activeView === "reviewer") render();
}

async function submitReviewerAnnotation() {
  const reviewer = state.reviewer;
  if (!reviewer.queue || !reviewer.selectedSourceId || !reviewer.token.trim()) {
    reviewer.status = "error";
    reviewer.notice = "Connect the local queue and choose a source card before recording an annotation.";
    if (state.activeView === "reviewer") render();
    return;
  }
  reviewer.status = "loading";
  reviewer.notice = "Recording the local annotation…";
  if (state.activeView === "reviewer") render();
  try {
    const response = await fetch("/api/reviewer-queue", {
      method: "POST",
      headers: { "content-type": "application/json", "x-reviewer-token": reviewer.token },
      body: JSON.stringify({
        sourceId: reviewer.selectedSourceId,
        action: reviewer.action,
        note: reviewer.note,
        reviewerLabel: reviewer.reviewerLabel,
      }),
    });
    if (!response.ok) throw new Error(await reviewerErrorMessage(response, "The local annotation could not be recorded."));
    const payload = await response.json();
    reviewer.note = "";
    await loadReviewerQueue({ successNotice: payload.notice || "Local annotation recorded; no Atlas or synthesis state changed." });
    showToast("Local source-card annotation recorded.");
  } catch (error) {
    reviewer.status = "error";
    reviewer.notice = error instanceof Error ? error.message : "The local annotation could not be recorded.";
    if (state.activeView === "reviewer") render();
  }
}

function disconnectReviewerQueue() {
  state.reviewer = {
    token: "",
    reviewerLabel: "",
    note: "",
    action: "annotate",
    selectedSourceId: "",
    queue: null,
    status: "idle",
    notice: "Disconnected. The token and all form values were removed from this browser session.",
  };
  if (state.activeView === "reviewer") render();
}

async function refreshExplainability({ shouldRender = true } = {}) {
  const location = locationPayload();
  const params = new URLSearchParams({
    concern: state.concern,
    lat: String(location.lat),
    lon: String(location.lon),
    location: location.name,
  });
  try {
    const response = await fetch(`/api/explainability?${params}`);
    if (!response.ok) throw new Error("Explainability unavailable");
    const payload = await response.json();
    state.explainability = payload.explainability || null;
    if (payload.environment && state.runStatus !== "running") state.environment = payload.environment;
  } catch {
    // Retain the last labelled explanation rather than substituting an
    // unlabelled client-side score.
  }
  if (shouldRender) render();
}

function csvRecords(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(value.trim()); value = ""; } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (quoted) return { error: "The CSV has an unmatched quote." };
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return { rows };
}

function bulkConcernCode(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z]+/g, " ").trim();
  const aliases = {
    acne: ["acne", "breakout", "breakouts", "breakout prone"],
    barrier: ["barrier"],
    pigment: ["pigment", "uneven tone", "hyperpigmentation"],
    dryness: ["dry", "dryness", "dry feeling"],
    oil: ["oil", "oily", "shine", "oil shine"],
    sensitivity: ["sensitive", "sensitivity"],
    texture: ["texture"],
  };
  return Object.entries(aliases).find(([, terms]) => terms.some((term) => normalized === term || normalized.includes(term)))?.[0] || "acne";
}

function bulkConcernLabel(value) {
  return concernLabelFromId(bulkConcernCode(value));
}

function parseCsv(text) {
  const parsed = csvRecords(text);
  if (parsed.error) return { rows: [], skipped: 0, capped: false, error: parsed.error };
  const sourceRows = parsed.rows || [];
  const first = sourceRows[0] || [];
  const hasHeader = /profile|id|concern/i.test(first.join(" "));
  let skipped = 0;
  const usable = sourceRows.slice(hasHeader ? 1 : 0).filter((row) => {
    if (!String(row[0] || "").trim()) { skipped += 1; return false; }
    return true;
  });
  const capped = usable.length > 100;
  const rows = usable.slice(0, 100).map((row, index) => {
    const id = String(row[0]).replace(/[\r\n]/g, " ").trim().slice(0, 64);
    const concern = bulkConcernLabel(row[1]);
    return [id, concern, "—", "Awaiting run"];
  });
  return { rows, skipped, capped, headerDetected: hasHeader, error: "" };
}

function quoteCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv() {
  const results = Array.isArray(state.bulkReport?.results) ? state.bulkReport.results : [];
  const content = results.length
    ? [
      "profile_id,skin_profile,concern,cue_score,cue_gate_passed,research_evidence_records,research_source_records,safety_status,top_environmental_driver,status",
      ...results.map((item) => [
        item.profileId,
        item.profile,
        concernLabelFromId(item.concern),
        safelyNumber(item.cueScore),
        item.cueGatePassed,
        item.researchEvidenceCount,
        item.researchSourceCount,
        item.safetyStatus,
        item.topDriver,
        item.status,
      ].map(quoteCsv).join(",")),
    ].join("\n")
    : ["profile_id,concern,cue_score,status", ...state.bulkRows.map((row) => row.map(quoteCsv).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "dermasynth-batch-preview.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(results.length ? "Batch research summary CSV exported." : "Deterministic batch preview CSV exported.");
}

function downloadBatchAudit() {
  const report = state.bulkReport;
  if (!report?.results?.length) {
    showToast("Run the deterministic batch before exporting its audit log.");
    return;
  }
  const content = JSON.stringify({
    exportedAt: new Date().toISOString(),
    scope: "Non-clinical, de-identified research batch export. It includes environment, retrieval, safety, and explainability traces; no free-text symptoms are collected.",
    ...report,
  }, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "dermasynth-batch-research-audit.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Structured batch safety and research audit exported.");
}

function exportCurrentRun() {
  const report = state.routineMeta?.runReport;
  if (!report) {
    showToast("Run a preview before exporting its research report.");
    return;
  }
  const content = JSON.stringify({
    exportedAt: new Date().toISOString(),
    scope: "Non-clinical research run export. Free-text symptoms are excluded; only a boolean indicates whether safety text was provided.",
    runReport: report,
  }, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "dermasynth-research-run.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Research run report exported.");
}

function printReportDate() {
  const value = state.routineMeta?.runReport?.completedAt || state.routineMeta?.runReport?.startedAt || state.routineMeta?.generatedAt || state.runStartedAt;
  const parsed = value ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : new Date().toLocaleString();
}

function printableReportSourceRows() {
  const raw = [
    ...(Array.isArray(state.routineMeta?.evidence) ? state.routineMeta.evidence : []),
    ...(Array.isArray(state.routineMeta?.researchEvidence?.evidence) ? state.routineMeta.researchEvidence.evidence : []),
  ];
  const seen = new Set();
  return raw.filter((item) => {
    const key = String(item?.id || item?.documentId || `${item?.title || ""}|${item?.sourceUrl || ""}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8).map((item) => {
    const url = safeEvidenceUrl(item?.sourceUrl);
    const title = escapeHtml(item?.title || (item?.ingredientNames || []).join(" · ") || "Source-linked research record");
    const source = escapeHtml(item?.source || "Source metadata");
    const scope = escapeHtml(item?.evidenceScope || item?.excerpt || "Source-linked research context only.");
    return `<li><strong>${title}</strong><span>${source}</span><p>${scope}</p>${url ? `<a href="${escapeHtml(url)}">Open attributed source</a>` : ""}</li>`;
  }).join("");
}

function printableResearchReportDocument() {
  const meta = state.routineMeta || {};
  const routine = normaliseRoutine();
  const environment = activeEnvironment();
  const readings = environment.readings || {};
  const grounding = meta.grounding || {};
  const safety = meta.safety || {};
  const features = Array.isArray(meta.explainability?.features) ? meta.explainability.features : Array.isArray(state.explainability?.features) ? state.explainability.features : [];
  const safetyChecks = Array.isArray(safety.checks) ? safety.checks : [];
  const sources = printableReportSourceRows();
  const stepRows = (steps) => steps.map((step, index) => `<li><b>${index + 1}</b><div><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(step.note)}</span></div></li>`).join("");
  const contributionRows = features.slice(0, 4).map((feature) => `<tr><td>${escapeHtml(feature.label || "Environmental input")}</td><td>${escapeHtml(feature.rawValue ?? "—")}${feature.unit ? ` ${escapeHtml(feature.unit)}` : ""}</td><td>${escapeHtml(safelyNumber(feature.shapValue, 3))}</td><td>${escapeHtml(String(feature.direction || "reported").replaceAll("_", " "))}</td></tr>`).join("");
  const environmentRows = [
    ["UV index", environmentValue(readings.uvi)],
    ["Humidity", `${environmentValue(readings.humidity)}%`],
    ["Temperature", `${environmentValue(readings.temperature)} °C`],
    ["PM2.5", `${environmentValue(readings.pm25)} µg/m³`],
  ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  const status = routineStatusLabel();
  const sourceNote = sources || "<li><strong>No retrieved source list was returned for this run.</strong><span>Review the run trace and Atlas separately.</span></li>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>DermaSynth final-review report</title><style>
    :root { color-scheme: light; --ink:#173530; --muted:#5e716b; --line:#d8e5e0; --accent:#1b7467; --soft:#eef8f4; }
    * { box-sizing:border-box; } body { margin:0; color:var(--ink); background:#eef4f1; font:14px/1.48 Inter, Avenir Next, Arial, sans-serif; } main { width:min(920px,100%); margin:0 auto; padding:34px; background:#fff; } .masthead { display:flex; justify-content:space-between; gap:24px; padding:25px 28px; color:#effff9; border-radius:20px; background:linear-gradient(135deg,#0c3d38,#176a5e); } .mark { display:flex; align-items:center; gap:11px; color:#b9e6d9; font-size:11px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; } .mark::before { width:12px; height:12px; border-radius:4px; background:#8ee2ca; content:""; } h1 { margin:8px 0 0; color:#fff; font-size:31px; letter-spacing:-.05em; } .masthead p { max-width:510px; margin:8px 0 0; color:#c7e8df; } .stamp { min-width:155px; color:#b7ded4; font-size:11px; text-align:right; } .stamp strong { display:block; margin-top:4px; color:#fff; font-size:13px; } section { margin-top:24px; padding:22px; border:1px solid var(--line); border-radius:16px; } h2 { margin:0; font-size:16px; letter-spacing:-.02em; } .lead { margin:6px 0 0; color:var(--muted); font-size:12px; } .status { display:inline-block; margin-top:13px; padding:5px 9px; color:#235f54; border-radius:999px; background:#dcf1ea; font-size:11px; font-weight:800; } .environment { display:grid; grid-template-columns:repeat(4,1fr); gap:9px; margin-top:15px; } .environment div { padding:12px; border-radius:11px; background:#f6faf8; } .environment span, .environment strong { display:block; } .environment span { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.08em; } .environment strong { margin-top:4px; font-size:17px; } .routine { display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-top:15px; } .routine article { padding:15px; border-radius:12px; background:#f8fbf9; } .routine h3 { margin:0; font-size:12px; text-transform:uppercase; letter-spacing:.08em; } ol { display:grid; gap:10px; margin:13px 0 0; padding:0; list-style:none; } ol li { display:grid; grid-template-columns:22px 1fr; gap:9px; } ol b { display:grid; width:21px; height:21px; place-items:center; color:#176a5e; border-radius:50%; background:#dff2ec; font-size:10px; } ol strong, ol span { display:block; } ol span { margin-top:2px; color:var(--muted); font-size:11px; } .facts { display:grid; grid-template-columns:repeat(3,1fr); gap:9px; margin-top:14px; } .facts div { padding:11px; border-left:3px solid #9ed6c8; background:#f8fbf9; } .facts dt { color:var(--muted); font-size:10px; text-transform:uppercase; } .facts dd { margin:4px 0 0; font-weight:750; } .checks { display:grid; gap:7px; margin-top:14px; padding:0; list-style:none; } .checks li { padding:10px 11px; color:#41564f; border-radius:10px; background:#f7faf8; font-size:12px; } table { width:100%; margin-top:14px; border-collapse:collapse; font-size:12px; } th, td { padding:9px; border-bottom:1px solid var(--line); text-align:left; } th { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.06em; } .sources { display:grid; gap:10px; margin:14px 0 0; padding:0; list-style:none; } .sources li { padding:12px; border:1px solid var(--line); border-radius:10px; } .sources strong, .sources span { display:block; } .sources span, .sources p { color:var(--muted); font-size:11px; } .sources p { margin:4px 0; } a { color:#176a5e; font-size:11px; font-weight:750; } .boundary { margin-top:24px; padding:15px 17px; color:#46625a; border:1px solid #cbe7dd; border-radius:13px; background:#eff9f5; font-size:11px; } .boundary strong { color:#176a5e; } footer { margin-top:18px; color:#71827d; font-size:10px; text-align:center; } @media print { body { background:#fff; } main { padding:0; } section { break-inside:avoid; } } @media (max-width:620px) { main { padding:18px; } .masthead { display:block; } .stamp { margin-top:15px; text-align:left; } .environment, .facts, .routine { grid-template-columns:1fr 1fr; } }
  </style></head><body><main><header class="masthead"><div><div class="mark">DermaSynth · Final-review research report</div><h1>Explainable category-preview record</h1><p>Environment inputs, category-only routine output, source links, deterministic guardrails, and configured contribution values in one printable artefact.</p></div><div class="stamp">Generated<strong>${escapeHtml(printReportDate())}</strong><br />Non-clinical research demonstrator</div></header><section><h2>Run boundary</h2><p class="lead">The report intentionally omits optional free-text safety context. It does not diagnose, prescribe, select a named ingredient, establish individual suitability, or replace qualified care.</p><span class="status">${escapeHtml(status)}</span><dl class="facts"><div><dt>Research context</dt><dd>${escapeHtml(concernOption().label)}</dd></div><div><dt>Profile input</dt><dd>${escapeHtml(state.profile)}</dd></div><div><dt>Evidence coverage gate</dt><dd>${Number.isFinite(Number(grounding.cueScore)) ? `CUE proxy ${escapeHtml(safelyNumber(grounding.cueScore))}` : "Not reported"}</dd></div></dl></section><section><h2>Labelled environment inputs</h2><p class="lead">${escapeHtml(locationLabel())} · ${escapeHtml(environmentModeLabel())} · ${escapeHtml(state.lastUpdated)}</p><div class="environment">${environmentRows}</div></section><section><h2>Category-only routine preview</h2><p class="lead">${escapeHtml(routine.label)}</p><div class="routine"><article><h3>Morning</h3><ol>${stepRows(routine.am)}</ol></article><article><h3>Evening</h3><ol>${stepRows(routine.pm)}</ol></article></div></section><section><h2>Deterministic guardrail trace</h2><p class="lead">${escapeHtml(String(safety.status || "Not reported").replaceAll("_", " "))}. The guardrail status is reported by the server; it is not a clinical safety guarantee.</p><ul class="checks">${safetyChecks.length ? safetyChecks.map((check) => `<li>${escapeHtml(check)}</li>`).join("") : "<li>No safety-check list was returned for this report.</li>"}</ul></section><section><h2>Configured environmental contribution view</h2><p class="lead">Exact Shapley values for the configured additive study-demo surrogate. Values explain this transparent study model only, not clinical causation.</p>${contributionRows ? `<table><thead><tr><th>Input</th><th>Reading</th><th>Shapley value</th><th>Direction</th></tr></thead><tbody>${contributionRows}</tbody></table>` : "<p class=\"lead\">No contribution values were returned for this run.</p>"}</section><section><h2>Source-linked research records</h2><p class="lead">Links are provided for final-review traceability. Their presence does not authorise a named ingredient, product, dose, frequency, compatibility, or treatment claim.</p><ul class="sources">${sourceNote}</ul></section><aside class="boundary"><strong>Scope declaration:</strong> this printable report documents a non-clinical technology demonstration. Category-source cards are source-mapped research context, remain pending qualified clinical review, and are excluded from strict CUE, live category selection, ingredient activation, and routine selection.</aside><footer>DermaSynth · local final-review export · save through the browser print dialog if a PDF file is needed.</footer></main></body></html>`;
}

function printResearchReport() {
  if (!state.routineMeta) {
    showToast("Run a gated preview before creating a printable research report.");
    return;
  }
  const reportWindow = window.open("", "dermasynth-final-review-report", "popup,width=960,height=900");
  if (!reportWindow) {
    showToast("The browser blocked the report window. Allow pop-ups, then try again.");
    return;
  }
  reportWindow.document.open();
  reportWindow.document.write(printableResearchReportDocument());
  reportWindow.document.close();
  reportWindow.focus();
  window.setTimeout(() => reportWindow.print(), 250);
}

function persistRunHistory() {
  try {
    window.localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(state.runHistory.slice(0, 12)));
  } catch {
    // Local storage is optional; the active browser session still keeps the summary.
  }
}

function recordRunSummary(payload, location) {
  const status = payload?.status === "cleared" ? "Cleared" : payload?.status === "medical_redirect" ? "Redirected" : payload?.status === "review_required" ? "Review" : "Reported";
  const cue = Number(payload?.grounding?.cueScore);
  const entry = {
    id: String(payload?.requestId || `local-${Date.now()}`),
    timestamp: new Date().toLocaleString(),
    profile: state.profile,
    concern: concernOption().label,
    location: String(location?.name || "Location unavailable").slice(0, 80),
    status,
    cue: Number.isFinite(cue) ? cue.toFixed(2) : "—",
    evidenceCount: Number.isFinite(Number(payload?.grounding?.evidenceCount)) ? Number(payload.grounding.evidenceCount) : "—",
  };
  state.runHistory = [entry, ...state.runHistory.filter((run) => run.id !== entry.id)].slice(0, 12);
  persistRunHistory();
}

function exportRunHistory() {
  if (!state.runHistory.length) return;
  const content = JSON.stringify({
    exportedAt: new Date().toISOString(),
    scope: "De-identified frontend research-run summaries. Free-text symptoms, source excerpts, and identifiers are excluded.",
    runs: state.runHistory,
  }, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "dermasynth-deidentified-run-history.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("De-identified local run history exported.");
}

function clearRunHistory() {
  state.runHistory = [];
  try { window.localStorage.removeItem(RUN_HISTORY_STORAGE_KEY); } catch { /* Optional browser storage. */ }
  render();
  showToast("Local de-identified run history cleared.");
}

function resetPreviewForInputChange() {
  if (state.runStatus === "running") state.routineRequestVersion += 1;
  state.generatedRoutine = null;
  state.routineMeta = null;
  state.reasonOpen = false;
  state.runStatus = "idle";
}

function importBulkFile(file) {
  if (!file) return;
  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
    state.bulkFeedback = { tone: "warning", message: "Choose a CSV file for this prototype." };
    render();
    return;
  }
  if (file.size > 1024 * 1024) {
    state.bulkFeedback = { tone: "warning", message: "This prototype accepts CSV files up to 1 MB." };
    render();
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseCsv(String(reader.result || ""));
    if (parsed.error) {
      state.bulkFeedback = { tone: "warning", message: parsed.error };
    } else if (!parsed.rows.length) {
      state.bulkFeedback = { tone: "warning", message: "No usable rows found. Each row needs a profile ID in the first column." };
    } else {
      state.bulkRows = parsed.rows;
      state.bulkReport = null;
      state.bulkConfirmed = false;
      const notices = [parsed.headerDetected ? "header detected" : "no header detected", parsed.skipped ? `${parsed.skipped} blank-ID row${parsed.skipped === 1 ? "" : "s"} skipped` : "all rows usable", parsed.capped ? "capped at 100 rows" : "within 100-row limit"];
      state.bulkFeedback = { tone: "success", message: `Imported ${parsed.rows.length} local row${parsed.rows.length === 1 ? "" : "s"}: ${notices.join("; ")}.` };
    }
    render();
    showToast(state.bulkFeedback.message);
  };
  reader.onerror = () => {
    state.bulkFeedback = { tone: "warning", message: "The selected file could not be read in this browser." };
    render();
  };
  reader.readAsText(file);
}

function moveForecastHover(event) {
  if (!(event.target instanceof Element)) { hideForecastHover(); return; }
  const timeline = event.target.closest("[data-forecast-hover]");
  if (!timeline || !forecastHoverData || !forecastHoverData.n) { hideForecastHover(); return; }
  const svg = timeline.querySelector("svg");
  const overlay = timeline.querySelector(".forecast-hover");
  const guide = timeline.querySelector(".forecast-guide");
  const dots = timeline.querySelector(".forecast-dots");
  const tooltip = timeline.querySelector(".forecast-tooltip");
  if (!svg || !overlay || !guide || !dots || !tooltip) return;
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const data = forecastHoverData;
  const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  let index = Math.round(frac * (data.n - 1));
  index = Math.max(0, Math.min(data.n - 1, index));
  const toY = (vy) => (vy / data.vbh) * rect.height;
  const xPx = (data.xFracs[index] ?? frac) * rect.width;

  overlay.classList.add("is-active");
  guide.style.left = `${xPx}px`;
  guide.style.top = `${toY(data.top)}px`;
  guide.style.height = `${toY(data.bottom) - toY(data.top)}px`;

  const rows = [];
  let dotsHtml = "";
  for (const s of data.series) {
    const cell = s.cells[index];
    if (!cell || cell.value === null) { rows.push(`<span class="forecast-tip-row is-off"><i style="--dot:${s.color}"></i>${escapeHtml(s.label)}<b>n/a</b></span>`); continue; }
    dotsHtml += `<span class="forecast-dot" style="left:${xPx}px;top:${toY(cell.y)}px;--dot:${s.color}"></span>`;
    rows.push(`<span class="forecast-tip-row"><i style="--dot:${s.color}"></i>${escapeHtml(s.label)}<b>${cell.value.toFixed(s.digits)} ${escapeHtml(s.unit)}</b></span>`);
  }
  if (data.pm) rows.push(`<span class="forecast-tip-row is-ref"><i class="is-dashed" style="--dot:${data.pm.color}"></i>PM2.5<b>${data.pm.value.toFixed(1)} µg/m³</b></span>`);
  dots.innerHTML = dotsHtml;
  tooltip.innerHTML = `<strong>${escapeHtml(data.times[index] || "")}</strong>${rows.join("")}`;

  const width = overlay.clientWidth || rect.width;
  const tipWidth = tooltip.offsetWidth || 150;
  let left = xPx + 12;
  if (left + tipWidth > width) left = xPx - tipWidth - 12;
  if (left < 0) left = 0;
  tooltip.style.left = `${left}px`;
}

function hideForecastHover() {
  document.querySelectorAll(".forecast-hover.is-active").forEach((el) => el.classList.remove("is-active"));
}

document.addEventListener("pointermove", moveForecastHover);
document.addEventListener("pointerleave", (event) => { if (event.target.closest?.("[data-forecast-hover]")) hideForecastHover(); }, true);
document.addEventListener("pointerdown", moveForecastHover);

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action } = target.dataset;
  if (action === "presentation-start") { startPresentation(); return; }
  if (action === "presentation-close") { endPresentation(); return; }
  if (action === "presentation-back") { setPresentationStep(state.presentation.step - 1); return; }
  if (action === "presentation-next") { advancePresentation(); return; }
  if (action === "presentation-skip") { advancePresentation({ skipProof: true }); return; }
  if (action === "presentation-run") { generateRoutine(); return; }
  if (action === "mobile-more") { state.mobileMoreOpen = !state.mobileMoreOpen; render(); return; }
  if (action === "mobile-more-close") { state.mobileMoreOpen = false; render(); return; }
  if (action === "navigate") { navigateView(target.dataset.view); return; }
  if (action === "stage") { state.selectedStage = state.selectedStage === target.dataset.stage ? null : target.dataset.stage; render(); return; }
  if (action === "refresh") {
    if (isLocationUpdating()) { showToast("Wait for the selected location's readings to finish updating."); return; }
    refreshEnvironment();
    return;
  }
  if (action === "location-search") { searchLocations(); return; }
  if (action === "select-location") { selectLocation(Number(target.dataset.locationIndex)); return; }
  if (action === "reset-location") { resetLocation(); return; }
  if (action === "comparison-location-search") { searchComparisonLocations(); return; }
  if (action === "comparison-location-select") { selectComparisonLocation(Number(target.dataset.comparisonLocationIndex)); return; }
  if (action === "comparison-refresh") { refreshComparisonContext(); return; }
  if (action === "profile") { if (state.runStatus === "running") return; state.profile = target.dataset.profile; resetPreviewForInputChange(); render(); return; }
  if (action === "concern-choice") { if (state.runStatus === "running") return; state.concern = target.dataset.concern; resetPreviewForInputChange(); render(); refreshExplainability({ shouldRender: true }); refreshComparisonContext(undefined, { announce: false }); return; }
  if (action === "simulate") { generateRoutine(); return; }
  if (action === "reason") { state.reasonOpen = !state.reasonOpen; render(); return; }
  if (action === "batch") { runBatch(); return; }
  if (action === "export") { downloadCsv(); return; }
  if (action === "export-batch-audit") { downloadBatchAudit(); return; }
  if (action === "print-research-report") { printResearchReport(); return; }
  if (action === "export-current-run") { exportCurrentRun(); return; }
  if (action === "export-run-history") { exportRunHistory(); return; }
  if (action === "clear-run-history") { clearRunHistory(); }
  if (action === "reviewer-connect") { loadReviewerQueue(); return; }
  if (action === "reviewer-disconnect") { disconnectReviewerQueue(); return; }
  if (action === "reviewer-submit") { submitReviewerAnnotation(); return; }
  if (action === "knowledge-refresh") { loadKnowledgeExplorer({ force: true }); loadCorpusSummary(); return; }
  if (action === "knowledge-search") { loadResearchSearch(); return; }
  if (action === "knowledge-concern") {
    state.knowledgeConcern = target.dataset.concern || "all";
    state.relationshipFocus = state.knowledgeConcern;
    state.relationshipSelectedId = "";
    state.knowledgeSearchResult = null;
    loadKnowledgeExplorer({ force: true });
    return;
  }
  if (action === "coverage-atlas") { navigateView("knowledge"); return; }
  if (action === "coverage-context") {
    state.knowledgeConcern = target.dataset.concern || "all";
    state.relationshipFocus = state.knowledgeConcern;
    state.relationshipSelectedId = "";
    state.knowledgeSearchResult = null;
    navigateView("knowledge");
    return;
  }
  if (action === "relationship-filter") {
    state.relationshipFocus = target.dataset.relationshipFocus || "all";
    state.relationshipSelectedId = "";
    if (state.activeView === "knowledge") {
      const focusValue = state.relationshipFocus;
      render();
      window.requestAnimationFrame(() => Array.from(document.querySelectorAll("[data-relationship-focus]")).find((item) => item.dataset.relationshipFocus === focusValue)?.focus());
    }
    return;
  }
  if (action === "relationship-select") {
    state.relationshipSelectedId = target.dataset.relationshipId || "";
    if (state.activeView === "knowledge") {
      const selectedId = state.relationshipSelectedId;
      render();
      window.requestAnimationFrame(() => Array.from(document.querySelectorAll("[data-relationship-id]")).find((item) => item.dataset.relationshipId === selectedId)?.focus());
    }
    return;
  }
  if (action === "evaluation-refresh") { loadEvaluation({ force: true }); }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.dataset.action === "concern") { state.concern = target.value; resetPreviewForInputChange(); render(); refreshExplainability({ shouldRender: true }); refreshComparisonContext(undefined, { announce: false }); }
  if (target.dataset.action === "finish-preference") {
    state.finishPreference = ["matte", "dewy", "no-preference"].includes(target.value) ? target.value : "";
    resetPreviewForInputChange();
    render();
  }
  if (target.dataset.action === "reactivity-level") {
    state.reactivityLevel = ["low", "moderate", "high"].includes(target.value) ? target.value : "";
    resetPreviewForInputChange();
    render();
  }
  if (target.dataset.action === "exposure-context") {
    state.exposureContext = ["indoors", "mixed", "outdoors"].includes(target.value) ? target.value : "mixed";
    resetPreviewForInputChange();
    render();
  }
  if (target.dataset.action === "upload" && target.files?.[0]) {
    importBulkFile(target.files[0]);
  }
  if (target.dataset.action === "bulk-confirm") { state.bulkConfirmed = target.checked; render(); }
  if (target.dataset.action === "reviewer-source") { state.reviewer.selectedSourceId = target.value; render(); }
  if (target.dataset.action === "reviewer-action") { state.reviewer.action = target.value; render(); }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.dataset.action === "symptoms") {
    state.symptoms = target.value.slice(0, 280);
    return;
  }
  if (target.dataset.action === "location-query") {
    state.locationQuery = target.value;
    state.locationResults = [];
    state.locationSearchStatus = "idle";
    state.locationSearchNotice = "";
    cancelLocationSearch();
    document.querySelector("#location-results")?.remove();
    target.setAttribute("aria-expanded", "false");
  }
  if (target.dataset.action === "comparison-location-query") {
    state.comparison.query = target.value;
    state.comparison.results = [];
    state.comparison.status = "idle";
    state.comparison.notice = "";
    cancelComparisonLocationSearch();
    document.querySelector("#comparison-location-results")?.remove();
    target.setAttribute("aria-expanded", "false");
  }
  if (target.dataset.action === "knowledge-query") {
    state.knowledgeQuery = target.value.slice(0, 100);
  }
  if (target.dataset.action === "reviewer-token") {
    state.reviewer.token = target.value.slice(0, 512);
  }
  if (target.dataset.action === "reviewer-label") {
    state.reviewer.reviewerLabel = target.value.slice(0, 80);
  }
  if (target.dataset.action === "reviewer-note") {
    state.reviewer.note = target.value.slice(0, 1800);
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target.dataset.action === "comparison-location-query") {
    if (event.key === "Enter") {
      event.preventDefault();
      searchComparisonLocations();
    }
    if (event.key === "Escape") {
      state.comparison.results = [];
      state.comparison.status = "idle";
      cancelComparisonLocationSearch();
      document.querySelector("#comparison-location-results")?.remove();
      target.setAttribute("aria-expanded", "false");
    }
    return;
  }
  if (target.dataset.action !== "location-query") return;
  if (event.key === "Enter") {
    event.preventDefault();
    searchLocations();
  }
  if (event.key === "Escape") {
    state.locationResults = [];
    state.locationSearchStatus = "idle";
    cancelLocationSearch();
    document.querySelector("#location-results")?.remove();
    target.setAttribute("aria-expanded", "false");
  }
});

function isLocationUpdating() {
  return state.locationSearchStatus === "updating";
}

function cancelLocationSearch() {
  state.locationSearchVersion += 1;
  if (state.locationSearchController) {
    state.locationSearchController.abort();
    state.locationSearchController = null;
  }
}

function locationPayload(location = state.selectedLocation) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { ...defaultLocation };
  }
  return {
    name: String(location?.name || defaultLocation.name).trim() || defaultLocation.name,
    lat,
    lon,
  };
}

function environmentEndpoint(location = state.selectedLocation) {
  const selected = locationPayload(location);
  const query = new URLSearchParams({
    lat: String(selected.lat),
    lon: String(selected.lon),
    location: selected.name,
  });
  return `/api/environment?${query}`;
}

function forecastEndpoint(location = state.selectedLocation) {
  const selected = locationPayload(location);
  const query = new URLSearchParams({ concern: state.concern, lat: String(selected.lat), lon: String(selected.lon), location: selected.name });
  return `/api/environment/forecast?${query}`;
}

async function refreshForecast(location = state.selectedLocation, { shouldRender = true } = {}) {
  try {
    const response = await fetch(forecastEndpoint(location));
    if (!response.ok) throw new Error("Forecast API is unavailable");
    state.forecast = await response.json();
  } catch {
    state.forecast = { status: "unavailable", next24Hours: [], next7Days: [], providerReliability: [] };
  }
  refreshForecastSynthesis();
  if (shouldRender) render();
}

function forecastSynthesisFacts() {
  const hourly = Array.isArray(state.forecast?.next24Hours) ? state.forecast.next24Hours : [];
  const summarise = (key, digits) => {
    const values = hourly.map((period) => Number(period.environment?.readings?.[key])).filter(Number.isFinite);
    if (!values.length) return null;
    const round = (n) => Number(n.toFixed(digits));
    return { low: round(Math.min(...values)), high: round(Math.max(...values)), start: round(values[0]), end: round(values[values.length - 1]) };
  };
  const pm = Number(activeEnvironment().readings?.pm25);
  return {
    scope: "Next 24-hour environmental trend for one location. Numeric context only; not a clinical or product recommendation.",
    location: state.selectedLocation?.name || "selected location",
    concern: state.concern || "general",
    hours: hourly.length,
    uv_index: summarise("uvi", 1),
    humidity_percent: summarise("humidity", 0),
    temperature_celsius: summarise("temperature", 1),
    pm25_now_ugm3: Number.isFinite(pm) ? Number(pm.toFixed(1)) : null,
  };
}

async function refreshForecastSynthesis() {
  const facts = forecastSynthesisFacts();
  const key = JSON.stringify(facts);
  if (!facts.hours) {
    state.forecastSynthesis = { status: "unavailable", text: "", generatedAt: "" };
    state.forecastSynthesisKey = key;
    return;
  }
  if (key === state.forecastSynthesisKey && state.forecastSynthesis?.status === "available") return;
  state.forecastSynthesisKey = key;
  state.forecastSynthesis = { status: "loading", text: "", generatedAt: "" };
  render();
  try {
    const response = await fetch("/api/ai/augment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "forecast", facts }),
    });
    if (!response.ok) throw new Error("Forecast synthesis is unavailable");
    const payload = await response.json();
    if (key !== state.forecastSynthesisKey) return;
    if (payload.status === "available" && payload.text) {
      state.forecastSynthesis = { status: "available", text: payload.text, generatedAt: payload.generatedAt || "" };
    } else {
      state.forecastSynthesis = { status: "unavailable", text: "", generatedAt: "" };
    }
  } catch {
    if (key !== state.forecastSynthesisKey) return;
    state.forecastSynthesis = { status: "unavailable", text: "", generatedAt: "" };
  }
  render();
}

async function searchLocations() {
  if (isLocationUpdating() || state.runStatus === "running") return;
  const query = state.locationQuery.trim();
  if (query.length < 2) {
    state.locationResults = [];
    state.locationSearchStatus = "error";
    state.locationSearchNotice = "Enter at least two characters to search for a location.";
    render();
    return;
  }

  state.locationResults = [];
  state.locationSearchStatus = "searching";
  state.locationSearchNotice = "";
  if (state.locationSearchController) state.locationSearchController.abort();
  const requestVersion = ++state.locationSearchVersion;
  const controller = new AbortController();
  state.locationSearchController = controller;
  render();
  try {
    const response = await fetch(`/api/locations?q=${encodeURIComponent(query)}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Location search is unavailable");
    const payload = await response.json();
    if (requestVersion !== state.locationSearchVersion) return;
    state.locationResults = Array.isArray(payload.locations) ? payload.locations : [];
    state.locationSearchStatus = state.locationResults.length ? "ready" : "empty";
    state.locationSearchNotice = payload.notices?.[0] || "";
    render();
  } catch {
    if (requestVersion !== state.locationSearchVersion) return;
    state.locationResults = [];
    state.locationSearchStatus = "error";
    state.locationSearchNotice = "Location search is unavailable right now.";
    render();
  } finally {
    if (state.locationSearchController === controller) state.locationSearchController = null;
  }
}

async function applyLocation(location) {
  if (isLocationUpdating() || state.runStatus === "running") return;
  const selected = locationPayload(location);
  const locationVersion = ++state.locationVersion;
  cancelLocationSearch();
  state.locationResults = [];
  state.locationSearchStatus = "updating";
  state.locationSearchNotice = `Updating readings for ${selected.name}…`;
  render();

  const refreshed = await refreshEnvironment(selected, { announce: false, locationVersion });
  if (locationVersion !== state.locationVersion) return;
  if (!refreshed) {
    state.locationSearchStatus = "error";
    state.locationSearchNotice = `Could not update readings for ${selected.name}; the previous location remains active.`;
    render();
    showToast("Location update was unavailable; retained the previous weather readings.");
    return;
  }

  state.locationQuery = state.selectedLocation.name;
  state.locationResults = [];
  state.locationSearchStatus = "selected";
  state.locationSearchNotice = `Weather location: ${selected.name}`;
  resetPreviewForInputChange();
  render();
  showToast(`Weather readings updated for ${selected.name}.`);
}

async function selectLocation(index) {
  const result = state.locationResults[index];
  if (!result) return;
  await applyLocation({ name: locationResultLabel(result), lat: result.lat, lon: result.lon });
}

async function resetLocation() {
  state.locationQuery = "";
  await applyLocation({ ...defaultLocation });
}

async function refreshEnvironment(location = state.selectedLocation, { announce = true, locationVersion = state.locationVersion } = {}) {
  const selected = locationPayload(location);
  const requestVersion = ++state.environmentRequestVersion;
  try {
    const response = await fetch(environmentEndpoint(selected));
    if (!response.ok) throw new Error("Environment API is unavailable");
    const payload = await response.json();
    if (requestVersion !== state.environmentRequestVersion || locationVersion !== state.locationVersion) return false;
    state.environment = payload;
    state.selectedLocation = locationPayload(payload.location || selected);
    state.lastUpdated = payload.updatedAt || "just now";
    await refreshExplainability({ shouldRender: false });
    await refreshForecast(state.selectedLocation, { shouldRender: false });
    render();
    if (announce) showToast(`${environmentModeLabel()} refreshed for ${state.selectedLocation.name}.`);
    return true;
  } catch {
    if (requestVersion !== state.environmentRequestVersion || locationVersion !== state.locationVersion) return false;
    render();
    if (announce) showToast("Environment API was unavailable; retained the last labelled reading set.");
    return false;
  }
}

function comparisonExplainabilityEndpoint(location = state.comparison.selectedLocation) {
  const selected = locationPayload(location);
  const query = new URLSearchParams({
    concern: state.concern,
    lat: String(selected.lat),
    lon: String(selected.lon),
    location: selected.name,
  });
  return `/api/explainability?${query}`;
}

function cancelComparisonLocationSearch() {
  state.comparison.searchVersion += 1;
  if (state.comparison.controller) {
    state.comparison.controller.abort();
    state.comparison.controller = null;
  }
}

async function searchComparisonLocations() {
  const comparison = state.comparison;
  if (comparisonBusy()) return;
  const query = comparison.query.trim();
  if (query.length < 2) {
    comparison.results = [];
    comparison.status = "error";
    comparison.notice = "Enter at least two characters to search a comparison location.";
    render();
    return;
  }
  comparison.results = [];
  comparison.status = "searching";
  comparison.notice = "";
  if (comparison.controller) comparison.controller.abort();
  const requestVersion = ++comparison.searchVersion;
  const controller = new AbortController();
  comparison.controller = controller;
  render();
  try {
    const response = await fetch(`/api/locations?q=${encodeURIComponent(query)}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Location search is unavailable");
    const payload = await response.json();
    if (requestVersion !== comparison.searchVersion) return;
    comparison.results = Array.isArray(payload.locations) ? payload.locations : [];
    comparison.status = comparison.results.length ? "ready" : "empty";
    comparison.notice = payload.notices?.[0] || (comparison.results.length ? "Choose a location to load its labelled context." : "No matching comparison location was found.");
  } catch {
    if (requestVersion !== comparison.searchVersion) return;
    comparison.results = [];
    comparison.status = "error";
    comparison.notice = "Comparison location search is unavailable right now.";
  } finally {
    if (comparison.controller === controller) comparison.controller = null;
    if (state.activeView === "monitor") render();
  }
}

async function refreshComparisonContext(location = state.comparison.selectedLocation, { announce = true } = {}) {
  const comparison = state.comparison;
  const selected = locationPayload(location);
  const requestVersion = ++comparison.requestVersion;
  comparison.status = "updating";
  comparison.notice = `Loading labelled context for ${selected.name}…`;
  if (state.activeView === "monitor") render();
  try {
    const response = await fetch(comparisonExplainabilityEndpoint(selected));
    if (!response.ok) throw new Error("Comparison context unavailable");
    const payload = await response.json();
    if (requestVersion !== comparison.requestVersion) return false;
    comparison.selectedLocation = locationPayload(payload.environment?.location || selected);
    comparison.environment = payload.environment || comparison.environment;
    comparison.explainability = payload.explainability || null;
    comparison.updatedAt = payload.environment?.updatedAt || "just now";
    comparison.status = "ready";
    comparison.notice = `Comparison context ready for ${comparison.selectedLocation.name}.`;
    if (state.activeView === "monitor") render();
    if (announce) showToast(`Comparison context updated for ${comparison.selectedLocation.name}.`);
    return true;
  } catch {
    if (requestVersion !== comparison.requestVersion) return false;
    comparison.status = "error";
    comparison.notice = `Could not load labelled context for ${selected.name}.`;
    if (state.activeView === "monitor") render();
    if (announce) showToast("Comparison context was unavailable; the previous labelled reading set was retained.");
    return false;
  }
}

async function selectComparisonLocation(index) {
  const result = state.comparison.results[index];
  if (!result) return;
  cancelComparisonLocationSearch();
  state.comparison.results = [];
  const selected = { name: locationResultLabel(result), lat: result.lat, lon: result.lon };
  const updated = await refreshComparisonContext(selected, { announce: true });
  if (updated) {
    state.comparison.query = state.comparison.selectedLocation.name;
    if (state.activeView === "monitor") render();
  }
}

async function generateRoutine() {
  if (isLocationUpdating()) {
    showToast("Wait for the selected location's readings to finish updating.");
    return;
  }
  if (state.runStatus === "running") return;
  state.reasonOpen = false;
  const location = locationPayload();
  const symptoms = state.symptoms.trim().slice(0, 280);
  const locationVersion = state.locationVersion;
  const requestVersion = ++state.routineRequestVersion;
  state.runStatus = "running";
  state.runStartedAt = Date.now();
  render();
  try {
    const body = { profile: state.profile, concern: state.concern, location };
    if (state.finishPreference) body.finishPreference = state.finishPreference;
    if (state.reactivityLevel) body.reactivityLevel = state.reactivityLevel;
    if (state.exposureContext) body.exposureContext = state.exposureContext;
    if (symptoms) body.symptoms = symptoms;
    const response = await fetch("/api/routine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Routine API is unavailable");
    const payload = await response.json();
    if (requestVersion !== state.routineRequestVersion || locationVersion !== state.locationVersion) return;
    state.generatedRoutine = payload.routine || null;
    state.routineMeta = payload;
    state.runStatus = "complete";
    state.symptoms = "";
    if (payload.environment) {
      state.environment = payload.environment;
      state.selectedLocation = locationPayload(payload.environment.location || state.selectedLocation);
      state.locationQuery = state.selectedLocation.name;
      state.lastUpdated = payload.environment.updatedAt || state.lastUpdated;
    }
    state.explainability = payload.explainability || state.explainability;
    recordRunSummary(payload, location);
    render();
    refreshIngredientRationales();
    if (payload.status === "cleared") {
      showToast("Grounded research preview cleared the configured gates.");
    } else if (payload.status === "medical_redirect") {
      showToast("The request was redirected for clinical assessment.");
    } else if (payload.synthesisStatus === "quota_unavailable") {
      showToast("Live synthesis unavailable; showing a generic research preview.");
    } else {
      showToast("Generic research preview returned; review the gate status before relying on it.");
    }
  } catch {
    if (requestVersion !== state.routineRequestVersion || locationVersion !== state.locationVersion) return;
    state.generatedRoutine = profileRoutines[state.concern] || profileRoutines.acne;
    state.routineMeta = {
      status: "review_required",
      mode: "local",
      safety: { status: "pending", checks: [], flags: [] },
      notices: ["The server could not be reached. This is a local generic research preview."],
    };
    state.runStatus = "error";
    state.symptoms = "";
    recordRunSummary(state.routineMeta, location);
    render();
    showToast("Server unavailable; retained a local generic research preview.");
  }
}

async function refreshIngredientRationales() {
  const selection = state.routineMeta?.ingredientCandidates;
  const entries = Array.isArray(selection?.entries) ? selection.entries : [];
  if (selection?.status !== "available" || !entries.length) {
    state.ingredientRationales = {};
    state.ingredientRationaleStatus = "idle";
    state.ingredientRationaleKey = "";
    return;
  }
  const candidates = entries.map((entry) => ({ ingredientId: entry.ingredientId, displayName: entry.displayName, categoryTitle: entry.categoryTitle }));
  const key = JSON.stringify({ c: state.concern, e: state.environment?.readings, ids: candidates.map((c) => c.ingredientId) });
  if (key === state.ingredientRationaleKey && state.ingredientRationaleStatus === "available") return;
  state.ingredientRationaleKey = key;
  state.ingredientRationaleStatus = "loading";
  render();
  try {
    const response = await fetch("/api/ai/ingredient-rationale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concern: state.concern, environment: { readings: state.environment?.readings || {} }, candidates }),
    });
    if (!response.ok) throw new Error("Ingredient rationale is unavailable");
    const payload = await response.json();
    if (key !== state.ingredientRationaleKey) return;
    const map = {};
    for (const item of Array.isArray(payload.rationales) ? payload.rationales : []) {
      if (item && item.ingredientId && item.text) map[item.ingredientId] = { text: item.text, source: item.source || "" };
    }
    state.ingredientRationales = map;
    state.ingredientRationaleStatus = Object.keys(map).length ? "available" : "unavailable";
  } catch {
    if (key !== state.ingredientRationaleKey) return;
    state.ingredientRationales = {};
    state.ingredientRationaleStatus = "unavailable";
  }
  render();
}

async function runBatch() {
  if (!state.bulkConfirmed) {
    showToast("Confirm that the rows are de-identified before running the batch preview.");
    return;
  }
  const profiles = state.bulkRows.map(([id, concern]) => ({ id, concern: bulkConcernCode(concern), profile: "combination" }));
  try {
    const response = await fetch("/api/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profiles, location: locationPayload() }),
    });
    if (!response.ok) throw new Error("Bulk API is unavailable");
    const payload = await response.json();
    const results = Array.isArray(payload.results) ? payload.results : [];
    state.bulkRows = results.map((item) => [item.profileId, concernLabelFromId(item.concern), safelyNumber(item.cueScore), item.status]);
    state.bulkReport = {
      mode: payload.mode || "deterministic-research-batch",
      summary: payload.summary || {},
      environment: payload.environment || null,
      notices: payload.notices || [],
      results,
    };
    state.bulkFeedback = { tone: "success", message: `Processed ${payload.summary?.total ?? state.bulkRows.length} de-identified profiles through environment, retrieval, research-atlas, safety, and explainability checks.` };
    render();
    showToast(state.bulkFeedback.message);
  } catch {
    state.bulkReport = null;
    state.bulkRows = state.bulkRows.map(([id, concern]) => [id, concern, "—", "Unavailable"]);
    state.bulkFeedback = { tone: "warning", message: "Bulk endpoint unavailable; no synthetic scores were substituted." };
    render();
    showToast("Bulk analysis is unavailable; no fabricated batch result was shown.");
  }
}

document.addEventListener("dragover", (event) => {
  const zone = event.target.closest("[data-dropzone]");
  if (!zone) return;
  event.preventDefault();
  zone.classList.add("is-over");
});

document.addEventListener("dragleave", (event) => {
  const zone = event.target.closest("[data-dropzone]");
  if (zone) zone.classList.remove("is-over");
});

document.addEventListener("drop", (event) => {
  const zone = event.target.closest("[data-dropzone]");
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove("is-over");
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  importBulkFile(file);
});

if (!window.location.hash || !viewFromHash()) window.history.replaceState(null, "", viewHash(state.activeView));
window.addEventListener("hashchange", applyRoute);
window.addEventListener("popstate", applyRoute);
render();
// Prime the demonstrator with labelled server data. Every call has a safe
// local/demo fallback, so the interface remains usable without provider keys.
void refreshEnvironment(defaultLocation, { announce: false });
void refreshComparisonContext(state.comparison.selectedLocation, { announce: false });
void loadKnowledgeExplorer();
void loadCorpusSummary();
void loadEvaluation();
