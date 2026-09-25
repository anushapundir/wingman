import { existsSync } from "node:fs";
import { z } from "zod";

// Next loads .env itself; the scripts and MCP server do not.
if (existsSync(".env")) process.loadEnvFile(".env");

const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);

export const env = z
  .object({
    ANTHROPIC_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
    WINGMAN_MODEL: z.preprocess(blankToUndefined, z.string().default("claude-opus-5-5")),
    DEMO_ACCESS_TOKEN: z.preprocess(blankToUndefined, z.string().optional()),
  })
  .parse(process.env);

export const hasAgentKey = Boolean(env.ANTHROPIC_API_KEY);
