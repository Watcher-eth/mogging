# Revenue reporting

The Revenue page uses deduplicated production billing events and excludes known internal accounts. Dates are Pacific time. The default Total · USD view combines USD-denominated payments with provider-recorded USD conversions for international payments. Headlines, stream charts, product charts and growth use this same basis. Original-currency views remain available as explicitly labelled purchase subsets. Missing historical conversions remain visible as gaps; known sums are labelled as minimums, never presented as complete totals.

| Previous presentation | Current presentation | Reason |
| --- | --- | --- |
| Net revenue meant payments minus refunds | Revenue, refunds, after-refunds collections, and estimated proceeds are separate | Collections were being confused with proceeds or profit |
| Active access included cancelled subscriptions | Paid subscriptions set to renew are separate from cancelled access, trials, billing retry and ended subscriptions | Cancellation intent is not yet churn |
| Currency detail hidden in diagnostics | Source, currency and country tables are visible | International purchases must not be omitted or added without conversion |

## Fee model

For Apple purchases, the report shows the requested **15% commission scenario**:

`estimated proceeds = signed amount × (1 − recorded tax percentage) × 0.85`

Tax percentages are provider estimates of the share of the original amount deducted as tax, not statutory tax rates. A negative refund reverses the corresponding estimated fees and taxes. This is a scenario, not proof that Apple applied 15% to a particular transaction. Check Small Business Program enrolment and its effective date in Apple and RevenueCat.

Provider-estimated proceeds remain separate: `signed amount × (1 − tax percentage − commission percentage)` as documented by RevenueCat. In the October 28 audit, most stored Apple commission estimates corresponded to about 30%, not the requested 15% scenario.

If any monetary event lacks required tax or processor fee information, full proceeds for that group are unknown. Known proceeds and the missing-event count remain available; unknown costs are not replaced with zero. Stripe fees require actual processor information. Proceeds do not deduct creator compensation, AI, hosting, business taxes or other operating expenses, so they are not business profit.

## Subscriptions and churn

- Set to renew: confirmed, unexpired paid access without cancellation intent, trial status, or an unresolved billing issue.
- Cancelled, access remains: cancellation intent is recorded, but paid access has not expired.
- Active trials and unresolved billing retry are separate.
- Ended in period: currently ended subscriptions whose expiry/refund falls inside the period, including subscribers who joined during the period.
- Start-cohort churn: subscriptions active at period start that have ended by the snapshot cutoff, divided by active subscriptions at period start. A zero denominator is unavailable, not 0%.
- Counts use provider/subscription identities, not unique people. All state is reconstructed from the recorded lifecycle; it is not a live provider account balance.

## Reconciling external totals

The reported $177 in App Store Connect and $250 in RevenueCat cannot be reconciled exactly without matching the date range, selected metric, currency conversion and store scope. $250 × 70% = $175 is consistent with a roughly 30% commission difference, but is not proof of the cause.

Apple Sales and Trends uses estimated conversion rates; Apple financial reports use settled transactions and fiscal months. RevenueCat has gross revenue, revenue net of taxes, and proceeds metrics. Compare matching definitions and dates. Future RevenueCat events also retain their original provider USD amount for reconciliation; historical events were not backfilled or guessed.

Sources:
- https://www.revenuecat.com/docs/dashboard-and-metrics/taxes-and-commissions
- https://developer.apple.com/help/app-store-connect/reference/reporting/sales-and-trends-reports-availability
- https://developer.apple.com/help/app-store-connect/getting-paid/download-financial-reports

## Verification

TypeScript and targeted lint passed. Dashboard, reporting-window, fee-policy and billing-normalization tests passed. Read-only synthetic PostgreSQL fixtures verified signed refunds, fee reversals, tax-before-commission arithmetic, separate currencies and unknown fee handling. Production read-only queries and the local-only browser preview verified actual subscription totals and currency switching. No production financial records were altered.

## Direct provider checks

- Stripe webhooks feed the ledger. The five-minute recovery job scans the Stripe API and advances its checkpoint only after processing an entire interval. The dashboard shows that checkpoint separately from the last job invocation and keeps the last explicit webhook configuration result.
- RevenueCat webhooks feed the ledger. The admin API also reads the project Overview from RevenueCat API v2, cached separately for 60 seconds. Set `REVENUECAT_METRICS_PROJECT_ID` and a dedicated `REVENUECAT_METRICS_API_KEY` with `charts_metrics:overview:read` in production. The existing purchase-verification key has a different purpose.
- App Store Connect Sales and Trends is a daily comparison feed. Configure the `ASC_REPORT_*` variables with a Sales and Reports team key, the sales vendor number, and the parent SKU `app.mogging.scan`. The dashboard requests the report from two Pacific calendar days ago and displays purchase-side estimated proceeds by currency. Refunds and adjustments are outside that comparison. Monthly financial reports remain the settlement source. The same daily report can be checked manually with `asc analytics sales --vendor "$ASC_REPORT_VENDOR_NUMBER" --type SALES --subtype SUMMARY --frequency DAILY --date YYYY-MM-DD` using the reporting key.

Provider snapshots are shown separately from ledger totals. They do not create billing events or modify entitlements.


## Video-to-sale measurement

The Creator Performance report now offers a 14-day window and joins creator reach,
non-bot referral clicks, provider-confirmed attributed payments and subsequent
completed server-side evaluations. Bio-link traffic remains creator-level;
post-specific credit requires a recorded submission ID on the actual click.
Currencies and Stripe/RevenueCat totals remain separate. Client access events are
not sales. Unattributed sales still belong in the Revenue report.

`creator_video_observations` retains source and observation time. Reported payout
thresholds are lower-bound baselines, not exact impressions. Only exact verified
recordings with matching storage keys and authenticated TikTok API counts supply
measured growth. Growth requires an opening observation from the same source;
missing history stays unavailable. Collection does not rewrite payout amounts or
reviewed view thresholds. Hourly API snapshots are idempotent. The 15-minute cron
rotates through canonical TikTok post IDs for the first ten days after submission.
It uses the first submission event when a post was prepared as a draft. Historical
snapshots remain available. Private or unavailable posts stay missing, and a creator
who reconnects with the required permission can sync on the next cron run.

Before deploying, apply only the additive migration:
`bun run db:migrate --only 0072_creator_video_observations`.
Do not run unrelated pending migrations. This does not change report visibility.

TikTok automatic collection needs approved `video.list` permission and creator
consent. Keep `TIKTOK_CREATOR_VIDEO_SCOPE_ENABLED=false` until the **live** app
configuration confirms approval, then enable it and have creators connect again
from Accounts. Refreshing a token cannot add a scope. Profile permission remains
separately gated. Never match an unverified manual handle to a provider account.
The standard video query supplies views, likes, comments and shares, not watch
retention or audience locations; those still require verified recordings.

Web events now retain coarse browser/platform and flow version/entry labels.
Historical missing labels are not backfilled with guesses. The original checkout
flow ID survives Stripe return through evaluation completion. The data-health
webhook backlog excludes reconciliation-job receipts, which are not provider
webhook deliveries.

Verification: targeted provider/contract/admin tests, TypeScript, an isolated local
PostgreSQL fixture covering retries, partial video access, recording provenance,
view growth and payment-to-evaluation joins, and a read-only production schema
compatibility query. The fixture script refuses databases outside its dedicated
localhost test database (`scripts/tests/creator-video-metrics.ts`).


## Stripe checkout linkage repair

The reconciliation job checks durable entitlement checkout IDs against Stripe as
well as consuming recent provider events. Subscription checkout confirmation has
a canonical `checkout:<session>` key, while the paid invoice owns revenue. These
must never both add income. For an existing invoice, repair retains its original
provider-event ID and actual invoice paid time. Replays fill missing account,
subscription, transaction and product links without replacing known amounts.
A later webhook can replace an explicitly estimated checkout timestamp with its
provider event time. Incomplete or unverifiable checkouts remain unresolved;
recovery cannot fabricate success or change access.
