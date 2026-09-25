import { dataAvailable, loadData } from "../lib/data";
import { readRankings, readScoreboard } from "../lib/results";
import { topTen } from "../lib/score";
import { App, type View } from "./app";

// Reads data/ and results/ at request time so the build never bakes in a missing dataset.
export const dynamic = "force-dynamic";

export default function Page() {
  const rankings = readRankings();
  if (!dataAvailable() || !rankings) return <App views={[]} companies={{}} scoreboard={readScoreboard()} defaultId={null} />;

  const { targets, companies, labels } = loadData();
  const directory = Object.fromEntries(companies.map((c) => [c.id, c]));
  const views: View[] = targets
    .filter((t) => rankings[t.id])
    .map((t) => ({
      target: t,
      rankings: rankings[t.id]!,
      labels: Object.fromEntries(labels.filter((l) => l.target === t.id).map((l) => [l.candidate, l.label])),
    }));

  // Open on the target where naive similarity picks the most competitors: that is the story.
  const competitors = (v: View) => topTen(v.rankings.baseline?.recommendations ?? []).filter((r) => v.labels[r.candidateId] === "competitor").length;
  const defaultId = views.reduce<View | null>((best, v) => (!best || competitors(v) > competitors(best) ? v : best), null)?.target.id ?? null;

  return <App views={views} companies={directory} scoreboard={readScoreboard()} defaultId={defaultId} />;
}
