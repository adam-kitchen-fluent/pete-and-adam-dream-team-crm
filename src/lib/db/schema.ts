import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

// ── Accounts ──────────────────────────────────────────────────────────────────
// One row per facility. CMS-sourced rows use the CMS CCN as id.
export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    phone: text("phone"),
    facilityType: text("facility_type"), // 'SNF/NF' | 'ALF' | ...
    providerType: text("provider_type"), // raw CMS provider_type
    ownershipType: text("ownership_type"),
    certifiedBeds: integer("certified_beds"),
    avgDailyResidents: real("avg_daily_residents"),
    chainId: text("chain_id"),
    chainName: text("chain_name"),
    chainSize: integer("chain_size"),
    totalNursingTurnover: real("total_nursing_turnover"), // % annual
    rnTurnover: real("rn_turnover"),
    adminDepartures: integer("admin_departures"),
    ownershipChanged12mo: integer("ownership_changed_12mo"), // 0/1
    overallRating: integer("overall_rating"), // CMS 1-5 stars
    staffingRating: integer("staffing_rating"),
    qmRating: integer("qm_rating"),
    specialFocus: text("special_focus"),
    lat: real("lat"),
    lng: real("lng"),

    // Enrichment tri-states — populated by connectors (Apollo/Apify/LLM), 'unknown' until then
    pccStatus: text("pcc_status").default("unknown"), // 'on_pcc' | 'not_on_pcc' | 'unknown'
    opsMaturity: text("ops_maturity").default("unknown"), // 'manual' | 'digital' | 'unknown'
    donNewHire: text("don_new_hire").default("unknown"), // 'yes' | 'no' | 'unknown'
    donTechForward: text("don_tech_forward").default("unknown"),
    enrichmentSource: text("enrichment_source"), // 'simulated' | 'apollo' | 'apify' | 'llm'
    enrichedAt: text("enriched_at"),

    // Denormalized rubric score snapshot (recomputed on rubric change)
    score: integer("score"),
    scoreBand: text("score_band"), // 'hot' | 'warm' | 'cold' | 'disqualified'
    scoreBreakdown: text("score_breakdown"), // JSON FactorEval[]
    scoredAt: text("scored_at"),

    source: text("source").default("cms"),
    createdAt: text("created_at"),
    updatedAt: text("updated_at"),
  },
  (t) => [
    index("idx_accounts_state").on(t.state),
    index("idx_accounts_band").on(t.scoreBand),
    index("idx_accounts_score").on(t.score),
  ],
);

// ── Contacts (people) ─────────────────────────────────────────────────────────
export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    name: text("name").notNull(),
    title: text("title"),
    role: text("role"), // 'don' | 'administrator' | 'owner' | 'other'
    email: text("email"),
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    notes: text("notes"),
    source: text("source"), // 'seed' | 'apollo' | 'manual'
    createdAt: text("created_at"),
  },
  (t) => [index("idx_contacts_account").on(t.accountId)],
);

// ── Deals / opportunities ─────────────────────────────────────────────────────
export const deals = sqliteTable(
  "deals",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    name: text("name").notNull(),
    rep: text("rep").notNull(),
    stage: text("stage").notNull(), // prospect|discovery|demo|proposal|negotiation|closed_won|closed_lost
    value: integer("value"), // annual contract value, USD
    createdAt: text("created_at"),
    updatedAt: text("updated_at"),
    closedAt: text("closed_at"),
    scoreAtClose: integer("score_at_close"),
    rubricSnapshot: text("rubric_snapshot"), // JSON ScoreResult frozen at close
  },
  (t) => [index("idx_deals_account").on(t.accountId), index("idx_deals_stage").on(t.stage)],
);

// ── Post-mortems — the learning engine's fuel ─────────────────────────────────
export const postmortems = sqliteTable("postmortems", {
  id: text("id").primaryKey(),
  dealId: text("deal_id").notNull().unique(),
  outcome: text("outcome").notNull(), // 'won' | 'lost'
  fitAssessment: text("fit_assessment").notNull(), // 'good_fit' | 'bad_fit' | 'unsure'
  primaryReason: text("primary_reason").notNull(), // see REASONS in rubric/defaults
  competitor: text("competitor"),
  notes: text("notes"),
  createdAt: text("created_at"),
});

// ── Rubric ────────────────────────────────────────────────────────────────────
export const rubricFactors = sqliteTable("rubric_factors", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  description: text("description"),
  source: text("source"), // 'cms' | 'enrichment'
  kind: text("kind").notNull(), // 'points' | 'disqualifier'
  points: integer("points").notNull(), // may be negative (penalty); 0 for disqualifiers
  active: integer("active").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const rubricRevisions = sqliteTable("rubric_revisions", {
  id: text("id").primaryKey(),
  createdAt: text("created_at"),
  reason: text("reason"),
  changes: text("changes"), // JSON [{key, from, to}]
  approvedBy: text("approved_by"),
});

// ── Activity log (momentum + nudges) ──────────────────────────────────────────
export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    dealId: text("deal_id"),
    type: text("type").notNull(), // note|call|email|meeting|stage_change|system
    body: text("body"),
    rep: text("rep"),
    createdAt: text("created_at"),
  },
  (t) => [index("idx_activities_account").on(t.accountId)],
);

// ── Settings (key/value: turnover median, learning gate, etc.) ────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export type Account = typeof accounts.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type Postmortem = typeof postmortems.$inferSelect;
export type RubricFactor = typeof rubricFactors.$inferSelect;
export type Activity = typeof activities.$inferSelect;
