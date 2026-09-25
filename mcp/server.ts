import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { rankWithAgent } from "../lib/agent";
import { baselineRecommend } from "../lib/baseline";
import { loadData } from "../lib/data";
import { hasAgentKey } from "../lib/env";
import { discover } from "../lib/live";
import type { Company, Ranking, RecommenderId } from "../lib/types";

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});
const fail = (message: string) => ({ ...text(message), isError: true });

async function rank(recommender: RecommenderId, target: Company, pool: Company[]): Promise<Ranking> {
  if (recommender === "baseline") return { recommendations: await baselineRecommend(target, pool), problems: [] };
  return rankWithAgent(target, pool);
}

// Names are added back for the reader; the recommenders only ever saw ids and descriptions.
function named(ranking: Ranking, companies: Company[]) {
  const byId = new Map(companies.map((c) => [c.id, c]));
  return {
    ...ranking,
    recommendations: ranking.recommendations.map((r) => ({ ...r, name: byId.get(r.candidateId)?.name, domain: byId.get(r.candidateId)?.domain })),
  };
}

const server = new McpServer({ name: "wingman", version: "0.1.0" });

server.registerTool("list_targets", { description: "List the eval target companies (id, name, domain)." }, async () =>
  text(loadData().targets.map(({ id, name, domain }) => ({ id, name, domain }))),
);

server.registerTool(
  "get_company",
  { description: "Get one company from the dataset by id.", inputSchema: { id: z.string() } },
  async ({ id }) => {
    const company = loadData().companies.find((c) => c.id === id);
    return company ? text(company) : fail(`Unknown company: ${id}`);
  },
);

server.registerTool(
  "recommend_partners",
  {
    description:
      "Rank 10 partner candidates for a company. Pass targetId (from list_targets) to rank the dataset pool, or url to read a live homepage and search the web for candidates. recommender 'wingman' looks for the same buyer with a different product; 'baseline' returns the most similar descriptions.",
    inputSchema: {
      targetId: z.string().optional(),
      url: z.string().optional(),
      recommender: z.enum(["wingman", "baseline"]).default("wingman"),
    },
  },
  async ({ targetId, url, recommender }) => {
    if (!targetId === !url) return fail("Pass exactly one of targetId or url.");
    if ((recommender === "wingman" || url) && !hasAgentKey) return fail("ANTHROPIC_API_KEY is not set.");
    try {
      if (url) {
        const { target, pool } = await discover(url);
        return text({ target: target.domain, ...named(await rank(recommender, target, pool), pool) });
      }
      const { companies, pool } = loadData();
      const target = companies.find((c) => c.id === targetId && c.role === "target");
      if (!target) return fail(`Unknown target: ${targetId}`);
      return text({ target: target.name, ...named(await rank(recommender, target, pool), companies) });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  },
);

await server.connect(new StdioServerTransport());
