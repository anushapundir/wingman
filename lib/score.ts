import { FLAG_IDS, type Company, type CompanyId, type Flag, type Label, type Problem, type Ranking, type Recommendation } from "./types";

export type RawPick = {
  candidateId: string;
  fit: number;
  reason: string;
  flags: Flag[];
  evidence: { companyId: string; quote: string }[];
};

// Turns raw model picks into a ranking. Unknown ids and quotes that are not exact
// substrings are dropped from the ranking and reported as problems, never hidden.
export function checkOutput(picks: RawPick[], target: Company, pool: Company[]): Pick<Ranking, "recommendations" | "problems"> {
  const candidates = new Map(pool.filter((c) => c.id !== target.id).map((c) => [c.id as string, c]));
  const citable = new Map<string, Company>([...candidates, [target.id, target]]);
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const kept: Omit<Recommendation, "rank">[] = [];

  for (const pick of picks) {
    if (!candidates.has(pick.candidateId)) {
      problems.push({ kind: "unknown_id", id: pick.candidateId, where: "candidate" });
      continue;
    }
    if (seen.has(pick.candidateId)) continue;
    seen.add(pick.candidateId);

    const evidence: Recommendation["evidence"] = [];
    for (const e of pick.evidence) {
      const company = citable.get(e.companyId);
      if (!company) problems.push({ kind: "unknown_id", id: e.companyId, where: "evidence" });
      else if (!e.quote || !company.description_anon.includes(e.quote)) problems.push({ kind: "bad_quote", companyId: company.id, quote: e.quote });
      else evidence.push({ companyId: company.id, quote: e.quote });
    }
    kept.push({
      candidateId: candidates.get(pick.candidateId)!.id,
      fit: Math.max(0, Math.min(100, Math.round(pick.fit))),
      reason: pick.reason,
      flags: [...new Set(pick.flags)],
      evidence,
    });
  }

  // Flagged picks are shown, but never take a ranked slot.
  const ranked = kept.filter((r) => r.flags.length === 0).slice(0, 10);
  const flagged = kept.filter((r) => r.flags.length > 0);
  const recommendations = [...ranked, ...flagged].map((r, i) => ({ ...r, rank: i + 1 }));
  return { recommendations, problems };
}

export type TargetScore = {
  targetId: CompanyId;
  hitsAt10: number;
  competitorsAt10: number;
  partnersAvailable: number;
  hallucinatedIds: number;
  badQuotes: number;
  flagged: Record<Flag, number>;
};

const countFlags = (recs: { flags: Flag[] }[]) =>
  Object.fromEntries(FLAG_IDS.map((f) => [f, recs.filter((r) => r.flags.includes(f)).length])) as Record<Flag, number>;

// The top 10 are the unflagged picks; a flagged competitor is a correct call, not a miss.
export const topTen = (recs: Recommendation[]) => recs.filter((r) => r.flags.length === 0).slice(0, 10);

export function scoreTarget(targetId: CompanyId, ranking: Ranking, labels: Label[]): TargetScore {
  const mine = labels.filter((l) => l.target === targetId);
  const partners = new Set(mine.filter((l) => l.label === "partner").map((l) => l.candidate));
  const competitors = new Set(mine.filter((l) => l.label === "competitor").map((l) => l.candidate));
  const top = topTen(ranking.recommendations);
  return {
    targetId,
    hitsAt10: top.filter((r) => partners.has(r.candidateId)).length,
    competitorsAt10: top.filter((r) => competitors.has(r.candidateId)).length,
    partnersAvailable: partners.size,
    hallucinatedIds: ranking.problems.filter((p) => p.kind === "unknown_id").length,
    badQuotes: ranking.problems.filter((p) => p.kind === "bad_quote").length,
    flagged: countFlags(ranking.recommendations),
  };
}

export type Aggregate = Omit<TargetScore, "targetId"> & { targets: number; partnerRecall: number | null };

type Counter = Exclude<keyof TargetScore, "targetId" | "flagged">;

export function aggregate(scores: TargetScore[]): Aggregate {
  const sum = (k: Counter) => scores.reduce((s, x) => s + x[k], 0);
  const hitsAt10 = sum("hitsAt10");
  const partnersAvailable = sum("partnersAvailable");
  return {
    targets: scores.length,
    hitsAt10,
    competitorsAt10: sum("competitorsAt10"),
    partnersAvailable,
    partnerRecall: partnersAvailable === 0 ? null : hitsAt10 / partnersAvailable,
    hallucinatedIds: sum("hallucinatedIds"),
    badQuotes: sum("badQuotes"),
    flagged: Object.fromEntries(FLAG_IDS.map((f) => [f, scores.reduce((s, x) => s + x.flagged[f], 0)])) as Record<Flag, number>,
  };
}
