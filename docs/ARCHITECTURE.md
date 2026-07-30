# Intelligence CRM for American Data — Architecture v2

> **One-liner:** A CRM that knows what a winnable nursing home looks like, finds them,
> scores them transparently, and gets sharper every time a deal closes or dies.

**Customer persona:** American Data — B2B SaaS vendor of a nursing-home EMR suite.
**Their ICP:** US skilled-nursing facilities (SNFs) and assisted-living facilities (ALFs),
~50–300 beds, independent or small chains, **not** on PointClickCare, ideally still
manual/Excel-based. PE-rolled-up chains are a hard disqualifier (they standardize on PCC).

## 1. Core concept: the rubric is the soul of the product

A **deterministic, transparent ICP rubric** (Clay-style): named yes/no factors with point
values. Every account gets a 0–100 score with a full per-factor breakdown — no black box.
Factor weights start as founder assumptions and are **retuned from empirical deal outcomes**
via the learning engine (below). Everything else — enrichment, nudges, forecast, chatbot —
hangs off this score.

### Rubric v1 (assumptions — the learning engine's job is to correct these)

| Key | Signal | Source | Points |
|---|---|---|---|
| `bed_sweet_spot` | 50–300 certified beds | CMS | +20 |
| `facility_type_fit` | SNF or ALF | CMS | +10 |
| `independent_or_small_chain` | No chain affiliation, or chain ≤ 10 facilities | CMS (affiliated entity) | +15 |
| `not_on_pcc` | Not using PointClickCare | enrichment (job posts / tech mentions) — **stub** | +25 |
| `manual_ops` | Still manual / Excel-based ops | enrichment — **stub** | +15 |
| `new_don` | New Director of Nursing in last ~6 mo | LinkedIn/Apollo — **stub**; CMS admin-departure count as proxy | +20 |
| `high_turnover` | Total nursing staff turnover above national median | CMS | +10 |
| `admin_churn` | ≥ 2 administrator departures reported | CMS | +10 |
| `tech_forward_don` | DON profile reads tech-forward | LLM read of profile — **stub** | +5 |
| `pe_rollup` | Large chain (> 20 facilities) / PE-owned | CMS chain size + ownership | **disqualifier** |
| `recent_ownership_change` | Ownership changed in last 12 mo (rollup risk) | CMS | −10 |

Score bands: **hot ≥ 70 · warm 40–69 · cold < 40 · disqualified** (any strike).

## 2. Data strategy (CMS-first)

1. **CMS Care Compare provider data** (free, public, ~14k certified nursing homes):
   beds, facility type, ownership type, chain affiliation, staffing turnover,
   administrator departures, ownership changes, star ratings. This seeds the **entire
   account universe with most of the rubric pre-populated** — deterministic and $0.
2. **Apollo** *(stubbed — waiting on key)*: contacts layer — find the DON/administrator,
   emails, LinkedIn; employee counts.
3. **Apify / Google Maps** *(stubbed — waiting on key)*: gap-filler for ALFs, which are
   state-regulated and thin in CMS data.
4. **LLM enrichment** (Anthropic): only for fuzzy signals — PCC detection from job
   postings, "tech-forward DON" reads, news.

All connectors implement one interface (`src/lib/connectors/types.ts`) so swapping
stub → live is a drop-in.

## 3. Learning engine (post-mortem driven)

- Closing a deal (won **or** lost) requires a lightweight **post-mortem**: outcome,
  fit assessment (good fit / bad fit / unsure), primary reason
  (`lost_to_competitor · bad_fit · pricing · timing_budget · champion_left · went_dark ·
  won_displaced_competitor · won_greenfield · won_relationship`), competitor if any,
  free-text notes. The account's **rubric snapshot is frozen onto the deal at close**.
- Admin **Learning view**: per factor, win-rate among closed deals *with* the factor vs
  *without* → lift → **proposed** weight adjustment.
- **Gate:** proposals unlock only after ≥ 50 closed deals with post-mortems (manual-review
  critical mass). A human approves every weight change; nothing auto-mutates. Full history kept.
- Post-mortem *reasons* feed back too: e.g., repeated `bad_fit` losses sharing a factor
  profile push that profile's weights down even when the rubric scored them hot.
- **Demo:** seed ~80 simulated historical closed deals with plausible outcome/factor
  correlations so the retuning moment is showable live.

## 4. Rep experience (nudges, not homework)

- **Pipeline efficiency:** each rep's open deals ranked by score × stage-weighted value;
  warnings when time is going to low-score accounts ("efficiency score").
- **Relationship override:** an engaged, progressing deal is never auto-deprioritized by
  rubric score alone — momentum (recent activity) beats static score; flags, not blocks.
- **Nudges feed:** "New DON at Maplewood Care (score 82) — reach out this week", with the
  *why* attached.

## 5. MVP scope (hackathon)

**Must:** accounts / people / deals tables · pipeline view · enrichment/search view over
the CMS-seeded universe ranked by rubric score · account detail with score breakdown ·
rubric admin (edit weights) · post-mortem flow on deal close · learning view with
simulated history · NL chatbot over the data (Anthropic).
**Nice:** weighted forecast, funnel, nudges feed, live Apollo pulls.
**Later (Adam, downstream):** auto-generated **HTML pitch book** per account for sales
meetings — consumes the same account + signals + competitive data. Parked for brainstorm.

## 6. Stack & repo layout

- **Next.js 15 (App Router) + TypeScript + Tailwind** — hand-rolled UI components (no
  component-lib yak-shaving)
- **SQLite via Drizzle ORM** (`data/crm.db`, gitignored; rebuildable from `npm run ingest` + `npm run seed`)
- **Anthropic API** for chatbot + fuzzy enrichment; key in `.env.local` (gitignored — see `.env.example`)
- `scripts/ingest-cms.ts` — pulls CMS provider data → accounts
- `scripts/seed.ts` — rubric v1, simulated reps/deals/post-mortems
- `src/lib/rubric/` — scoring engine (pure functions, unit-testable)
- `src/lib/connectors/` — `cms.ts` (live), `apollo.ts` / `apify.ts` (typed stubs)

## 7. Division of labor (proposed)

- **Pete + Claude (now):** CRM core — data layer, CMS ingest, rubric engine, learning
  loop, CRM views, chatbot.
- **Adam (on return):** pitch-book generator + Apollo/Apify keys → flip stubs live.
- Solo-building window = commits straight to `main`; revisit branch/PR flow when both are
  building.
