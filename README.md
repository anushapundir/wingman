# Wingman

**Find the companies you should partner with.**

Give Wingman a company. It returns 10 ranked partner candidates, each with a fit score, a one-line reason, flags, and quotes from the company descriptions that back the reason up.

<!-- Screenshot slots: docs/compare.png (desktop) and docs/phone.png (phone width). -->

## Why

The obvious way to find partners is to search for companies similar to yours. That mostly returns competitors. A company that describes itself the way you do usually sells the same thing to the same people.

A good partner is the opposite shape: same buyer, different product. A payroll tool and an expense card both sell to the finance lead at a small business, and neither replaces the other. That is the pair that integrates, co-sells and refers customers.

Wingman looks for that shape on purpose, and flags look-alikes instead of ranking them.

## What it does

- **Ranks 10 partner candidates** for a company, with a fit score from 0 to 100 and a one-line reason.
- **Flags** candidates that look close but should not be pitched: `competitor` (substitute product, same buyer) and `wrong_buyer` (complementary product, different buyer). Flagged candidates are listed after the 10, never inside them.
- **Cites evidence.** Every reason comes with short quotes from the target's or the candidate's description. Quotes must be exact substrings. Click one in the UI and it lights up in the text.
- **Compares against a naive baseline** (TF-IDF similarity) on the same companies, so you can see the difference side by side.
- **Grades both** against partnerships and competitors taken from public pages.
- **Runs live** on any company URL: it reads the homepage, searches the web for candidates, and ranks them.
- **Works over MCP**, so any MCP client can list targets and ask for partners.

## How it works

```mermaid
flowchart LR
  subgraph Eval
    D[data/companies.json<br/>anonymized descriptions] --> B[Baseline: TF-IDF cosine]
    D --> A[Wingman: one forced tool call]
    L[data/labels.json<br/>public partner pages] --> S[Scorer]
  end
  subgraph Live
    U[Company URL] --> F[Fetch homepage, scrub names]
    F --> W[Web search for candidates]
    W --> A
  end
  A --> C[checkOutput: drop unknown ids and bad quotes, count them]
  C --> S
  B --> S
  S --> R[results/scoreboard.json<br/>results/rankings.json]
  R --> UI[Compare UI]
```

- `lib/types.ts` is the domain model. `Company` and `Label` are parsed with zod when the data loads. `Recommendation` is `{ candidateId, rank, fit, reason, flags, evidence }`. `FLAGS` is the one table of flags that the UI, the prompt and the scorer read.
- `lib/baseline.ts` is plain TF-IDF cosine over the descriptions, with no dependencies. Ties break by id, so it is deterministic.
- `lib/agent.ts` sends the model only ids and anonymized descriptions, never names. The prompt asks it to profile the target first (what it sells, who buys it), then pick 10 complementary companies that sell to the same buyer. It answers through one forced tool call, parsed with zod.
- `lib/score.ts` is pure. `checkOutput` drops candidate ids that are not in the pool and quotes that are not exact substrings of the cited description, and records each one as a problem. Nothing is silently fixed. `scoreTarget` and `aggregate` compute the metrics below. `npm test` covers both.
- `lib/live.ts` is live mode. It fetches the homepage (http and https only, 8 second timeout, 1 MB cap, private and loopback addresses blocked on the connecting socket), scrubs the brand name out of the text, finds candidates with the server-side web search tool, and runs the same ranking.

## Quickstart

```bash
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY to run Wingman itself
npm run eval           # baseline always; Wingman only when the key is set
npm run dev            # http://localhost:3000
```

Other commands:

```bash
npm test                          # scoring and live-fetch tests
npm run eval -- --only c001       # smoke test one target; does not write results/
npm run find -- acme.com          # live mode from the terminal
npm run mcp                       # MCP server over stdio
```

The UI reads `results/rankings.json`, so once eval results are committed it works without a key. Live mode needs one.

| Variable | Required | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | For Wingman and live mode | Without it, eval runs the baseline only and live mode is off. |
| `WINGMAN_MODEL` | No | Model id. Defaults to `claude-opus-5-5`. |
| `DEMO_ACCESS_TOKEN` | To use live mode on a deployment | `next dev` leaves live mode open. Anywhere else, `/api/recommend` needs the header `x-demo-token` to match this value, and it stays closed when the value is unset. Open the UI with `?token=<value>`. |

## Eval

Each target company has labelled partners and competitors in `data/labels.json`, taken from public partner and integration pages. Both recommenders rank the same closed pool of anonymized companies.

- **hits@10**: labelled partners in the top 10.
- **competitors@10**: labelled competitors in the top 10.
- **partnersAvailable**: labelled partners that exist in the pool for that target.
- **hallucinated ids**: candidate or evidence ids that are not in the pool. Dropped from the ranking and counted.
- **bad quotes**: evidence quotes that are not exact substrings of the cited description. Dropped and counted.
- **flagged**: how many candidates were flagged, per flag.

The top 10 are the unflagged picks. A labelled competitor that Wingman flags as a competitor is shown in the UI but does not count toward `competitors@10`.

Numbers come from `results/scoreboard.json`, written by `npm run eval`.

| Recommender | hits@10 | competitors@10 | hallucinated ids | bad quotes |
| --- | --- | --- | --- | --- |
| Most similar (naive) | not run yet | not run yet | n/a | n/a |
| Wingman | not run yet | not run yet | not run yet | not run yet |

### Caveats

- **hits@10 is a lower bound.** Labels come from public partner pages, and most real partnerships are never published. A pick that is not labelled is not necessarily wrong.
- **The pool is closed and anonymized.** Names are scrubbed from every description and the model sees only ids, so it cannot just recall partnerships it read about in training.
- **The eval covers ranking only.** Live mode adds a discovery step (reading a homepage and searching the web) that this eval does not measure.

## MCP

Tools: `list_targets`, `recommend_partners` (`targetId` or `url`, plus `recommender`: `wingman` or `baseline`), and `get_company`.

```json
{
  "mcpServers": {
    "wingman": {
      "command": "npm",
      "args": ["--prefix", "/path/to/wingman", "run", "--silent", "mcp"],
      "env": { "ANTHROPIC_API_KEY": "..." }
    }
  }
}
```

## What I'd build next

- **Measure discovery.** Hold out known partners, run live mode on the target, and check whether web search surfaces them at all.
- **Richer profiles.** Pull pricing, integrations and docs pages as well as the homepage, so the buyer is inferred from more than marketing copy.
- **Mutual fit.** Score the pair in both directions. A partnership only happens if the other side wants it too.
- **Feedback loop.** Let a user mark picks as good or bad and feed those back in as labels.

## License

MIT. See [LICENSE](LICENSE).
