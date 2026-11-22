// Static data: the research pipeline steps, profile routines, concern options, the defence walkthrough
// steps and the incorporated ingredient list.

export const pipeline = [
  {
    id: "input",
    number: "01",
    name: "Input",
    meta: "Profile + environment",
    detail: "Profile context and current environmental readings are normalised before processing.",
  },
  {
    id: "triage",
    number: "02",
    name: "Triage",
    meta: "Intent + medical redirect",
    detail: "Potentially clinical intents are identified and redirected before any skincare advisory is generated.",
  },
  {
    id: "retrieval",
    number: "03",
    name: "Retrieval",
    meta: "Indexed evidence search",
    detail: "The server queries configured indexed evidence before it permits model synthesis.",
  },
  {
    id: "cue",
    number: "04",
    name: "Evidence + CUE",
    meta: "Sufficiency gate · CUE on model text",
    detail:
      "The model is only called when enough attributable evidence is retrieved (evidence-sufficiency gate). Any text the model writes must then score at least 0.80 on Context Utilisation Evaluation (supported claims / claims), or it is regenerated once and then withheld.",
  },
  {
    id: "safety",
    number: "05",
    name: "Safety",
    meta: "Deterministic passes + final rescan",
    detail:
      "Clinical redirect and restricted-content checks run before and after synthesis, and a post-selection pass rescans the final named ingredients (exclusions, incompatible pairs, photosensitisers in the morning, barrier guardrail).",
  },
  {
    id: "synthesis",
    number: "06",
    name: "Synthesis",
    meta: "Structured response",
    detail: "A server-only structured model response is allowed only after retrieval and safety gates pass.",
  },
];

export const profileRoutines = {
  acne: {
    label: "Breakout-prone appearance research preview",
    am: [
      ["Gentle cleansing category", "Low-irritation research context"],
      ["Light hydration category", "Supportive non-prescriptive category"],
      ["Daytime photoprotection category", "Research context only"],
    ],
    pm: [
      ["Gentle cleansing category", "Low-irritation research context"],
      ["Lightweight moisturising category", "Humidity-aware finish context"],
    ],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  barrier: {
    label: "Barrier comfort research preview",
    am: [
      ["Low-stripping cleansing category", "Research preview category"],
      ["Comfort-focused hydration category", "Non-prescriptive context"],
      ["Daytime photoprotection category", "Research context only"],
    ],
    pm: [
      ["Low-stripping cleansing category", "Research preview category"],
      ["Barrier-support moisturising category", "Research preview category"],
    ],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  pigment: {
    label: "Uneven-tone context research preview",
    am: [
      ["Gentle cleansing category", "Low-irritation research context"],
      ["Comfort-focused hydration category", "Non-prescriptive context"],
      ["Daytime photoprotection category", "Research context only"],
    ],
    pm: [
      ["Gentle cleansing category", "Low-irritation research context"],
      ["Supportive moisturising category", "Low-irritation support context"],
    ],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  dryness: {
    label: "Dry-feeling comfort research preview",
    am: [
      ["Comfort-focused cleansing category", "Low-stripping research context"],
      ["Hydration category", "Non-prescriptive comfort context"],
      ["Daytime photoprotection category", "Research context only"],
    ],
    pm: [
      ["Comfort-focused cleansing category", "Low-stripping research context"],
      ["Barrier-support moisturising category", "Research preview category"],
    ],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  oil: {
    label: "Oil/shine context research preview",
    am: [
      ["Gentle cleansing category", "Low-irritation research context"],
      ["Light hydration category", "Supportive non-prescriptive category"],
      ["Daytime photoprotection category", "Research context only"],
    ],
    pm: [
      ["Gentle cleansing category", "Low-irritation research context"],
      ["Lightweight moisturising category", "Humidity-aware finish context"],
    ],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  sensitivity: {
    label: "Sensitivity context research preview",
    am: [
      ["Low-stripping cleansing category", "Research preview category"],
      ["Comfort-focused hydration category", "Non-prescriptive context"],
      ["Daytime photoprotection category", "Research context only"],
    ],
    pm: [
      ["Low-stripping cleansing category", "Research preview category"],
      ["Barrier-support moisturising category", "Research preview category"],
    ],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  texture: {
    label: "Texture appearance research preview",
    am: [
      ["Gentle cleansing category", "Low-irritation research context"],
      ["Light hydration category", "Supportive non-prescriptive category"],
      ["Daytime photoprotection category", "Research context only"],
    ],
    pm: [
      ["Gentle cleansing category", "Low-irritation research context"],
      ["Supportive moisturising category", "Low-irritation support context"],
    ],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  redness: {
    label: "Redness-prone appearance research preview",
    am: [
      ["Low-irritation cleansing category", "Research preview category"],
      ["Comfort-focused hydration category", "Non-prescriptive context"],
      ["Daytime photoprotection category", "Research context only"],
    ],
    pm: [
      ["Low-irritation cleansing category", "Research preview category"],
      ["Barrier-support moisturising category", "Research preview category"],
    ],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  radiance: {
    label: "Dullness/radiance appearance research preview",
    am: [
      ["Gentle cleansing category", "Low-irritation research context"],
      ["Light hydration category", "Supportive non-prescriptive category"],
      ["Daytime photoprotection category", "Research context only"],
    ],
    pm: [
      ["Gentle cleansing category", "Low-irritation research context"],
      ["Supportive moisturising category", "Low-irritation support context"],
    ],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
  pores: {
    label: "Visible-pore appearance research preview",
    am: [
      ["Gentle cleansing category", "Low-irritation research context"],
      ["Light hydration category", "Supportive non-prescriptive category"],
      ["Daytime photoprotection category", "Research context only"],
    ],
    pm: [
      ["Gentle cleansing category", "Low-irritation research context"],
      ["Lightweight moisturising category", "Humidity-aware finish context"],
    ],
    reason: "This generic research preview is not a personalised treatment plan.",
  },
};

export const concernOptions = [
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

export const presentationSteps = Object.freeze([
  {
    view: "monitor",
    anchor: "monitor-location",
    eyebrow: "01 · Location",
    title: "Set the environmental context",
    detail:
      "Kuala Lumpur is ready as the demonstrator context, or search for a city or area. Selected coordinates are used only for labelled weather and air-quality readings.",
  },
  {
    view: "monitor",
    anchor: "monitor-readings",
    eyebrow: "02 · Environment",
    title: "Inspect the measured inputs",
    detail:
      "Read UV, humidity, temperature, and PM2.5 as context inputs. They are not skin measurements or medical outcomes.",
  },
  {
    view: "simulator",
    anchor: "routine-preview",
    requiresRun: true,
    eyebrow: "03 · Routine",
    title: "Run the gated category preview",
    detail:
      "The routine remains broad and category-only. Retrieval, the evidence-coverage gate, and deterministic safety checks are shown separately.",
  },
  {
    view: "knowledge",
    anchor: "relationship-explorer-title",
    eyebrow: "04 · Ingredient evidence",
    title: "Trace the research Atlas",
    detail:
      "Browse source-linked ingredient metadata and the isolated non-clinical context cards without turning a source map into a treatment rule.",
  },
]);

export const INCORPORATED_INGREDIENTS = Object.freeze([
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
