# App-first homepage experiments, revision 1

The shared redesign puts an iPhone download CTA above the fold, shows live app previews,
explains the evaluation → Protocol → progress flow, and keeps browser analysis as a
secondary action. Illustrative testimonials, invented rating counts, and the old
homepage subscription implementation are removed. The browser section and `/app` share one Pro checkout component, with the same install identity and Stripe activation handoff.

## Allocation

| Experiment | A | B | Traffic |
| --- | --- | --- | --- |
| `landing_hero_v1` | “Ascend to your true potential.” + benefit-focused description | “Find your potential. Start mogging.” + feature-focused description | 50%, equally split |
| `landing_download_v1` | Inline download buttons | Same page plus a persistent download button after the hero button scrolls out of view | 50%, equally split |

Each browser enters exactly one experiment. All four arms use the same redesign,
except for their named treatment. This is not a comparison against the old page.
A first-party cookie holds a random visitor UUID and immutable arm for 90 days.
The server renders the assigned version without a hydration-time switch or a
remote experiment-service request. Personalized HTML is private/no-store. There
is no database work on the homepage request. Changing a treatment requires a new
experiment ID/cookie revision; do not silently edit a running treatment.

Development-only previews: `/?landing_preview=hero_a`, `hero_b`, `download_a`, or
`download_b`. These previews do not record experiment exposure or homepage CTA
conversions. The override is ignored in production.

## Measurement and decision

- Primary metric: unique visitors who click through to the App Store within seven
  days of their first observed homepage exposure in the selected reporting window.
  This measures store intent, not downloads or app activation.
- Secondary metrics: browser analysis entry, browser paywall exposure, server
  checkout creation, and a positive-amount checkout confirmed paid by Stripe.
  Zero-value/free completions are excluded from paid conversions. Revenue itself
  remains in the verified billing ledger, with currencies kept separate.
- Deduplicate visitors by the experiment cookie's `landing_id`, which survives
  anonymous-to-account identity changes. Preserve assignment in Stripe checkout
  metadata for webhook attribution. A returning visit or duplicate receipt does
  not create another visitor/converter.
- Only join outcomes after exposure, inside seven days, with the same assignment.
  All observations must also be inside the selected admin date window. A visitor
  with less than seven days of observation is pending, not a mature non-converter.
- Section reach is one event per section per mount once at least 25% is visible.
  CTA placement counts overlap and must not be summed. Existing batched transport
  is reused; no scroll-event handlers, fingerprinting, or questionnaire tracking.

See **Admin → Analytics → Acquisition** for both tests, pending/mature cohorts,
observed rates, mature rates with 97.5% Wilson intervals, CTA placements, section
reach, and homepage-specific source counts. Use the web/all-platform filter and
30/90-day windows; a seven-day window contains almost no mature observations.

Plan one decision after at least 14 days AND 750 mature visitors per arm. That
sample is a conservative target for a baseline near 7.4% and an uplift to about
12.4%, allowing for the two planned comparisons. Recalculate power if those
assumptions change. Do not stop early just because a live rate looks better.
The intervals describe uncertainty; their overlap/non-overlap is not an automatic
winner rule. At the planned decision, use a two-proportion test with alpha 0.025
per experiment, check assignment balance and source mix, and inspect the browser
payment guardrail. An inconclusive result is a valid result. Current traffic may
require many weeks; a 90-day reporting window may be insufficient at low volume,
in which case analyze the full experiment cohort before deciding.

Before shipping a winner, retain App Store click attribution and compare actual
install/activation data where Apple/Appsflyer attribution is available. No
cross-device website-click → install identity join is implied by this dashboard.

## Verification

Unit checks cover allocation balance, cookie validation, contract parity, empty
arms, and interval uncertainty. Read-only PostgreSQL fixtures verify repeat views,
duplicate receipts, out-of-window or wrong-arm outcomes, pending visitors,
free-checkout exclusion, section deduplication, and homepage-only store denominators.
Desktop and phone-sized browser checks cover both headlines, sticky control/treatment,
responsive overflow, stable assignment on reload, and browser-analysis navigation.
No paid checkout is created as part of verification.

## Live previews

The homepage uses DOM/SVG recreations of the mobile capture, scan, evaluation and Protocol,
not screenshots. The example portrait and its cached Vision calibration match iOS;
SVG paths resolve through the existing portable mobile overlay engine. Image and
overlay use the same centered cover transform. The hero shows the complete native
scan layout. The walkthrough shows capture → scan → Protocol. The report includes
its Overall selector, scrolling category grid and growth cards, and fixed Share
action. Report and Protocol previews omit the bottom tab bar.
The 390×844 point reference viewport, report hero height (55%), native 54-point
calendar rows, task entrances (480/840 ms), the 3400 ms check-off, and its
245 ms wiggle/580 ms strike follow the mobile source. Protocol uses its real
score/settings header and native symbol assets; dates and task completion are
interactive. Scan labels use staggered title/value strips resolved in the actual
269-point image viewport, preserving native stroke and type sizes. Previews pause when offscreen
or the tab is hidden. Reduced motion removes loops and displays measurements
without drawing. Example scores and tasks are illustrative, not user reports.

The leaderboard preview mirrors the native podium, with an animated Global/Friends selector. Global displays the first six real public profiles and battle ratings from the same API as the app, fetched once near the viewport with shared caching. Friends remains a clearly labeled example. Scan includes jawline geometry. The report advertises 10 detailed categories and 40+ feature metrics (four to six per category in the report contract). Each Protocol day uses a distinct task mix. Off-screen preview trees and images mount only within 300px of the viewport; their frames reserve space to avoid layout shift. Section entrances run once; FAQ height/opacity/indicator motion respects reduced motion.

Performance pass: 10 / 40+ / 200+ counters use Number Flow once on entry and respect reduced motion. Counter and FAQ state are local; phone previews are memoized. Homepage navigation and analysis links do not prefetch application routes. Audio, camera capture, and profile appearance processing are deferred; the landing header uses a solid background to avoid scroll-time backdrop blur. The hero entrance no longer gates visible content, and the scan portrait requests a 242px display size.

Download buttons scale on hover without color/opacity changes. Capture replaces the oval guide with a face contour and feature-axis overlay resolved against the cached portrait, within the same moving image container. The FAQ includes the upcoming Android app.
