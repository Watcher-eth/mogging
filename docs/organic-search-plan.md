# Mogging organic search: audit and release plan

Audit date: 19 September 2026. Target: earn top-20, then top-10 visibility for “mogging,” while also increasing relevant non-brand visits and app interest. No paid links, paid SEO tools, ads, or purchased traffic are required by this plan. Ranking is an outcome to measure, not a promise.

## What the audit actually established

| Finding | Evidence | Action |
| --- | --- | --- |
| The homepage does not answer the dominant informational intent | Retrieved search results prominently include definitions and slang explanations; the previous homepage was an app purchase funnel | Add a concise visible definition on the homepage and a dedicated, sourced `/what-is-mogging` guide |
| Missing crawl discovery files | Public HTTP requests returned 404 for both `/robots.txt` and `/sitemap.xml`, routed through `[referral]` | Add robots.txt and a sitemap of nine public canonical pages |
| Duplicate and inconsistent metadata | Production HTML contained two descriptions and two app banners; social metadata remained generic while the title described the app | Use the existing keyed SeoHead component consistently |
| Canonical fallback inconsistent with production | Live canonical already used www through environment configuration; code defaulted to the apex host | One fixed production origin; normalize queries, fragments, trailing slashes and `/app` alias |
| Account, creator, placeholder and shared-report routes lacked a consistent index policy | Global metadata was indexable by default | Explicit public route list; other routes receive noindex, follow |
| Trust signals could not be substantiated | Homepage claimed 4.8/243 ratings and supplied three hard-coded reviews; the retrieved US App Store listing showed 5.0/1 | Remove unsupported counters/testimonials and link directly to current App Store reviews; do not add review schema |
| Main content starts transparent | Homepage wrappers rendered opacity:0 pending client animation | Remove the entry animation; keep visible HTML and avoid preloading all three screenshots |
| Guides and legal resources were poorly discoverable | No sitewide resource footer | Add contextual links and footer navigation |

This is a public-site and code audit. Search Console, actual Google positions by country/device, crawl history, backlink quality, manual actions, and real-user Core Web Vitals were not available. A `site:` search is not a reliable index count. The search provider’s results are directional evidence of intent, not a verified Google rank tracker.

## Changes ready in this release

- Homepage: product remains the primary experience; search visitors get an immediate definition and a link to the guide. Added product explanation, limitations, and links to analysis, battle, leaderboard and methodology.
- `/what-is-mogging`: one page serves mogging meaning, mog/mogged variants, examples, origin, meme usage and the distinction from looksmaxxing. Do not split these into near-duplicate keyword pages.
- `/how-face-analysis-works`: first-party explanation grounded in the app’s schema/scoring code, with photo guidance and limits. This is product documentation, not invented independent research or medical expertise.
- Website/organization structured data on the homepage; article/breadcrumb markup on guides. Content is visible and consistent with markup. No fake author credentials, review stars, arbitrary publication dates or promised FAQ rich results.
- `lang="en"`, consistent canonical/social metadata, crawlable links, sitemap, robots policy and protected utility-route indexing.
- `/app` remains functional for existing payment links and attribution but canonicalizes to `/`. Do not redirect away checkout query parameters or disrupt activation flows.

The sitemap omits lastmod rather than reporting a fictitious update date on every deployment. Add accurate content modification dates only when the publishing workflow owns them. New public pages must be added to `publicPaths` in `lib/seo.ts`; this intentionally controls both sitemap membership and indexing eligibility.

## Release and indexing: first priority

1. Deploy this reviewed change through the existing production workflow. Confirm the primary domain remains `https://www.mogging.com`. Test apex and HTTP redirects, including query-string preservation. Do not change domains or remove www as part of this release.
2. Verify the live homepage and both guides return 200 without authentication, and robots.txt and sitemap.xml return the correct file types. Confirm a nonexistent route returns 404 (not a 200 error screen). Keep Vercel previews protected or noindexed.
3. In Google Search Console, verify the **Domain property** `mogging.com` through DNS if it is not already verified. Domain properties cover protocol and subdomain variants.
4. Submit `https://www.mogging.com/sitemap.xml`. Inspect `/`, `/what-is-mogging`, and `/how-face-analysis-works`; run the live test, inspect rendered content and request indexing once for each. Check Google-selected versus user-declared canonical after recrawling.
5. Check Manual actions, Security issues, Page indexing and Crawl stats before assuming this is only a content problem. If a domain has problematic history or the host serves Googlebot errors, that changes the priority order.
6. Use the Rich Results Test for supported markup and Schema.org Validator for the full graph. Structured data helps describe content; it does not guarantee ranking or a rich result.
7. Optionally verify Bing Webmaster Tools and submit the same sitemap. Google’s Indexing API is not a general submission API for these pages. Do not repeatedly request indexing or build an “instant indexing” script.

`noindex` is not access control. Shared links must still be treated as accessible to anyone holding the URL. Sensitive content must use authorization where privacy requires it. Utility pages remain crawlable so search engines can see noindex; blocking them in robots.txt would defeat that purpose. `/api/` is blocked to keep crawlers away from operational endpoints.

## Measurement before further edits

Export the last 3 months of Search Console performance, split by page, country and device. Save a baseline before deployment. Track weekly, then compare equal 28-day periods, allowing for changing demand.

| Query group | Primary destination | Useful measurement |
| --- | --- | --- |
| mogging | Homepage and meaning guide | Which page Google selects, impressions, clicks, average position, top-20/top-10 progress |
| what is mogging / mogging meaning / mogged meaning | Meaning guide | Non-brand impressions, clicks, CTR, query breadth |
| mogging app | Homepage | Branded CTR and visits leading to the App Store |
| mogging face analysis / mogging face rating | Homepage and analysis | Relevant visits and analysis/app interest |
| how face analysis works | Methodology guide | Helpful long-tail visibility and visits into the product |

Select the actual target country before interpreting position. Average position is impression-weighted and is not a universal fixed rank. Branded and informational intent overlap for this domain; inspect query/page combinations rather than assuming all “mogging” searches were looking for your app. Search Console is the source for organic query data; never put private photos, report IDs, checkout session IDs or user email addresses in analytics events.

Diagnostic order:

- **Not indexed:** inspect crawl response, rendered HTML, noindex, selected canonical, robots and server errors first.
- **Indexed with few impressions:** investigate relevance, internal discovery, external references and whether there is demand for the topic.
- **Impressions at positions 20–60:** improve the actual answer, original evidence and relevant citations/links; metadata polishing alone is unlikely to close the gap.
- **Top-20 with low CTR:** compare the actual search snippet with competing results for that country/device. Change the title only if it sets the wrong expectation; low CTR alone does not prove poor copy.
- **Two URLs alternate for the same intent:** inspect page-level performance. Strengthen each page’s distinct role. Consolidate genuinely redundant pages only when there is evidence, preserving their useful content and redirecting the retired URL.

## Earn authority without paying for links

The exact domain makes the brand memorable; it does not replace independent references. Prioritize a small number of relevant editorial mentions over large numbers of low-quality links.

1. Make owned profiles consistent: use the production domain in existing social bios, app-store website links and relevant product profiles where you control them. Do not create dozens of empty profiles.
2. Publish one original resource worth citing. A useful fit is a transparent demonstration of how camera distance, lighting and pose change a face-analysis result. Use consenting adults or your own images, repeated conditions, the same app/model version, and disclose sample size, uncertainty and limitations. Publish the real result even if it shows substantial variability. Do not manufacture statistics or claim a clinical validation study.
3. Create short, useful explanations from that resource for your existing audience, linking to the full methodology. Avoid reposting identical promotional comments across communities.
4. Identify articles already discussing mogging, face-rating apps or photo distortion. Offer a specific factual correction, useful demo or original evidence when relevant. An editor chooses whether to cite you; do not demand exact-match anchors or reciprocal links.
5. Ask genuine customers for honest feedback without prescribing a score. Display only reviews with a verifiable source and permission where required; keep counts current or link to the source.

No outreach messages were sent in this task. Purchased links, private blog networks, mass directory submissions, comment spam, expired-domain schemes, fake traffic and scaled AI filler are excluded. They spend effort on manipulation rather than building a useful result and can violate Google’s spam policies.

## Content and performance priorities over the next 8–12 weeks

- **Weeks 1–2:** deploy, verify indexing, establish country/device baseline, fix any crawl or canonical problems revealed by Search Console.
- **Weeks 2–4:** review queries landing on the meaning guide. Add genuinely missing answers to this page instead of creating synonyms as separate articles. Have the product owner review methodology accuracy and keep claims consistent with the app.
- **Weeks 3–6:** publish the original photo-condition demonstration and share it through existing channels. Add a real named author/reviewer only with their involvement; do not invent expertise.
- **Weeks 4–8:** improve the public analysis/battle/leaderboard experience if these pages appear as thin client-loaded shells to Google. Describe what users can do and how rankings work before data loads. Do not expose private reports to manufacture indexable pages.
- **Weeks 8–12:** compare Search Console cohorts, identify pages gaining relevant impressions and decide the next unique resource. Expand only where user demand and first-party knowledge justify it.

Run PageSpeed Insights on the live homepage and guide on mobile after deployment. Use field data where available; a single Lighthouse run is a diagnostic, not a ranking score. Aim for LCP ≤2.5s, INP ≤200ms and CLS ≤0.1 at the 75th percentile. The global app shell loads account/camera infrastructure even for editorial pages; profile its bundle and interaction cost before refactoring it. The release removes one obvious visibility delay and excess image priorities, but does not claim a measured Core Web Vitals improvement.

No “SEO score,” word-count target, meta keywords, FAQ-schema trick, hidden text, or llms.txt can substitute for relevance, crawlability and independent credibility. Page one or two cannot be guaranteed; use the milestones above to determine whether the site is earning visibility after Google recrawls and evaluates it.

## Sources

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide): usefulness, links, titles, and the limited impact of keywords in a domain.
- [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls): keep canonical signals consistent.
- [Google structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies): markup must accurately represent visible content.
- [Search Console getting started](https://developers.google.com/search/docs/monitor-debug/search-console-start): indexing and performance diagnostics.
- [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies): link spam and scaled content abuse.
- [Merriam-Webster: mog](https://www.merriam-webster.com/slang/mog) and [Know Your Meme: mogging](https://knowyourmeme.com/memes/mogging): terminology and documented history.
- [Mogging’s US App Store listing](https://apps.apple.com/us/app/mogging-face-rating/id6771414050): product listing and review-count cross-check; storefronts and cached results can differ.
- [Google’s Web Vitals guidance](https://web.dev/articles/vitals): field metrics and current thresholds.

## Local validation completed

- Production build and TypeScript check passed.
- Lint passed with one existing `no-img-element` warning in `pages/analysis.tsx`.
- Four targeted SEO tests passed (23 assertions): canonical normalization, sitemap indexability, utility exclusions, and safe JSON-LD serialization.
- Audited 14 prerendered HTML documents for titles, descriptions, canonical URLs and indexing directives; verified structured JSON on the homepage and guides. Next supplies an additional noindex tag for its 404 page.
- Local production HTTP checks: robots.txt and sitemap.xml return 200 with correct content types; all nine sitemap URLs return 200.
- Browser checked homepage, guide navigation and methodology page; the meaning guide fits a 390px viewport without horizontal overflow. No browser console errors were captured during these checks.
- These are local results. Deployment, Google recrawling, Search Console submission and ranking changes have not been completed or verified.

| Before | After | Why |
| --- | --- | --- |
| Homepage content initially transparent | Visible on first HTML render | Removes dependence on entry animation for visibility |
| Three screenshots preloaded | Only the first receives priority | Avoids making below-the-fold images compete for loading priority |
| No visible educational route from the hero | Readable definition and guide link | Serves visitors arriving for the word’s meaning |
| Hard-coded review counters and testimonials | Link to the current App Store source | Keeps social proof verifiable |

## Production release — 19 September 2026

Deployed the working-tree SEO changes to the existing Vercel `glimpseback/mogging` project. Production build succeeded and was aliased to `https://www.mogging.com`.

Deployment: https://mogging-m8mz56ip0-glimpseback.vercel.app

Post-deploy HTTP checks passed: homepage, both guides, robots.txt, sitemap.xml and all nine sitemap URLs return 200. Descriptions/canonicals are unique; JSON-LD parses; registration is noindexed; `/app` canonicalizes to `/`; apex redirect preserves query parameters. Search Console submission and Google recrawling remain pending.

## Search Console submission — 19 September 2026

The `mogging.com` Domain property was automatically verified through its existing domain-provider DNS verification. Submitted `https://www.mogging.com/sitemap.xml`; Search Console reported **Success** and **9 discovered pages**.

Google confirmed **Indexing requested** and addition to its priority crawl queue for:
- `https://www.mogging.com/` (already indexed; requested recrawl of the update)
- `https://www.mogging.com/what-is-mogging`
- `https://www.mogging.com/how-face-analysis-works`

Both new guides were “Discovered - currently not indexed” at inspection time. Submission is complete; actual indexing and ranking remain Google's decision. Performance and coverage reports were still processing. Do not repeat submissions to attempt to increase queue priority.
