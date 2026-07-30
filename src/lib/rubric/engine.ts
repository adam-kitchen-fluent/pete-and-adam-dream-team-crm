// Deterministic, explainable ICP scoring. Pure functions — no I/O.
import type { Account, RubricFactor } from "../db/schema";
import { SCORE_BANDS } from "./defaults";

export type FactorStatus = "hit" | "miss" | "unknown";

export interface FactorEval {
  key: string;
  label: string;
  kind: string;
  points: number;
  status: FactorStatus;
  detail: string;
}

export interface ScoreResult {
  score: number;
  band: "hot" | "warm" | "cold" | "disqualified";
  disqualified: boolean;
  disqualifiers: string[];
  potentialUpside: number; // points locked behind 'unknown' enrichment factors
  evals: FactorEval[];
}

export interface ScoreContext {
  turnoverMedian: number; // national median total nursing turnover %
}

type Evaluator = (a: Account, ctx: ScoreContext) => { status: FactorStatus; detail: string };

const evaluators: Record<string, Evaluator> = {
  bed_sweet_spot: (a) => {
    if (a.certifiedBeds == null) return { status: "unknown", detail: "Bed count unknown" };
    const hit = a.certifiedBeds >= 50 && a.certifiedBeds <= 300;
    return { status: hit ? "hit" : "miss", detail: `${a.certifiedBeds} certified beds (target 50–300)` };
  },
  facility_type_fit: (a) => {
    const hit = a.facilityType === "SNF/NF" || a.facilityType === "ALF";
    return { status: hit ? "hit" : "miss", detail: a.facilityType ?? "Unknown facility type" };
  },
  independent_or_small_chain: (a) => {
    if (!a.chainName) return { status: "hit", detail: "Independent — no chain affiliation" };
    if (a.chainSize == null) return { status: "unknown", detail: `Chain "${a.chainName}", size unknown` };
    const hit = a.chainSize <= 10;
    return { status: hit ? "hit" : "miss", detail: `Chain "${a.chainName}" — ${a.chainSize} facilities` };
  },
  not_on_pcc: (a) => {
    if (a.pccStatus === "not_on_pcc") return { status: "hit", detail: "No PointClickCare footprint detected" };
    if (a.pccStatus === "on_pcc") return { status: "miss", detail: "Runs PointClickCare" };
    return { status: "unknown", detail: "EMR stack not yet enriched" };
  },
  manual_ops: (a) => {
    if (a.opsMaturity === "manual") return { status: "hit", detail: "Manual / Excel-based operations" };
    if (a.opsMaturity === "digital") return { status: "miss", detail: "Already digitized" };
    return { status: "unknown", detail: "Ops maturity not yet enriched" };
  },
  new_don: (a) => {
    if (a.donNewHire === "yes") return { status: "hit", detail: "New Director of Nursing in last ~6 months" };
    if (a.donNewHire === "no") return { status: "miss", detail: "DON tenure established" };
    return { status: "unknown", detail: "DON tenure not yet enriched" };
  },
  high_turnover: (a, ctx) => {
    if (a.totalNursingTurnover == null) return { status: "unknown", detail: "Turnover not reported" };
    const hit = a.totalNursingTurnover > ctx.turnoverMedian;
    return {
      status: hit ? "hit" : "miss",
      detail: `${a.totalNursingTurnover.toFixed(1)}% nursing turnover (national median ${ctx.turnoverMedian.toFixed(1)}%)`,
    };
  },
  admin_churn: (a) => {
    if (a.adminDepartures == null) return { status: "unknown", detail: "Administrator departures not reported" };
    const hit = a.adminDepartures >= 2;
    return { status: hit ? "hit" : "miss", detail: `${a.adminDepartures} administrator departure(s) reported` };
  },
  tech_forward_don: (a) => {
    if (a.donTechForward === "yes") return { status: "hit", detail: "DON profile reads tech-forward" };
    if (a.donTechForward === "no") return { status: "miss", detail: "No tech-forward signal on DON" };
    return { status: "unknown", detail: "DON profile not yet enriched" };
  },
  recent_ownership_change: (a) => {
    if (a.ownershipChanged12mo == null) return { status: "unknown", detail: "Ownership history unknown" };
    const hit = a.ownershipChanged12mo === 1;
    return { status: hit ? "hit" : "miss", detail: hit ? "Ownership changed in last 12 months" : "Ownership stable" };
  },
  pe_rollup: (a) => {
    if (a.chainSize != null && a.chainSize > 20)
      return { status: "hit", detail: `Chain "${a.chainName}" has ${a.chainSize} facilities — rollup profile` };
    return { status: "miss", detail: a.chainName ? `Small chain (${a.chainSize ?? "?"})` : "Independent" };
  },
};

export function computeScore(account: Account, factors: RubricFactor[], ctx: ScoreContext): ScoreResult {
  const evals: FactorEval[] = [];
  let score = 0;
  let potentialUpside = 0;
  const disqualifiers: string[] = [];

  for (const f of factors) {
    if (!f.active) continue;
    const evaluate = evaluators[f.key];
    if (!evaluate) continue; // unknown factor key — tolerate rubric drift
    const { status, detail } = evaluate(account, ctx);
    evals.push({ key: f.key, label: f.label, kind: f.kind, points: f.points, status, detail });

    if (f.kind === "disqualifier") {
      if (status === "hit") disqualifiers.push(f.label);
    } else if (status === "hit") {
      score += f.points;
    } else if (status === "unknown" && f.points > 0) {
      potentialUpside += f.points;
    }
  }

  score = Math.max(0, Math.min(100, score));
  const disqualified = disqualifiers.length > 0;
  const band = disqualified
    ? "disqualified"
    : score >= SCORE_BANDS.hot
      ? "hot"
      : score >= SCORE_BANDS.warm
        ? "warm"
        : "cold";

  return { score, band, disqualified, disqualifiers, potentialUpside, evals };
}
