# Sources

Ground truth for the offline eval. Every label in `labels.json` cites a page fetched on 2026-09-25/26 and a short quote from it (`evidence`). Descriptions in `companies.raw.json` come from each company's own homepage (meta description plus the first descriptive copy, lightly trimmed), with the fetched URL in `source_url`.

| Target | Partners page | Competitor source(s) | Partners | Competitors |
|---|---|---|---|---|
| Lattice | https://lattice.com/integrations | https://lattice.com/compare | 12 | 5 |
| Fathom Analytics | https://usefathom.com/integrations | https://usefathom.com/features/vs-cloudflare-web-analytics<br>https://usefathom.com/features/vs-google-analytics<br>https://usefathom.com/features/vs-matomo | 12 | 3 |
| Buttondown | https://buttondown.com/features/integrations | https://buttondown.com/alternatives | 11 | 5 |
| Help Scout | https://www.helpscout.com/apps/ | https://www.helpscout.com/compare/freshdesk/<br>https://www.helpscout.com/compare/frontapp/<br>https://www.helpscout.com/compare/gorgias/<br>https://www.helpscout.com/compare/zendesk/ | 20 | 4 |
| Linear | https://linear.app/integrations | https://linear.app/switch | 16 | 2 |
| FreeAgent | https://www.freeagent.com/integrations/ | https://www.freeagent.com/features/competitors/ | 14 | 3 |
| Cal.com | https://cal.com/apps | https://cal.com/blog/acuity-scheduling-vs-cal.com<br>https://cal.com/blog/why-choose-calcom-over-chili-piper<br>https://cal.com/calcom-vs-calendly | 20 | 3 |
| airSlate SignNow | https://www.signnow.com/integrations | https://www.signnow.com/alternative | 20 | 4 |
| OnPay | https://onpay.com/app-directory/category/all/ | https://onpay.com/payroll/best-payroll-services/ | 12 | 3 |
| Harvest | https://www.getharvest.com/integrations | https://www.getharvest.com/resources/harvest-vs-clockify<br>https://www.getharvest.com/resources/harvest-vs-toggl | 17 | 2 |

Totals: 10 targets, 181 companies in the pool file (10 targets, 171 pool), 154 partner labels, 34 competitor labels.

## Rules

- Candidates for a target are every company in `companies.json` except the target itself. Other targets are valid candidates: Fathom Analytics is a labeled partner of Buttondown and Cal.com, Linear of Help Scout, Harvest and Cal.com, Help Scout of airSlate SignNow, and Cal.com of Fathom Analytics.
- A pool company that appears on a target's partner page is labeled a partner of that target, not only the first ~12 picked when the pool was built. Leaving a listed partner unlabeled would count a true partner as a miss.
- Unlabeled pairs are unknown, not negatives. The ~40 distractors are vertical SaaS (construction, fleet, clinics, property, hospitality, schools, nonprofits) picked to sit far from every target's buyer.
- Ambiguity rule: when a target's own pages support both labels for a company, the pair is dropped.
- `fetch_method` is `curl` unless noted. Two Cal.com blog pages render client side, so their names were read through a headless fetch (`webfetch`); the evidence for those is the page title.
- Ids are shuffled with a fixed seed so the id order does not reveal role or label.

## Dropped or excluded

- HiBob, Rippling, ADP for Lattice. Listed on /integrations and also on /compare as tools Lattice beats.
- Ghost and Memberful for Buttondown. Listed as integrations and also recommended on /alternatives.
- Intercom for Help Scout. In the app directory and in the compare nav.
- QuickBooks for OnPay. QuickBooks Online and QuickBooks Time are app-directory integrations, and QuickBooks Payroll is on the comparison page.
- Klaviyo for Buttondown. Listed on /alternatives, but cut to keep competitors at 2 to 5 and it is more ecommerce SMS than newsletter. It stays a Help Scout partner.
- Freshservice (Freshworks) for Harvest and "Intuit eSignature" for airSlate SignNow. The listing names a product, not the pool company, so the pair is not labeled.
- "Fathom" on the FreeAgent integrations page is a financial reporting tool, not Fathom Analytics. Not labeled.
- MainStreet (OnPay app directory): mainstreet.com now serves an unrelated holding company, so it was replaced by PosterElite from the same directory. Zenefits (Lattice) has no standalone homepage and was dropped.
- Customer logos and testimonials on comparison pages (for example Deel on the Cal.com vs Calendly page, Pilot and Ramp on linear.app/switch) are not labels.
- G2 and Capterra alternatives pages returned 403 to every fetch, so all competitor labels come from the targets' own comparison pages.

## Exceptions kept

- Jira is a Linear competitor, not a partner. The Jira entry on linear.app/integrations is a migration path ("Smoothly transition from Jira to Linear") and /switch names it: "migrating from Jira, Asana, and GitHub Issues".
- Sage stays a FreeAgent competitor. Its only integration listing is AutoEntry by Sage, a separate product.
- Procore and Buildium were picked as distractors, then found on the airSlate SignNow integrations page, so they are labeled partners.

## Anonymization

`node build.mjs` replaces every company name, alias, product name and domain from `companies.raw.json` (case-insensitive, word-boundary, longest match first) with `[company]` and writes `companies.json`. It then greps every anonymized description for every term and exits non-zero if any remain. `--caps` prints the leftover capitalized tokens for a manual pass on unlisted product names.
