import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "./env";
import { checkOutput } from "./score";
import { FLAGS, FLAG_IDS, type Company, type Ranking, type Recommender } from "./types";

// Ids stay plain strings here so a made-up id is counted by checkOutput instead of failing the parse.
const AgentOutput = z.object({
  profile: z.object({
    sells: z.string().describe("What the target sells, in one sentence."),
    buyer: z.string().describe("Who buys it: role and kind of organization."),
  }),
  picks: z
    .array(
      z.object({
        candidateId: z.string().describe("Id of a company from the candidate list."),
        fit: z.number().describe("0 to 100. How strong a partner this company is for the target."),
        reason: z.string().describe("One sentence: why this company is a good partner, or why it is flagged."),
        flags: z.array(z.enum(FLAG_IDS)).describe("Empty for a recommended partner."),
        evidence: z
          .array(
            z.object({
              companyId: z.string().describe("The target's id or this candidate's id."),
              quote: z.string().describe("Exact text copied from that company's description."),
            }),
          )
          .describe("One to three quotes that support the reason."),
      }),
    )
    .describe("Ten recommended partners, best first, then any flagged companies."),
});

const TOOL: Anthropic.Tool = {
  name: "recommend_partners",
  description: "Record the target profile and the partner picks.",
  input_schema: { ...z.toJSONSchema(AgentOutput), type: "object" },
};

const SYSTEM = `You find partnership candidates for a company (the target). Company names are hidden; you see only ids and descriptions.

A good partner sells to the same buyer as the target but sells a different, complementary product, so the two can integrate, co-sell or refer customers. A company that looks similar is often a competitor, not a partner.

Work in this order:
1. Profile the target: what it sells and who buys it.
2. Pick the 10 candidates that best complement the target and sell to that same buyer. Rank them best first with no flags.
3. If you notice strong look-alikes that should not be recommended, add them after the 10 with a flag instead of ranking them:
${FLAG_IDS.map((id) => `   - ${id}: ${FLAGS[id].description}`).join("\n")}

Rules:
- Use only ids from the candidate list.
- Every evidence quote must be copied exactly, character for character, from the description of the company it cites (the target or that candidate). Keep quotes short.`;

export function renderPrompt(target: Company, pool: Company[]): string {
  const candidates = pool.filter((c) => c.id !== target.id).map((c) => `[${c.id}] ${c.description_anon}`);
  return `Target:\n[${target.id}] ${target.description_anon}\n\nCandidates:\n${candidates.join("\n")}`;
}

let client: Anthropic | undefined;
export const anthropic = () => (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));

export async function rankWithAgent(target: Company, pool: Company[]): Promise<Ranking> {
  const res = await anthropic().messages.create({
    model: env.WINGMAN_MODEL,
    max_tokens: 8000,
    // Forced tool choice and thinking don't mix; the tool call is the whole answer.
    thinking: { type: "disabled" },
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: renderPrompt(target, pool) }],
  });
  const call = res.content.find((b) => b.type === "tool_use");
  if (!call) throw new Error(`No ${TOOL.name} call for ${target.id} (stop_reason: ${res.stop_reason})`);
  const out = AgentOutput.parse(call.input);
  return { ...checkOutput(out.picks, target, pool), profile: out.profile };
}

export const agentRecommend: Recommender = async (target, pool) => (await rankWithAgent(target, pool)).recommendations;
