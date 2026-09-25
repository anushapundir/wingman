import type Anthropic from "@anthropic-ai/sdk";
import { lookup as dnsLookup } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { z } from "zod";
import { anthropic, rankWithAgent } from "./agent";
import { env } from "./env";
import type { Company, CompanyId, Ranking } from "./types";

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const PROFILE_CHARS = 2000;

export class LiveInputError extends Error {}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const)
  blocked.addSubnet(net, prefix, "ipv6");

// BlockList also matches IPv4-mapped IPv6 addresses against the IPv4 rules.
const isBlocked = (ip: string) => blocked.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4");

export function parseSiteUrl(input: string): URL {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new LiveInputError("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new LiveInputError("Only http and https URLs are allowed");
  if (url.username || url.password) throw new LiveInputError("URLs with credentials are not allowed");
  return url;
}

// Every address is vetted inside the socket's own lookup, so the IP we check is the IP we connect to.
const vettedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    if (addresses.length === 0) return callback(new LiveInputError("Could not resolve that host"), "");
    if (addresses.some((a) => isBlocked(a.address))) return callback(new LiveInputError("That host is not publicly reachable"), "");
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

type RawResponse = { status: number; location?: string; body: string };

function get(url: URL, signal: AbortSignal): Promise<RawResponse> {
  // IP literals skip the lookup hook entirely, so they are checked here.
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal) && isBlocked(literal)) return Promise.reject(new LiveInputError("That host is not publicly reachable"));
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { lookup: vettedLookup, signal, headers: { "user-agent": "wingman/0.1 (+partner finder)", "accept-encoding": "identity" } },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const done = () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, body: Buffer.concat(chunks).subarray(0, MAX_BYTES).toString("utf8") });
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          size += chunk.length;
          if (size >= MAX_BYTES) {
            res.destroy();
            done();
          }
        });
        res.on("end", done);
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function fetchHomepage(start: URL): Promise<{ url: URL; html: string }> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await get(url, signal);
    if (res.status >= 300 && res.status < 400 && res.location) {
      url = parseSiteUrl(new URL(res.location, url).toString());
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new LiveInputError(`The site answered with HTTP ${res.status}`);
    return { url, html: res.body };
  }
  throw new LiveInputError("Too many redirects");
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function meta(html: string, name: string): string | undefined {
  const tag = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i"))?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1];
}

export function pageText(html: string): { title: string; siteName?: string; text: string } {
  const title = decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
  const description = meta(html, "description") ?? meta(html, "og:description") ?? "";
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const text = decode(`${description}. ${body}`).replace(/\s+/g, " ").trim();
  return { title, siteName: meta(html, "og:site_name"), text };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Best effort: removes the obvious brand strings so the ranking step sees a description, not a name.
export function scrub(text: string, names: (string | undefined)[]): string {
  const words = [...new Set(names.filter((n): n is string => !!n && n.trim().length >= 3).map((n) => n.trim()))];
  words.sort((a, b) => b.length - a.length);
  return words.reduce((t, w) => t.replace(new RegExp(`\\b${escape(w)}\\b`, "gi"), "the company"), text);
}

const domainRoot = (host: string) => host.replace(/^www\./, "").split(".").slice(0, -1).join(".") || host;

const Candidates = z.object({
  companies: z.array(z.object({ name: z.string(), domain: z.string(), description: z.string() })),
});

const SUBMIT: Anthropic.Tool = {
  name: "submit_candidates",
  description: "Submit the candidate companies you found. Call once, at the end.",
  input_schema: { ...z.toJSONSchema(Candidates), type: "object" },
};

async function discoverCandidates(domain: string, profile: string): Promise<z.infer<typeof Candidates>["companies"]> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Company website: ${domain}\nWhat its homepage says:\n${profile}\n\nUse web search to find 20 to 30 real companies that sell to the same buyer as this company. Include some complementary products (possible partners) and some close alternatives (competitors). For each, give its name, its domain, and a two or three sentence description of what it sells and to whom. Then call submit_candidates.`,
    },
  ];
  for (let round = 0; round < 5; round++) {
    const res = await anthropic().messages.create({
      model: env.WINGMAN_MODEL,
      max_tokens: 8000,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }, SUBMIT],
      messages,
    });
    const call = res.content.find((b) => b.type === "tool_use" && b.name === SUBMIT.name);
    if (call?.type === "tool_use") return Candidates.parse(call.input).companies;
    messages.push({ role: "assistant", content: res.content });
    // pause_turn means the server paused a long search; resending the same turn resumes it.
    if (res.stop_reason !== "pause_turn") messages.push({ role: "user", content: "Call submit_candidates now with what you found." });
  }
  throw new Error("Discovery did not submit candidates");
}

export type LiveResult = { target: Company; pool: Company[]; ranking: Ranking };

export async function discover(input: string): Promise<{ target: Company; pool: Company[] }> {
  const { url, html } = await fetchHomepage(parseSiteUrl(input));
  const page = pageText(html);
  const host = url.hostname.replace(/^www\./, "");
  const brand = [domainRoot(host), host, page.siteName, page.title.split(/\s[|:\-–]\s/)[0]];
  const profile = scrub(page.text, brand).slice(0, PROFILE_CHARS);
  if (profile.length < 40) throw new LiveInputError("Could not read enough text from that homepage");

  const target: Company = { id: "w00" as CompanyId, name: page.siteName ?? page.title ?? host, domain: host, role: "target", description_anon: profile };
  const found = await discoverCandidates(host, profile);
  const seen = new Set([host]);
  const pool: Company[] = [];
  for (const c of found) {
    const domain = c.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
    if (seen.has(domain)) continue;
    seen.add(domain);
    pool.push({
      id: `w${String(pool.length + 1).padStart(2, "0")}` as CompanyId,
      name: c.name,
      domain,
      role: "pool",
      description_anon: scrub(c.description, [c.name, domainRoot(domain), domain, ...brand]),
    });
  }
  return { target, pool };
}

export async function liveRecommend(input: string): Promise<LiveResult> {
  const { target, pool } = await discover(input);
  return { target, pool, ranking: await rankWithAgent(target, pool) };
}
