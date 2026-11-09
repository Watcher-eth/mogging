# Purchase reliability and payment-channel reporting

The read-only 30-day audit found 660 linked mobile attempts: 554 cancellations, 64 missing outcomes, 30 SDK/reconciliation purchases with an activation signal, 11 store errors and one pending approval. Six errors were purchase-not-allowed (code 3); five were store-problem (code 2). This is 1.7% recorded errors plus 9.7% missing outcomes, not an established 11% payment-failure rate. These counts are a historical snapshot, not a permanent business result.

43 unresolved attempts ended with inactive/background state, 14 with a store request but no callback, five with unsuccessful recovery, one older build with inactive/background state, and one before the store request. An additional database check found no nearby linked provider payment for those 64 attempts. Lack of a payment record cannot prove that no charge occurred. Two SDK successes referenced transactions preceding the attempt (one by about four minutes, one by about 2.6 days); another SDK transaction had no matching billing record. The user approved the three provider customer-info lookups, including the endpoint's possible empty-record side effect. All three accounts already existed. RevenueCat confirmed the same production transactions for the two older purchases. The third account's current subscription is refunded and carries a different transaction ID; it does not prove the SDK-reported transaction. The two exact older transactions now appear as restored access, and one SDK success remains explicitly unverified. No monetary ledger entries or access were changed. Do not fabricate missing charges, prices, cancellations or activation.

| Previous | Revised | Reason |
| --- | --- | --- |
| One chart invited errors and unknowns to be combined | Separate restriction, technical-error, missing-outcome and access-unconfirmed metrics | Different problems and different follow-up |
| Only client transaction IDs could confirm an interrupted attempt | Stored RevenueCat records can recover a unique account/product/native-store/time-matched request | Handles app termination and either webhook/telemetry arrival order |
| Missing outcomes lacked operational context | Build, last stage, last evidence, age and recovery breakdown | Shows where tracking actually stops |
| All-source sales and mobile diagnostics were easy to confuse | Combined sales, explicit channel comparison, separate mobile and Stripe diagnostics | Device platform is not payment channel |
| Revenue repeated buyer-cohort panels | Revenue links to Purchases using the same period | Financials and checkout behavior each have one clear home |
| Provider verification had one 15-second request | Shared concurrent requests, two bounded attempts for transient faults | Retries only an idempotent GET; never repeats a charge |
| SQL attempt timestamps could be parsed in local time | UTC timestamps at the query boundary | Detailed and aggregate views agree about recent versus unresolved |

Recovery uses production initial purchases, trials or one-time purchases. A fallback match requires a linked account, exact product, matching native store, payment within five seconds before to ten minutes after the recorded store request, and exactly one eligible request across all recorded attempts (including outside the selected reporting window). Conflicting SDK transaction evidence, wrong accounts, old purchases, renewals, sandbox activity and ambiguous retries cannot use this fallback. Exact transaction matching remains available across prior purchase dates; older exact transactions with activation are classified as restored access, not new sales. Recovery confirms a provider purchase outcome, never automatically asserts client activation or creates a monetary ledger entry. Historical silent store exits without provider evidence remain unknown. This is backend-only; no mobile build or migration is required.

Apple/Google/Stripe can be combined for deduplicated paid transactions and linked customers, with source breakdowns. Monetary totals combine only the same original currency. Renewals count as payments, not new customers. Source-level customer counts can overlap. Stripe decline/expiry/invoice signals are provider events, not a denominator-compatible mobile conversion funnel. Stripe payments can unlock mobile access without being Apple purchases.

Verification: focused unit/rendering checks, rollback-only local PostgreSQL fixtures for full report SQL and source/customer aggregation, read-only production report checks, TypeScript and local browser inspection. No real charge was made. The changes were deployed on October 30, 2026.

Provider references: [RevenueCat errors](https://www.revenuecat.com/docs/test-and-launch/errors), [webhook delivery](https://www.revenuecat.com/docs/integrations/webhooks).

## Production release

- Production deployment: `dpl_8ANDqdMmPc3S4s31uiNmF1oTmZzQ` (`mogging-543al4jcv-glimpseback.vercel.app`).
- Build ID: `5KxTbsc4MvjF6pRM1a298`; live `www.mogging.com` serves that exact build.
- Isolated release snapshot used latest main `1f706a292ac2f4952020c165ea6be8a60fabc073` plus 22 reviewed analytics/reliability files, preserving the committed Creator Studio release. Unrelated local campaign edits were excluded and left intact. No Git push or database migration was performed.
- Locked dependency install, TypeScript, 41 focused unit/rendering tests and three rollback-only PostgreSQL integration tests passed on the combined snapshot.
- Staged and public production checks: homepage and health 200, database healthy, analytics and correctly formed entitlement requests 401 without app authentication, development-only analytics preview 404. The shipped bundle includes the restored-access outcome.
- Signed-in admin content and live Apple purchases were not exercised after deployment. Historical outcomes without provider evidence remain unresolved.

### Combined release after Studio deployment

A later Studio deployment (`dpl_BiWvbVJJZyJrdziUgRdKxghQPZNj`) replaced the first purchase release. Its live source differed from committed main in 14 Studio files. Those exact files were recovered through the authenticated Vercel deployment-source API and verified by SHA-1 before being combined with the 22 reviewed purchase release files. All 36 source hashes matched the staged deployment. No Studio source was reverted.

- Combined production deployment: `dpl_9CYMarduBMdiaWEtRbk33UcB5oDd` (`mogging-fleth98i7-glimpseback.vercel.app`).
- Live build ID: `axldm45NuUpwIOnyItjk9`.
- Combined snapshot: TypeScript, 41 focused unit/rendering checks and three rollback-only local PostgreSQL checks passed.
- Live homepage and health returned 200; database was healthy. Analytics and valid entitlement requests required authentication (401); development-only preview returned 404. The shipped client bundle contains the restored-access outcome.
- Deployment-scoped error/fatal log query returned zero records in the initial 15-minute window. This is limited post-deploy observation, not a guarantee against future provider or client failures.
- No migration or Git push was performed. Historical outcomes without provider evidence remain unresolved.
