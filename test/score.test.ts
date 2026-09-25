import assert from "node:assert/strict";
import { test } from "node:test";
import { baselineRecommend } from "../lib/baseline";
import { aggregate, checkOutput, scoreTarget, type RawPick } from "../lib/score";
import type { Company, CompanyId, Label, Ranking } from "../lib/types";

const id = (s: string) => s as CompanyId;
const co = (s: string, description_anon: string, role: Company["role"] = "pool"): Company => ({
  id: id(s),
  name: s.toUpperCase(),
  domain: `${s}.example`,
  role,
  description_anon,
});

const target = co("t1", "Payroll software for small business finance teams.", "target");
const pool = [
  co("p1", "Expense cards for finance teams at small businesses."),
  co("p2", "Payroll software for small business owners."),
  co("p3", "Time tracking for hourly workers."),
];

const label = (candidate: string, l: Label["label"]): Label => ({
  target: id("t1"),
  candidate: id(candidate),
  label: l,
  source_url: "https://example.com",
  fetched_at: "2026-01-01",
  evidence: "",
});
const labels = [label("p1", "partner"), label("p3", "partner"), label("p2", "competitor"), { ...label("p1", "partner"), target: id("t9") }];

const pick = (candidateId: string, extra: Partial<RawPick> = {}): RawPick => ({
  candidateId,
  fit: 80,
  reason: "r",
  flags: [],
  evidence: [],
  ...extra,
});

test("unknown candidate ids are counted and dropped from the ranking", () => {
  const out = checkOutput([pick("ghost"), pick("t1"), pick("p1")], target, pool);
  assert.deepEqual(out.recommendations.map((r) => r.candidateId), ["p1"]);
  assert.deepEqual(out.problems, [
    { kind: "unknown_id", id: "ghost", where: "candidate" },
    { kind: "unknown_id", id: "t1", where: "candidate" },
  ]);
});

test("quotes must be exact substrings of the cited company's description", () => {
  const out = checkOutput(
    [
      pick("p1", {
        evidence: [
          { companyId: "p1", quote: "Expense cards" },
          { companyId: "t1", quote: "finance teams" },
          { companyId: "p1", quote: "expense cards" },
          { companyId: "p1", quote: "Payroll software" },
          { companyId: "nope", quote: "x" },
        ],
      }),
    ],
    target,
    pool,
  );
  assert.deepEqual(out.recommendations[0]!.evidence, [
    { companyId: "p1", quote: "Expense cards" },
    { companyId: "t1", quote: "finance teams" },
  ]);
  assert.deepEqual(out.problems, [
    { kind: "bad_quote", companyId: "p1", quote: "expense cards" },
    { kind: "bad_quote", companyId: "p1", quote: "Payroll software" },
    { kind: "unknown_id", id: "nope", where: "evidence" },
  ]);
});

test("flagged picks come after ranked ones and never count toward hits or competitors", () => {
  const out = checkOutput([pick("p2", { flags: ["competitor"] }), pick("p1"), pick("p1"), pick("p3")], target, pool);
  assert.deepEqual(
    out.recommendations.map((r) => [r.candidateId, r.rank]),
    [["p1", 1], ["p3", 2], ["p2", 3]],
  );
  const s = scoreTarget(id("t1"), { ...out, problems: [] }, labels);
  assert.equal(s.hitsAt10, 2);
  assert.equal(s.competitorsAt10, 0);
});

test("scoreTarget counts hits, competitors and problems for one target", () => {
  const ranking: Ranking = {
    recommendations: [
      { candidateId: id("p2"), rank: 1, fit: 90, reason: "", flags: [], evidence: [] },
      { candidateId: id("p1"), rank: 2, fit: 50, reason: "", flags: [], evidence: [] },
      { candidateId: id("p3"), rank: 3, fit: 10, reason: "", flags: ["wrong_buyer"], evidence: [] },
    ],
    problems: [
      { kind: "unknown_id", id: "x", where: "candidate" },
      { kind: "unknown_id", id: "y", where: "evidence" },
      { kind: "bad_quote", companyId: id("p1"), quote: "q" },
    ],
  };
  assert.deepEqual(scoreTarget(id("t1"), ranking, labels), {
    targetId: "t1",
    hitsAt10: 1,
    competitorsAt10: 1,
    partnersAvailable: 2,
    hallucinatedIds: 2,
    badQuotes: 1,
    flagged: { competitor: 0, wrong_buyer: 1 },
  });
});

test("aggregate sums per-target scores and computes recall", () => {
  const a = { targetId: id("a"), hitsAt10: 1, competitorsAt10: 2, partnersAvailable: 4, hallucinatedIds: 1, badQuotes: 0, flagged: { competitor: 2, wrong_buyer: 0 } };
  const b = { targetId: id("b"), hitsAt10: 2, competitorsAt10: 0, partnersAvailable: 2, hallucinatedIds: 0, badQuotes: 3, flagged: { competitor: 1, wrong_buyer: 1 } };
  assert.deepEqual(aggregate([a, b]), {
    targets: 2,
    hitsAt10: 3,
    competitorsAt10: 2,
    partnersAvailable: 6,
    partnerRecall: 0.5,
    hallucinatedIds: 1,
    badQuotes: 3,
    flagged: { competitor: 3, wrong_buyer: 1 },
  });
  assert.equal(aggregate([]).partnerRecall, null);
});

test("baseline ranks the most similar description first and is deterministic", async () => {
  const first = await baselineRecommend(target, pool);
  assert.equal(first[0]!.candidateId, "p2");
  assert.deepEqual(await baselineRecommend(target, pool), first);
  assert.ok(first.every((r) => r.flags.length === 0 && r.evidence.length === 0));
});
