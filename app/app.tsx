"use client";

import { useState } from "react";
import type { Run, Scoreboard } from "../lib/results";
import { FLAGS, RECOMMENDERS, type Company, type Label, type Ranking, type Recommendation, type RecommenderId } from "../lib/types";

export type View = {
  target: Company;
  rankings: Partial<Record<RecommenderId, Ranking>>;
  labels: Record<string, Label["label"]>;
  companies?: Record<string, Company>;
};

type Selected = { key: string; companyId: string; quote: string } | null;

const RECOMMENDER_IDS = Object.keys(RECOMMENDERS) as RecommenderId[];

export function App({
  views,
  companies,
  scoreboard,
  defaultId,
}: {
  views: View[];
  companies: Record<string, Company>;
  scoreboard: Scoreboard | null;
  defaultId: string | null;
}) {
  const [targetId, setTargetId] = useState(defaultId);
  const [live, setLive] = useState<View | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const view = live ?? views.find((v) => v.target.id === targetId) ?? null;
  const directory = view?.companies ?? companies;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-8 sm:pt-16">
      <header className="max-w-2xl">
        <p className="text-sm font-medium text-accent">Wingman</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Find the companies you should partner with.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
          Ask for similar companies and you get a list of competitors. Wingman looks for the opposite: companies that sell a different product to the same buyer.
        </p>
      </header>

      <ScoreStrip scoreboard={scoreboard} />

      <section className="mt-10 grid gap-4 border-t border-line pt-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block">
          <span className="text-sm text-muted">Eval company</span>
          <select
            className="mt-2 w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
            value={live ? "" : (targetId ?? "")}
            onChange={(e) => {
              setLive(null);
              setSelected(null);
              setTargetId(e.target.value);
            }}
            disabled={views.length === 0}
          >
            {live && <option value="">Live: {live.target.domain}</option>}
            {views.length === 0 && <option value="">No eval results yet</option>}
            {views.map((v) => (
              <option key={v.target.id} value={v.target.id}>
                {v.target.name} ({v.target.domain})
              </option>
            ))}
          </select>
        </label>
        <LiveForm
          onResult={(v) => {
            setSelected(null);
            setLive(v);
          }}
        />
      </section>

      {view ? (
        <>
          <TargetCard view={view} selected={selected} />
          <section className="mt-8 grid gap-10 md:grid-cols-2 md:gap-8">
            {RECOMMENDER_IDS.map((id) => (
              <Column
                key={id}
                id={id}
                view={view}
                directory={directory}
                selected={selected}
                onSelect={setSelected}
              />
            ))}
          </section>
        </>
      ) : (
        <p className="mt-12 max-w-xl text-muted">
          No rankings to show yet. Add <code>data/companies.json</code> and <code>data/labels.json</code>, then run{" "}
          <code>npm run eval</code>. Or type a company URL above to run live.
        </p>
      )}
    </main>
  );
}

function ScoreStrip({ scoreboard }: { scoreboard: Scoreboard | null }) {
  return (
    <section className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line" aria-label="Eval scoreboard">
      {RECOMMENDER_IDS.map((id) => (
        <ScoreCell key={id} name={RECOMMENDERS[id].label} run={scoreboard?.[id]} />
      ))}
    </section>
  );
}

function ScoreCell({ name, run }: { name: string; run: Run | undefined }) {
  return (
    <div className="bg-panel p-4 sm:p-5">
      <p className="text-sm text-muted">{name}</p>
      {run?.status === "ran" ? (
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <dt className="text-xs text-muted">Real partners in top 10</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-good">
              {run.aggregate.hitsAt10}
              <span className="text-base font-normal text-muted"> / {run.aggregate.partnersAvailable}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Competitors in top 10</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight text-bad">{run.aggregate.competitorsAt10}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-lg text-muted">Not run yet</p>
      )}
    </div>
  );
}

function LiveForm({ onResult }: { onResult: (v: View) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const token = new URLSearchParams(window.location.search).get("token");
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token && { "x-demo-token": token }) },
        body: JSON.stringify({ url }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      const pool = body.pool as Company[];
      onResult({
        target: body.target,
        rankings: body.rankings,
        labels: {},
        companies: Object.fromEntries([body.target, ...pool].map((c: Company) => [c.id, c])),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="block">
      <label htmlFor="live-url" className="text-sm text-muted">
        Or try any company live
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="live-url"
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2.5 text-base outline-none placeholder:text-muted/60 focus-visible:ring-2 focus-visible:ring-accent"
          placeholder="acme.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button
          className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60 dark:text-bg"
          disabled={busy}
        >
          {busy ? "Searching..." : "Find partners"}
        </button>
      </div>
      {busy && <p className="mt-2 text-sm text-muted">Reading the homepage and searching the web. This takes a minute.</p>}
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </form>
  );
}

function Highlighted({ text, quote }: { text: string; quote: string | null }) {
  const at = quote ? text.indexOf(quote) : -1;
  if (!quote || at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{quote}</mark>
      {text.slice(at + quote.length)}
    </>
  );
}

function TargetCard({ view, selected }: { view: View; selected: Selected }) {
  const profile = view.rankings.wingman?.profile;
  const quote = selected?.companyId === view.target.id ? selected.quote : null;
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">
        {view.target.name} <span className="font-normal text-muted">{view.target.domain}</span>
      </h2>
      <p className="mt-3 max-w-3xl leading-relaxed text-ink/85">
        <Highlighted text={view.target.description_anon} quote={quote} />
      </p>
      {profile && (
        <p className="mt-4 max-w-3xl border-l-2 border-accent pl-4 text-sm leading-relaxed text-muted">
          Wingman read this as: sells {profile.sells}. Buyer: {profile.buyer}.
        </p>
      )}
    </section>
  );
}

function Column({
  id,
  view,
  directory,
  selected,
  onSelect,
}: {
  id: RecommenderId;
  view: View;
  directory: Record<string, Company>;
  selected: Selected;
  onSelect: (s: Selected) => void;
}) {
  const ranking = view.rankings[id];
  const recs = ranking?.recommendations ?? [];
  const top = recs.filter((r) => r.flags.length === 0).slice(0, 10);
  const hasLabels = Object.keys(view.labels).length > 0;
  const partners = top.filter((r) => view.labels[r.candidateId] === "partner").length;
  const competitors = top.filter((r) => view.labels[r.candidateId] === "competitor").length;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
        <h3 className="font-semibold">{RECOMMENDERS[id].label}</h3>
        {ranking && hasLabels && (
          <p className="text-sm text-muted">
            <span className="text-good">{partners} partners</span>, <span className="text-bad">{competitors} competitors</span>
          </p>
        )}
      </div>
      {!ranking ? (
        <p className="py-6 text-sm leading-relaxed text-muted">
          Not run yet for this company. Set <code>ANTHROPIC_API_KEY</code> and run <code>npm run eval</code>.
        </p>
      ) : (
        <>
          <ol>
            {recs.map((r) => (
              <Row
                key={r.candidateId}
                rowKey={`${id}:${r.candidateId}`}
                rec={r}
                company={directory[r.candidateId]}
                target={view.target}
                label={view.labels[r.candidateId]}
                selected={selected}
                onSelect={onSelect}
              />
            ))}
          </ol>
          {ranking.problems.length > 0 && (
            <p className="pt-4 text-sm text-muted">
              {ranking.problems.length} problem{ranking.problems.length === 1 ? "" : "s"} in the model output (unknown ids or quotes not found in the text) were dropped and counted.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Row({
  rowKey,
  rec,
  company,
  target,
  label,
  selected,
  onSelect,
}: {
  rowKey: string;
  rec: Recommendation;
  company: Company | undefined;
  target: Company;
  label: Label["label"] | undefined;
  selected: Selected;
  onSelect: (s: Selected) => void;
}) {
  const flagged = rec.flags.length > 0;
  const mine = selected?.key.startsWith(`${rowKey}#`) ? selected : null;
  return (
    <li className={`border-b border-line py-4 ${flagged ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="w-6 shrink-0 pt-0.5 text-sm text-muted">{flagged ? "" : rec.rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium">{company?.name ?? rec.candidateId}</span>
            {company && <span className="truncate text-sm text-muted">{company.domain}</span>}
            {label === "partner" && <Badge tone="good">Real partner</Badge>}
            {label === "competitor" && <Badge tone="bad">Competitor</Badge>}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-line" role="meter" aria-valuenow={rec.fit} aria-valuemin={0} aria-valuemax={100} aria-label="Fit">
              <div className="h-full rounded-full bg-accent" style={{ width: `${rec.fit}%` }} />
            </div>
            <span className="w-7 text-right text-xs text-muted">{rec.fit}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink/85">{rec.reason}</p>
          {(flagged || rec.evidence.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {rec.flags.map((f) => (
                <span key={f} title={FLAGS[f].description} className="rounded-md bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad">
                  {FLAGS[f].label}
                </span>
              ))}
              {rec.evidence.map((e, i) => {
                const key = `${rowKey}#${i}`;
                const active = selected?.key === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelect(active ? null : { key, companyId: e.companyId, quote: e.quote })}
                    className={`max-w-full truncate rounded-md border px-2 py-0.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      active ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink"
                    }`}
                    title={e.quote}
                  >
                    {e.companyId === target.id ? "Target" : "Them"}: &ldquo;{e.quote}&rdquo;
                  </button>
                );
              })}
            </div>
          )}
          {mine && mine.companyId !== target.id && company && (
            <p className="mt-3 rounded-lg bg-panel p-3 text-sm leading-relaxed text-ink/85 ring-1 ring-line">
              <Highlighted text={company.description_anon} quote={mine.quote} />
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function Badge({ tone, children }: { tone: "good" | "bad"; children: React.ReactNode }) {
  const cls = tone === "good" ? "bg-good-soft text-good" : "bg-bad-soft text-bad";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
