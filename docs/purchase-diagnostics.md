# Purchase diagnostics

The Purchases admin page keeps the existing whole-window funnel and adds a restricted attempt report at `/api/admin/purchase-attempts`. The detailed report includes at most 2,000 recent linked attempts and 80 expandable timelines; its counters describe that cohort. Filter by purchase type, paywall, build, and tracking coverage. Known sandbox purchases are excluded from its displayed counters. Failed or cancelled attempts may have no known store environment, even when the app's telemetry environment is production.

## Event meaning

- `purchase_started`: a purchase-button tap, with one shared attempt ID.
- `purchase_stage_changed`: session restore, product loading, purchase preparation, store request, or access activation. Includes the previous stage's duration.
- `checkout_started`: about to invoke RevenueCat's native purchase API after preparing identity/attribution. This does **not** prove the Apple sheet was visibly presented.
- `purchase_completed`: the SDK returned a successful purchase. Includes transaction ID where returned. Subscription sandbox status comes from the matching RevenueCat subscription/entitlement, never the app build.
- `purchase_cancelled`, `purchase_failed`, `purchase_pending`: distinct store outcomes. A cancellation code returned before the store boundary is a preparation failure.
- `purchase_activated`, `purchase_activation_failed`, `purchase_account_required`: payment success is separate from account setup and backend access activation.
- `purchase_app_state`: active, inactive, or background during an active attempt. These are observations, not abandonment classifications.
- `purchase_recovered`, `purchase_reconciled`: journal recovery on launch and provider/backend checks on launch, foreground, or account establishment. No additional store purchase is initiated.
- `purchase_cancel_feedback`: an optional bounded choice, at most weekly per device. iOS offers price, not ready, payment/account trouble, or other; Android offers price/not ready. Skip records no motivation.

Stage and total duration, product, price/currency, paywall, plan, build, OS, SDK code, allowlisted native domain/code, nested domain/code, and safe HTTP status help explain failures. Raw error messages, receipts, purchase tokens, photos, questionnaire answers, and payment details are never analytics properties.

## Reliability and recovery

All purchase events and the native checkout boundary persist immediately through the existing analytics queue. Critical events retain up to 30 days of offline history, within the existing 500-event cap. A separate serialized, atomic journal retains the latest 25 unfinished attempts. Store requests wait for best-effort durable tracking, not network delivery; telemetry storage errors do not block purchasing.

Recovery requires a matching product and provider purchase date in the store request window, with exactly one eligible interrupted attempt. Ordinary unresolved requests have a ten-minute matching window; an explicitly pending approval may complete later. Existing purchases, conflicting retries, wrong accounts, or ambiguous scan transactions stay unresolved. Known SDK successes stay purchased even when access activation fails. Backend access checks never initiate another charge.

The admin report marks billing verification only for an exact transaction/product match against an initial purchase, trial, or one-time purchase in the production RevenueCat ledger. Provider-observed or SDK success alone is not that ledger verification. Timelines use UTC timestamps and pseudonymous device labels. Attempt/device counts are separate; retries can place the same device in multiple outcomes.

## Rollout and verification

Deploy the web contract/endpoint before releasing the mobile build with tracking version `2`. Older builds' missing stages/results are not reconstructed. Compare detailed builds separately before drawing conversion conclusions. Web deployed on 2026-10-14 to `www.mogging.com` as `dpl_8GsBYk9v18VV4hU8V2fqT1YPaHv2`. Mobile is prepared as `0.1.73 (77)` and awaits TestFlight upload. No SQL schema migration was needed; the query uses existing tables and indexes.

Checks:

- Mobile purchase attempt, recovery, runtime, queue, purchase outcome, native boundary, and paywall activation tests.
- Web outcome classification, contract parity, and tracking ownership tests.
- Disposable PostgreSQL integration: `PURCHASE_ANALYTICS_TEST_DATABASE_URL=postgres://.../purchase_analytics_test bun run scripts/tests/purchase-analytics.ts` (refuses non-local/non-test databases).
- Typecheck in both projects; local browser filters and expandable timeline preview.

A physical-device/TestFlight validation of Apple cancellation, pending approval, and successful payment remains required before release. No real purchase was made during automated verification.

Release checks: isolated production snapshot, Vercel production build and promotion passed; homepage HTTP 200, new admin endpoint HTTP 401 without authentication. Read-only query passed against the configured database. iOS prebuild completed, duplicate generated widget target removed, CocoaPods installation completed (137 pods), app/widget build settings synchronized, and Xcode opened on Any iOS Device (arm64).
