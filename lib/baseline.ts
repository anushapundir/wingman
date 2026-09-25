import type { Company, Recommendation, Recommender } from "./types";

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in into is it its of on or our that the their them they this to with we you your company companies".split(" "),
);

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

type Vector = Map<string, number>;

function tfidf(docs: string[][]): Vector[] {
  const df = new Map<string, number>();
  for (const doc of docs) for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  return docs.map((doc) => {
    const v: Vector = new Map();
    for (const t of doc) v.set(t, (v.get(t) ?? 0) + 1);
    for (const [t, n] of v) v.set(t, (n / doc.length) * Math.log(docs.length / df.get(t)!));
    return v;
  });
}

function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  for (const [t, x] of a) dot += x * (b.get(t) ?? 0);
  const norm = (v: Vector) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot / d;
}

export const baselineRecommend: Recommender = async (target, pool) => {
  const candidates = pool.filter((c) => c.id !== target.id);
  const vectors = tfidf([target, ...candidates].map((c: Company) => tokens(c.description_anon)));
  const scored = candidates.map((c, i) => ({ c, score: cosine(vectors[0]!, vectors[i + 1]!) }));
  // Ties break by id so reruns produce identical output.
  scored.sort((x, y) => y.score - x.score || x.c.id.localeCompare(y.c.id));
  return scored.slice(0, 10).map(
    ({ c, score }, i): Recommendation => ({
      candidateId: c.id,
      rank: i + 1,
      fit: Math.round(score * 100),
      reason: `Most similar description (score ${score.toFixed(2)})`,
      flags: [],
      evidence: [],
    }),
  );
};
