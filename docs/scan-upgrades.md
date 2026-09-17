# Scan allowances and purchases

The server owns the scan balance. An active Pro flag alone never authorizes a scan.

| Access | Allowance | Expiry |
| --- | --- | --- |
| Weekly | 1 scan per paid billing period | End of that week |
| Monthly | 2 scans per paid billing period | End of that month |
| Yearly | 2 scans in each monthly window anchored to the paid year's start | End of each monthly window |
| Single / three-scan purchase | 1 / 3 scans | Six calendar months after the verified purchase |

Calendar arithmetic uses UTC and clamps short months without drifting (January 31 → February 28/29 → March 31). Unused subscription scans never roll over. Skipped months do not accumulate. Subscription credits are spent first; purchased packs then spend in expiry order. Cancellation at the end of a paid period retains that period's access; expired/refunded subscriptions cannot supply new scans.

The existing admin code, activation codes, referral/invite credits, time-limited unlimited codes and lifetime access retain their access behavior.

## App behavior

“New” in Evaluations fetches a fresh server balance before opening the person picker or scanner. An exhausted balance opens the existing buy-more-scans sheet. A failed balance check offers an error instead of assuming access. The server checks again when generating, so another device or a period boundary cannot bypass the limit. A server 402 also opens the sheet.

Native purchases and restores apply the verified server balance. SDK Pro status cannot mint credits. Purchase confirmation failures retain the sheet's retry-sync path without charging again. Transport retries within a scan submission reuse its request ID; confirmed failed analyses use a new ID for a new attempt.

## Ledger guarantees

- Verified RevenueCat purchase IDs and billing transactions are bound once across aliases and restores. Account deletion preserves transaction tombstones so recreating an account cannot refill old purchases.
- Stripe subscription dates come from the current subscription item. Balance reads reconcile Stripe subscription state, including missed or out-of-order webhooks. Unpaid checkout completion does not grant access.
- One database transaction locks and reserves a credit before model work. Concurrent requests cannot spend the same last credit.
- The analysis and durable retry result commit together. A lost response replays the existing result without charging again.
- Confirmed failures return one credit to the original bucket, retaining its expiry. Abandoned reservations are returned after five minutes on the next balance/read request. A late worker cannot save a report after that reservation has been returned.
- Refunds revoke remaining credits. RevenueCat refund tombstones also cover refunds delivered before the purchase sync. A failed in-flight scan cannot restore a refunded balance.
- Successful reports from the current period before this migration count against its initial allowance. No past-period allowance is backfilled.

## Release requirements

1. Apply `0031_scan_allowances.sql` through `bun run db:migrate` before deploying this backend. It adds credit expiry, billing starts, reservations and the historical usage cutoff, and retains purchase identities after account deletion. It does not alter invite/referral-code expiry.
2. Deploy the backend before releasing the mobile build. Scan enforcement no longer depends on the old `PAID_ANALYSIS_REQUIRED` flag.
3. Configure `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_WEBHOOK_AUTH_TOKEN`, and the Pro entitlement (`REVENUECAT_PRO_ENTITLEMENT_ID`, default `pro`). Subscription products are `mogging.pro.weekly`, `mogging.pro.monthly`, and `mogging.pro.yearly`.
4. Configure consumable products `mogging.evaluation` and `mogging.evaluation.pack3`. Server overrides are `REVENUECAT_SCAN_PRODUCT_ID` and `REVENUECAT_SCAN_PACK_PRODUCT_ID`; match the mobile `EXPO_PUBLIC_SCAN_PRODUCT_ID` / `EXPO_PUBLIC_SCAN_PACK_PRODUCT_ID` values. Do not attach consumables to Pro.
5. Perform native sandbox QA: onboarding purchase, allowance exhaustion, New → upgrade sheet, consumable purchase, interrupted purchase sync, restore/reinstall, and subscription renewal. This code review does not certify App Store configuration or a live deployment.

Historical RevenueCat packs are initially blocked until the next server sync restores their actual purchase-based expiry without changing their remaining balance. Historical Stripe packs use their stored creation date. New Stripe packs use the verified charge date.

## Verification

- `bun --no-env-file test` with a dummy `DATABASE_URL` runs backend unit tests without loading live integration settings.
- `SCAN_TEST_DATABASE_URL=postgres://...@127.0.0.1:55439/postgres bun run scripts/tests/scan-allowances.ts` runs the isolated database suite. It creates/drops its own schema, applies the real migration, mocks payment providers and refuses remote databases.
- The original `scripts/smoke/scan-credits.ts` command delegates to that suite.
- Run `bun run typecheck` in both repositories and `bun run test` in the mobile repository.

The database suite covers limits, concurrency, request replay, refunds, six-month expiry, historical usage, atomic report persistence, abandoned-request recovery, purchase/refund ordering, account aliases/deletion, preserved code access, forged client inputs and Stripe billing dates/renewals.

Provider field references: [RevenueCat customer API](https://www.revenuecat.com/docs/api-v1/customers), [Stripe subscription items](https://docs.stripe.com/api/subscription_items/object).
