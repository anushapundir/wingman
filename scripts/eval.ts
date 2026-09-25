import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { rankWithAgent } from "../lib/agent";
import { baselineRecommend } from "../lib/baseline";
import { DataMissingError, loadData } from "../lib/data";
import { env, hasAgentKey } from "../lib/env";
import { RANKINGS_PATH, SCOREBOARD_PATH, readRankings, readScoreboard, type Rankings, type Run, type Scoreboard } from "../lib/results";
import { aggregate, scoreTarget } from "../lib/score";
import type { Company, Ranking } from "../lib/types";

const CONCURRENCY = 4;

function load() {
  try {
    return loadData();
  } catch (err) {
    if (err instanceof DataMissingError) {
      console.error(`${err.message}\nAdd data/companies.json and data/labels.json, then rerun npm run eval.`);
      process.exit(1);
    }
    throw err;
  }
}

const { targets: allTargets, pool, labels } = load();
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx === -1 ? undefined : process.argv[onlyIdx + 1];
const targets = only ? allTargets.filter((t) => t.id === only) : allTargets;
if (only && targets.length === 0) {
  console.error(`Unknown target: ${only}. Targets: ${allTargets.map((t) => t.id).join(", ")}`);
  process.exit(1);
}

async function runAll(rank: (t: Company) => Promise<Ranking>, model: string) {
  const rankings: Ranking[] = [];
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    rankings.push(...(await Promise.all(targets.slice(i, i + CONCURRENCY).map(rank))));
    if (model !== "tf-idf") console.log(`  ${model}: ${rankings.length}/${targets.length} targets`);
  }
  const perTarget = targets.map((t, i) => scoreTarget(t.id, rankings[i]!, labels));
  const run: Run = { status: "ran", model, aggregate: aggregate(perTarget), perTarget };
  return { run, rankings };
}

const baseline = await runAll(async (t) => ({ recommendations: await baselineRecommend(t, pool), problems: [] }), "tf-idf");
const agent = hasAgentKey ? await runAll((t) => rankWithAgent(t, pool), env.WINGMAN_MODEL) : null;

const fmt = (name: string, run: Run) =>
  run.status === "not_run"
    ? `${name}: not run yet (${run.reason})`
    : `${name}: hits@10 ${run.aggregate.hitsAt10}/${run.aggregate.partnersAvailable}, competitors@10 ${run.aggregate.competitorsAt10}, hallucinated ids ${run.aggregate.hallucinatedIds}, bad quotes ${run.aggregate.badQuotes} (${run.aggregate.targets} targets)`;

if (only) {
  console.log(fmt("baseline", baseline.run));
  if (agent) console.log(fmt("wingman", agent.run));
  console.log("--only is a smoke test; results/ was not changed.");
  process.exit(0);
}

// Without a key, keep earlier agent results instead of replacing a paid run with "not run".
const previousBoard = readScoreboard();
const previousRankings = readRankings();
const keepAgent = !agent && previousBoard?.wingman.status === "ran";

const board: Scoreboard = {
  baseline: baseline.run,
  wingman: agent?.run ?? (keepAgent ? previousBoard!.wingman : { status: "not_run", reason: "ANTHROPIC_API_KEY not set" }),
};
const rankings: Rankings = Object.fromEntries(
  targets.map((t, i) => {
    const wingman = agent?.rankings[i] ?? (keepAgent ? previousRankings?.[t.id]?.wingman : undefined);
    return [t.id, { baseline: baseline.rankings[i]!, ...(wingman && { wingman }) }];
  }),
);

mkdirSync(dirname(SCOREBOARD_PATH), { recursive: true });
writeFileSync(SCOREBOARD_PATH, JSON.stringify(board, null, 2) + "\n");
writeFileSync(RANKINGS_PATH, JSON.stringify(rankings, null, 2) + "\n");

console.log(fmt("baseline", board.baseline));
console.log(fmt("wingman", board.wingman));
if (keepAgent) console.log("(wingman results kept from the previous run; set ANTHROPIC_API_KEY to rerun)");
