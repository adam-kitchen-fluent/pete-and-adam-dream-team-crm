// Seed demo data: simulated enrichment (pending Apollo/Apify keys), contacts,
// open pipeline deals, and ~80 historical closed deals WITH post-mortems so the
// learning engine has fuel on day one. Deterministic (seeded RNG) — rebuildable.
// Usage: npm run seed  (after npm run ingest)
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  accounts,
  activities,
  contacts,
  deals,
  postmortems,
  rubricFactors,
  settings,
} from "../src/lib/db/schema";
import { computeScore } from "../src/lib/rubric/engine";
import { getScoreContext, rescoreAccounts } from "../src/lib/rubric/score-accounts";

// ── Deterministic RNG ─────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260730);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
const uuid = () => crypto.randomUUID();

const REPS = ["Pete Blanchard", "Adam Kitchen", "Jordan Lee"] as const;
const FIRST = ["Maria", "James", "Tanya", "Robert", "Aisha", "Daniel", "Karen", "Luis", "Emily", "Marcus", "Susan", "Kevin", "Angela", "Brian", "Nicole", "Derek"];
const LAST = ["Alvarez", "Thompson", "Nguyen", "Okafor", "Miller", "Johnson", "Patel", "Brooks", "Kowalski", "Reed", "Sanchez", "Kim", "Foster", "Hughes", "Bennett", "Carter"];

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

async function main() {
  console.log("→ Seeding demo data…");

  // Idempotency: wipe previously seeded artifacts
  await db.delete(postmortems);
  await db.delete(deals);
  await db.delete(activities);
  await db.delete(contacts).where(eq(contacts.source, "seed"));

  // ── 1. Simulated enrichment for ~500 plausible targets ─────────────────────
  // Marked enrichmentSource='simulated' — flips to live once Apollo/Apify keys land.
  const candidates = await db
    .select()
    .from(accounts)
    .where(
      and(
        gte(accounts.certifiedBeds, 40),
        lte(accounts.certifiedBeds, 350),
        sql`(${accounts.chainSize} IS NULL OR ${accounts.chainSize} <= 12)`,
      ),
    )
    .orderBy(sql`RANDOM()`)
    .limit(500);

  const now = new Date().toISOString();
  for (const a of candidates) {
    await db
      .update(accounts)
      .set({
        pccStatus: chance(0.55) ? "not_on_pcc" : chance(0.6) ? "on_pcc" : "unknown",
        opsMaturity: chance(0.4) ? "manual" : chance(0.5) ? "digital" : "unknown",
        donNewHire: chance(0.18) ? "yes" : chance(0.7) ? "no" : "unknown",
        donTechForward: chance(0.22) ? "yes" : chance(0.5) ? "no" : "unknown",
        enrichmentSource: "simulated",
        enrichedAt: now,
        updatedAt: now,
      })
      .where(eq(accounts.id, a.id));
  }
  console.log(`   enriched (simulated): ${candidates.length} accounts`);
  await rescoreAccounts(candidates.map((c) => c.id));

  // Reload with fresh scores
  const enriched = await db
    .select()
    .from(accounts)
    .where(inArray(accounts.id, candidates.map((c) => c.id)));
  const factors = await db.select().from(rubricFactors);
  const ctx = await getScoreContext();

  // ── 2. Contacts for enriched accounts ──────────────────────────────────────
  let contactCount = 0;
  for (const a of enriched.slice(0, 120)) {
    const donName = `${pick(FIRST)} ${pick(LAST)}`;
    const adminName = `${pick(FIRST)} ${pick(LAST)}`;
    const domain = a.name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 18) || "facility";
    await db.insert(contacts).values([
      {
        id: uuid(),
        accountId: a.id,
        name: donName,
        title: "Director of Nursing",
        role: "don",
        email: `${donName.toLowerCase().replace(" ", ".")}@${domain}.example.com`,
        source: "seed",
        createdAt: now,
      },
      {
        id: uuid(),
        accountId: a.id,
        name: adminName,
        title: "Administrator",
        role: "administrator",
        email: `${adminName.toLowerCase().replace(" ", ".")}@${domain}.example.com`,
        source: "seed",
        createdAt: now,
      },
    ]);
    contactCount += 2;
  }
  console.log(`   contacts: ${contactCount}`);

  // ── 3. Historical closed deals + post-mortems (learning-engine fuel) ───────
  // Outcome probability correlates with rubric score + noise; post-mortem reasons
  // are consistent with the account's factor profile.
  const historyPool = [...enriched].sort(() => rand() - 0.5).slice(0, 80);
  let won = 0,
    lost = 0;
  for (const a of historyPool) {
    const result = computeScore(a, factors, ctx);
    const score = result.score;
    const createdDays = 90 + Math.floor(rand() * 450); // opened 3–18 months ago
    const cycleDays = 30 + Math.floor(rand() * 120);
    const closedDays = Math.max(7, createdDays - cycleDays);

    const pWin = result.disqualified ? 0.05 : Math.min(0.85, 0.1 + 0.75 * Math.pow(score / 100, 1.4));
    const isWon = chance(pWin);

    const beds = a.certifiedBeds ?? 100;
    const value = Math.round((beds * (300 + rand() * 300)) / 500) * 500;

    const dealId = uuid();
    await db.insert(deals).values({
      id: dealId,
      accountId: a.id,
      name: `${a.name} — EMR`,
      rep: pick(REPS),
      stage: isWon ? "closed_won" : "closed_lost",
      value,
      createdAt: daysAgo(createdDays),
      updatedAt: daysAgo(closedDays),
      closedAt: daysAgo(closedDays),
      scoreAtClose: score,
      rubricSnapshot: JSON.stringify(result),
    });

    // Post-mortem consistent with profile
    const onPcc = a.pccStatus === "on_pcc";
    const bigChain = (a.chainSize ?? 0) > 20;
    const manual = a.opsMaturity === "manual";
    let primaryReason: string;
    let competitor: string | null = null;
    let fit: string;
    if (isWon) {
      primaryReason = onPcc ? "won_displaced_competitor" : manual ? "won_greenfield" : chance(0.5) ? "won_relationship" : "won_greenfield";
      if (onPcc) competitor = "PointClickCare";
      fit = score >= 55 ? "good_fit" : chance(0.7) ? "good_fit" : "unsure";
      won++;
    } else {
      if (bigChain || onPcc) {
        primaryReason = "lost_to_competitor";
        competitor = "PointClickCare";
        fit = bigChain ? "bad_fit" : "good_fit";
      } else if (score < 35) {
        primaryReason = chance(0.6) ? "bad_fit" : "went_dark";
        fit = "bad_fit";
      } else {
        primaryReason = pick(["pricing", "timing_budget", "champion_left", "went_dark"] as const);
        fit = score >= 60 ? "good_fit" : "unsure";
        if (primaryReason === "pricing" && chance(0.5)) competitor = pick(["MatrixCare", "Netsmart", "PointClickCare"] as const);
      }
      lost++;
    }
    await db.insert(postmortems).values({
      id: uuid(),
      dealId,
      outcome: isWon ? "won" : "lost",
      fitAssessment: fit,
      primaryReason,
      competitor,
      notes: null,
      createdAt: daysAgo(closedDays),
    });
  }
  console.log(`   historical deals: ${historyPool.length} (${won} won / ${lost} lost)`);

  // ── 4. Open pipeline ───────────────────────────────────────────────────────
  const openPool = enriched
    .filter((a) => (a.score ?? 0) >= 40 && !historyPool.some((h) => h.id === a.id))
    .sort((x, y) => (y.score ?? 0) - (x.score ?? 0))
    .slice(0, 18);
  const stages = ["prospect", "discovery", "demo", "proposal", "negotiation"] as const;
  let open = 0;
  for (const a of openPool) {
    const stage = pick(stages);
    const beds = a.certifiedBeds ?? 100;
    const value = Math.round((beds * (300 + rand() * 300)) / 500) * 500;
    const createdDays = 5 + Math.floor(rand() * 80);
    const dealId = uuid();
    const rep = pick(REPS);
    // Momentum split: some deals active (recent touch), some stale → nudge material
    const lastTouchDays = chance(0.55) ? Math.floor(rand() * 6) : 10 + Math.floor(rand() * 25);
    await db.insert(deals).values({
      id: dealId,
      accountId: a.id,
      name: `${a.name} — EMR`,
      rep,
      stage,
      value,
      createdAt: daysAgo(createdDays),
      updatedAt: daysAgo(lastTouchDays),
    });
    await db.insert(activities).values({
      id: uuid(),
      accountId: a.id,
      dealId,
      type: pick(["call", "email", "meeting"] as const),
      body: pick([
        "Intro call with DON — walked through med-pass workflow pain.",
        "Sent pricing one-pager; awaiting committee review.",
        "Demo of clinical charting module; strong reaction to MDS tooling.",
        "Followed up on state survey prep timeline.",
        "Administrator asked for references from similar-size facilities.",
      ] as const),
      rep,
      createdAt: daysAgo(lastTouchDays),
    });
    open++;
  }
  console.log(`   open deals: ${open}`);

  // Learning gate marker
  await db
    .insert(settings)
    .values({ key: "learning_min_deals", value: "50" })
    .onConflictDoNothing();

  console.log("✓ Seed complete.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
