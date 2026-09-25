import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

// Open only under `next dev`; any other environment fails closed.
const isDev = process.env.NODE_ENV === "development";

// Live mode spends API credits and fetches arbitrary URLs, so a deployment needs a shared token.
export const liveAccessConfigured = isDev || Boolean(env.DEMO_ACCESS_TOKEN);

export function hasLiveAccess(req: Request): boolean {
  if (isDev) return true;
  const expected = env.DEMO_ACCESS_TOKEN;
  const given = req.headers.get("x-demo-token");
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
