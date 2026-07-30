// Rubric v1 — founder assumptions from the Jul 30 Pete/Adam session.
// The learning engine's whole job is to correct these weights from deal outcomes.

export const DEFAULT_FACTORS = [
  {
    key: "bed_sweet_spot",
    label: "50–300 certified beds",
    description: "American Data's sweet spot: big enough to pay, small enough to move.",
    source: "cms",
    kind: "points",
    points: 20,
    sortOrder: 1,
  },
  {
    key: "facility_type_fit",
    label: "SNF / nursing facility",
    description: "Skilled nursing or nursing facility (ALFs enter via Apify later).",
    source: "cms",
    kind: "points",
    points: 10,
    sortOrder: 2,
  },
  {
    key: "independent_or_small_chain",
    label: "Independent or small chain (≤10)",
    description: "No chain affiliation, or a chain of 10 or fewer facilities.",
    source: "cms",
    kind: "points",
    points: 15,
    sortOrder: 3,
  },
  {
    key: "not_on_pcc",
    label: "Not on PointClickCare",
    description: "PCC is near-undisplaceable. Detected from job postings / tech mentions.",
    source: "enrichment",
    kind: "points",
    points: 25,
    sortOrder: 4,
  },
  {
    key: "manual_ops",
    label: "Manual / Excel-based ops",
    description: "Greenfield: still on paper or spreadsheets — easiest conversion.",
    source: "enrichment",
    kind: "points",
    points: 15,
    sortOrder: 5,
  },
  {
    key: "new_don",
    label: "New Director of Nursing (~6 mo)",
    description: "New DONs pick tech stacks. Prime timing signal.",
    source: "enrichment",
    kind: "points",
    points: 20,
    sortOrder: 6,
  },
  {
    key: "high_turnover",
    label: "Above-median nursing turnover",
    description: "Churn means new decision-makers and openness to change.",
    source: "cms",
    kind: "points",
    points: 10,
    sortOrder: 7,
  },
  {
    key: "admin_churn",
    label: "≥2 administrator departures",
    description: "CMS-reported administrator departures — leadership in flux.",
    source: "cms",
    kind: "points",
    points: 10,
    sortOrder: 8,
  },
  {
    key: "tech_forward_don",
    label: "Tech-forward DON profile",
    description: "Soft signal from LinkedIn profile (LLM read).",
    source: "enrichment",
    kind: "points",
    points: 5,
    sortOrder: 9,
  },
  {
    key: "recent_ownership_change",
    label: "Ownership changed in last 12 mo",
    description: "Rollup risk — may be mid-acquisition by a PCC-standardized chain.",
    source: "cms",
    kind: "points",
    points: -10,
    sortOrder: 10,
  },
  {
    key: "pe_rollup",
    label: "Large chain / PE rollup (>20 facilities)",
    description: "Big chains standardize on PointClickCare. Hard disqualifier.",
    source: "cms",
    kind: "disqualifier",
    points: 0,
    sortOrder: 11,
  },
] as const;

export const SCORE_BANDS = { hot: 70, warm: 40 } as const;

// Post-mortem primary reasons (user-specified taxonomy)
export const POSTMORTEM_REASONS = {
  lost: [
    { key: "lost_to_competitor", label: "Good fit — lost to competitor" },
    { key: "bad_fit", label: "Bad fit — shouldn't have pursued" },
    { key: "pricing", label: "Pricing issue" },
    { key: "timing_budget", label: "Timing / no budget" },
    { key: "champion_left", label: "Champion left" },
    { key: "went_dark", label: "Went dark" },
  ],
  won: [
    { key: "won_displaced_competitor", label: "Displaced a competitor" },
    { key: "won_greenfield", label: "Greenfield (manual/Excel replacement)" },
    { key: "won_relationship", label: "Relationship-driven" },
  ],
} as const;

export const STAGES = [
  "prospect",
  "discovery",
  "demo",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;

export const STAGE_WEIGHTS: Record<string, number> = {
  prospect: 0.05,
  discovery: 0.15,
  demo: 0.3,
  proposal: 0.5,
  negotiation: 0.7,
  closed_won: 1,
  closed_lost: 0,
};

// Learning engine gate: proposals unlock only past this many closed deals w/ post-mortems
export const LEARNING_GATE = 50;
