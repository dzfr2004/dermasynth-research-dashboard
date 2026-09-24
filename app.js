const app = document.querySelector("#app");

const defaultLocation = Object.freeze({
  name: "Kuala Lumpur, MY",
  lat: 3.139,
  lon: 101.6869,
});

const VIEW_META = Object.freeze({
  dashboard: { title: "Overview", subtitle: "Source-linked skincare research intelligence", hash: "overview" },
  monitor: { title: "Environment", subtitle: "Live location-aware research context", hash: "environment" },
  simulator: { title: "Your routine", subtitle: "Today's skincare routine", hash: "routine" },
  knowledge: { title: "Ingredient Atlas", subtitle: "Source-linked research records", hash: "atlas" },
});

const CORE_VIEWS = Object.freeze(["dashboard", "monitor", "simulator", "knowledge"]);

function viewFromHash() {
  if (typeof window === "undefined") return "dashboard";
  const requested = String(window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
  // G1: with no page in the address, consumers land on their routine and
  // the expert view lands on the research overview.
  if (!requested) return loadExpertView() ? "dashboard" : "simulator";
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
  { id: "cue", number: "04", name: "Evidence + CUE", meta: "Sufficiency gate · CUE on model text", detail: "The model is only called when enough attributable evidence is retrieved (evidence-sufficiency gate). Any text the model writes must then score at least 0.80 on Context Utilisation Evaluation (supported claims / claims), or it is regenerated once and then withheld." },
  { id: "safety", number: "05", name: "Safety", meta: "Deterministic passes + final rescan", detail: "Clinical redirect and restricted-content checks run before and after synthesis, and a post-selection pass rescans the final named ingredients (exclusions, incompatible pairs, photosensitisers in the morning, barrier guardrail)." },
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
  { id: "acne", label: "Breakouts", description: "Breakout-prone appearance" },
  { id: "barrier", label: "Skin barrier", description: "Barrier comfort" },
  { id: "pigment", label: "Uneven tone", description: "Dark spots, uneven tone" },
  { id: "dryness", label: "Dryness", description: "Skin that feels dry or tight" },
  { id: "oil", label: "Oiliness / shine", description: "Shine through the day" },
  { id: "sensitivity", label: "Sensitivity", description: "Stings or reddens easily" },
  { id: "texture", label: "Rough texture", description: "Uneven surface" },
  { id: "redness", label: "Redness", description: "Redness-prone appearance" },
  { id: "radiance", label: "Dullness", description: "Lack of glow" },
  { id: "pores", label: "Visible pores", description: "Pore appearance" },
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
const EXPERT_VIEW_STORAGE_KEY = "dermasynth.expert-view.v1";

// G1: the app opens in the consumer view; the expert view (scores, traces,
// run report) is one toggle away and remembered in this browser only.
function loadExpertView() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(EXPERT_VIEW_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveExpertView(value) {
  try { window.localStorage.setItem(EXPERT_VIEW_STORAGE_KEY, value ? "1" : "0"); } catch { /* storage unavailable */ }
}

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
  routineContext: { runId: "", status: "idle", steps: {}, ingredients: {}, error: "", model: "" },
  expertView: loadExpertView(),
  openWhy: {},
  whyJustOpened: "",
  outlook: { status: "idle" },
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
  if (mode === "unavailable") return "Readings unavailable";
  if (mode === "user_reported") return "Your reported conditions";
  return "Sample weather (not live)";
}

const SOURCE_STATUS_WORDS = Object.freeze({ live: "live", demo: "sample data", not_configured: "not set up", unavailable: "unavailable", error: "unavailable", degraded: "partial", cached: "recent", user_reported: "reported by you", stale: "not recent" });

function sourceStatusWord(status) {
  return SOURCE_STATUS_WORDS[status] || String(status || "unknown").replaceAll("_", " ");
}

function environmentSourceLabel() {
  const sources = activeEnvironment().sources || {};
  const weather = sources.weather?.status || "demo";
  const air = sources.airQuality?.status || "demo";
  if (weather === "user_reported" && air === "user_reported") return "Conditions reported by you";
  if (weather === air) return `Weather and air: ${sourceStatusWord(weather)}`;
  return `Weather ${sourceStatusWord(weather)} · Air ${sourceStatusWord(air)}`;
}

function locationLabel() {
  return state.selectedLocation?.name || activeEnvironment().location?.name || defaultLocation.name;
}

function cueLabel() {
  const rawCue = state.routineMeta?.grounding?.cue?.score;
  const cue = rawCue === null || rawCue === undefined ? NaN : Number(rawCue);
  if (Number.isFinite(cue)) return `CUE ${cue.toFixed(2)}`;
  const sufficiency = Number(state.routineMeta?.grounding?.sufficiencyScore);
  return Number.isFinite(sufficiency) ? `Evidence sufficiency ${sufficiency.toFixed(2)}` : "Evidence gate not run";
}

function cueSummary(grounding) {
  const cue = grounding?.cue;
  if (!cue || cue.score === null || cue.score === undefined) return { value: "Not run", foot: "Runs when the model writes text" };
  const status = String(cue.status || "").replaceAll("_", " ");
  return { value: safelyNumber(cue.score), foot: `${status} · threshold ${safelyNumber(cue.threshold)} · ${cue.method || "method n/a"}` };
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
      id: typeof step.id === "string" ? step.id : "",
      title: String(step.title || step.name || step.category || `Research category ${index + 1}`),
      note: String(step.note || step.rationale || step.reason || step.description || "Research-only category"),
      sourceIds: sourceIds.map((value) => String(value)).slice(0, 3),
      ruleIds: Array.isArray(step.ruleIds) ? step.ruleIds.map(String) : [],
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
    const gpt = phase && step?.id ? state.routineContext?.steps?.[`${phase}:${step.id}`] : null;
    // C5: without GPT text, show the rule-based reason for this step, never the generic category note.
    const ruleText = stepRuleReason(phase, step?.id) || step.note;
    const note = gpt?.text
      ? `<small class="routine-step-gpt">${escapeHtml(gpt.text)}</small>${state.expertView ? `<small class="routine-step-rule"><b>Rule-based version:</b> ${escapeHtml(ruleText)}${gpt.cue && Number.isFinite(Number(gpt.cue.score)) ? ` · GPT text CUE ${Number(gpt.cue.score).toFixed(2)}${gpt.cue.attempt === 2 ? " after one rewrite" : ""}` : ""}</small>` : ""}`
      : `<small>${escapeHtml(ruleText)}${escapeHtml(sourceText)}${phase && state.routineContext?.status === "loading" ? " · writing context…" : ""}</small>`;
    return `<li><span class="routine-step-title">${escapeHtml(step.title)}</span>${note}${recommendation}${!dark ? "" : `<span class="synth-step-number">${index + 1}</span>`}</li>`;
  }).join("")}</ol>`;
}

function stepRuleReason(phase, categoryId) {
  const steps = state.routineMeta?.explanation?.steps;
  if (!Array.isArray(steps) || !phase || !categoryId) return "";
  return steps.find((item) => item.phase === phase && item.categoryId === categoryId)?.text || "";
}

function degradedBanner(meta) {
  const reasons = meta?.degraded?.status === "degraded" ? meta.degraded.reasons || [] : [];
  if (!reasons.length) return "";
  return `<div class="degraded-banner" role="status">${icon("info", 14)}<div><strong>${state.expertView ? "Reduced mode for this run" : "Some parts are simpler today"}</strong><ul>${reasons.map((reason) => `<li>${escapeHtml(reason.text)}</li>`).join("")}</ul></div></div>`;
}

function ingredientAttributionMarkup(attr) {
  if (!attr || !Array.isArray(attr.features)) return "";
  const rows = attr.features.map((f) => {
    const value = Number(f.shapValue) || 0;
    return `<span class="ingredient-attr-row"><i>${escapeHtml(f.label)}</i><b class="ingredient-attr-bar"><b style="width:${Math.max(0, Math.min(100, Number(f.influencePercent) || 0))}%"></b></b><em>${value >= 0 ? "+" : "−"}${escapeHtml(Math.abs(value).toFixed(3))}</em></span>`;
  }).join("");
  const contrast = attr.contrast
    ? `<span class="ingredient-attr-contrast">vs ${escapeHtml(attr.contrast.runnerUp?.displayName || "runner-up")}: margin ${escapeHtml(Number(attr.contrast.margin || 0).toFixed(3))}${attr.contrast.decisive ? ` · decided by ${escapeHtml(attr.contrast.decisive.label)}` : ""}</span>`
    : `<span class="ingredient-attr-contrast">Only candidate in the retrieved pool</span>`;
  return `<div class="ingredient-attr"><span class="ingredient-attr-head">${icon("activity", 11)} Why chosen · rank ${escapeHtml(String(attr.poolRank || "—"))} of ${escapeHtml(String(attr.poolSize || "—"))} · score ${escapeHtml(Number(attr.selectionScore || 0).toFixed(3))}</span>${rows}${contrast}</div>`;
}

function atlasReferenceLine(ingredient) {
  const parts = [];
  const safety = ingredient?.safetyEvidence;
  if (safety) {
    const kind = /no_dedicated/.test(safety.verificationStatus || "") ? "no dedicated assessment" : `${safety.sourceFamily} conclusion`;
    parts.push(`Safety card: ${kind}${safety.verifiedAt ? ` (checked ${safety.verifiedAt})` : ""}`);
  }
  const ewg = ingredient?.ewgReference;
  if (ewg) parts.push(ewg.status === "listed" ? `EWG ${ewg.hazardScore}/10 · ${ewg.dataAvailability} data` : "EWG: not listed");
  if (ingredient?.routineSelectionAllowed === false) parts.push("Not selectable in routines");
  return parts.length ? `<p class="atlas-reference-line">${escapeHtml(parts.join(" · "))}</p>` : "";
}

function approvedIngredientCandidatePanel(meta = state.routineMeta) {
  const selection = meta?.ingredientCandidates;
  const entries = Array.isArray(selection?.entries) ? selection.entries : [];
  const removed = Array.isArray(selection?.removedBySafety) ? selection.removedBySafety : [];
  if ((selection?.status !== "available" || !entries.length) && !removed.length) return "";
  const contextStatus = state.routineContext?.status;
  const gptStatusMarkup = contextStatus === "error" || contextStatus === "unavailable"
    ? `<p class="ingredient-gpt-status">${icon("info", 13)} GPT explanations are not shown: ${escapeHtml(state.routineContext.error || "unavailable")} The score-based explanation is shown instead.</p>`
    : contextStatus === "available" && state.routineContext.withheld?.some((item) => item.kind === "ingredient")
      ? `<p class="ingredient-gpt-status">${icon("info", 13)} Some GPT explanations were withheld because their CUE stayed below ${escapeHtml(String(state.routineMeta?.grounding?.cue?.threshold ?? 0.8))}; the score-based explanation is shown for those.</p>`
      : "";
  const removedMarkup = removed.length
    ? `<p class="ingredient-removed-note">${icon("shield", 13)} Final safety rescan removed ${escapeHtml(removed.map((item) => item.displayName).join(", "))}; ${removed.length === 1 ? "its step stays" : "their steps stay"} as a category.</p>`
    : "";
  const cards = entries.map((entry) => {
    const source = Array.isArray(entry.sourceRecords) ? entry.sourceRecords[0] : null;
    const url = safeEvidenceUrl(source?.sourceUrl);
    const trace = entry.selectionTrace || {};
    const attr = entry.attribution || {};
    const checked = Array.isArray(trace.compatibility?.checkedAgainst) && trace.compatibility.checkedAgainst.length ? trace.compatibility.checkedAgainst.map((item) => item.displayName).join(", ") : "No earlier named recommendation";
    const gpt = state.routineContext?.ingredients?.[`${entry.phase}:${entry.categoryId}`] || null;
    const explanation = entry.explanation || {};
    const whyStep = gpt?.whyThisStep || explanation.whyThisStep || "";
    const rationaleText = gpt?.whyThisIngredient || explanation.whyThisIngredient || entry.rationale || "Matched from the approved knowledge base.";
    const expertBoth = state.expertView && gpt && explanation.whyThisIngredient
      ? `<div class="ingredient-rule-version"><b>Rule-based version (always computed):</b> ${escapeHtml(explanation.whyThisStep || "")} ${escapeHtml(explanation.whyThisIngredient)}${gpt.cue && Number.isFinite(Number(gpt.cue.score)) ? `<small>GPT version CUE ${Number(gpt.cue.score).toFixed(2)} (threshold ${escapeHtml(String(state.routineMeta?.grounding?.cue?.threshold ?? 0.8))})${gpt.cue.attempt === 2 ? ", passed after one rewrite" : ""}</small>` : ""}</div>`
      : "";
    const llm = gpt ? { text: gpt.whyThisIngredient } : null;
    const rationaleTag = gpt
      ? gptTag(gpt)
      : (state.routineContext?.status === "loading" ? '<span class="ingredient-rationale-tag is-loading">GPT is writing the explanation…</span>' : "");
    const pickChip = entry.selectedBy === "llm_from_rag_pool"
      ? `<span class="ingredient-pick-chip">${icon("sparkles", 10)} LLM · from retrieved pool${attr.agreesWithSurrogate === false ? " · differs from top score" : ""}</span>`
      : '<span class="ingredient-pick-chip is-rule">top-scored</span>';
    const ranking = Array.isArray(attr.ranking) ? attr.ranking.map((item) => `${item.rank}. ${item.displayName} (${Number(item.score).toFixed(3)})`).join(" · ") : "—";
    const retrieval = trace.retrieval ? `${trace.retrieval.mode || "retrieval"} · pool ${trace.poolSource || "—"}` : (trace.poolSource || "not reported");
    return `<article><div><strong>${escapeHtml(entry.displayName || "Approved ingredient")}</strong><small>${escapeHtml(`${entry.phase === "am" ? "Morning" : "Evening"} · ${entry.categoryTitle || entry.categoryId || "routine category"}`)} ${pickChip}</small></div>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Evidence ${icon("arrow", 12)}</a>` : ""}${whyStep ? `<p class="ingredient-why-step"><b>Why this step:</b> ${escapeHtml(whyStep)}</p>` : ""}<p class="ingredient-rationale ${llm && llm.text ? "is-grounded" : ""}"><b>Why this ingredient:</b> ${escapeHtml(rationaleText)}</p>${rationaleTag}${expertBoth}${ingredientAttributionMarkup(attr)}<details class="selection-trace"><summary>Selection trace</summary><span>Category: ${escapeHtml(trace.category?.title || entry.categoryId || "—")}</span><span>Retrieval: ${escapeHtml(retrieval)}</span><span>Pool ranking: ${escapeHtml(ranking)}</span><span>Language model: ${escapeHtml(String(trace.llmPickStatus || "not requested").replaceAll("_", " "))}</span><span>Record: ${escapeHtml(trace.selectedRecord?.ingredientId || entry.ingredientId || "—")} · v${escapeHtml(String(trace.selectedRecord?.version || "—"))}</span><span>Compatibility: ${escapeHtml(trace.compatibility?.status || "not reported")} · checked against ${escapeHtml(checked)}</span>${explanation.whyThisIngredient ? `<span>Score explanation: ${escapeHtml(explanation.whyThisIngredient)}</span>` : ""}</details></article>`;
  }).join("");
  return `<section class="research-context-card ingredient-candidate-panel"><div class="ingredient-card-top"><div><p class="ingredient-eyebrow">${icon("shield", 14)} Approved ingredient recommendations</p><h3>Named AM/PM recommendations</h3></div><span class="ingredient-output-mode">${escapeHtml(selection.registryVersion || "live database")}</span></div><p class="ingredient-card-summary">Each step's candidates are retrieved from the approved knowledge base, ranked by a transparent score, and rescanned by the final safety pass.</p>${gptStatusMarkup}${removedMarkup}<div class="research-context-list">${cards}</div></section>`;
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
    share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
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
  const items = state.expertView
    ? [["dashboard", "Overview", "grid"], ["monitor", "Environment", "activity"], ["simulator", "Routine", "flask"], ["knowledge", "Atlas", "file"]]
    : [["simulator", "Today", "sparkles"], ["monitor", "Weather", "sun"], ["knowledge", "Ingredients", "file"]];
  return `<nav class="mobile-nav" style="--nav-items: ${items.length}" aria-label="Primary navigation">${items.map(([id, label, iconName]) => mobileNavItem(id, label, iconName)).join("")}</nav>`;
}

function shell(view) {
  const ingredientCount = Number(state.knowledgeExplorer?.overview?.ingredientCount) || incorporatedIngredientRecords().length;
  const currentMeta = VIEW_META[state.activeView] || VIEW_META.dashboard;
  const CONSUMER_TITLES = { simulator: "Your routine", monitor: "Weather", knowledge: "Ingredients" };
  const title = !state.expertView && CONSUMER_TITLES[state.activeView] ? CONSUMER_TITLES[state.activeView] : currentMeta.title;
  const modeClass = activeEnvironment().mode === "live" ? "" : ["degraded", "unavailable"].includes(activeEnvironment().mode) ? "is-warning" : "is-neutral";
  const cueClass = state.routineMeta?.status === "cleared" ? "" : "is-warning";
  const locationUpdating = isLocationUpdating();
  return `<div class="app-shell ${state.expertView ? "is-expert" : "is-consumer"}">
    <a class="skip-link" href="#main-content">Skip to content</a>
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark"><img src="/assets/dermasynth-mark.svg" alt="" /></span><span class="brand-copy"><strong>DermaSynth</strong><small>Weather-aware skincare</small></span></div>
      <div class="sidebar-navigation">
        <div class="sidebar-navigation-group">
          <p class="side-section-label">Core workflow</p>
          <nav class="nav-list" aria-label="Core research workflow">
            ${navItem("dashboard", "Overview", "At a glance", "grid")}
            ${navItem("monitor", "Environment", "Live conditions", "activity")}
            ${navItem("simulator", "Routine", "Build routine", "flask")}
            ${navItem("knowledge", "Ingredient Atlas", `${ingredientCount} ingredients`, "file")}
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
        <div class="page-title"><img class="topbar-mark" src="/assets/dermasynth-mark.svg" alt="" width="30" height="30" /><div class="page-title-text"><h1 id="page-title" tabindex="-1">${title}</h1><p class="location-line">${icon("pin", 15)}<span>${escapeHtml(locationLabel())}</span><span>· ${escapeHtml(environmentModeLabel())}</span></p></div></div>
        <div class="topbar-actions">
          <button class="expert-toggle-top" type="button" data-action="toggle-expert" aria-pressed="${state.expertView}">${icon("layers", 14)} <span>Expert view</span></button>
          ${state.expertView ? `<button class="presentation-button" type="button" data-action="presentation-start">${icon("sparkles", 14)} Defence walkthrough</button>
          <span class="pill ${cueClass}">${icon("sparkles", 14)} ${escapeHtml(cueLabel())}</span>
          <span class="pill ${modeClass}">${escapeHtml(environmentSourceLabel())}</span>` : ""}
          <button class="refresh-button" type="button" data-action="refresh" aria-label="Refresh environment readings" ${locationUpdating ? "disabled" : ""}>${icon("refresh", 16)} <span>Refresh environment</span></button>
        </div>
      </header>
      <div class="scope-banner" role="note">${icon("shield", 14)}<span><strong>Research prototype, not medical advice.</strong> Patch-test new products and stop if your skin reacts.</span></div>
      <div class="content"><div class="view" style="view-transition-name: page-view">${view}</div></div>
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
    ["Evidence gate", grounding ? (grounding.passed ? "Passed" : "Not passed") : "—", grounding ? `Sufficiency ${safelyNumber(grounding.sufficiencyScore)} · ${grounding.criteria?.length || 0} criteria` : "Not run"],
    ["CUE", grounding ? cueSummary(grounding).value : "—", grounding ? cueSummary(grounding).foot : "Not run"],
    ["Safety", routineStatusLabel(), meta?.safety?.postSelection?.removed?.length ? `${meta.safety.postSelection.removed.length} removed by final rescan` : "Deterministic passes + final rescan"],
    ["Environment", activeEnvironment().mode || "demo", environmentSourceLabel()],
    ["Retrieval", meta?.grounding?.evidenceCount ?? "—", meta?.grounding?.scoreType || "Awaiting index"],
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
      <div class="ingredient-system-grid" tabindex="0" role="region" aria-label="Ingredients in the knowledge base (scrollable list)">${ingredients.map((ingredient) => `<article class="ingredient-system-chip"><strong>${escapeHtml(ingredient.name)}</strong><small>${escapeHtml(ingredient.inci)}</small></article>`).join("")}</div>
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
  const cue = Number(grounding?.sufficiencyScore);
  const cueText = Number.isFinite(cue) ? `Evidence sufficiency ${cue.toFixed(2)}` : "Evidence gate not run";
  const detail = String(grounding?.scoreType || "").includes("evidence_sufficiency")
    ? "An evidence-coverage check before the model is called, not a diagnosis score."
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
    cue: ["evidence_sufficiency_gate", "cue"],
    safety: ["first_safety", "second_safety", "post_selection_safety"],
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
  if (step.id === "cue" && meta.grounding) return { kind: meta.grounding.passed ? "passed" : "reported", label: `Evidence sufficiency ${safelyNumber(meta.grounding.sufficiencyScore)}`, detail: `CUE ${cueSummary(meta.grounding).value}` };
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
    ["Evidence gate", Number.isFinite(Number(grounding.sufficiencyScore)) ? `${grounding.passed ? "Passed" : "Not passed"} · sufficiency ${safelyNumber(grounding.sufficiencyScore)}` : "Not reported"],
    ["CUE", cueSummary(grounding).value],
    ["Safety flags", safetyFlags.length ? safetyFlags.length : "None reported"],
    ["Run time", generatedAt],
  ];
  return `<section class="panel run-report"><div class="panel-header"><div><h3 class="panel-title">${icon("file", 17)} Explainable run report</h3></div><div class="run-report-actions"><button class="ghost-button" type="button" data-action="print-research-report" ${meta ? "" : "disabled"}>${icon("file", 14)} Print / Save PDF</button><button class="ghost-button" type="button" data-action="export-current-run" ${meta?.runReport ? "" : "disabled"}>${icon("download", 14)} Export JSON</button></div></div><dl class="run-report-grid">${reportRows.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>${safetyFlags.length ? `<p class="report-flags"><strong>Reported safety flags:</strong> ${escapeHtml(safetyFlags.join(" · "))}</p>` : ""}</section>`;
}

function historyPanel() {
  const runs = state.runHistory.slice(0, 5);
  return `<section class="panel history-panel"><div class="panel-header"><div><h2 class="panel-title">${icon("layers", 17)} Local research run history</h2><p class="panel-note">De-identified summary only · newest first</p></div><div class="history-actions"><button class="ghost-button" type="button" data-action="export-run-history" ${runs.length ? "" : "disabled"}>${icon("download", 14)} Export</button><button class="text-button" type="button" data-action="clear-run-history" ${runs.length ? "" : "disabled"}>Clear</button></div></div>${runs.length ? `<div class="history-list">${runs.map((run) => `<article class="history-item"><div><strong>${escapeHtml(run.concern || "Research run")}</strong><small>${escapeHtml(run.timestamp || "Time unavailable")} · ${escapeHtml(run.profile || "Profile unavailable")}</small></div><div><span class="table-status ${run.status === "Cleared" ? "" : "review"}">${escapeHtml(run.status || "Reported")}</span><small>CUE / evidence score ${escapeHtml(run.cue || "—")} · ${escapeHtml(run.evidenceCount ?? "—")} notes</small></div></article>`).join("")}</div>` : `<div class="evidence-empty"><strong>No local run summaries yet.</strong><span>Completed requests can be exported as a de-identified research record from this browser.</span></div>`}<p class="history-privacy">Stored locally: time, profile, concern, city/area context, status, CUE (or evidence-sufficiency score when no model text was written) and evidence count. Never stored: free-text symptoms, source excerpts, or identifiers.</p></section>`;
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
    : state.locationSearchNotice || `Weather for ${locationLabel()}.`;

  return `<div class="field location-picker ${compact ? "is-compact" : ""}"><label for="location-search">${escapeHtml(label)}</label><div class="location-input-row"><input id="location-search" type="search" value="${escapeHtml(state.locationQuery)}" placeholder="Search city or area" autocomplete="off" data-action="location-query" role="combobox" aria-autocomplete="list" aria-controls="location-results" aria-expanded="${expanded}" aria-busy="${busy}" ${busy ? "disabled" : ""} /><button class="location-search-button" type="button" data-action="location-search" ${busy ? "disabled" : ""}>${icon("pin", 14)} Search</button></div>${expanded ? `<div class="location-results" id="location-results" role="listbox" aria-label="Matching locations">${results.map((location, index) => `<button type="button" class="location-option" role="option" aria-selected="false" data-action="select-location" data-location-index="${index}" ${busy ? "disabled" : ""}><span>${escapeHtml(locationResultLabel(location))}</span><small>${Number(location.lat).toFixed(4)}, ${Number(location.lon).toFixed(4)}</small></button>`).join("")}</div>` : ""}<div class="location-status" role="status" aria-live="polite"><span>${escapeHtml(notice)}</span><button type="button" data-action="use-my-location" ${busy ? "disabled" : ""}>${icon("pin", 12)} Use my location</button></div>${compact ? "" : `<p class="location-privacy">Your location is only used to look up the weather. It is rounded to about 1 km and remembered in this browser.</p>`}</div>`;
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
  const weightStatus = String(explanation?.model?.weightStatus || "");
  const label = explanation?.method === "exact_shapley_values_for_additive_environmental_surrogate"
    ? `Exact Shapley values · additive surrogate ${/expert/.test(weightStatus) ? "fitted to expert-labelled scenarios" : /fitted/.test(weightStatus) ? "fitted to a labelled dataset" : "with configured weights"}`
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

function weatherView() {
  const wo = state.weatherOutlook;
  const tomorrow = wo?.data?.tomorrow;
  const hasRoutine = Boolean(state.routineMeta?.status === "cleared" && state.generatedRoutine);
  const tomorrowHtml = hasRoutine && state.outlook?.data?.tomorrow
    ? tomorrowCard()
    : tomorrow ? `<section class="tomorrow-card" aria-labelledby="w-tomorrow"><h3 id="w-tomorrow">${icon("activity", 15)} Tomorrow</h3><p class="tomorrow-summary">${escapeHtml(tomorrow.summary)}</p><p class="tomorrow-source">${escapeHtml(wo.data?.source || "")}</p></section>`
      : wo?.status === "loading" ? `<section class="tomorrow-card is-loading" aria-live="polite"><h3>${icon("activity", 15)} Tomorrow</h3><p class="shimmer-text">Checking tomorrow's forecast…</p></section>` : "";
  const cta = `<section class="weather-cta"><p>${hasRoutine ? "Your routine already uses these readings." : "DermaSynth turns today's weather into a morning and evening routine for your skin."}</p><button type="button" class="primary-button" data-action="navigate" data-view="simulator">${icon("sparkles", 15)} ${hasRoutine ? "See my routine" : "Build today's routine"}</button></section>`;
  return shell(`<div class="view-heading"><div><h2>Today's weather for your skin</h2><p>UV, humidity, haze and temperature where you are, and what tomorrow looks like.</p></div><button type="button" class="ghost-button" data-action="refresh" ${isLocationUpdating() ? "disabled" : ""}>${icon("refresh", 15)} Refresh</button></div><section class="panel monitor-location-panel" id="monitor-location">${locationPicker({ label: "Location", compact: true })}</section><div class="weather-stack">${conditionsSummaryCard(null, wo)}${tomorrowHtml}${cta}</div>`);
}

async function refreshWeatherOutlook() {
  const key = `${locationPayload().lat},${locationPayload().lon}`;
  if (state.weatherOutlook?.key === key && ["loading", "available"].includes(state.weatherOutlook.status)) return;
  state.weatherOutlook = { status: "loading", key };
  const todaySteps = currentStepKeys();
  try {
    const response = await fetch("/api/outlook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: state.profile, concern: state.concern, location: locationPayload(), todaySteps, exposureContext: state.exposureContext || "mixed" }) });
    const data = await response.json().catch(() => ({}));
    if (state.weatherOutlook?.key !== key) return;
    state.weatherOutlook = data?.available ? { status: "available", key, data } : { status: "idle", key };
  } catch {
    if (state.weatherOutlook?.key === key) state.weatherOutlook = { status: "idle", key };
  }
  if (state.activeView === "monitor" && !state.expertView) scheduleRender({ animated: true });
}

function monitorView() {
  if (!state.expertView) return weatherView();
  const env = activeEnvironment();
  const uvi = environmentValue(env.readings?.uvi);
  const weatherStatus = env.sources?.weather?.status || "demo";
  const notice = env.notices?.[0] || "Refresh readings to check the current source state.";
  const locationLabelText = state.presentation.active && state.presentation.step === 0 ? "Choose or confirm weather location" : "Weather location";
  return shell(`<div class="view-heading"><div><h2>Live environmental context.</h2><p>Weather and air-quality inputs update the routine view.</p></div><button type="button" class="primary-button" data-action="refresh" ${isLocationUpdating() ? "disabled" : ""}>${icon("refresh", 15)} Refresh</button></div><section class="panel monitor-location-panel" id="monitor-location">${locationPicker({ label: locationLabelText, compact: true })}</section><div class="module-hero" id="monitor-readings"><section class="panel monitor-card"><div class="panel-header"><h3 class="panel-title">${icon("sun", 17)} UV index</h3><p class="panel-note">${escapeHtml(environmentModeLabel())}</p></div><div class="monitor-readout"><strong>${escapeHtml(uvi)}</strong><span>${uvi === "—" ? "Unavailable" : "Current reading"}<br />${escapeHtml(state.lastUpdated)}</span></div><div class="monitor-chip-row"><span class="monitor-chip">${escapeHtml(locationLabel())}</span><span class="monitor-chip">OpenWeather ${escapeHtml(weatherStatus)}</span></div></section><section class="panel guidance-panel"><div class="panel-header"><h3 class="panel-title">${icon("sparkles", 17)} Active signals</h3><p class="panel-note">Routine inputs</p></div><div class="guidance-list"><div class="guidance"><span class="guidance-icon">${icon("sun", 16)}</span><div><strong>UV</strong><p>Daytime protection category.</p></div></div><div class="guidance"><span class="guidance-icon">${icon("droplet", 16)}</span><div><strong>Humidity</strong><p>Finish and hydration context.</p></div></div><div class="guidance"><span class="guidance-icon">${icon("wind", 16)}</span><div><strong>PM2.5</strong><p>Antioxidant context when available.</p></div></div></div></section></div>${forecastRoutinePanel()}<div class="dashboard-grid">${environmentPanel()}${insightPanel()}</div>`);
}

function concernPicker() {
  const disabled = state.runStatus === "running";
  return `<div class="field concern-field"><label id="concern-label">Main skin concern</label><div class="concern-grid" role="group" aria-labelledby="concern-label">${concernOptions.map((option) => `<button type="button" class="concern-choice ${state.concern === option.id ? "is-selected" : ""}" data-action="concern-choice" data-concern="${option.id}" aria-pressed="${state.concern === option.id}" ${disabled ? "disabled" : ""}><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.description)}</small></button>`).join("")}</div></div>`;
}

function profilePreferenceFields() {
  const disabled = state.runStatus === "running";
  const finishPreference = ["matte", "dewy", "no-preference"].includes(state.finishPreference) ? state.finishPreference : "";
  const reactivityLevel = ["low", "moderate", "high"].includes(state.reactivityLevel) ? state.reactivityLevel : "";
  return `<div class="profile-secondary-fields" aria-label="Optional self-report context">
    <div class="field"><label for="finish-preference">Finish preference <span class="field-optional">(optional)</span></label><select id="finish-preference" data-action="finish-preference" ${disabled ? "disabled" : ""}><option value="" ${finishPreference ? "" : "selected"}>Not specified</option><option value="matte" ${finishPreference === "matte" ? "selected" : ""}>Matte</option><option value="dewy" ${finishPreference === "dewy" ? "selected" : ""}>Dewy</option><option value="no-preference" ${finishPreference === "no-preference" ? "selected" : ""}>No preference</option></select><p class="field-help">How you like your skin to look after moisturising.</p></div>
    <div class="field"><label for="reactivity-level">Do new products often sting or redden your skin? <span class="field-optional">(optional)</span></label><select id="reactivity-level" data-action="reactivity-level" ${disabled ? "disabled" : ""}><option value="" ${reactivityLevel ? "" : "selected"}>Not specified</option><option value="low" ${reactivityLevel === "low" ? "selected" : ""}>Rarely</option><option value="moderate" ${reactivityLevel === "moderate" ? "selected" : ""}>Sometimes</option><option value="high" ${reactivityLevel === "high" ? "selected" : ""}>Often</option></select><p class="field-help">If they do, the routine stays extra gentle.</p></div>
    <div class="field"><label for="exposure-context">Your day today</label><select id="exposure-context" data-action="exposure-context" ${disabled ? "disabled" : ""}><option value="indoors" ${state.exposureContext === "indoors" ? "selected" : ""}>Mostly indoors</option><option value="mixed" ${state.exposureContext === "mixed" ? "selected" : ""}>Mixed</option><option value="outdoors" ${state.exposureContext === "outdoors" ? "selected" : ""}>Mostly outdoors</option></select><p class="field-help">More time outdoors means sun protection is added at lower UV.</p></div></div>`;
}

function conditionsCard(meta) {
  const options = meta?.conditionOptions || {};
  const labels = { sky: "Sun right now", air: "How the air feels", haze: "Air quality", temperature: "Temperature" };
  const chosen = state.reportedConditions || {};
  const groups = Object.entries(labels).map(([key, label]) => `<fieldset class="conditions-group"><legend>${escapeHtml(label)}</legend><div class="conditions-options">${(options[key] || []).map((option) => `<button type="button" class="condition-chip ${chosen[key] === option.id ? "is-selected" : ""}" data-action="report-condition" data-key="${escapeHtml(key)}" data-value="${escapeHtml(option.id)}" aria-pressed="${chosen[key] === option.id}">${escapeHtml(option.label)}</button>`).join("")}</div></fieldset>`).join("");
  const complete = Object.keys(labels).every((key) => chosen[key]);
  return `<section class="synthesized-routine-card is-review conditions-card" aria-live="polite"><div class="synth-card-top"><div><p class="routine-eyebrow">${icon("info", 14)} Live readings unavailable</p><h3>Tell us today's conditions</h3><p>We couldn't get live weather and air-quality readings for ${escapeHtml(locationLabel())}. Rather than guess, the routine will use what you choose below.</p></div></div>${groups}<div class="form-actions"><button class="primary-button" type="button" data-action="submit-conditions" ${complete ? "" : "disabled"}>${icon("sparkles", 15)} Build routine with these conditions</button></div></section>`;
}

// ---- G1/G2/G3: consumer view ---------------------------------------------
const STEP_PLAIN = Object.freeze({
  "low-irritation-cleansing": { name: "Gentle cleanse", what: "A mild, non-stripping cleanser." },
  "comfort-hydration": { name: "Hydrating layer", what: "A hydrating serum or essence that draws in water." },
  "light-hydration": { name: "Light hydrating layer", what: "A light, water-based hydrating layer." },
  "supportive-hydration": { name: "Hydrating layer", what: "A hydrating serum or essence." },
  "barrier-support-moisturising": { name: "Rich moisturiser", what: "A richer moisturiser that helps skin hold on to water." },
  "lightweight-moisturising": { name: "Light moisturiser", what: "A light gel or lotion moisturiser." },
  "supportive-moisturising": { name: "Moisturiser", what: "An everyday moisturiser." },
  "daytime-photoprotection": { name: "Sun protection", what: "Sunscreen as the last morning step." },
  "antioxidant-context": { name: "Antioxidant", what: "An antioxidant serum for high-pollution days." },
  "texture-renewal": { name: "Gentle exfoliant (evenings only)", what: "A mild leave-on exfoliant, evenings only." },
  "overnight-comfort": { name: "Soothing night step", what: "A calming last step before bed." },
});

function plainStep(step) {
  return STEP_PLAIN[step?.id] || { name: step?.title || "Routine step", what: step?.note || "" };
}

// Everyday bands: WHO UV index categories; US EPA 24-hour PM2.5 breakpoints.
function uvBand(uvi) {
  const v = Number(uvi);
  if (!Number.isFinite(v)) return null;
  if (v < 3) return { label: "low", tone: "calm" };
  if (v < 6) return { label: "moderate", tone: "mild" };
  if (v < 8) return { label: "high", tone: "warn" };
  if (v < 11) return { label: "very high", tone: "alert" };
  return { label: "extreme", tone: "alert" };
}
function humidityBand(h) {
  const v = Number(h);
  if (!Number.isFinite(v)) return null;
  if (v <= 50) return { label: "dry air", tone: "mild" };
  if (v >= 75) return { label: "humid", tone: "mild" };
  return { label: "comfortable", tone: "calm" };
}
function hazeBand(pm) {
  const v = Number(pm);
  if (!Number.isFinite(v)) return null;
  if (v <= 12) return { label: "clean air", tone: "calm" };
  if (v <= 35.4) return { label: "moderate", tone: "mild" };
  if (v <= 55.4) return { label: "hazy", tone: "warn" };
  return { label: "very hazy", tone: "alert" };
}
function temperatureBand(c) {
  const v = Number(c);
  if (!Number.isFinite(v)) return null;
  if (v <= 15) return { label: "cold", tone: "mild" };
  if (v >= 30) return { label: "hot", tone: "warn" };
  return { label: "mild", tone: "calm" };
}

function conditionsSummaryCard(meta, outlook = state.outlook) {
  const environment = meta?.environment || activeEnvironment();
  const r = environment?.readings || {};
  const fmt = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : "—");
  const items = [
    ["UV now", fmt(r.uvi, 1), "", Number(r.uviMaxToday) > Number(r.uvi) ? { ...uvBand(r.uviMaxToday), label: `peaks at ${Math.round(Number(r.uviMaxToday))} today` } : uvBand(r.uvi)],
    ["Humidity", fmt(r.humidity), "%", humidityBand(r.humidity)],
    ["Haze (PM2.5)", fmt(r.pm25), "µg/m³", hazeBand(r.pm25)],
    ["Temperature", fmt(r.temperature), "°C", temperatureBand(r.temperature)],
  ];
  const source = environment?.mode === "live" ? "Live readings" : environment?.mode === "user_reported" ? "Conditions you reported" : environment?.mode === "degraded" ? "Some live readings missing" : "Sample weather (not live)";
  const outlookToday = outlook?.data?.today;
  const timingLine = outlookToday?.text ? `<p class="today-timing">${icon("sun", 13)} ${escapeHtml(outlookToday.text)}${outlookToday.sunTip ? ` ${escapeHtml(outlookToday.sunTip)}` : ""}</p>` : "";
  return `<section class="today-card" style="view-transition-name: today-card" aria-labelledby="today-title"><div class="today-head"><h3 id="today-title">${icon("pin", 15)} ${locationLabel() === "Your location" ? "Today near you" : `Today in ${escapeHtml(locationLabel())}`}</h3><span>${escapeHtml(source)}</span></div><dl class="today-grid">${items.map(([label, value, unit, band]) => `<div class="today-item ${band ? `is-${band.tone}` : ""}"><dt>${escapeHtml(label)}</dt><dd><strong>${escapeHtml(value)}</strong>${unit && value !== "—" ? `<small>${escapeHtml(unit)}</small>` : ""}${band ? `<span>${escapeHtml(band.label)}</span>` : ""}</dd></div>`).join("")}</dl>${uvTimeline(outlook)}${timingLine}</section>`;
}

// ---- Timing and tomorrow (forecast, /api/outlook) ----------------------------
function sunscreenTiming() {
  const w = state.outlook?.data?.today?.window;
  if (!w || w.allDayBelow || w.passed || !w.start) return "";
  const hour = (time) => { const h = Number(String(time).slice(11, 13)); return h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`; };
  return `Matters most from ${hour(w.start)} to ${hour(w.end)} today. If you're outside for long, top it up during the day.`;
}

function tomorrowCard() {
  const outlook = state.outlook;
  if (!outlook || outlook.status === "idle") return "";
  if (outlook.status === "loading") return `<section class="tomorrow-card is-loading" style="view-transition-name: tomorrow-card" aria-live="polite"><h3>${icon("activity", 15)} Tomorrow</h3><p class="shimmer-text">Checking tomorrow's forecast…</p></section>`;
  const tomorrow = outlook.data?.tomorrow;
  if (!tomorrow) return "";
  const changes = (tomorrow.changes || []).filter((c) => c.change !== "kept");
  const kept = (tomorrow.changes || []).filter((c) => c.change === "kept");
  return `<section class="tomorrow-card" style="view-transition-name: tomorrow-card" aria-labelledby="tomorrow-title"><h3 id="tomorrow-title">${icon("activity", 15)} Tomorrow</h3><p class="tomorrow-summary">${escapeHtml(tomorrow.summary)}</p>${tomorrow.sameAsToday ? `<p class="tomorrow-same">${icon("check", 14)} Same routine as today.</p>` : `<ul class="tomorrow-changes">${changes.map((c) => `<li class="is-${escapeHtml(c.change)}">${escapeHtml(c.text)}</li>`).join("")}</ul>`}${kept.length ? `<p class="tomorrow-kept">${kept.map((c) => escapeHtml(c.text)).join(" ")}</p>` : ""}<p class="tomorrow-source">${escapeHtml(outlook.data?.source || "")}</p></section>`;
}

async function refreshOutlook() {
  const meta = state.routineMeta;
  const routine = state.generatedRoutine;
  if (!meta || meta.status !== "cleared" || !routine) { state.outlook = { status: "idle" }; return; }
  const runId = meta.routineContext?.runId || meta.requestId || "";
  state.outlook = { status: "loading", runId };
  const todaySteps = [...(routine.am || []).map((s) => `am:${s.id}`), ...(routine.pm || []).map((s) => `pm:${s.id}`)];
  try {
    const body = { profile: state.profile, concern: state.concern, location: locationPayload(), todaySteps, exposureContext: state.exposureContext || "mixed" };
    if (state.finishPreference) body.finishPreference = state.finishPreference;
    if (state.reactivityLevel) body.reactivityLevel = state.reactivityLevel;
    const response = await fetch("/api/outlook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (state.outlook.runId !== runId) return;
    state.outlook = data?.available ? { status: "available", runId, data } : { status: "idle", runId };
  } catch {
    if (state.outlook.runId !== runId) return;
    state.outlook = { status: "idle", runId };
  }
  scheduleRender({ animated: true });
}

// G6: technical failures become one plain sentence; the detail stays in Expert view.
function plainMessage(text, fallback = "This part isn't available right now.") {
  const value = String(text || "");
  if (!value) return fallback;
  if (/\.env|LIVE_SERVICES|OPENAI|api\.openai|provider|not_configured|quota|model|HTTP|timeout|timed out|budget|rate limit/i.test(value)) return "Friendlier explanations aren't available right now, so the standard reasons are shown.";
  return value;
}

function consumerWhy(entry) {
  const gpt = state.routineContext?.ingredients?.[`${entry.phase}:${entry.categoryId}`] || null;
  const rule = entry.explanation?.consumer || {};
  const useGpt = Boolean(gpt?.whatItIs && gpt?.whyToday);
  const fields = useGpt ? { whatItIs: gpt.whatItIs, whyToday: gpt.whyToday } : { whatItIs: rule.whatItIs, whyToday: rule.whyToday };
  const labels = rule.labels || { names: [entry.displayName], note: null };
  const references = Array.isArray(rule.references) ? rule.references : [];
  const rows = [
    ["What it is", escapeHtml(fields.whatItIs || "")],
    ["Why today", escapeHtml(fields.whyToday || "")],
    ["On labels", escapeHtml(`Look for ${labels.names.map((name) => `“${name}”`).join(" or ")} in the ingredient list.${labels.note ? ` ${labels.note}` : ""}`)],
    ["References", references.length ? `<ol class="reference-list">${references.map((ref) => { const url = safeEvidenceUrl(ref.url); return `<li><span class="reference-type">${escapeHtml(ref.studyType)}</span> ${escapeHtml(ref.title)}. <i>${escapeHtml(ref.publisher || "")}</i>${ref.year ? ` ${escapeHtml(String(ref.year))}` : ""}.${ref.doi ? ` doi:${escapeHtml(ref.doi)}` : ref.pmid ? ` PMID: ${escapeHtml(ref.pmid)}` : ""}${url ? ` <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open<span class="sr-only"> ${escapeHtml(ref.title)} (opens in a new tab)</span></a>` : ""}</li>`; }).join("")}</ol>` : ""],
  ].filter(([, html]) => html);
  const loading = !useGpt && state.routineContext?.status === "loading";
  return `<dl class="why-grid ${useGpt ? "is-gpt" : ""} ${useGpt && state.gptJustArrived ? "is-arriving" : ""}">${rows.map(([label, html]) => `<div class="why-row"><dt>${escapeHtml(label)}</dt><dd>${html}</dd></div>`).join("")}</dl><p class="why-foot">${useGpt ? `${icon("sparkles", 12)} Written by AI from DermaSynth's checked facts, then checked again against them.` : loading ? `${icon("sparkles", 12)} <span class="shimmer-text">Writing a friendlier version…</span>` : ""}</p>`;
}

function consumerStepItem(step, phase, entries, meta) {
  const key = `${phase}:${step.id}`;
  const plain = plainStep(step);
  const entry = entries.find((item) => item.categoryId === step.id && item.phase === phase) || null;
  const gptStep = state.routineContext?.steps?.[key]?.text || "";
  const serverPlain = (state.routineMeta?.explanation?.steps || []).find((item) => item.phase === phase && item.categoryId === step.id)?.plain || "";
  const line = gptStep || serverPlain || consumerStepLine(step, phase, meta) || plain.what;
  const timing = step.id === "daytime-photoprotection" ? sunscreenTiming() : "";
  const open = Boolean(state.openWhy?.[key]);
  const panelId = `why-${phase}-${step.id}`;
  const stepIndex = (state.stepCounter = (state.stepCounter || 0) + 1);
  const mine = state.editingProducts ? "" : productNameFor(key);
  return `<li class="consumer-step" style="view-transition-name: step-${escapeHtml(phase)}-${escapeHtml(step.id)}; --i: ${stepIndex}"><div class="consumer-step-main"><strong>${escapeHtml(plain.name)}</strong>${entry ? `<span class="consumer-ingredient">Look for: <b>${escapeHtml(entry.displayName)}</b></span>` : `<span class="consumer-ingredient">${escapeHtml(plain.what)}</span>`}${mine ? `<span class="my-product">Your product: <b>${escapeHtml(mine)}</b></span>` : ""}<p class="step-line ${gptStep ? "is-gpt" : ""} ${gptStep && state.gptJustArrived ? "is-arriving" : ""}">${escapeHtml(line)}</p>${timing ? `<p class="step-timing">${icon("sun", 12)} ${escapeHtml(timing)}</p>` : ""}${productInput(key, plain.name)}</div>${entry ? `<button type="button" class="why-button" data-action="toggle-why" data-key="${escapeHtml(key)}" aria-expanded="${open}" aria-controls="${escapeHtml(panelId)}">${open ? "Hide" : "Why?"}<span class="sr-only"> ${escapeHtml(entry.displayName)} for ${escapeHtml(plain.name)}</span></button><div class="consumer-why ${state.whyJustOpened === key ? "is-opening" : ""}" id="${escapeHtml(panelId)}" ${open ? "" : "hidden"}>${open ? consumerWhy(entry) : ""}</div>` : ""}</li>`;
}

// ---- Impact features (1-10) -----------------------------------------------
const MY_ROUTINE_KEY = "dermasynth.my-routine.v1";
const LAST_ROUTINE_KEY = "dermasynth.last-routine.v1";
const CHECKIN_KEY = "dermasynth.checkins.v1";

function readStore(key, fallback) {
  try { const value = JSON.parse(window.localStorage.getItem(key) || "null"); return value ?? fallback; } catch { return fallback; }
}
function writeStore(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

function currentStepKeys(routine = state.generatedRoutine) {
  return [...(routine?.am || []).map((s) => `am:${s.id}`), ...(routine?.pm || []).map((s) => `pm:${s.id}`)];
}

// 1. Today in one line: the day's decisions, from facts the run computed.
function planningUv(readings = {}) {
  const now = Number(readings.uvi);
  const peak = Number(readings.uviMaxToday);
  const values = [now, peak].filter((v) => Number.isFinite(v));
  return values.length ? Math.max(...values) : null;
}

function todayOneLine(meta, routine) {
  const readings = meta?.environment?.readings || {};
  const steps = new Set(currentStepKeys(routine).map((k) => k.split(":")[1]));
  const parts = [];
  const uv = planningUv(readings);
  const peakTime = state.outlook?.data?.today?.window?.peak?.time;
  const hour = (time) => { const h = Number(String(time || "").slice(11, 13)); return Number.isFinite(h) ? (h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`) : ""; };
  if (steps.has("daytime-photoprotection")) {
    const when = peakTime ? ` around ${hour(peakTime)}` : "";
    parts.push(uv !== null && uv >= 6 ? `sunscreen is a must (UV ${Math.round(uv)}${when})` : `wear sunscreen when you go out (UV up to ${uv === null ? "?" : Math.round(uv)})`);
  } else if (uv !== null) {
    parts.push(`UV stays low today (up to ${Math.round(uv)})`);
  }
  if (steps.has("antioxidant-context")) parts.push("add an antioxidant (hazy air)");
  const guarded = [...(routine?.am || []), ...(routine?.pm || [])].some((s) => (s.ruleIds || []).includes("low-irritation-barrier-guardrail"));
  const direction = routine?.generation?.textureVote?.direction;
  if (guarded) parts.push("keep everything extra gentle");
  else if (direction === "lighter") parts.push("keep your moisturiser light");
  else if (direction === "richer") parts.push("use your richer moisturiser");
  if (parts.length < 3 && steps.has("texture-renewal")) parts.push("exfoliate tonight only");
  if (!parts.length) return "";
  const text = parts.join(" · ");
  return text[0].toUpperCase() + text.slice(1) + ".";
}

function heroCard(meta, routine) {
  const line = todayOneLine(meta, routine);
  if (!line) return "";
  return `<section class="hero-line" style="view-transition-name: hero-line" aria-labelledby="hero-line-title"><p class="hero-kicker" id="hero-line-title">${icon("sparkles", 13)} Today in one line</p><p class="hero-text">${escapeHtml(line)}</p><div class="hero-actions"><button type="button" class="pill-button is-primary" data-action="pc-focus">${icon("layers", 14)} Check a product you own</button><button type="button" class="pill-button" data-action="story-open">${icon("share", 14)} Share as story</button><button type="button" class="pill-button" data-action="reminders">${icon("bell", 14)} Add reminders</button></div></section>`;
}

// 4. UV timeline: today's hourly UV with the sunscreen window shaded.
function uvTimeline(outlook = state.outlook) {
  const today = outlook?.data?.today;
  const hours = Array.isArray(today?.hourly) ? today.hourly : [];
  if (hours.length < 6) return "";
  const w = 320; const h = 96; const padX = 8; const top = 12; const base = 70;
  const maxUv = Math.max(11, ...hours.map((p) => p.uvi));
  const x = (time) => padX + (Number(String(time).slice(11, 13)) / 23) * (w - padX * 2);
  const y = (uvi) => base - (uvi / maxUv) * (base - top);
  const line = hours.map((p, i) => `${i ? "L" : "M"}${x(p.time).toFixed(1)},${y(p.uvi).toFixed(1)}`).join(" ");
  const area = `${line} L${x(hours.at(-1).time).toFixed(1)},${base} L${x(hours[0].time).toFixed(1)},${base} Z`;
  const win = today.window;
  const winRect = win && win.start && win.end ? `<rect class="uv-window" x="${x(win.start).toFixed(1)}" y="${top + 2}" width="${(x(win.end) - x(win.start)).toFixed(1)}" height="${base - top - 2}" rx="6"/>` : "";
  const thresholdY = win ? y(win.threshold) : null;
  const nowX = today.now ? x(today.now) : null;
  const peak = win?.peak;
  const label = win?.start && win?.end ? `UV today: ${win.threshold} or higher from ${hourLabel(win.start)} to ${hourLabel(win.end)}, peaking at ${Math.round(peak?.uvi ?? 0)} around ${hourLabel(peak?.time)}.` : "UV today stays low.";
  return `<figure class="uv-timeline"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(label)}">${winRect}<path class="uv-area" d="${area}"/><path class="uv-line" d="${line}"/>${thresholdY !== null ? `<line class="uv-threshold" x1="${padX}" x2="${w - padX}" y1="${thresholdY.toFixed(1)}" y2="${thresholdY.toFixed(1)}"/>` : ""}${nowX !== null ? `<line class="uv-now" x1="${nowX.toFixed(1)}" x2="${nowX.toFixed(1)}" y1="${top - 8}" y2="${base}"/><text class="uv-now-label" x="${nowX.toFixed(1)}" y="${top - 1}" text-anchor="middle">now</text>` : ""}${peak ? `<circle class="uv-peak" cx="${x(peak.time).toFixed(1)}" cy="${y(peak.uvi).toFixed(1)}" r="3.5"/>` : ""}${["06", "12", "18"].map((hh) => `<text class="uv-axis" x="${x(`2000-01-01T${hh}:00`).toFixed(1)}" y="${h - 8}" text-anchor="middle">${hh === "12" ? "noon" : hh === "06" ? "6 am" : "6 pm"}</text>`).join("")}</svg><figcaption><span class="uv-key is-window"></span> sunscreen matters · <span class="uv-key is-line"></span> UV through the day</figcaption></figure>`;
}
function hourLabel(time) {
  const h = Number(String(time || "").slice(11, 13));
  if (!Number.isFinite(h)) return "";
  return h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`;
}

// 6 and 7. Compared with your usual routine / since your last routine.
function compareCard(meta) {
  const cmp = meta?.compare;
  const my = state.myRoutine;
  const blocks = [];
  if (cmp?.vsUsual && my?.steps?.length) {
    blocks.push(cmp.vsUsual.sameAsUsual
      ? `<p class="compare-same">${icon("check", 14)} Same as your usual routine today.</p>`
      : `<p class="compare-title">Today's changes to your usual routine</p><ul class="tomorrow-changes">${cmp.vsUsual.changes.map((c) => `<li class="is-${escapeHtml(c.change)}">${escapeHtml(c.text)}</li>`).join("")}</ul>`);
  }
  if (cmp?.vsPrevious && !(cmp.vsPrevious.same && !cmp.vsPrevious.readingChanges?.length)) {
    const when = cmp.vsPrevious.at ? relativeDay(cmp.vsPrevious.at) : "last time";
    const readings = cmp.vsPrevious.readingChanges?.length ? `<p class="compare-readings">${escapeHtml(cmp.vsPrevious.readingChanges.join(" · "))}.</p>` : "";
    blocks.push(`<p class="compare-title">Since your routine ${escapeHtml(when)}</p>${readings}${cmp.vsPrevious.same ? `<p class="compare-same">${icon("check", 14)} The routine itself hasn't changed.</p>` : `<ul class="tomorrow-changes">${cmp.vsPrevious.changes.map((c) => `<li class="is-${escapeHtml(c.change)}">${escapeHtml(c.text)}</li>`).join("")}</ul>`}`);
  }
  if (!blocks.length) return "";
  return `<section class="compare-card" style="view-transition-name: compare-card" aria-label="What changed">${blocks.join("")}</section>`;
}
function relativeDay(iso) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "last time";
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(then).setHours(0, 0, 0, 0)) / 864e5);
  return days <= 0 ? "earlier today" : days === 1 ? "yesterday" : `${days} days ago`;
}

function myRoutineControls() {
  const my = state.myRoutine;
  const saved = my?.steps?.length;
  const same = saved && currentStepKeys().join(",") === my.steps.join(",");
  if (state.editingProducts && saved) return `<div class="my-routine-bar is-editing"><span>Type the product you use for each step (optional). It stays in this browser.</span><button type="button" class="pill-button is-selected" data-action="products-done">${icon("check", 13)} Done</button></div>`;
  return `<div class="my-routine-bar">${saved ? `<span>${icon("check", 13)} Your usual routine is saved${same ? " (this one)" : ""}.</span>` : `<span>Use this as your usual routine? Tomorrow you'll just see what changes.</span>`}<button type="button" class="pill-button" data-action="save-my-routine">${saved && !same ? "Make this my usual routine" : saved ? "Edit my products" : "Save as my usual routine"}</button>${saved ? `<button type="button" class="text-button" data-action="clear-my-routine">Forget it</button>` : ""}</div>`;
}

function productNameFor(key) {
  return state.myRoutine?.products?.[key] || "";
}

// 9. One-tap check-in.
function checkinCard(meta) {
  if (!meta || meta.status !== "cleared") return "";
  const store = readStore(CHECKIN_KEY, {});
  const runId = meta.routineContext?.runId || meta.requestId || "";
  const askYesterday = state.previousForCheckin && !store[`y:${state.previousForCheckin.at}`];
  const done = store[runId];
  if (done && !askYesterday) return `<section class="checkin-card is-done" aria-live="polite"><p>${icon("check", 14)} Thanks. Your check-in helps test DermaSynth.</p></section>`;
  const about = askYesterday ? "yesterday" : "today";
  const title = askYesterday ? `How did your skin feel after your routine ${escapeHtml(relativeDay(state.previousForCheckin.at))}?` : "How does your skin feel with today's routine?";
  const chosen = state.checkinDraft?.about === about ? state.checkinDraft : {};
  return `<section class="checkin-card" aria-labelledby="checkin-title"><p class="checkin-title" id="checkin-title">${title}</p><div class="checkin-options" role="group" aria-label="How your skin felt">${[["good", "🙂", "Good"], ["ok", "😐", "Okay"], ["bad", "🙁", "Not good"]].map(([value, face, label]) => `<button type="button" class="checkin-face ${chosen.rating === value ? "is-selected" : ""}" data-action="checkin" data-about="${about}" data-value="${value}" aria-pressed="${chosen.rating === value}"><span aria-hidden="true">${face}</span>${label}</button>`).join("")}</div>${chosen.rating ? `<div class="checkin-follow" role="group" aria-label="Did you follow the routine"><span>Did you follow it?</span>${[["yes", "Yes"], ["partly", "Partly"], ["no", "No"]].map(([value, label]) => `<button type="button" class="pill-button ${chosen.followed === value ? "is-selected" : ""}" data-action="checkin-follow" data-about="${about}" data-value="${value}" aria-pressed="${chosen.followed === value}">${label}</button>`).join("")}</div>` : ""}<p class="checkin-note">Anonymous: only your answer, skin type and concern are sent.</p></section>`;
}

async function sendCheckin(about) {
  const draft = state.checkinDraft;
  if (!draft?.rating) return;
  const meta = state.routineMeta;
  const runId = meta?.routineContext?.runId || meta?.requestId || "";
  try {
    await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId, about, rating: draft.rating, followed: draft.followed || null, profile: state.profile, concern: state.concern }) });
  } catch { /* offline: still thank the user */ }
  const store = readStore(CHECKIN_KEY, {});
  if (about === "yesterday" && state.previousForCheckin) store[`y:${state.previousForCheckin.at}`] = draft.rating;
  else store[runId] = draft.rating;
  writeStore(CHECKIN_KEY, store);
  state.checkinDraft = null;
  if (about === "yesterday") state.previousForCheckin = null;
  renderAnimated();
  showToast("Thanks for checking in.");
}

// 5. Check my product.
function productCheckExample() {
  const entries = state.routineMeta?.ingredientCandidates?.entries || [];
  const chosen = entries.find((e) => e.phase === "am" && e.categoryId !== "daytime-photoprotection") || entries[0];
  return ["Aqua", "Glycerin", chosen?.displayName, "Butylene Glycol", "Panthenol", "Phenoxyethanol"].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
}

function productCheckTone(r) {
  if (!r) return "neutral";
  if (r.cautions?.some((c) => c.level === "stop")) return "stop";
  if (r.conflicts?.length || r.cautions?.some((c) => c.level === "warn")) return "warn";
  if (r.fits?.length) return "good";
  return "neutral";
}

function productCheckCard(meta) {
  if (!meta || meta.status !== "cleared") return "";
  const pc = state.productCheck || {};
  const r = pc.result;
  const tone = productCheckTone(r);
  const toneIcon = { good: "check", warn: "info", stop: "shield", neutral: "info" }[tone];
  const group = (title, items, cls = "") => (items.length ? `<div class="pc-group"><p class="pc-group-title">${escapeHtml(title)}</p><ul class="pc-list ${cls}">${items.join("")}</ul></div>` : "");
  const resultHtml = r ? `<div class="pc-result is-${tone}" aria-live="polite"><p class="pc-verdict">${icon(toneIcon, 17)} <span>${escapeHtml(r.verdict)}</span></p>${group("Fits your routine", (r.fits || []).map((f) => `<li>${icon("check", 13)} ${escapeHtml(f.text)}</li>`), "is-good")}${group("Clashes with today's routine", (r.conflicts || []).map((c) => `<li>${escapeHtml(c.text)}</li>`), "is-warn")}${group("Good to know", (r.cautions || []).map((c) => `<li class="is-${escapeHtml(c.level)}">${escapeHtml(c.text)}</li>`))}${r.recognised?.length ? `<p class="pc-found">Recognised: ${escapeHtml(r.recognised.map((x) => x.name).join(", "))}.</p>` : ""}${r.note ? `<p class="pc-note">${escapeHtml(r.note)}</p>` : ""}</div>` : "";
  const busy = pc.status === "loading";
  return `<section class="product-card" id="product-check" style="view-transition-name: product-card" aria-labelledby="pc-title"><div class="pc-head"><span class="pc-badge" aria-hidden="true">${icon("layers", 20)}</span><div><h3 id="pc-title">Already have a product? Check it here</h3><p class="pc-help">Paste the ingredient list from the label. DermaSynth tells you which of today's steps it can fill, and whether it clashes with anything in your routine.</p></div></div><label class="sr-only" for="pc-text">Ingredient list from the product label</label><textarea id="pc-text" data-action="pc-text" rows="4" maxlength="4000" placeholder="Ingredients: Aqua, Glycerin, Niacinamide, Sodium Hyaluronate, …">${escapeHtml(pc.text || "")}</textarea><div class="pc-actions"><button type="button" class="primary-button" data-action="pc-run" ${busy ? "disabled" : ""}>${icon("check", 15)} ${busy ? "Checking…" : "Check this product"}</button><button type="button" class="ghost-button" data-action="pc-example" ${busy ? "disabled" : ""}>Try an example</button>${r ? `<button type="button" class="text-button" data-action="pc-clear">Check another</button>` : ""}</div><p class="pc-tip">Tip: the list is usually on the back of the box or bottle, after "Ingredients".</p>${pc.status === "error" ? `<p class="pc-note">${escapeHtml(pc.error || "The check couldn't run. Try again.")}</p>` : ""}${resultHtml}</section>`;
}

function focusProductCheck() {
  const card = document.querySelector("#product-check");
  if (!card) return;
  card.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  setTimeout(() => document.querySelector("#pc-text")?.focus({ preventScroll: true }), prefersReducedMotion() ? 0 : 450);
}

async function runProductCheck() {
  const text = state.productCheck?.text || document.querySelector("#pc-text")?.value || "";
  if (!text.trim()) {
    state.productCheck = { text: "", status: "error", error: "Paste the ingredient list from the label first, or press Try an example." };
    renderAnimated().then(() => document.querySelector("#pc-text")?.focus({ preventScroll: true }));
    return;
  }
  state.productCheck = { ...(state.productCheck || {}), text, status: "loading", error: "" };
  renderAnimated();
  const entries = (state.routineMeta?.ingredientCandidates?.entries || []).map((e) => ({ ingredientId: e.ingredientId, displayName: e.displayName, phase: e.phase, categoryId: e.categoryId }));
  try {
    const response = await fetch("/api/check-product", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, routine: { entries, steps: currentStepKeys(), concern: state.concern, reactivityLevel: state.routineMeta?.routine?.generation?.reactivityLevel || state.reactivityLevel || "low" } }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "The check couldn't run.");
    state.productCheck = { text, status: "done", result: data };
  } catch (error) {
    state.productCheck = { text, status: "error", error: error instanceof Error ? error.message : "The check couldn't run." };
  }
  renderAnimated();
}

// 8. Reminders as a calendar file.
function icsDate(localIso) {
  // "2026-09-24T13:00" -> 20260924T130000 (floating local time)
  return String(localIso).replace(/[-:]/g, "").slice(0, 13).padEnd(13, "0") + "00";
}
function localIsoNow(offsetDays = 0, hour = null) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour ?? d.getHours())}:${hour === null ? pad(d.getMinutes()) : "00"}`;
}
function icsEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
function downloadReminders() {
  const routine = state.generatedRoutine;
  const meta = state.routineMeta;
  if (!routine || !meta) return;
  const names = (phase) => (routine[phase] || []).map((step, i) => { const entry = (meta.ingredientCandidates?.entries || []).find((e) => e.categoryId === step.id && e.phase === phase); return `${i + 1}. ${plainStep(step).name}${entry ? ` (look for ${entry.displayName})` : ""}${productNameFor(`${phase}:${step.id}`) ? ` - ${productNameFor(`${phase}:${step.id}`)}` : ""}`; }).join("\n");
  const events = [];
  const win = state.outlook?.data?.today?.window;
  const now = localIsoNow();
  const placeNow = state.outlook?.data?.today?.now || now;
  if (win?.peak?.time && !win.passed && win.peak.time > placeNow && (routine.am || []).some((s) => s.id === "daytime-photoprotection")) {
    events.push({ start: win.peak.time, minutes: 15, title: "Top up sunscreen", body: `UV peaks around ${hourLabel(win.peak.time)} (about ${Math.round(win.peak.uvi)}). If you're outside, top up your sunscreen.` });
  }
  const evening = localIsoNow(0, 21);
  if (evening > now) events.push({ start: evening, minutes: 15, title: "Evening skincare routine", body: names("pm") });
  const tomorrow = state.outlook?.data?.tomorrow;
  events.push({ start: localIsoNow(1, 7), minutes: 15, title: "Morning skincare routine", body: `${tomorrow?.summary || ""}\n${(tomorrow?.changes || []).filter((c) => c.change !== "kept").map((c) => `- ${c.text}`).join("\n") || "Same routine as today."}\nOpen DermaSynth for today's routine.`.trim() });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DermaSynth//Routine reminders//EN", "CALSCALE:GREGORIAN"];
  events.forEach((event, i) => {
    const endDate = new Date(`${event.start}:00`);
    endDate.setMinutes(endDate.getMinutes() + event.minutes);
    const pad = (n) => String(n).padStart(2, "0");
    const end = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
    lines.push("BEGIN:VEVENT", `UID:dermasynth-${Date.now()}-${i}@local`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(event.start)}`, `DTEND:${end}`, `SUMMARY:${icsEscape(event.title)}`, `DESCRIPTION:${icsEscape(event.body)}`, "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(event.title)}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  // RFC 5545: fold lines longer than 75 characters.
  const folded = lines.flatMap((line) => { const out = []; let rest = line; while (rest.length > 74) { out.push(out.length ? ` ${rest.slice(0, 73)}` : rest.slice(0, 74)); rest = rest.slice(out.length === 1 ? 74 : 73); } out.push(out.length ? ` ${rest}` : rest); return out; });
  const blob = new Blob([folded.join("\r\n")], { type: "text/calendar" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "dermasynth-reminders.ics";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  showToast(`${events.length} reminder${events.length === 1 ? "" : "s"} saved. Open the file to add ${events.length === 1 ? "it" : "them"} to your calendar.`);
}


// 6. Saving "my routine" and the product names the user owns.
function saveMyRoutine() {
  const steps = currentStepKeys();
  if (!steps.length) return;
  const products = {};
  for (const key of steps) if (state.myRoutine?.products?.[key]) products[key] = state.myRoutine.products[key];
  state.myRoutine = { steps, products, savedAt: new Date().toISOString(), profile: state.profile, concern: state.concern };
  writeStore(MY_ROUTINE_KEY, state.myRoutine);
  state.editingProducts = true;
  renderAnimated();
  showToast("Saved as your usual routine. Add the products you use, if you like.");
}

function clearMyRoutine() {
  state.myRoutine = null;
  state.editingProducts = false;
  try { window.localStorage.removeItem(MY_ROUTINE_KEY); } catch { /* storage unavailable */ }
  renderAnimated();
  showToast("Your usual routine was forgotten.");
}

function productInput(key, label) {
  if (!state.editingProducts || !state.myRoutine?.steps?.includes(key)) return "";
  const id = `my-product-${key.replace(":", "-")}`;
  return `<label class="my-product-field" for="${escapeHtml(id)}"><span>Your product for this step (optional)</span><input id="${escapeHtml(id)}" type="text" maxlength="60" autocomplete="off" data-action="my-product" data-key="${escapeHtml(key)}" value="${escapeHtml(productNameFor(key))}" placeholder="e.g. the brand and name of your ${escapeHtml(label.toLowerCase())}" /></label>`;
}

// 2. After a routine, the form folds into a one-line summary.
function collapsedFormPanel() {
  const profileWord = state.profile[0].toUpperCase() + state.profile.slice(1);
  return `<section class="panel form-panel is-collapsed" id="routine-preview"><div class="collapsed-form"><div><p class="collapsed-form-label">About your skin</p><p class="collapsed-form-value">${escapeHtml(profileWord)} skin · ${escapeHtml(concernOption().label)} · ${escapeHtml(locationLabel())}</p></div><div class="collapsed-form-actions"><button type="button" class="ghost-button" data-action="edit-form">${icon("sliders", 14)} Edit my skin details</button><button type="button" class="text-button" data-action="simulate" ${state.runStatus === "running" || isLocationUpdating() ? "disabled" : ""}>${icon("refresh", 13)} Rebuild</button></div></div></section>`;
}

function scrollToResult() {
  const target = document.querySelector("#routine-result");
  if (!target || window.matchMedia("(min-width: 901px)").matches) return;
  const top = target.getBoundingClientRect().top;
  if (top >= 0 && top < window.innerHeight * 0.35) return;
  target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
}

// Previous routine (for "changed since last time" and the next-day check-in).
function previousRoutineForCompare() {
  const last = readStore(LAST_ROUTINE_KEY, null);
  if (!last?.steps?.length || last.profile !== state.profile || last.concern !== state.concern) return null;
  const at = new Date(last.at);
  if (Number.isNaN(at.getTime())) return null;
  const sameDay = at.toDateString() === new Date().toDateString();
  if (sameDay && Date.now() - at.getTime() < 3 * 36e5) return null;
  return last;
}

function rememberRoutine(payload) {
  if (!payload?.routine || payload.status === "medical_redirect" || payload.status === "needs_conditions") return;
  const last = readStore(LAST_ROUTINE_KEY, null);
  if (last?.at && new Date(last.at).toDateString() !== new Date().toDateString() && last.status === "cleared") {
    state.previousForCheckin = { at: last.at };
  }
  const r = payload.environment?.readings || {};
  writeStore(LAST_ROUTINE_KEY, {
    steps: currentStepKeys(payload.routine),
    readings: { uvi: r.uvi ?? null, uviMaxToday: r.uviMaxToday ?? null, humidity: r.humidity ?? null, pm25: r.pm25 ?? null, temperature: r.temperature ?? null },
    at: new Date().toISOString(),
    profile: state.profile,
    concern: state.concern,
    status: payload.status,
  });
}

// 10. "Share as story": a 1080 x 1920 Instagram Story image, drawn on a canvas.
const STORY = Object.freeze({
  w: 1080, h: 1920, x: 84, safeTop: 250, safeBottom: 1640,
  bgTop: "#0E3B32", bgBottom: "#1F5A4B", gold: "#E8C77A", cream: "#F5EEDC", mint: "#9FE3CF", deep: "#0B2F28",
  sans: '"Avenir Next", "SF Pro Display", "Helvetica Neue", Inter, "Segoe UI", system-ui, sans-serif',
  serif: '"New York", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
});

function storyWrap(ctx, text, maxWidth, maxLines = 3) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.replace(/[\s,.;·]+$/, "")}…`;
    return kept;
  }
  return lines;
}

function storyRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function storyGlass(ctx, x, y, w, h, r = 36) {
  ctx.save();
  storyRoundRect(ctx, x, y, w, h, r);
  const fill = ctx.createLinearGradient(x, y, x, y + h);
  fill.addColorStop(0, "rgba(255,255,255,0.10)");
  fill.addColorStop(1, "rgba(255,255,255,0.05)");
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(245,238,220,0.16)";
  ctx.stroke();
  ctx.restore();
}

function storySun(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = r * 0.22; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 8; i += 1) {
    const a = (Math.PI / 4) * i;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.restore();
}

function storyMoon(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.clip();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.42, cy - r * 0.3, r * 0.68, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill("evenodd");
  ctx.restore();
}

function storyData() {
  const routine = state.generatedRoutine;
  const meta = state.routineMeta;
  if (!routine || !meta) return null;
  const entries = meta.ingredientCandidates?.entries || [];
  const r = meta.environment?.readings || {};
  const uv = planningUv(r);
  const fmt = (v, unit = "") => (Number.isFinite(Number(v)) && v !== null ? `${Math.round(Number(v))}${unit}` : "—");
  const steps = (phase) => (routine[phase] || []).map((step) => {
    const entry = entries.find((e) => e.categoryId === step.id && e.phase === phase);
    return { name: plainStep(step).name, ingredient: entry?.displayName || "", product: productNameFor(`${phase}:${step.id}`) };
  });
  const tomorrow = state.outlook?.data?.tomorrow;
  const tomorrowChanges = (tomorrow?.changes || []).filter((c) => c.change !== "kept");
  return {
    date: new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }),
    place: locationLabel() === "Your location" ? "Near you" : locationLabel(),
    line: todayOneLine(meta, routine) || "Your routine for today, matched to the weather.",
    tiles: [
      ["UV peak", fmt(uv), uvBand(uv)?.label || ""],
      ["Humidity", fmt(r.humidity, "%"), humidityBand(r.humidity)?.label || ""],
      ["Haze", fmt(r.pm25), hazeBand(r.pm25)?.label || "PM2.5"],
      ["Temp", fmt(r.temperature, "°"), temperatureBand(r.temperature)?.label || ""],
    ],
    am: steps("am"),
    pm: steps("pm"),
    tomorrow: tomorrow ? (tomorrow.sameAsToday ? "Same routine as today." : tomorrowChanges.map((c) => c.text).join(" ") || tomorrow.summary || "") : "",
    profile: `${state.profile[0].toUpperCase()}${state.profile.slice(1)} skin · ${concernOption().label}`,
  };
}

function drawStory(ctx, data, s) {
  const S = STORY;
  const W = S.w;
  const inner = W - S.x * 2;
  // Background: deep forest gradient, a mint glow and a soft gold halo.
  const bg = ctx.createLinearGradient(0, 0, W * 0.35, S.h);
  bg.addColorStop(0, S.bgTop);
  bg.addColorStop(1, S.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, S.h);
  const glow = ctx.createRadialGradient(W - 96, 250, 20, W - 96, 250, 620);
  glow.addColorStop(0, "rgba(159,227,207,0.30)");
  glow.addColorStop(1, "rgba(159,227,207,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, S.h);
  const warm = ctx.createRadialGradient(W * 0.1, S.h * 0.9, 20, W * 0.1, S.h * 0.9, 700);
  warm.addColorStop(0, "rgba(232,199,122,0.07)");
  warm.addColorStop(1, "rgba(232,199,122,0)");
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, W, S.h);
  ctx.save();
  ctx.strokeStyle = "rgba(232,199,122,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(W - 96, 250, 118, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W - 96, 250, 168, 0, Math.PI * 2); ctx.globalAlpha = 0.5; ctx.stroke();
  ctx.restore();

  ctx.textBaseline = "alphabetic";
  let y = S.safeTop + 18;
  // Wordmark and date.
  ctx.fillStyle = S.gold;
  ctx.font = `600 26px ${S.sans}`;
  ctx.letterSpacing = "8px";
  ctx.fillText("DERMASYNTH", S.x, y);
  ctx.letterSpacing = "0px";
  y += 52;
  ctx.fillStyle = "rgba(245,238,220,0.72)";
  ctx.font = `500 28px ${S.sans}`;
  ctx.fillText(`${data.date} · ${data.place}`, S.x, y);

  // Headline: "Today's" in gold italic, "skin plan" in cream.
  y += 118 * Math.max(s, 0.85);
  const headSize = Math.round(96 * Math.max(s, 0.85));
  ctx.font = `italic 500 ${headSize}px ${S.serif}`;
  ctx.fillStyle = S.gold;
  ctx.fillText("Today's", S.x, y);
  const todayWidth = ctx.measureText("Today's ").width;
  ctx.font = `500 ${headSize}px ${S.serif}`;
  ctx.fillStyle = S.cream;
  ctx.fillText("skin plan", S.x + todayWidth, y);

  // One-line summary.
  y += 30;
  ctx.font = `500 ${Math.round(36 * s)}px ${S.sans}`;
  ctx.fillStyle = "rgba(245,238,220,0.92)";
  for (const line of storyWrap(ctx, data.line, inner, 3)) { y += Math.round(50 * s); ctx.fillText(line, S.x, y); }
  y += Math.round(20 * s);
  ctx.font = `500 ${Math.round(24 * s)}px ${S.sans}`;
  ctx.fillStyle = S.mint;
  y += Math.round(30 * s);
  ctx.fillText(data.profile, S.x, y);

  // Weather tiles, one row of four.
  y += Math.round(40 * s);
  const gap = 18;
  const tileW = (inner - gap * 3) / 4;
  const tileH = Math.round(168 * s);
  data.tiles.forEach(([label, value, band], i) => {
    const tx = S.x + i * (tileW + gap);
    storyGlass(ctx, tx, y, tileW, tileH, 30);
    ctx.fillStyle = "rgba(245,238,220,0.66)";
    ctx.font = `600 ${Math.round(20 * s)}px ${S.sans}`;
    ctx.letterSpacing = "2px";
    ctx.fillText(label.toUpperCase(), tx + 24, y + Math.round(44 * s));
    ctx.letterSpacing = "0px";
    ctx.fillStyle = S.cream;
    ctx.font = `600 ${Math.round(54 * s)}px ${S.sans}`;
    ctx.fillText(value, tx + 22, y + Math.round(106 * s));
    ctx.fillStyle = S.gold;
    ctx.font = `600 ${Math.round(21 * s)}px ${S.sans}`;
    ctx.fillText(storyWrap(ctx, band, tileW - 40, 1)[0] || "", tx + 24, y + Math.round(144 * s));
  });
  y += tileH + Math.round(34 * s);

  // Morning and evening cards.
  const card = (title, steps, drawIcon) => {
    const headH = Math.round(92 * s);
    const rowH = Math.round((steps.some((st) => st.product) ? 100 : 86) * s);
    const h = headH + rowH * steps.length + Math.round(18 * s);
    storyGlass(ctx, S.x, y, inner, h, 40);
    drawIcon(S.x + 50, y + headH / 2 + 4, Math.round(24 * s));
    ctx.fillStyle = S.cream;
    ctx.font = `500 ${Math.round(46 * s)}px ${S.serif}`;
    ctx.fillText(title, S.x + 92, y + headH / 2 + Math.round(18 * s));
    ctx.fillStyle = "rgba(245,238,220,0.6)";
    ctx.font = `500 ${Math.round(24 * s)}px ${S.sans}`;
    const count = `${steps.length} step${steps.length === 1 ? "" : "s"}`;
    ctx.fillText(count, S.x + inner - 36 - ctx.measureText(count).width, y + headH / 2 + Math.round(12 * s));
    let ry = y + headH;
    steps.forEach((st, i) => {
      ctx.strokeStyle = "rgba(245,238,220,0.10)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(S.x + 36, ry); ctx.lineTo(S.x + inner - 36, ry); ctx.stroke();
      const cy = ry + rowH / 2;
      const cr = Math.round(22 * s);
      ctx.fillStyle = S.gold;
      ctx.beginPath(); ctx.arc(S.x + 58, cy, cr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = S.deep;
      ctx.font = `700 ${Math.round(24 * s)}px ${S.sans}`;
      const num = String(i + 1);
      ctx.fillText(num, S.x + 58 - ctx.measureText(num).width / 2, cy + Math.round(8 * s));
      const textX = S.x + 104;
      const maxW = inner - 140;
      ctx.fillStyle = S.cream;
      ctx.font = `600 ${Math.round(32 * s)}px ${S.sans}`;
      const sub = st.product || st.ingredient;
      ctx.fillText(storyWrap(ctx, st.name, maxW, 1)[0], textX, sub ? cy - Math.round(4 * s) : cy + Math.round(11 * s));
      if (sub) {
        ctx.fillStyle = S.mint;
        ctx.font = `500 ${Math.round(25 * s)}px ${S.sans}`;
        const text = st.product ? `${st.product}${st.ingredient ? ` · ${st.ingredient}` : ""}` : `with ${st.ingredient}`;
        ctx.fillText(storyWrap(ctx, text, maxW, 1)[0], textX, cy + Math.round(32 * s));
      }
      ry += rowH;
    });
    y += h + Math.round(24 * s);
  };
  if (data.am.length) card("Morning", data.am, (cx, cy, r) => storySun(ctx, cx, cy, r, S.gold));
  if (data.pm.length) card("Evening", data.pm, (cx, cy, r) => storyMoon(ctx, cx, cy, r, S.gold));

  // Tomorrow strip.
  if (data.tomorrow) {
    ctx.font = `500 ${Math.round(26 * s)}px ${S.sans}`;
    const lines = storyWrap(ctx, data.tomorrow, inner - 220, 2);
    const h = Math.round(38 * s) * lines.length + Math.round(44 * s);
    storyRoundRect(ctx, S.x, y, inner, h, h / 2 > 48 ? 40 : h / 2);
    ctx.fillStyle = "rgba(232,199,122,0.14)";
    ctx.fill();
    ctx.strokeStyle = "rgba(232,199,122,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = S.gold;
    ctx.font = `700 ${Math.round(22 * s)}px ${S.sans}`;
    ctx.letterSpacing = "3px";
    ctx.fillText("TOMORROW", S.x + 34, y + h / 2 + Math.round(8 * s));
    ctx.letterSpacing = "0px";
    ctx.fillStyle = S.cream;
    ctx.font = `500 ${Math.round(26 * s)}px ${S.sans}`;
    const startY = y + h / 2 - ((lines.length - 1) * Math.round(38 * s)) / 2 + Math.round(9 * s);
    lines.forEach((line, i) => ctx.fillText(line, S.x + 196, startY + i * Math.round(38 * s)));
    y += h;
  }

  // Footer, inside the safe zone.
  ctx.fillStyle = "rgba(245,238,220,0.5)";
  ctx.font = `500 22px ${S.sans}`;
  const foot = "Research prototype · not medical advice";
  ctx.fillText(foot, (W - ctx.measureText(foot).width) / 2, S.safeBottom);
  return y;
}

async function buildStoryImage() {
  const data = storyData();
  if (!data) return null;
  try { await document.fonts?.ready; } catch { /* fonts API unavailable */ }
  const canvas = document.createElement("canvas");
  canvas.width = STORY.w;
  canvas.height = STORY.h;
  const ctx = canvas.getContext("2d");
  // Shrink the lower sections until everything sits above the footer.
  let scale = 1;
  for (let i = 0; i < 12; i += 1) {
    ctx.clearRect(0, 0, STORY.w, STORY.h);
    const end = drawStory(ctx, data, scale);
    if (end <= STORY.safeBottom - 50 || scale <= 0.64) break;
    scale = Math.max(0.64, scale - 0.04);
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? { blob, width: canvas.width, height: canvas.height } : null;
}

let storyReturnFocus = null;
async function openStory() {
  storyReturnFocus = document.activeElement;
  closeStory({ restoreFocus: false });
  const image = await buildStoryImage();
  if (!image) { showToast("Build a routine first."); return; }
  const url = URL.createObjectURL(image.blob);
  state.story = { blob: image.blob, url, width: image.width, height: image.height };
  const canShare = (() => { try { return Boolean(navigator.canShare?.({ files: [new File([image.blob], "dermasynth-today.png", { type: "image/png" })] })); } catch { return false; } })();
  const modal = document.createElement("div");
  modal.className = "story-modal";
  modal.id = "story-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "story-title");
  modal.innerHTML = `<div class="story-backdrop" data-action="story-close"></div><div class="story-sheet"><div class="story-sheet-head"><h2 id="story-title">Your story image</h2><button type="button" class="story-close" data-action="story-close" aria-label="Close">×</button></div><img class="story-preview" src="${url}" width="${image.width}" height="${image.height}" alt="Story image of today's skin plan: the summary line, today's weather, and the morning and evening steps." /><div class="story-actions">${canShare ? `<button type="button" class="primary-button" data-action="story-share">${icon("share", 15)} Share</button>` : ""}<button type="button" class="${canShare ? "ghost-button" : "primary-button"}" data-action="story-download">${icon("download", 15)} Save image</button></div><p class="story-hint">1080 × 1920, sized for an Instagram Story.</p></div>`;
  document.body.append(modal);
  requestAnimationFrame(() => modal.classList.add("is-open"));
  modal.querySelector(canShare ? "[data-action='story-share']" : "[data-action='story-download']")?.focus();
}

function closeStory({ restoreFocus = true } = {}) {
  const modal = document.querySelector("#story-modal");
  if (modal) modal.remove();
  if (state.story?.url) setTimeout(((url) => () => URL.revokeObjectURL(url))(state.story.url), 1000);
  state.story = null;
  if (restoreFocus && storyReturnFocus?.isConnected) storyReturnFocus.focus();
}

function downloadStory() {
  if (!state.story) return;
  const link = document.createElement("a");
  link.href = state.story.url;
  link.download = "dermasynth-today.png";
  document.body.append(link);
  link.click();
  link.remove();
  showToast("Image saved.");
}

async function shareStory() {
  if (!state.story) return;
  const file = new File([state.story.blob], "dermasynth-today.png", { type: "image/png" });
  try {
    await navigator.share({ files: [file], title: "My skin plan today" });
  } catch (error) {
    if (error?.name !== "AbortError") downloadStory();
  }
}

function consumerResult(routine, meta, running) {
  if (running) {
    const slow = state.runSlow;
    return `<section class="consumer-card is-loading" aria-live="polite" aria-busy="true"><h3>${slow ? "This is taking longer than usual" : "Building your routine…"}</h3><p>${slow ? "The AI is still choosing and checking. You can keep waiting, or see the standard routine now: it uses the same safety checks and rules, without the AI's choices." : "Checking today's weather, running the safety checks and choosing ingredients. This usually takes a few seconds."}</p>${slow ? `<div class="form-actions"><button class="primary-button" type="button" data-action="standard-routine">Show the standard routine now</button><span class="consumer-wait shimmer-text">Still waiting for the AI…</span></div>` : ""}</section>`;
  }
  if (!meta) {
    return `<section class="consumer-card is-ready" aria-live="polite"><h3>Your routine will appear here</h3><p>Choose your skin type and main concern, answer the skin question, then press <b>Build routine</b>.</p></section>`;
  }
  if (meta.mode === "local") {
    const busy = meta.errorKind === "busy";
    return `<section class="consumer-card is-error" role="alert"><h3>${busy ? "Too many requests just now" : "We couldn't build your routine"}</h3><p>${busy ? "Please wait a minute, then try again." : "DermaSynth couldn't be reached. Check your connection and try again. No routine is shown, because the safety checks could not run."}</p><button class="primary-button" type="button" data-action="simulate">Try again</button></section>`;
  }
  const entries = Array.isArray(meta?.ingredientCandidates?.entries) ? meta.ingredientCandidates.entries : [];
  const removed = Array.isArray(meta?.ingredientCandidates?.removedBySafety) ? meta.ingredientCandidates.removedBySafety : [];
  const contextStatus = state.routineContext?.status;
  const contextNote = contextStatus === "loading"
    ? `<p class="consumer-status" aria-live="polite">${icon("sparkles", 13)} ${state.routineContext.slow ? "Friendlier explanations are taking a while. The standard reasons are shown meanwhile, and nothing else is waiting on them." : "Writing friendlier explanations…"}</p>`
    : contextStatus === "error" ? `<p class="consumer-status">${icon("info", 13)} ${escapeHtml(plainMessage(state.routineContext.error))}</p>` : "";
  const profileWord = state.profile[0].toUpperCase() + state.profile.slice(1);
  const reviewNote = meta.status === "cleared" ? "" : `<p class="consumer-status is-warn" role="status">${icon("info", 13)} Some checks asked for review, so treat this routine with extra care.</p>`;
  state.stepCounter = 0;
  return `<div class="consumer-result ${state.animateEnter ? "is-entering" : ""}">${meta.status === "cleared" ? heroCard(meta, routine) : ""}${conditionsSummaryCard(meta)}${compareCard(meta)}<section class="consumer-card" style="view-transition-name: routine-card" aria-labelledby="consumer-routine-title"><div class="consumer-head"><h3 id="consumer-routine-title">Your routine for today</h3><p>${escapeHtml(profileWord)} skin · ${escapeHtml(concernOption().label)} · ${escapeHtml(locationLabel())}</p></div>${degradedBanner(meta)}${reviewNote}${contextNote}<div class="consumer-phases"><section aria-labelledby="am-title"><h4 id="am-title">${icon("sun", 16)} Morning</h4><ol class="consumer-steps">${routine.am.map((step) => consumerStepItem(step, "am", entries, meta)).join("")}</ol></section><section aria-labelledby="pm-title"><h4 id="pm-title">${icon("sparkles", 16)} Evening</h4><ol class="consumer-steps">${routine.pm.map((step) => consumerStepItem(step, "pm", entries, meta)).join("")}</ol></section></div>${removed.length ? `<p class="consumer-status">${icon("shield", 13)} The final safety check removed ${escapeHtml(removed.map((item) => item.displayName).join(", "))}. Use a plain product for that step.</p>` : ""}${meta.status === "cleared" ? myRoutineControls() : ""}</section>${productCheckCard(meta)}${checkinCard(meta)}${tomorrowCard()}</div>`;
}

function synthesizedRoutineCard(routine, meta) {
  const redirect = meta?.status === "medical_redirect";
  const cleared = meta?.status === "cleared";
  const running = state.runStatus === "running";
  if (!meta && !running && !state.expertView) return consumerResult(routine, meta, running);
  if (!meta && !running) {
    return `<section class="synthesized-routine-card is-ready" aria-live="polite"><div class="synth-card-top"><div><p class="routine-eyebrow">${icon("sparkles", 14)} Ready to run</p><h3>Your category preview will appear here</h3><p>${escapeHtml(state.profile[0].toUpperCase() + state.profile.slice(1))} profile · ${escapeHtml(concernOption().label)} · ${escapeHtml(locationLabel())}</p></div><span class="synth-status is-review">Awaiting run</span></div><div class="synth-ready-content"><span>${icon("flask", 24)}</span><div><strong>One gated request, then an inspectable result.</strong><p>Choose a research context and run the preview to see the category output, evidence grounding, safety trace, and environmental explanation together.</p></div></div><div class="synth-card-footer"><p>${icon("shield", 15)} <span>No routine categories are shown before a gated research run.</span></p></div></section>`;
  }
  const notices = Array.isArray(meta?.safety?.flags) && meta.safety.flags.length ? meta.safety.flags.join(" ") : "";
  const variant = redirect ? "is-redirect" : cleared ? "is-cleared" : "is-review";
  if (meta?.status === "needs_conditions" && !running) return conditionsCard(meta);
  if (!state.expertView && !redirect) return consumerResult(routine, meta, running);
  if (redirect) {
    return `<section class="clinical-redirect" role="alert"><span class="clinical-redirect-icon">${icon("shield", 23)}</span><div><p class="routine-eyebrow">Please get this checked</p><h3>We won't suggest a routine today</h3><p>What you described may need a pharmacist or doctor to look at it. Please don't start new products until then.</p><p class="redirect-flags">${escapeHtml(notices)}</p><small>If you have swelling of the face, lips or throat, or trouble breathing, get urgent medical help now.</small></div></section>`;
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
    ? `<section class="ai-category-rationale"><div><span>${icon("sparkles", 14)} AI category rationale</span><small>${escapeHtml(aiRationale.cue && aiRationale.cue.score !== null && aiRationale.cue.score !== undefined ? `CUE ${Number(aiRationale.cue.score).toFixed(2)} · ${String(aiRationale.cue.status || "").replaceAll("_", " ")}` : (aiRationale.label || String(aiRationale.status).replaceAll("_", " ")))}</small></div><p>${escapeHtml(aiRationale.text)}</p><strong>${escapeHtml(aiRationale.boundary || "Deterministic safety checks remain the final authority for every displayed category.")}</strong></section>`
    : `<section class="ai-category-rationale is-unavailable"><div><span>${icon("info", 14)} AI category rationale</span><small>Not available</small></div><p>No AI category rationale is shown because the configured gate did not permit it or the GPT billing/provider connection is unavailable.</p><strong>Deterministic safety checks remain the final authority for every displayed category.</strong></section>`;
  const candidates = Array.isArray(meta?.ingredientCandidates?.entries) ? meta.ingredientCandidates.entries : [];
  return `<section class="synthesized-routine-card ${variant}" aria-live="polite" aria-busy="${running}"><div class="synth-card-top"><div><p class="routine-eyebrow">${icon("sparkles", 14)} Routine recommendations</p><h3>${escapeHtml(routine.label)}</h3><p>${escapeHtml(state.profile[0].toUpperCase() + state.profile.slice(1))} profile · ${escapeHtml(concernOption().label)} · ${escapeHtml(locationLabel())}</p></div><div class="synth-top-actions"><span class="synth-status ${variant}">${escapeHtml(routineStatusLabel())}</span></div></div>${degradedBanner(meta)}${approvedIngredientCandidatePanel(meta)}<div class="synth-structure-label">${icon("layers", 13)} Routine structure by category</div><div class="synth-time-grid"><section class="synth-time-slot"><div class="synth-time-heading">${icon("sun", 16)}<span>Morning</span></div>${routineStepList(routine.am, { dark: true, ingredientCandidates: candidates, phase: "am" })}</section><section class="synth-time-slot"><div class="synth-time-heading">${icon("sparkles", 16)}<span>Evening</span></div>${routineStepList(routine.pm, { dark: true, ingredientCandidates: candidates, phase: "pm" })}</section></div><div class="synth-card-footer"><p>${icon("shield", 15)} <span>${escapeHtml(statusMessage)}</span></p><button class="reason-button is-dark" type="button" data-action="reason">${state.reasonOpen ? "Hide rationale" : "Why these recommendations?"}</button></div>${state.reasonOpen ? `<div class="synth-rationale"><strong>Result rationale</strong><p>${escapeHtml(routine.reason)}</p>${meta?.explanation?.level1?.text ? `<p class="peg-level1"><b>Environment (level 1):</b> ${escapeHtml(meta.explanation.level1.text)}</p>` : ""}${aiRationaleMarkup}</div>` : ""}</section>`;
}

function simulatorView() {
  const routine = normaliseRoutine();
  const profileChoices = ["dry", "combination", "oily", "sensitive"].map((profile) => `<button class="profile-choice ${state.profile === profile ? "is-selected" : ""}" type="button" data-action="profile" data-profile="${profile}" aria-pressed="${state.profile === profile}" ${state.runStatus === "running" ? "disabled" : ""}>${profile[0].toUpperCase()}${profile.slice(1)}</button>`).join("");
  const locationUpdating = isLocationUpdating();
  const running = state.runStatus === "running";
  const inputs = `<section class="panel form-panel" id="routine-preview"><div class="panel-header"><h3 class="panel-title">${icon("flask", 17)} About your skin</h3><p class="panel-note">Takes about a minute</p></div><div class="form-grid"><div class="field"><label id="skin-type-label">Skin type</label><div class="profile-pills" role="group" aria-labelledby="skin-type-label">${profileChoices}</div></div>${concernPicker()}${profilePreferenceFields()}<div class="field safety-input"><label for="symptoms">Anything unusual with your skin right now?</label><textarea id="symptoms" data-action="symptoms" maxlength="280" aria-describedby="symptoms-help" placeholder="For example: swelling, burning after a new product, a spreading rash, blisters">${escapeHtml(state.symptoms || "")}</textarea><p class="field-help" id="symptoms-help">Leave it empty if not. If something needs a pharmacist or doctor, we'll tell you instead of giving a routine. This text is used only for that check and is not stored.</p></div>${locationPicker({ label: "Location" })}</div><div class="form-actions"><button class="primary-button" type="button" data-action="simulate" ${locationUpdating || running ? "disabled" : ""}>${icon("sparkles", 15)} ${running ? "Building…" : "Build routine"}</button><button class="ghost-button" type="button" data-action="navigate" data-view="monitor">Today's weather</button></div></section>`;
  const formPanel = state.formCollapsed && !state.expertView && state.routineMeta && !running ? collapsedFormPanel() : inputs;
  const result = `<section class="sim-result" id="routine-result">${synthesizedRoutineCard(routine, state.routineMeta)}${state.expertView ? researchContextPanel(state.routineMeta) : ""}</section>`;
  return shell(`<div class="view-heading ${state.routineMeta && !state.expertView ? "has-result" : ""}"><div><h2>${state.expertView ? "Routine preview (expert view)" : "Your routine for today"}</h2><p>${state.expertView ? "The same routine with scores, traces, evidence and the run report." : "Based on today's weather where you are and what you tell us about your skin."}</p></div></div><div class="simulator-grid ${formPanel === inputs ? "" : "is-form-collapsed"}">${formPanel}${result}</div>${state.expertView ? `<div class="simulator-report-grid">${progressPanel()}${reportPanel()}${evidencePanel()}</div>` : ""}`);
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
  const ATLAS_PAGE = 12;
  const atlasLimited = !state.atlasShowAll && !query && filtered.length > ATLAS_PAGE;
  const cards = (atlasLimited ? filtered.slice(0, ATLAS_PAGE) : filtered).map((ingredient) => {
    const contexts = (ingredient.concernContexts || []).map((context) => `<span>${escapeHtml(concernLabelFromId(context))}</span>`).join("");
    const inci = (ingredient.inciNames || []).join(" · ");
    const sources = Array.isArray(ingredient.sources) ? ingredient.sources : [];
    const primarySource = sources[0];
    const sourceCount = sources.length;
    return `<article class="atlas-ingredient"><div class="atlas-ingredient-head"><div><h3>${escapeHtml(ingredient.displayName)}</h3><p>${escapeHtml(inci || ingredient.id)}</p></div><span class="atlas-state">${sourceCount} source${sourceCount === 1 ? "" : "s"}</span></div><div class="atlas-contexts">${contexts}</div>${atlasReferenceLine(ingredient)}${primarySource ? `<div class="atlas-primary-source">${atlasSourceCard(primarySource)}</div>` : ""}${sources.length > 1 ? `<details class="atlas-limitations"><summary>View ${sources.length - 1} more source${sources.length === 2 ? "" : "s"}</summary><div class="atlas-sources">${sources.slice(1).map(atlasSourceCard).join("")}</div></details>` : ""}</article>`;
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
  const consumer = !state.expertView;
  return shell(`<div class="view-heading atlas-heading"><div><p class="hero-kicker">${consumer ? "Ingredients" : "Knowledge base"}</p><h2>${consumer ? "Ingredient guide" : "Ingredient Atlas"}</h2><p>${consumer ? "Look up any ingredient DermaSynth can suggest, what it's used for, and the studies behind it." : "Search ingredients, filter by context, and open the linked sources."}</p></div>${consumer ? "" : `<button class="ghost-button" type="button" data-action="knowledge-refresh" ${state.knowledgeStatus === "loading" ? "disabled" : ""}>${icon("refresh", 15)} Refresh</button>`}</div>${consumer ? "" : `<section class="atlas-summary panel"><div class="atlas-summary-stat"><span>Ingredients</span><strong>${escapeHtml(String(ingredientCount || "—"))}</strong><small>incorporated records</small></div><div class="atlas-summary-stat"><span>Sources</span><strong>${escapeHtml(String(overview.sourceCount || "—"))}</strong><small>${sourceFamilies.map(([family, count]) => `${sourceFamilyLabel(family)} ${count}`).join(" · ") || "linked records"}</small></div><div class="atlas-summary-stat"><span>Index</span><strong>${liveResearchIndex.enabled ? "Live" : "Local"}</strong><small>${escapeHtml(liveResearchIndex.namespace || "metadata index")}</small></div></section>${corpusCard}`}<section class="panel atlas-controls"><div class="atlas-search"><label for="knowledge-query">Find an ingredient</label><div><input id="knowledge-query" value="${escapeHtml(state.knowledgeQuery)}" placeholder="${consumer ? "e.g. niacinamide" : "Search Atlas"}" data-action="knowledge-query" /><button type="button" class="primary-button" data-action="knowledge-search" ${state.knowledgeSearchStatus === "searching" ? "disabled" : ""}>${state.knowledgeSearchStatus === "searching" ? "Searching…" : "Search"}</button></div></div><div class="atlas-filter"><span>${consumer ? "Filter by skin concern" : "Filter by context"}</span><div>${["all", ...concernOptions.map((option) => option.id)].map((concern) => `<button type="button" data-action="knowledge-concern" data-concern="${escapeHtml(concern)}" class="filter-chip ${state.knowledgeConcern === concern ? "is-selected" : ""}" aria-pressed="${state.knowledgeConcern === concern}">${escapeHtml(consumer && concern === "all" ? "All" : concernLabelFromId(concern))}</button>`).join("")}</div></div>${statusText && (!consumer || state.knowledgeStatus === "loading" || state.knowledgeStatus === "error") ? `<p class="atlas-notice" role="status">${escapeHtml(statusText)}</p>` : ""}</section>${showRetrieval ? `<section class="panel atlas-retrieval"><div class="panel-header"><div><h3 class="panel-title">Search results</h3><p class="panel-note">${escapeHtml(String(retrieval.coverage?.uniqueIngredients ?? 0))} matches</p></div></div><div class="research-hit-grid">${retrievalCards || `<div class="evidence-empty"><strong>No source match found.</strong></div>`}</div></section>` : ""}${consumer ? "" : `<details class="atlas-explorer-details"><summary>${icon("activity", 16)} Explore ingredient relationships</summary>${ingredientRelationshipExplorer()}</details>`}<section class="atlas-grid" aria-live="polite">${cards || `<div class="panel evidence-empty"><strong>No ingredients match this view.</strong></div>`}</section>${atlasLimited ? `<div class="atlas-more"><button type="button" class="ghost-button" data-action="atlas-show-all">Show all ${filtered.length} ingredients</button></div>` : ""}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function render() {
  const views = { dashboard: dashboardView, monitor: monitorView, simulator: simulatorView, knowledge: knowledgeExplorerView };
  // Keep keyboard focus on the same button across a re-render (background
  // updates such as GPT text or the forecast arriving must not drop focus).
  const active = document.activeElement;
  let focusSelector = null;
  if (active && app.contains(active) && (active.tagName === "BUTTON" || active.tagName === "A") && active.dataset?.action) {
    focusSelector = `[data-action="${CSS.escape(active.dataset.action)}"]`;
    for (const attr of ["key", "view", "profile", "concern", "value"]) if (active.dataset[attr]) focusSelector += `[data-${attr}="${CSS.escape(active.dataset[attr])}"]`;
  }
  let fieldFocus = null;
  if (active && app.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && active.id) {
    fieldFocus = { id: active.id, start: active.selectionStart, end: active.selectionEnd };
  }
  app.innerHTML = views[state.activeView]();
  if (focusSelector) app.querySelector(focusSelector)?.focus({ preventScroll: true });
  if (fieldFocus) {
    const field = document.getElementById(fieldFocus.id);
    if (field) { field.focus({ preventScroll: true }); try { field.setSelectionRange(fieldFocus.start, fieldFocus.end); } catch { /* not a text field */ } }
  }
  document.title = `DermaSynth | ${(VIEW_META[state.activeView] || VIEW_META.dashboard).title}`;
}

// ---- Motion ---------------------------------------------------------------
// State changes morph with the View Transitions API (spring timing in CSS);
// a new routine plays a one-off staggered entrance instead. Everything falls
// back to an instant render when the browser lacks the API or the user asks
// for reduced motion.
let viewTransitionBusy = false;
let deferredRender = null;

function prefersReducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

function renderAnimated({ entering = false } = {}) {
  if (entering) {
    state.animateEnter = true;
    state.enterUntil = Date.now() + 1100;
  }
  const finish = () => { render(); state.animateEnter = false; state.gptJustArrived = false; };
  if (entering || prefersReducedMotion() || typeof document.startViewTransition !== "function" || viewTransitionBusy) {
    finish();
    return Promise.resolve();
  }
  viewTransitionBusy = true;
  const transition = document.startViewTransition(finish);
  transition.finished.finally(() => { viewTransitionBusy = false; }).catch(() => {});
  return transition.updateCallbackDone.catch(() => {});
}

// Background updates wait until a running entrance has finished, so it is not
// cut short by a re-render.
function scheduleRender({ animated = false } = {}) {
  const wait = (state.enterUntil || 0) - Date.now();
  if (wait <= 0) return animated ? renderAnimated() : (render(), Promise.resolve());
  clearTimeout(deferredRender);
  return new Promise((resolve) => { deferredRender = setTimeout(() => { (animated ? renderAnimated() : (render(), Promise.resolve())).then(resolve); }, wait); });
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
  renderAnimated().then(() => settleViewNavigation({ focus, scroll }));
  if (view === "knowledge") {
    loadKnowledgeExplorer();
  }
  if (view === "monitor" && !state.expertView) refreshWeatherOutlook();
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
  </style></head><body><main><header class="masthead"><div><div class="mark">DermaSynth · Final-review research report</div><h1>Explainable category-preview record</h1><p>Environment inputs, category-only routine output, source links, deterministic guardrails, and configured contribution values in one printable artefact.</p></div><div class="stamp">Generated<strong>${escapeHtml(printReportDate())}</strong><br />Non-clinical research demonstrator</div></header><section><h2>Run boundary</h2><p class="lead">The report intentionally omits optional free-text safety context. It does not diagnose, prescribe, select a named ingredient, establish individual suitability, or replace qualified care.</p><span class="status">${escapeHtml(status)}</span><dl class="facts"><div><dt>Research context</dt><dd>${escapeHtml(concernOption().label)}</dd></div><div><dt>Profile input</dt><dd>${escapeHtml(state.profile)}</dd></div><div><dt>Evidence-sufficiency gate</dt><dd>${Number.isFinite(Number(grounding.sufficiencyScore)) ? `${grounding.passed ? "Passed" : "Not passed"} · ${escapeHtml(safelyNumber(grounding.sufficiencyScore))}` : "Not reported"}</dd></div><div><dt>CUE (model text)</dt><dd>${escapeHtml(cueSummary(grounding).value)}</dd></div></dl></section><section><h2>Labelled environment inputs</h2><p class="lead">${escapeHtml(locationLabel())} · ${escapeHtml(environmentModeLabel())} · ${escapeHtml(state.lastUpdated)}</p><div class="environment">${environmentRows}</div></section><section><h2>Category-only routine preview</h2><p class="lead">${escapeHtml(routine.label)}</p><div class="routine"><article><h3>Morning</h3><ol>${stepRows(routine.am)}</ol></article><article><h3>Evening</h3><ol>${stepRows(routine.pm)}</ol></article></div></section><section><h2>Deterministic guardrail trace</h2><p class="lead">${escapeHtml(String(safety.status || "Not reported").replaceAll("_", " "))}. The guardrail status is reported by the server; it is not a clinical safety guarantee.</p><ul class="checks">${safetyChecks.length ? safetyChecks.map((check) => `<li>${escapeHtml(check)}</li>`).join("") : "<li>No safety-check list was returned for this report.</li>"}</ul></section><section><h2>Configured environmental contribution view</h2><p class="lead">Exact Shapley values for the configured additive study-demo surrogate. Values explain this transparent study model only, not clinical causation.</p>${contributionRows ? `<table><thead><tr><th>Input</th><th>Reading</th><th>Shapley value</th><th>Direction</th></tr></thead><tbody>${contributionRows}</tbody></table>` : "<p class=\"lead\">No contribution values were returned for this run.</p>"}</section><section><h2>Source-linked research records</h2><p class="lead">Links are provided for final-review traceability. Their presence does not authorise a named ingredient, product, dose, frequency, compatibility, or treatment claim.</p><ul class="sources">${sourceNote}</ul></section><aside class="boundary"><strong>Scope declaration:</strong> this printable report documents a non-clinical technology demonstration. Category-source cards are source-mapped research context, remain pending qualified clinical review, and are excluded from the evidence-sufficiency gate, live category selection, ingredient activation, and routine selection.</aside><footer>DermaSynth · local final-review export · save through the browser print dialog if a PDF file is needed.</footer></main></body></html>`;
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
  const cueScore = payload?.grounding?.cue?.score;
  const cue = Number(cueScore === null || cueScore === undefined ? payload?.grounding?.sufficiencyScore : cueScore);
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
  if (action === "story-open") { openStory(); return; }
  if (action === "atlas-show-all") { state.atlasShowAll = true; renderAnimated(); return; }
  if (action === "story-close") { closeStory(); return; }
  if (action === "story-share") { shareStory(); return; }
  if (action === "story-download") { downloadStory(); return; }
  if (action === "reminders") { downloadReminders(); return; }
  if (action === "save-my-routine") { saveMyRoutine(); return; }
  if (action === "products-done") { state.editingProducts = false; writeStore(MY_ROUTINE_KEY, state.myRoutine); renderAnimated(); showToast("Saved."); return; }
  if (action === "clear-my-routine") { clearMyRoutine(); return; }
  if (action === "edit-form") { state.formCollapsed = false; renderAnimated().then(() => document.querySelector("#routine-preview")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" })); return; }
  if (action === "pc-run") { runProductCheck(); return; }
  if (action === "pc-focus") { focusProductCheck(); return; }
  if (action === "pc-example") { state.productCheck = { text: productCheckExample() }; runProductCheck(); return; }
  if (action === "pc-clear") { state.productCheck = { text: "" }; renderAnimated().then(() => document.querySelector("#pc-text")?.focus({ preventScroll: true })); return; }
  if (action === "checkin" || action === "checkin-follow") {
    const about = target.dataset.about === "yesterday" ? "yesterday" : "today";
    const draft = state.checkinDraft?.about === about ? { ...state.checkinDraft } : { about };
    if (action === "checkin") draft.rating = target.dataset.value; else draft.followed = target.dataset.value;
    state.checkinDraft = draft;
    if (draft.rating && draft.followed) { sendCheckin(about); return; }
    renderAnimated();
    return;
  }
  if (action === "presentation-start") { startPresentation(); return; }
  if (action === "presentation-close") { endPresentation(); return; }
  if (action === "presentation-back") { setPresentationStep(state.presentation.step - 1); return; }
  if (action === "presentation-next") { advancePresentation(); return; }
  if (action === "presentation-skip") { advancePresentation({ skipProof: true }); return; }
  if (action === "presentation-run") { generateRoutine(); return; }
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
  if (action === "use-my-location") { useMyLocation(); return; }
  if (action === "standard-routine") { showStandardRoutineNow(); return; }
  if (action === "comparison-location-search") { searchComparisonLocations(); return; }
  if (action === "comparison-location-select") { selectComparisonLocation(Number(target.dataset.comparisonLocationIndex)); return; }
  if (action === "comparison-refresh") { refreshComparisonContext(); return; }
  if (action === "profile") { if (state.runStatus === "running") return; state.profile = target.dataset.profile; resetPreviewForInputChange(); render(); return; }
  if (action === "concern-choice") { if (state.runStatus === "running") return; state.concern = target.dataset.concern; resetPreviewForInputChange(); render(); refreshExplainability({ shouldRender: true }); refreshComparisonContext(undefined, { announce: false }); return; }
  if (action === "simulate") { generateRoutine(); return; }
  if (action === "report-condition") { state.reportedConditions = { ...(state.reportedConditions || {}), [target.dataset.key]: target.dataset.value }; render(); return; }
  if (action === "toggle-expert") { state.expertView = !state.expertView; saveExpertView(state.expertView); render(); if (state.activeView === "monitor" && !state.expertView) refreshWeatherOutlook(); showToast(state.expertView ? "Expert view on: scores, traces and the run report are shown." : "Expert view off."); return; }
  if (action === "toggle-why") { const key = target.dataset.key; const opening = !state.openWhy[key]; state.openWhy = { ...state.openWhy, [key]: opening }; state.whyJustOpened = opening ? key : ""; renderAnimated().then(() => { state.whyJustOpened = ""; document.querySelector(`[data-action="toggle-why"][data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true }); }); return; }
  if (action === "submit-conditions") { generateRoutine({ reportedConditions: state.reportedConditions }); return; }
  if (action === "reason") { state.reasonOpen = !state.reasonOpen; render(); return; }
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
  if (target.dataset.action === "reviewer-source") { state.reviewer.selectedSourceId = target.value; render(); }
  if (target.dataset.action === "reviewer-action") { state.reviewer.action = target.value; render(); }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.dataset.action === "symptoms") {
    state.symptoms = target.value.slice(0, 280);
    return;
  }
  if (target.dataset.action === "pc-text") {
    state.productCheck = { ...(state.productCheck || {}), text: target.value.slice(0, 4000) };
    return;
  }
  if (target.dataset.action === "my-product" && state.myRoutine) {
    const value = target.value.replace(/[\u0000-\u001f]/g, "").slice(0, 60);
    state.myRoutine.products = { ...(state.myRoutine.products || {}) };
    if (value.trim()) state.myRoutine.products[target.dataset.key] = value; else delete state.myRoutine.products[target.dataset.key];
    writeStore(MY_ROUTINE_KEY, state.myRoutine);
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
    showToast("We couldn't get the weather for that place, so the previous readings are kept.");
    return;
  }

  state.locationQuery = state.selectedLocation.name;
  saveLocation(state.selectedLocation);
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

const LOCATION_STORAGE_KEY = "dermasynth.location.v1";

function loadSavedLocation() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(LOCATION_STORAGE_KEY) || "null");
    if (saved && Number.isFinite(Number(saved.lat)) && Number.isFinite(Number(saved.lon))) return { name: String(saved.name || "Your location").slice(0, 80), lat: Number(saved.lat), lon: Number(saved.lon) };
  } catch { /* storage unavailable */ }
  return null;
}

function saveLocation(location) {
  try { window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({ name: location.name, lat: location.lat, lon: location.lon })); } catch { /* storage unavailable */ }
}

// Current location from the browser (it asks the user first). Coordinates are
// rounded to ~1 km; the name comes from the server's reverse lookup.
async function useMyLocation({ silent = false } = {}) {
  if (!("geolocation" in navigator)) { if (!silent) showToast("This browser can't share your location. Search for your city instead."); return false; }
  if (!silent) { state.locationSearchNotice = "Finding your location…"; render(); }
  try {
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }));
    const lat = Math.round(position.coords.latitude * 100) / 100;
    const lon = Math.round(position.coords.longitude * 100) / 100;
    let name = "Your location";
    try {
      const reply = await fetch(`/api/locations/reverse?lat=${lat}&lon=${lon}`).then((r) => r.json());
      if (reply?.name) name = reply.name;
    } catch { /* keep the generic name */ }
    await applyLocation({ name, lat, lon });
    return true;
  } catch {
    try { window.localStorage.setItem(`${LOCATION_STORAGE_KEY}.asked`, "1"); } catch { /* ignore */ }
    if (!silent) { state.locationSearchNotice = "Location wasn't shared. Search for your city instead."; render(); }
    return false;
  }
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
    if (state.activeView === "monitor" && !state.expertView) refreshWeatherOutlook();
    if (announce) showToast(`${environmentModeLabel()} refreshed for ${state.selectedLocation.name}.`);
    return true;
  } catch {
    if (requestVersion !== state.environmentRequestVersion || locationVersion !== state.locationVersion) return false;
    render();
    if (announce) showToast("We couldn't refresh the weather, so the last readings are shown.");
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

// F2: the page never waits silently. After 25 s the user can keep waiting for
// GPT or get the standard (rule-based) routine at once.
const SLOW_ROUTINE_MS = 25_000;
let routineAbort = null;

function showStandardRoutineNow() {
  const reportedConditions = state.lastReportedConditions || null;
  if (routineAbort) routineAbort.abort();
  routineAbort = null;
  state.runStatus = "idle";
  state.runSlow = false;
  generateRoutine({ reportedConditions, standardRoutine: true });
}

async function generateRoutine({ reportedConditions = null, standardRoutine = false } = {}) {
  if (isLocationUpdating()) {
    showToast("Wait for the selected location's readings to finish updating.");
    return;
  }
  if (state.runStatus === "running") return;
  state.reasonOpen = false;
  const location = locationPayload();
  const symptoms = (state.symptoms || state.pendingSymptoms || "").trim().slice(0, 280);
  const locationVersion = state.locationVersion;
  const requestVersion = ++state.routineRequestVersion;
  state.runStatus = "running";
  state.runStartedAt = Date.now();
  state.runSlow = false;
  state.lastReportedConditions = reportedConditions;
  const controller = new AbortController();
  routineAbort = controller;
  const slowTimer = setTimeout(() => {
    if (requestVersion === state.routineRequestVersion && state.runStatus === "running") { state.runSlow = true; render(); }
  }, SLOW_ROUTINE_MS);
  render();
  try {
    const body = { profile: state.profile, concern: state.concern, location };
    if (standardRoutine) body.standardRoutine = true;
    if (state.finishPreference) body.finishPreference = state.finishPreference;
    if (state.reactivityLevel) body.reactivityLevel = state.reactivityLevel;
    if (state.exposureContext) body.exposureContext = state.exposureContext;
    if (symptoms) body.symptoms = symptoms;
    if (reportedConditions) body.reportedConditions = reportedConditions;
    const previous = previousRoutineForCompare();
    const usual = state.myRoutine?.steps?.length ? state.myRoutine.steps : null;
    if (usual || previous) body.compare = { ...(usual ? { usualSteps: usual } : {}), ...(previous ? { previous: { steps: previous.steps, readings: previous.readings, at: previous.at } } : {}) };
    // A replaced request can still hold the server's one in-flight slot for a
    // moment after it is cancelled; retry briefly on that specific 429.
    let response;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      response = await fetch("/api/routine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const retryAfter = Number(response.headers.get("retry-after"));
      if (response.status !== 429 || !(retryAfter > 0 && retryAfter <= 3)) break;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    clearTimeout(slowTimer);
    if (!response.ok) { const failure = new Error("Routine API is unavailable"); failure.status = response.status; throw failure; }
    const payload = await response.json();
    if (requestVersion !== state.routineRequestVersion || locationVersion !== state.locationVersion) return;
    state.generatedRoutine = payload.routine || null;
    state.routineMeta = payload;
    state.runStatus = "complete";
    // Keep the safety text only while we wait for the user's conditions, so
    // the resubmitted request is triaged again with the same text.
    state.pendingSymptoms = payload.status === "needs_conditions" ? symptoms : "";
    if (payload.status !== "needs_conditions") state.reportedConditions = null;
    state.symptoms = "";
    if (payload.environment) {
      state.environment = payload.environment;
      state.selectedLocation = locationPayload(payload.environment.location || state.selectedLocation);
      state.locationQuery = state.selectedLocation.name;
      state.lastUpdated = payload.environment.updatedAt || state.lastUpdated;
    }
    state.explainability = payload.explainability || state.explainability;
    recordRunSummary(payload, location);
    rememberRoutine(payload);
    state.productCheck = null;
    state.checkinDraft = null;
    state.editingProducts = false;
    state.formCollapsed = ["cleared", "review_required"].includes(payload.status);
    renderAnimated({ entering: true });
    requestAnimationFrame(scrollToResult);
    refreshRoutineContext();
    refreshOutlook();
    if (payload.status === "needs_conditions") {
      showToast("We couldn't get today's weather. Tell us the conditions to continue.");
    } else if (payload.status === "cleared") {
      showToast("Your routine is ready.");
    } else if (payload.status === "medical_redirect") {
      showToast("Please get your skin checked before starting a routine.");
    } else if (payload.synthesisStatus === "quota_unavailable") {
      showToast("Your routine is ready. Some personalised parts are unavailable right now.");
    } else {
      showToast("Your routine is ready.");
    }
  } catch (failure) {
    clearTimeout(slowTimer);
    if (failure?.name === "AbortError") return; // replaced by the standard-routine request
    if (requestVersion !== state.routineRequestVersion || locationVersion !== state.locationVersion) return;
    state.generatedRoutine = profileRoutines[state.concern] || profileRoutines.acne;
    state.routineMeta = {
      status: "review_required",
      mode: "local",
      errorKind: failure?.status === 429 || failure?.status === 503 ? "busy" : failure?.status === 400 ? "invalid" : "unreachable",
      safety: { status: "pending", checks: [], flags: [] },
      notices: ["The server could not be reached. This is a local generic research preview."],
    };
    state.runStatus = "error";
    state.symptoms = "";
    recordRunSummary(state.routineMeta, location);
    render();
    showToast(state.routineMeta?.errorKind === "busy" ? "Too many requests just now. Please wait a minute and try again." : "We couldn't reach DermaSynth. Check your connection and try again.");
  }
}

async function refreshRoutineContext() {
  const meta = state.routineMeta;
  const runId = meta?.routineContext?.runId || "";
  if (!runId) {
    state.routineContext = { runId: "", status: "idle", steps: {}, ingredients: {}, error: "", model: "" };
    return;
  }
  if (!meta.routineContext.available) {
    state.routineContext = { runId, status: "unavailable", steps: {}, ingredients: {}, error: meta.routineContext.reason || "GPT explanations are not available for this run.", model: "" };
    scheduleRender();
    return;
  }
  if (state.routineContext.runId === runId && ["loading", "available"].includes(state.routineContext.status)) return;
  state.routineContext = { runId, status: "loading", steps: {}, ingredients: {}, error: "", model: "" };
  const slowContextTimer = setTimeout(() => {
    if (state.routineContext.runId === runId && state.routineContext.status === "loading") { state.routineContext = { ...state.routineContext, slow: true }; scheduleRender(); }
  }, SLOW_ROUTINE_MS);
  scheduleRender();
  try {
    const response = await fetch("/api/ai/routine-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (state.routineContext.runId !== runId) return;
    if (!response.ok) throw new Error(payload?.error || "GPT explanations are unavailable.");
    state.routineContext = {
      runId,
      status: "available",
      steps: payload.steps || {},
      ingredients: payload.ingredients || {},
      withheld: Array.isArray(payload.withheld) ? payload.withheld : [],
      error: "",
      model: payload.model || "",
    };
    state.gptJustArrived = true;
    clearTimeout(slowContextTimer);
  } catch (error) {
    clearTimeout(slowContextTimer);
    if (state.routineContext.runId !== runId) return;
    state.routineContext = { runId, status: "error", steps: {}, ingredients: {}, error: error instanceof Error ? error.message : "GPT explanations are unavailable.", model: "" };
  }
  scheduleRender({ animated: true });
}

function gptTag(item) {
  const cue = item?.cue && Number.isFinite(Number(item.cue.score)) ? ` · CUE ${Number(item.cue.score).toFixed(2)}` : "";
  const model = state.routineContext?.model ? ` · ${escapeHtml(state.routineContext.model)}` : "";
  return `<span class="ingredient-rationale-tag">${icon("sparkles", 11)} GPT${escapeHtml(cue)}${model}</span>`;
}


state.myRoutine = readStore(MY_ROUTINE_KEY, null);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector("#story-modal")) { event.preventDefault(); closeStory(); }
  // Keep keyboard focus inside the story dialog while it is open.
  const modal = document.querySelector("#story-modal");
  if (event.key === "Tab" && modal) {
    const items = [...modal.querySelectorAll("button")];
    if (!items.length) return;
    const first = items[0]; const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

if (!window.location.hash || !viewFromHash()) window.history.replaceState(null, "", viewHash(state.activeView));
window.addEventListener("hashchange", applyRoute);
window.addEventListener("popstate", applyRoute);
render();
// Prime the demonstrator with labelled server data. Every call has a safe
// local/demo fallback, so the interface remains usable without provider keys.
// Start with the last location this browser used; on a first visit, ask for
// the current location (once) and fall back to Kuala Lumpur.
{
  const saved = loadSavedLocation();
  let askedBefore = false;
  try { askedBefore = window.localStorage.getItem(`${LOCATION_STORAGE_KEY}.asked`) === "1"; } catch { askedBefore = true; }
  if (saved) {
    state.selectedLocation = saved;
    state.locationQuery = saved.name;
    void refreshEnvironment(saved, { announce: false });
  } else {
    void refreshEnvironment(defaultLocation, { announce: false }).then(() => { if (!askedBefore) void useMyLocation({ silent: true }); });
  }
}
void refreshComparisonContext(state.comparison.selectedLocation, { announce: false });
if (state.activeView === "monitor" && !state.expertView) void refreshWeatherOutlook();
void loadKnowledgeExplorer();
void loadCorpusSummary();
