// Recompute + persist rubric scores. Used by ingest, seed, and rubric-admin actions.
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { accounts, rubricFactors, settings } from "../db/schema";
import { computeScore, type ScoreContext } from "./engine";

export async function getScoreContext(): Promise<ScoreContext> {
  const row = await db.select().from(settings).where(eq(settings.key, "turnover_median"));
  return { turnoverMedian: row[0] ? Number(row[0].value) : 52 };
}

/** Rescore every account (or a subset by id). Chunked batch updates. */
export async function rescoreAccounts(ids?: string[]) {
  const factors = await db.select().from(rubricFactors);
  const ctx = await getScoreContext();
  const rows = ids?.length
    ? await db.select().from(accounts).where(sql`${accounts.id} IN ${ids}`)
    : await db.select().from(accounts);

  const now = new Date().toISOString();
  const CHUNK = 300;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const updates = chunk.map((a) => {
      const r = computeScore(a, factors, ctx);
      return db
        .update(accounts)
        .set({
          score: r.score,
          scoreBand: r.band,
          scoreBreakdown: JSON.stringify(r),
          scoredAt: now,
        })
        .where(eq(accounts.id, a.id));
    });
    await db.batch(updates as [typeof updates[0], ...typeof updates]);
  }
  return rows.length;
}
