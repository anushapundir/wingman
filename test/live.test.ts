import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchHomepage, parseSiteUrl, scrub } from "../lib/live";

test("live fetch refuses non-http schemes and private or loopback addresses", async () => {
  assert.throws(() => parseSiteUrl("file:///etc/passwd"), /http and https/);
  assert.equal(parseSiteUrl("acme.com").href, "https://acme.com/");
  for (const url of ["http://127.0.0.1", "http://[::1]/", "http://169.254.169.254/", "http://10.1.2.3", "http://[::ffff:127.0.0.1]/", "http://192.168.0.1"]) {
    await assert.rejects(fetchHomepage(parseSiteUrl(url)), /not publicly reachable/, url);
  }
});

test("scrub removes whole-word brand names only", () => {
  assert.equal(scrub("Acme builds payroll. Acmelike tools exist.", ["acme", "ab"]), "the company builds payroll. Acmelike tools exist.");
});

test("a hostname that resolves to loopback is rejected on the connecting socket", async () => {
  await assert.rejects(fetchHomepage(parseSiteUrl("http://localhost:3000/")), /not publicly reachable/);
});
