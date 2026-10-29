# Reliability release — 28 October 2026

Production: https://mogging-4jbffj26j-glimpseback.vercel.app (`dpl_Bto8kU5EW2znM4dbMMo4fcB7Wz3u`). Promoted through the authorized Vercel CLI account. Based on friend commit `274fafbf35f1ff9ffb4745e560a53d68a26b9731`, including the earlier `fa89cf5` campaign changes.

## Changes

- Reminder scheduling normalizes legacy timezones and isolates invalid devices; removes the PostgreSQL timezone expression that could abort the entire batch. Two production timezone aliases repaired.
- Stripe recovery uses a durable cursor, a fenced lease, fixed provider windows, and bounded incremental/audit work. Completed webhook receipts are skipped; failed events never advance the cursor. Operational analytics distinguish real unfinished webhooks from retired synthetic recovery jobs.
- Report parsing normalizes optional eye/hair metadata and keyed category responses while retaining required score/category validation. The observed failures were four invalid eye-color responses and one category-shape response.
- Auth preserves typed account-recovery errors, verifies Apple email claims, retries the selected OAuth provider, and gives embedded-browser guidance while retaining OAuth state/PKCE safeguards.
- Creator lookup accepts supported codes and links and resolves approved submitted videos through shared links owned by the same creator. Release cohorts assign each verified purchase once and use real report views, mature cancellation/refund windows, and distinct return actions.

## Verification

- Final isolated backend source: 207 test files passed, zero failed. Production build passed.
- Mobile: 438 tests passed across 87 files; typecheck passed. Native recovery changes require a future app build.
- PostgreSQL integration: billing lease/deduplication, creator recovery-to-purchase/refund fixture, release cohorts, and push delivery checks. Friend shared-budget suite: seven checks passed.
- One explicitly approved bundled demo image sent to the live analysis provider: success on first attempt, 12 categories, about 40.1 seconds. This verifies one response, not a latency-distribution improvement.
- New admin endpoint returns 401 without application authentication on the staged production build.
- OAuth browser-cookie tests reproduce missing/expired state failures; a production initiation probe checks state and PKCE cookies. Full human Apple/Google login remains a device/browser acceptance check.
- No real App Store purchase was made. The attributed purchase/refund integration uses provider fixtures; a physical-device paid creator chain remains a rollout gate before scaling spend.

## Preservation and migrations

Both friend commits are included. All local changed/untracked files were archived and hash-checked before merges; no unexpected preservation mismatches. Recovery stashes retained. Unrelated local edits were excluded from this release, not discarded.

Backups: `.local/pre-friend-merge-20261028-160452/` and path recorded in `.local/second-merge-backup.txt`. Reviewed source manifest: `.local/reliability-oct28-manifest.json`.

Friend migration `0065_creator_budget_reservations` is retained. Billing migration was renamed `0066_billing_reconciliation_state` with its SQL hash and original timestamp unchanged. The migration runner recognizes the existing production record and reports no pending work for that scope.

## Release measurement

Admin retention now exposes version cohorts for verified purchase, real report viewed, mature 24-hour cancellation, refunds and seven-day returns. A version with no real exposure is shown as not exposed. Missing/maturing denominators are not zero. These are observational cohorts, not randomized causal estimates. App Review delays mean new app cohorts cannot be evaluated before actual release exposure.

## Live post-deployment evidence

Scheduled Stripe run at 2026-10-28 23:30 UTC completed in 3,315 ms, checked 181 event entries across incremental/audit windows, recovered zero missing events, and returned `partial: false`. Both durable coverage checkpoints reached 23:30:49 UTC; the lease was released. Webhook configuration was ready. No real Stripe/RevenueCat receipts older than ten minutes remained unfinished.

Reminder scheduling had 15 consecutive successful runs after the timezone repair (through 23:31 UTC). This verifies scheduler health, not device receipt of a notification. One manual verification attempt used a differing local cron credential and correctly returned 401; that rejected probe is not a scheduler regression. Production cron definitions were confirmed bound to the promoted deployment.

Production OAuth initiation returned the Google authorization URL with state and PKCE cookies. Production creator lookup returned a controlled 404 for a nonexistent code. Production cohort query returned 11 version rows in 4,765 ms. The protected cohort endpoint returned 401 without an application login.
