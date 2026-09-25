import { hasAgentKey } from "../lib/env";
import { LiveInputError, liveRecommend } from "../lib/live";
import { FLAGS } from "../lib/types";

const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run find -- <company url>");
  process.exit(1);
}
if (!hasAgentKey) {
  console.error("Live mode needs ANTHROPIC_API_KEY. Add it to .env.");
  process.exit(1);
}

try {
  console.log(`Reading ${input} and searching for candidates...`);
  const { target, pool, ranking } = await liveRecommend(input);
  const byId = new Map(pool.map((c) => [c.id, c]));
  if (ranking.profile) console.log(`\n${target.domain} sells ${ranking.profile.sells}\nBuyer: ${ranking.profile.buyer}\n`);
  console.table(
    ranking.recommendations.map((r) => ({
      rank: r.rank,
      company: byId.get(r.candidateId)?.name,
      domain: byId.get(r.candidateId)?.domain,
      fit: r.fit,
      flags: r.flags.map((f) => FLAGS[f].label).join(", "),
      reason: r.reason,
    })),
  );
  if (ranking.problems.length) console.log(`${ranking.problems.length} problem(s) in the model output were dropped:`, ranking.problems);
} catch (err) {
  console.error(err instanceof LiveInputError ? err.message : err);
  process.exit(1);
}
