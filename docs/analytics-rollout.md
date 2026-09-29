# Attribution and analytics: release plan

This change implements the week 1–3 data foundation and core semantic instrumentation. It is not live merely because the code exists: apply the migration, configure providers, deploy the API, and release a mobile build in that order.

## Ownership and performance

- Mobile and web use one Mogging event transport. There is no additional PostHog client/native SDK, autocapture, replay recorder, touch listener, screenshot capture, or render subscription.
- Mobile enqueue is synchronous in-memory work. A 500-event queue batches at most 50 events every 10 seconds. Async file writes coalesce over one second and serialize; requests time out after 8 seconds and back off to five minutes with jitter. Storage failures never prevent delivery or navigation. Events expire after seven days on hydration; oldest events are dropped at capacity. Short crashes can lose the last one second of unpersisted events. Analytics is best effort; billing is durable.
- Web batches at most ten events every five seconds, persists in session storage, uses keepalive on exit, and backs off to five minutes. Browser storage denial is tolerated. Campaign context persists in first-party local storage. Route templates exclude query strings/tokens.
- Allowed scalar properties have a conservative 2KB budget. Images, photos, raw errors, coordinates, demographic answers, scores, credentials, and arbitrary nested objects are excluded.
- Auth and purchase UI no longer wait for analytics delivery or creator-attribution network flushing. RevenueCat attribution attributes are cached by content/account and include the AppsFlyer ID when available.
- PostHog export runs on the server every minute, up to 2,000 behavioral and 200 billing events per invocation, with bounded execution time. UUIDs are stable across retries. Unexported events remain in Postgres. Only production events are exported.
- App foreground/background boundaries stop screen exposure timers. Paywall and personalization durations use a shared foreground-time counter without polling. Sessions rotate after 30 minutes of inactivity. Dwell measures foreground exposure, not eye tracking or active attention; store dialogs may still cover the app while it is foregrounded.

## Database and deployment order

1. Review and apply `drizzle/0035_analytics_billing.sql` through the existing migration workflow. The migration adds billing receipts, immutable lifecycle facts, identity links, analytics metadata, and export indexes; it does not delete existing data.
2. Configure server variables below. `POSTHOG_PROJECT_KEY` absent disables export while local ingestion continues. Existing clients remain compatible with defaulted metadata.
3. Deploy the web/API. Verify `/api/admin/analytics-health` while signed in and unlocked as an administrator.
4. Configure RevenueCat/Stripe webhook delivery, then test in sandbox. Sandbox financial rows stay in the ledger and are excluded from production creator totals/export. Creator routing is now first-party and requires no OneLink subscription.
5. Deploy the creator-code exchange API first; build and release the mobile handler/code UI before enabling `/r/*` Universal Links and store redirects. `app.config.js` is the single Expo dynamic configuration. The existing iOS entitlements include both Mogging domains. See the mobile `docs/creator-attribution.md` for staged rollout and device checks.
6. Check production health after the first real transaction and after one export interval. Inspect a consenting test account from anonymous session through authentication, onboarding, purchase, evaluation, and cancellation.

## Configuration required

Server:

| Variable | Value |
| --- | --- |
| `POSTHOG_PROJECT_KEY` | The project's capture key, not a personal API key |
| `POSTHOG_HOST` | `https://us.i.posthog.com` or the project's EU/self-hosted HTTPS ingestion endpoint |
| `CRON_SECRET` | Existing scheduler bearer secret, configured in the deployment environment |
| `REVENUECAT_WEBHOOK_AUTH_TOKEN` | Exact webhook Authorization secret in RevenueCat |
| `APPLE_APP_STORE_PROVIDER_TOKEN` | Actual App Store Connect provider token for campaign links |

Mobile:

- `EXPO_PUBLIC_APPSFLYER_DEV_KEY`
- `EXPO_PUBLIC_APPSFLYER_APP_ID` (numeric Apple app ID)

AppsFlyer/RevenueCat:

- Reserve `deep_link_sub1` for Mogging's signed attribution token and `deep_link_sub2` for creative metadata.
- Verify first-party associated domains and direct opening. A fresh iPhone install requires reopening the creator link or explicitly entering the code/link before purchase; do not claim automatic deferred attribution or count manual claims as verified installs.
- Configure RevenueCat's AppsFlyer integration if revenue forwarding is wanted. `$appsflyerId` is attached when available. The app no longer mirrors general behavior into AppsFlyer, which avoids client/server purchase double counting.
- Do not enable an ATT prompt solely for internal analytics. The SDK no longer waits ten seconds for a prompt the app does not present.

Stripe:

- Keep existing checkout, invoice, subscription-update/deletion, refund-charge, and dispute deliveries.
- Also subscribe to `customer.subscription.created`, `invoice.payment_failed`, `refund.created`, and `refund.updated`. Successful refunds use refund ID for deduplication; partial refunds are distinct facts. Invoices own subscription money; paid one-time checkout sessions own one-time money.
- Current entitlements remain owned by existing billing code. The new lifecycle ledger is for analytics and audit; it does not introduce a competing entitlement projection.

## Instrumentation coverage

- Web: page exposure/duration, landing store destinations, installed-app destination, plan selection, web checkout entry, analysis-step views/paywall/report views, evaluation success/failure.
- Mobile: cold and foreground opens, first installation open (existing installations are not counted as new), screen exposure/duration, onboarding primer/protocol/personalization steps, authentication success, library/camera/location permissions, photo selection, consent, paywall/product load/plan selection, purchase success/failure/cancellation, restoration, one-time upgrade purchase, evaluation attempts/duration/outcomes, report/category exposure, protocol tab and task completion, repeat evaluation entry, share/invite intent, and push open.
- Billing: every RevenueCat event is retained with normalized lifecycle, signed amount/currency, original event time, transaction IDs, safe metadata, and sandbox separation. Transfers are accepted without `app_user_id`. Unknown provider types are retained as `billing_other` for follow-up. Stripe lifecycle is normalized alongside it.
- Identity: authenticated account links are stored. Server ingestion rejects client finance/handoff authority and never relabels queued events to a different logged-in account. Mobile anonymous IDs include a session segment to prevent two accounts on one installation being merged. Provider-signed RevenueCat aliases and the existing server-side subscriber verification attach anonymous billing facts to the account. A transactional, deduplicated identify outbox also links already-exported anonymous billing in PostHog. Only RevenueCat anonymous IDs can merge; the first verified account owns that anonymous identity, so a later transfer cannot merge two customer profiles. Verification adds a small database transaction, not another mobile/provider request; a linking failure cannot deny access and subsequent verification retries it.

## Dashboard setup

The first-party dashboard is implemented at `/admin/analytics` (linked from creator admin). It shares the existing allowlisted account + admin-password access control. It reads Postgres directly; neither PostHog nor Metabase is required. Deploy the API/page and apply the migration before using it with production data.

Included tabs: overview, acquisition, onboarding, revenue, retention, and quality. Time windows are 7/30/90 days; platform filters apply to behavior, while verified billing remains all-platform. Production only. Server identity events and admin-route traffic are excluded from behavioral activity.

Reporting safeguards:

- Ordered device/browser funnels, a seven-day completion window, and explicit recent-cohort caveats. Purchase UX milestones are not financial truth. No claim of deterministic web-to-install matching.
- Onboarding step counts are labeled as milestones, not inferred conversion rates. Retention anchors at first evaluation **observed in the selected window**, not first-ever lifetime activation.
- Currency-separated gross/refund/net amounts; net excludes provider fees and taxes. Cancellation timing is observed intent, not churn rate or current subscription state.
- Aggregate-only responses, capped table sizes, indexed time windows, one read-only database transaction with an eight-second statement timeout, and a bounded 12-key/60-second process cache that coalesces concurrent requests. Auth precedes cache access. HTTP responses are private/no-store; the page does not poll.
- Plain tables and CSS funnel bars; no new chart dependency or mobile changes. Quality exposes delivery health and release-level evaluation latency, not invented native frame/startup measurements.

Verification: `bun run scripts/tests/admin-analytics.ts` with the same isolated database variable as below tests sequential ordering, duplicate actors, malformed durations, environment/platform filtering, separate currencies, mature retention, and empty states. A local synthetic 20,000-event query measured about 45 ms. `scripts/tests/admin-analytics-http.ts` targets only the isolated preview on port 3107 with synthetic credentials and validates authorization, filtering, private headers, and snapshot reuse. Desktop and 390px browser checks verified the password gate, tabs, and absence of horizontal overflow/error overlays. These are local checks, not production load or native-device profiling.

The isolated browser database intentionally contains only the analytics test schema, not the complete user-profile schema. Dashboard/session/health requests worked; unrelated app-shell profile and client-telemetry requests produced fixture-schema/user errors. This was not a clean full-application end-to-end test against a migrated staging database. The preview and test database were stopped afterward; the user's existing development server was left alone.

UI/performance review:

| Before | After | Why |
| --- | --- | --- |
| Creator-only password form | Shared admin password gate | One owner for the existing unlock flow |
| SQL starter queries only | Accessible tables and CSS funnel bars in admin | No chart SDK or mobile bundle cost |
| Unbounded ad-hoc reporting risk | Preset ranges, timeout, aggregate response, bounded cache | Protect request and database budgets |
| No in-product reporting caveats | Metric definitions alongside each report | Avoid confusing milestone counts, conversion, churn, and revenue |

Use `docs/analytics-dashboards.sql` as optional read-only Metabase starter queries. Optional PostHog reports:

1. Web visit → store redirect, segmented by first UTM source/campaign/creative.
2. First open → onboarding step → paywall → purchase UX completion → evaluation completed → report viewed.
3. Paywall viewed → plan selected → purchase started → completed, segmented by paywall surface/version and plan.
4. Activation cohorts with D1/D7/D30 retention based on report/protocol/evaluation actions.
5. Verified subscription starts, trial conversions, cancellations, expirations, renewals, refunds, and reactivations.

Use sequential funnels and unique people/flow IDs. A daily count of different milestones is not a cohort conversion rate. Do not mix currencies or treat sandbox records as revenue. Cancellation intent and actual expiry are different metrics. The local SQL cancellation query only knows observed history since instrumentation; historical backfill needs provider exports.

## Verification and rollout gates

- Unit tests: `bun test lib/payments lib/analytics lib/creator/revenuecat-attribution.test.ts` (web), and `bun test tests` (mobile).
- Integration: create a disposable localhost database named `analytics_test`, then run `ANALYTICS_TEST_DATABASE_URL=postgres://.../analytics_test bun run scripts/tests/analytics-billing.ts`. The script refuses non-local/non-test targets. It validates migration, duplicates, concurrency, retry/lease recovery, organic billing, chronology/refunds, and export outage/recovery.
- Queue benchmark: `bun run scripts/analytics-benchmark.ts`. This measures JavaScript enqueue/storage/network separation on the development host; it does not replace release-device frame/startup profiling.
- Both apps: `bun run typecheck` (use `bunx tsc --noEmit --incremental false` on web to avoid updating a shared build-info file).
- Real device: offline onboarding, terminate/relaunch, reconnect, background/foreground, restore, cancelled purchase, successful sandbox purchase, upgrade-sheet purchase, refund, direct creator link, clean-install deferred creator link, and account switch.
- Compare cold startup and paywall responsiveness on the same release build/device with collection enabled/disabled before broad rollout. No claim of zero native overhead is justified by TypeScript tests alone.

## Boundaries still requiring follow-up

- No provider project is created, webhook subscription is changed, or mobile release is submitted by this code change. Web/API production deployment is recorded below; provider-console settings still require verification.
- Replay remains disabled. Face/camera/report surfaces require verified native masking and a measured sampling budget before any recorder is enabled. The semantic funnel and dwell data work without replay.
- Per-post creator links, cost ingestion, App Store Connect/Play report import, Metabase hosting, and experiments belong to the next reporting/experimentation phase. Current creator link granularity is still account-level.
- RevenueCat does not emit every historical-period refund through the subscription cancellation webhook. Reconcile provider exports when preparing financial statements.
- Share intent/handoff is not proof that content was posted. No SDK can confirm every social-app post from a handoff.
- Raw behavioral-event retention/deletion automation should be configured with the agreed retention period. Do not silently purge the existing analytics table during this rollout.
- Anonymous mobile sessions that end before sign-in are not all automatically merged into one PostHog person; the install/flow IDs retained in Postgres are needed for cross-session pre-auth onboarding analysis. This deliberately avoids unsafe shared-device account merges.

## Local verification record (2026-09-28)

- Both TypeScript checks passed. The complete mobile test suite passed (61 tests); backend analytics/billing/creator tests passed (38 tests).
- Disposable PostgreSQL integration passed receipt deduplication, failed/expired lease recovery, concurrent delivery, provider-time ordering, refunds, anonymous-purchase linking before/after and concurrently with webhooks, cross-account merge protection, and export outage/recovery. Provider HTTP was stubbed; this was not a live PostHog or store purchase test.
- Development-host benchmark: 10,000 sanitize/enqueue calls in approximately 6.7 ms, p95 enqueue approximately 0.0008 ms, zero synchronous storage writes or requests. This microbenchmark excludes native SDKs, UUID generation, UI rendering, and device startup.
- Source diff whitespace checks passed. Concurrently generated Xcode logs contain unrelated whitespace and were left untouched.
- At the end of local verification, production migration/deployment were still pending. The subsequent deployment is recorded below. Provider configuration, real-device attribution tests, and native performance comparison remain pending.

## Production deployment record (2026-09-28)

### First-party creator exchange: API-only rollout

Live verification after activation: `www.mogging.com` serves AASA with `/r/*` (200), and an iPhone browser request to the branded creator link returns an App Store 307 with private/no-store. The bare `mogging.com` AASA request still receives the existing domain-level 307, so use generated canonical `https://www.mogging.com/r/...` links; bare-domain Universal Links are not verified.

**Subsequent routing activation:** At the user's explicit request to enable links before their own device testing, promoted `https://mogging-6k9kinrdn-glimpseback.vercel.app` on 2026-09-28. This preserves the API-only release and adds the creator route, shared link-routing helper, provider-free link builder, and `/r/*` AASA rules. Production build and mocked routing checks passed; staged iPhone requests returned 307 to the App Store, and Instagram requests retained the app/code/store fallback. Real-device testing remains pending. TestFlight build 60 contains the required handler; public users still need an App Store update. Fresh installs must reopen the creator link or enter the code—automatic deferred-install attribution is not provided. Apple/device association caches can delay activation. Rollback target: `https://mogging-dq92k03i1-glimpseback.vercel.app`.

- Promoted `dpl_34F2uqJWyCAbAtPvND8ou9zwKfS5` (`https://mogging-dq92k03i1-glimpseback.vercel.app`) after staging and verification. Source: production commit `0d9dcc17d56e47241e05d0dde6ac3c8189118bf7` plus only `pages/api/attribution/link.ts`; unrelated working-tree changes were excluded.
- Verified GET 405, malformed POST 400, inactive code 404, rate-limit headers and private/no-store responses. A live POST using Mogging's own creator link returned 200 and a signed `mogging:` URL. This recorded one QA click with user agent `MoggingReleaseVerification/1.0`; no install, purchase, or commission was created.
- Production AASA still excludes creator `/r/*` routes, and the existing creator landing route is unchanged. Do not deploy the pending AASA/store-redirect changes until the new mobile build is released and real-device tests pass.
- Mobile automated checks: 65 tests passed plus the first-party runtime integration script and TypeScript. The Release simulator build installed/launched, and an inactive creator URL displayed the expected error alert. This is not real-device attribution or purchase verification.
- Signed iPhone archive succeeded at `/private/tmp/mogging-creator-link-release.xcarchive`; both root/www associated-domain entitlements were verified. App Store Connect upload succeeded on 2026-09-28 at 22:24 UTC for version `0.1.56`, build `60` (Xcode automatically incremented archived build `59`). Apple reported processing, not TestFlight availability or App Store publication. Distribution logs: `/private/var/folders/b5/bypf54694xz5_4h0qn1qpws80000gn/T/moggingscan_2026-09-28_16-22-26.409.xcdistributionlogs`.
- Upload warning: the archive lacks the Hermes framework dSYM for UUID `B99B4F0D-1B56-3D94-940F-383F4F00C905`; upload succeeded, but Hermes crash symbolication is incomplete. Real-device attribution/purchase testing and native performance comparison remain pending. The user will connect an iPhone after deployment.
- API-only rollback target: `https://mogging-782y2j1rk-glimpseback.vercel.app` (`dpl_55KtEkm4gW7tRiSco8bFqFFFuJwN`). No migration was required for this endpoint.

### Earlier analytics deployment

- Promoted `dpl_Fyp6XfzZqLCt3yLsowEM2gyLVJuB` (`https://mogging-83670814d-glimpseback.vercel.app`) to mogging.com after a production-target build with domain assignment deferred. Release source: HEAD `a14b689` plus the analytics changes and the five creator files already present in the preceding production release. Unrelated in-progress leaderboard changes were excluded.
- Reviewed and applied the four pending journal entries through `0035_analytics_billing` in one transaction, with a two-second lock timeout and 30-second per-statement timeout. This included the prior private-photo default, referral-signup table, and idempotent creator identity changes. Normal Drizzle migration hashes/timestamps were recorded. Existing analytics data was preserved.
- Production build/type validation passed; focused analytics/billing/attribution tests passed (35 tests). Homepage, creator page, and health endpoint returned 200 after promotion. Unauthenticated admin analytics/health APIs returned 401 with no-store; the analytics page returned its intended private 404 for unauthenticated visitors. Unauthenticated export cron returned 401. Invalid event ingestion returned 202 with zero accepted and one rejected, without inserting test traffic.
- Read-only dashboard queries succeeded against production for 7/30/90-day ranges. End-to-end timings from the development machine were approximately 1,850/876/896 ms, including network/transaction overhead; these are not database-only timings or mobile performance measurements. The existing one-minute dashboard cache remains enabled.
- PostHog, Apple campaign provider token, and deferred-link template were absent from the production environment inventory. The first-party dashboard does not require PostHog. New mobile metrics depend on shipping the instrumented mobile build; historical billing and onboarding data were not backfilled.
- Rollback target, if needed: `https://mogging-knwkxfr6q-glimpseback.vercel.app` (`dpl_HsfkhsaHFTDsdPo3ZYnXS7o97vKQ`). The additive schema can remain in place when rolling back application code.
