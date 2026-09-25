// Reads companies.raw.json, strips every known company/product name and domain from each
// description, writes companies.json, then proves zero leaks.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('.', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('companies.raw.json', dir), 'utf8'));

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const terms = [...new Set(raw.flatMap((c) => [c.name, ...c.aliases, c.domain, c.domain.replace(/^www\./, '')]))]
  .sort((a, b) => b.length - a.length);
const pattern = (t) => new RegExp(`(?<![\\w])${escape(t)}(?![\\w])`, 'gi');
const patterns = terms.map((t) => [t, pattern(t)]);

const anonymize = (text) => {
  let out = text;
  for (const [, re] of patterns) out = out.replace(re, '[company]');
  return out.replace(/\[company\](?:\s*\[company\])+/g, '[company]').replace(/\s{2,}/g, ' ').trim();
};

const companies = raw.map(({ id, name, domain, role, description }) => ({
  id, name, domain, role, description_anon: anonymize(description),
}));
writeFileSync(new URL('companies.json', dir), JSON.stringify(companies, null, 2) + '\n');

let leaks = 0;
for (const c of companies) {
  for (const [t, re] of patterns) {
    const hits = c.description_anon.match(re);
    if (hits) { leaks += hits.length; console.log(`LEAK ${c.id} "${t}"`); }
  }
}

const caps = new Map();
for (const c of companies) {
  for (const m of c.description_anon.matchAll(/(?<![.!?:]\s|^)\b[A-Z][A-Za-z0-9]*[A-Z0-9a-z](?:[.-][A-Za-z0-9]+)*/g)) {
    caps.set(m[0], (caps.get(m[0]) ?? 0) + 1);
  }
}
if (process.argv.includes('--caps')) console.log([...caps].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w}:${n}`).join(' '));

console.log(`companies=${companies.length} terms=${terms.length} leaks=${leaks}`);
if (leaks) process.exit(1);
