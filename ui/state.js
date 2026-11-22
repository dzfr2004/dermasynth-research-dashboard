// App state: the single `state` object every view reads, the default location and demo readings, the
// page routes (#routine, #environment …) and small localStorage helpers.

export const defaultLocation = Object.freeze({
  name: "Kuala Lumpur, MY",
  lat: 3.139,
  lon: 101.6869,
});

export const VIEW_META = Object.freeze({
  dashboard: { title: "Overview", subtitle: "Source-linked skincare research intelligence", hash: "overview" },
  monitor: { title: "Environment", subtitle: "Live location-aware research context", hash: "environment" },
  simulator: { title: "Your routine", subtitle: "Today's skincare routine", hash: "routine" },
  knowledge: { title: "Ingredient Atlas", subtitle: "Source-linked research records", hash: "atlas" },
  shelf: { title: "My shelf", subtitle: "The products you own", hash: "shelf" },
});

export function viewFromHash() {
  if (typeof window === "undefined") return "dashboard";
  const requested = String(window.location.hash || "")
    .replace(/^#/, "")
    .trim()
    .toLowerCase();
  // G1: with no page in the address, consumers land on their routine and
  // the expert view lands on the research overview.
  if (!requested) return loadExpertView() ? "dashboard" : "simulator";
  return Object.entries(VIEW_META).find(([, meta]) => meta.hash === requested)?.[0] || null;
}

export function viewHash(view) {
  return `#${VIEW_META[view]?.hash || VIEW_META.dashboard.hash}`;
}

export const demoEnvironment = {
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

export const RUN_HISTORY_STORAGE_KEY = "dermasynth.deidentified-run-history.v1";

export const EXPERT_VIEW_STORAGE_KEY = "dermasynth.expert-view.v1";

// G1: the app opens in the consumer view; the expert view (scores, traces,
// run report) is one toggle away and remembered in this browser only.
export function loadExpertView() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(EXPERT_VIEW_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveExpertView(value) {
  try {
    window.localStorage.setItem(EXPERT_VIEW_STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

export function loadRunHistory() {
  try {
    const saved = typeof window === "undefined" ? null : window.localStorage.getItem(RUN_HISTORY_STORAGE_KEY);
    const history = JSON.parse(saved || "[]");
    return Array.isArray(history) ? history.slice(0, 12).filter((item) => item && typeof item === "object") : [];
  } catch {
    return [];
  }
}

export const state = {
  activeView: viewFromHash() || "dashboard",
  selectedStage: null,
  profile: "combination",
  finishPreference: "",
  reactivityLevel: "",
  exposureContext: "mixed",
  concern: "acne",
  // Up to MAX_CONCERNS picks; the first is the main concern (kept in sync
  // with state.concern, which older code paths still read).
  concerns: ["acne"],
  shelf: [],
  shelfCheck: null,
  shelfCheckStatus: "idle",
  shelfEditor: null,
  shelfSelected: null,
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
  week: { status: "idle" },
  resultView: "today",
  selectedLocation: { ...defaultLocation },
  locationQuery: "",
  locationResults: [],
  locationSearchStatus: "idle",
  locationSearchNotice: "",
  locationSearchVersion: 0,
  locationSearchController: null,
  locationVersion: 0,
  environmentRequestVersion: 0,
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
  explainability: null,
};

// ---- Impact features (1-10) -----------------------------------------------
export const MY_ROUTINE_KEY = "dermasynth.my-routine.v1";

export const LAST_ROUTINE_KEY = "dermasynth.last-routine.v1";

export const CHECKIN_KEY = "dermasynth.checkins.v1";

export function readStore(key, fallback) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}
