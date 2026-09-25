import { z } from "zod";
import { hasLiveAccess } from "../../../lib/access";
import { baselineRecommend } from "../../../lib/baseline";
import { hasAgentKey } from "../../../lib/env";
import { LiveInputError, liveRecommend } from "../../../lib/live";

const Body = z.object({ url: z.string().trim().min(3).max(300) });

export async function POST(req: Request) {
  if (!hasLiveAccess(req)) return Response.json({ error: "Live mode is disabled on this deployment" }, { status: 403 });
  if (!hasAgentKey) return Response.json({ error: "Live mode needs ANTHROPIC_API_KEY on the server" }, { status: 503 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Expected { url }" }, { status: 400 });

  try {
    const { target, pool, ranking } = await liveRecommend(body.data.url);
    const baseline = { recommendations: await baselineRecommend(target, pool), problems: [] };
    return Response.json({ target, pool, rankings: { baseline, wingman: ranking } });
  } catch (err) {
    if (err instanceof LiveInputError) return Response.json({ error: err.message }, { status: 400 });
    console.error("live recommend failed", err);
    return Response.json({ error: "Could not build recommendations for that site" }, { status: 502 });
  }
}
