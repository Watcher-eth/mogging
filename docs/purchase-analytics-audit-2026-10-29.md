# Purchases and Revenue reporting audit — 2026-10-29

## Section decisions

| Section | Before | After / retained visualization | Reason |
| --- | --- | --- | --- |
| Purchase activity | Mobile attempts and overlapping purchased/activation lines | Narrow daily/hourly bars for paid transactions, grouped by Apple, Google Play, Stripe and other stores | Discrete totals; client attempts are not all purchases |
| Purchase headlines | Attempt outcomes only | All-source purchases, identified buyers, single/bundle orders and repeat scan buyers | Answers sales questions independently of mobile instrumentation |
| What people buy | Not available | Product count bars with buyers and renewals in exact data | Orders, credits and people must remain distinct |
| Repeat buyers | Not available | Scan-order frequency and mutually exclusive product-combination bars | Shows repeat demand and scan/subscription overlap without double-counting groups |
| Time to first purchase | Not available | Exclusive signup-to-first-payment timing buckets | Describes when buyers buy; not a conversion funnel |
| Signup conversion | Not available | Cumulative 1/3/7/14-day rates, eligible and pending counts | Uses only cohorts with complete follow-up; immature is not failure |
| After first purchase | Not available | 1/3/7/14-day repeat-scan and later-subscription table | Outcomes can overlap and should not be a sequential funnel |
| Tracked mobile attempts | Main sales chart | Separate diagnostics with grouped attempt/purchase/activation bars | Retains troubleshooting value without implying total sales coverage |
| Purchase outcomes | Category bars | Retained | Disjoint latest outcomes are suitable comparisons |
| Performance by paywall | Table | Retained with attempt-based denominator | Mixed rates and volumes need exact values; observational, not causal |
| Issues and recovery | Tables | Retained | Errors, restores and web handoffs have different meanings and denominators |
| Data freshness | Diagnostics | Retained | Fresh events alone do not prove complete collection |
| Revenue per day | Several overlapping monetary series | Narrow calendar bars; one selected metric, one currency | Clearly communicates each day's revenue without gross/net overlap |
| Financial breakdown | Table | Retained | Revenue, refunds, taxes and estimated fees reconcile as amounts, not independent slices |
| Current subscriptions | Metrics | Retained | Current balances differ from event counts and period flows |
| Churn and new purchases | Metrics | Retained with explicit cohort and credits definitions | Churn, cancellation intent and expired access are different measures |
| Product/provider revenue | Ranked bars and exact table | Retained | Rank comparable amounts within one currency; top-eight limit remains explicit |
| Revenue sources | Dense table | Selected-currency net bars, expandable all-currency table | Faster source comparison without currency aggregation |
| Countries | Dense table | Top-ten selected-currency gross bars, expandable full table | Ranking is useful; exact data and unknown country remain available |
| Reporting coverage | Diagnostics | Retained | Missing amounts, reconciliation gaps and fee assumptions remain explicit |

## Measurement boundaries

- Paid purchases require a positive production billing amount and a recognized purchase event. Duplicate provider transactions are counted once. Refund reversals restore money but are not new purchases; trials without charges are not paid purchases.
- Purchases include all recorded provider sources independently of the mobile diagnostics filter. This is ledger coverage, not a claim that provider ingestion is infallible.
- Purchases with unknown amounts remain excluded and disclosed. Unidentified payments count as transactions, but not people. Cross-provider identities unify only when linked to the same account.
- Repeat scan orders combine single scans and bundles. A bundle is one order, not several orders. Subscription renewals are not repeat manual scan purchases.
- First-purchase and repeat timing use full available billing history through the snapshot cutoff. They cannot reconstruct history predating collection. Period buyers' combinations describe their recorded history, not only products bought inside the selected window.
- Signup timing means account creation, not installation or first paywall exposure. Signup cohorts contain all non-internal accounts, including accounts that may not have reached a consumer paywall. They must not be interpreted as install-to-paid conversion.
- Calendar revenue/purchase buckets use Pacific dates, including daylight-saving transitions. Boundary days are partial; absent recorded activity is zero, while an observed missing amount remains unknown. Daily totals use original currencies separately; no synthetic USD sum is introduced.
- Monetary revenue includes financial adjustments; purchase counts exclude refund reversals. Gross collections, after-refund amounts and estimated proceeds are deliberately separate. Proceeds are not business profit.

## Verification

- Read-only full production queries for Purchases and Revenue, 30-day window: 44 paid transactions, 32 linked billing identities, 7 single-scan orders, 6 bundle orders and 31 subscription payments (3 renewals). This snapshot is not a permanent business result.
- Rollback-only PostgreSQL integration covers all provider sources, duplicate transactions, sandbox/internal exclusion, unknown identities, trials/refund reversals, repeat behavior and mature cohort denominators.
- PostgreSQL calendar check covers the 25-hour Pacific daylight-saving day and an exact exclusive end boundary.
- Existing query and rendering regression suites retained; production build and browser verification performed separately from these fixtures.

## Production release

- Deployed and promoted 2026-10-29 using the authorized Vercel CLI account.
- Base production revision preserved: `04a22c63c5ec440b8636a9170dd064436a6e3834`, plus the reviewed working-tree analytics changes.
- Deployment: `dpl_BHYLVUJQHDi6GBBm71nTq86kvaau` (`mogging-ms09dapy1-glimpseback.vercel.app`).
- Production build ID: `1QnryPlNvvry_67AOMCxk`.
- Staged checks: analytics API 401 without app authentication; development-only report preview 404; build manifest 200 with both analytics pages.
- After promotion, `www.mogging.com` resolves to this ready deployment; live build manifest matches the staged manifest and analytics authentication remains enforced.
- Signed-in production report content was not rechecked because the available browser session is not an authorized admin. The exact report queries were previously verified read-only against production data and both dashboards were browser-tested locally.
