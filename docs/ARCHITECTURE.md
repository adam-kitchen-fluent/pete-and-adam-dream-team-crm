# Fluent Intelligence CRM — Architecture & Build Plan

> **Thesis:** Not a contact database. A CRM that *thinks ahead of the rep* — every
> account is continuously enriched from live web signals, scored for likelihood to
> convert, and turned into ranked next-best-actions that agents can execute.

Maps directly to the build brief:

| Brief | System component |
|---|---|
| Predictive scoring — rank prospects by likelihood to convert | **Scoring engine** (hybrid model + explainable factors) |
| Competitive market analysis — win / lose / get undercut | **Competitive Intelligence agent** + market rollup |
| Next-best action — tell reps what to do next, and why | **Next-Best-Action agent** (rationale-first) |
| Auto-enriched records — live signals from the open web | **Enrichment pipeline** (live web search + fetch + extract) |
| As agentic as possible — take action, not just suggest | **Action-executor agents** behind an approval gate |

---

## 1. Stack

- **Next.js 15 (App Router) + TypeScript** — app + API routes + server actions
- **Tailwind + shadcn/ui** — UI system
- **Drizzle ORM** — SQLite (libSQL) for local dev, **Postgres (Neon)** for deploy
- **Anthropic Claude API** — agent reasoning (Opus for orchestration/NBA, Sonnet for high-volume extraction). Model choice per agent; see `claude-api` reference before wiring.
- **Live web enrichment** — web search + page fetch. *Decision pending:* Anthropic
  native web-search tool (single vendor) vs **Exa/Tavily** (structured results, better
  for extraction). Leaning Exa for search + fetch for content.
- **Durable job runner** — **Inngest** for enrichment/scoring sweeps (survives restarts,
  gives us the agent-run audit trail for free). Simple cron fallback for the prototype.
- **Streaming** — Vercel AI SDK / raw Anthropic streaming for live agent-run traces.

## 2. Data model (core entities)

- **Account** — company: name, domain, industry, size, region, stage, owner, icpFit
- **Contact** — person at an account
- **Signal** — one enrichment fact from the web:
  `{ accountId, type, title, summary, sourceUrl, publishedAt, fetchedAt, importance, sentiment, rawExcerpt }`
  Types: `funding · hiring · leadership_change · product_launch · competitor_mention ·
  layoffs · expansion · earnings · tech_stack · news · review · social`.
  **Every signal carries its source URL + fetch timestamp — no unsourced claims.**
- **Score** — `{ accountId, value 0–100, band hot/warm/cold, computedAt, factors[] }`
  where each factor has `{ label, weight, contribution, explanation }`.
- **CompetitiveInsight** — `{ accountId, competitor, position winning|losing|undercut,
  evidenceSignalIds[], recommendation }`.
- **NextBestAction** — `{ accountId, type, title, rationale, priority,
  status suggested|approved|executing|done|failed, payload, agentRunId }`.
- **AgentRun** — `{ id, agentType, accountId, trigger, status, steps[], tokensUsed,
  startedAt, finishedAt, output }` — every tool call + observation logged for trust.

## 3. Agent architecture (the "agentic" core)

A small fleet, orchestrated per-account or per-sweep:

1. **Enrichment agent** — given name + domain, runs live web searches, fetches pages,
   extracts structured `Signal`s, dedupes against existing, writes to the record.
   On-demand button first, then scheduled sweeps.
2. **Scoring agent** — hybrid: a deterministic, explainable feature model (recency ×
   weight of signals — funding ↑, layoffs ↓, relevant hiring ↑, competitor displacement
   risk ↓, ICP fit) + an LLM adjustment layer. Emits 0–100 + per-factor contributions +
   a plain-English "why". This *is* the predictive ranking.
3. **Competitive-intelligence agent** — targeted research for competitor mentions,
   pricing, review-site comparisons, tech stack → per-account `CompetitiveInsight`s and a
   market-level win/lose/undercut rollup.
4. **Next-best-action agent** — consumes score + signals + competitive position + deal
   stage → a *ranked* list of concrete actions, each with a rationale
   ("send case study X — they just raised a Series B and are hiring 5 SDRs").
5. **Action-executor agents** — turn approved actions into real side effects: draft &
   (on approval) send outreach, draft LinkedIn message, create follow-up task, generate a
   deal battle-card / one-pager, update record fields.

**Orchestrator** fans out enrichment → scoring → competitive → NBA per account, then
stages actions. Built on the durable runner so sweeps survive restarts.

### Autonomy & safety gate
- **Autonomous (reversible/internal):** enrichment, scoring, generating drafts &
  battle-cards, creating internal tasks, updating record fields.
- **Approval-gated (outbound/irreversible):** sending any email/message, anything that
  leaves the system. Staged for one-click rep approval — never sent silently.
- Full agent-run audit log + every fact sourced + factor-level score explainability =
  a CRM a rep can actually trust.

## 4. Screens

1. **Pipeline / ranking** — accounts ranked by predictive score: band, top signal, and the
   #1 next-best-action inline. The money view.
2. **Account detail** — enriched record: overview · live signal timeline (with sources) ·
   score breakdown (factor bars) · competitive position · ranked NBAs with "Approve & run"
   · agent-run trace.
3. **Competitive intelligence** — market view of win / lose / undercut by competitor, with
   evidence.
4. **Agent activity feed** — live streaming runs, staged actions awaiting approval, audit trail.
5. **Command bar** — NL over the fleet: "Enrich Acme", "Who's most likely to convert this
   week?", "Draft outreach for the top 3".

## 5. Phased build plan

- **Phase 0 — Scaffold.** Next.js + TS + Tailwind + shadcn; Drizzle + SQLite; env for
  Claude + search keys; seed a handful of *real* target accounts (name + domain only —
  everything else gets enriched live).
- **Phase 1 — Enrichment pipeline (live web).** Enrichment agent + account detail with
  sourced signal timeline. On-demand "Enrich" first.
- **Phase 2 — Predictive scoring.** Feature extraction → hybrid score → explainable
  factors → pipeline ranking view.
- **Phase 3 — Competitive intelligence.** Competitive agent + market view.
- **Phase 4 — Next-best-action + execution.** NBA agent; action staging + approval gate;
  executors (draft email, create task, battle-card); live agent activity feed.
- **Phase 5 — Command bar + polish + deploy.** NL command bar; streaming; demo seed;
  Vercel + Neon.

## 6. Open decisions (need a call before Phase 1)

1. **Search provider** — Anthropic native web search vs Exa/Tavily. *(Recommend Exa.)*
2. **Job runner** — Inngest vs simple cron for the prototype. *(Recommend Inngest.)*
3. **DB target** — SQLite-only for the demo vs Postgres/Neon from day one. *(Recommend
   SQLite local, Postgres on deploy.)*
4. **API keys** — need an Anthropic key + a search-provider key in `.env`.
