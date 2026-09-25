import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Aggregate, TargetScore } from "./score";
import type { Ranking, RecommenderId } from "./types";

export type Run =
  | { status: "ran"; model: string; aggregate: Aggregate; perTarget: TargetScore[] }
  | { status: "not_run"; reason: string };

export type Scoreboard = Record<RecommenderId, Run>;
export type Rankings = Record<string, Partial<Record<RecommenderId, Ranking>>>;

const DIR = join(process.cwd(), "results");
export const SCOREBOARD_PATH = join(DIR, "scoreboard.json");
export const RANKINGS_PATH = join(DIR, "rankings.json");

// Our own output, written by scripts/eval.ts, so it is trusted without a schema.
function read<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
}

export const readScoreboard = () => read<Scoreboard>(SCOREBOARD_PATH);
export const readRankings = () => read<Rankings>(RANKINGS_PATH);
