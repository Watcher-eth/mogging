# Mogging analytics review — October 28, 2026

## Scope and method

Production data was read on October 28, with the main snapshot at 15:34 Pacific and follow-up checks that afternoon. The main comparison is **October 21–27 vs October 14–20**, with both windows ending at midnight Pacific. The recent incident window is **October 25–27**; October 28 is a separate partial-day check. Boundaries are 07:00 UTC during these dates.

Sources: first-party analytics_events; verified subscription_events; scan reservations and completed analyses; creator click/claim/payment ledgers; creator payouts/submissions; push registrations and delivery claims; backend request telemetry. Queries use read-only transactions and existing dashboard customer/internal/sandbox exclusions. Raw snapshot JSON files beside this report preserve the evidence. Customer/device counts across windows, providers, and versions can overlap; do not add them as unique people. App first opens are observed telemetry, not Apple-reported downloads.

**The pending app cannot be evaluated as a public rollout.** Last week, 1.41(80) accounted for 1,162 active version identities, 1,140 of 1,149 first opens, and all 767 observed paywall devices and 437 detailed purchase starts. Newer versions 1.44, 1.45, 1.47 and 1.48 each appeared on only 1–4 devices, with no paywall exposure. Those observations could include review/testing and are not a treatment cohort. Older builds still have revision-4 onboarding. Zero courses/progress activity is not evidence against features that have not reached customers.

## Executive assessment

Acquisition is growing strongly. Installed-paywall conversion remains low; higher absolute sales mostly accompany higher traffic. Buyers are getting reports, but early subscription cancellation and very limited ongoing engagement undermine recurring value. Two operational jobs are currently failing independently of App Review: reminder scheduling and Stripe recovery. Report validation also developed a real, customer-visible failure cluster. Creator attribution still loses continuity before native purchase attribution, so creator-level ROAS is not measurable.

## Weekly comparison

| Metric | Oct 14–20 | Oct 21–27 | Change |
|---|---:|---:|---:|
| Public website visitors, first-party | 865 | 1,887 | +118.2% |
| Homepage entry identities | 524 | 1,059 | +102.1% |
| App Store redirect identities, all tracked surfaces | 296 | 731 | +147.0% |
| Observed app first opens | 429 | 1,149 | +167.8% |
| Ordered onboarding funnel: started | 434 | 1,170 | +169.6% |
| Ordered onboarding funnel: reached paywall | 277 | 767 | +176.9% |
| Ordered onboarding funnel: purchase completed | 6 | 17 | +183.3% |
| Paywall→purchase in that ordered funnel | 2.17% | 2.22% | +0.05 percentage points |
| New paid subscription identities, ledger | 6 | 17 | +183.3% |
| First-time paying accounts, across products | 8 | 17 | +112.5% |
| Positive billing transactions, all products | 10 | 19 | +90% |
| Server scan reservations completed | 9 | 25 | +177.8% |
| Server scan reservations failed | 0 / 9 | 5 / 30 | 16.7% current request failure rate |
| Creator browser clicks | 130 | 317 | +143.8% |
| Creator submitted-post cohort | 49 | 95 | +93.9% |
| Creators in that submitted-post cohort | 10 | 27 | +170% |
| Creator cash payouts, USD | $1,420.00 | $2,161.31 | +52.2% |

The ordered onboarding funnel is deliberately narrower than all purchase events: the prior week had eight client purchase-completed events but only six in the full ordered onboarding funnel. Earlier detailed-attempt coverage was incomplete (63/168 starts), so the apparent increase from 63 to 437 detailed attempts is **not** a clean growth or conversion comparison.

## Acquisition and website

Homepage start-web-analysis actions rose from 108/524 (20.6%) to 285/1,059 (26.9%); homepage App Store clicks rose from 73/524 (13.9%) to 195/1,059 (18.4%). These are same-page activity ratios, not proof of completed native installs.

Current-week homepage sources: direct/unattributed 622 visitors, Instagram `ig` 190, google.com 104, Google Android app 93, TikTok-tagged/referrer entries 29 across two source labels. Google-labelled entries grew from 110 to 197 (+79.1%). This establishes more first-party search-referred traffic, **not** a Search Console ranking improvement or a complete creator demand estimate. Creators can cause branded search/direct App Store discovery.

Daily first opens peaked at 237 on October 24, then 174, 160 and 144 on October 25–27. The peak cooled, but those later days remained well above the earlier week's 31–91/day range. There is no monotonic collapse. October 28 had 107 first opens and one client purchase by 15:34 Pacific; it is incomplete and must not be compared with a full day.

The ledger shows zero Stripe paid charges in October 21–27 versus two ($9.98) the prior week. It also has 111 checkout-expired records versus 31. Expirations are classified by event time and are not a cohort conversion denominator. Investigate homepage→web scan→sign-in→checkout and mobile-to-web handoff separately. Backend web-checkout 401s (21 last week, five in the recent three days) need trace-level separation of legitimate unauthorized requests from lost authenticated sessions. Do not simply remove authentication.

## Purchase and paywall behavior

Current week: **437 detailed attempts**, 17 activated purchases (3.9%), 369 cancellations (84.4%), seven explicit store failures (1.6%), and 44 unresolved attempts (10.1%). There were no observed purchased-but-access-unconfirmed attempts in the aggregate. All 44 unresolved devices had neither a later client purchase success nor a later verified charge observed through the partial-day cutoff. This is unresolved telemetry/abandonment, not evidence of 44 customers charged without access.

Recent three days: 183 attempts, nine activated, 150 canceled, five store errors, 19 unresolved. Previous three days: 209 attempts, seven activated, 183 canceled, two store errors, 17 unresolved. Activation per attempt improved from 3.35% to 4.92%; explicit errors increased from 0.96% to 2.73%, with very small counts. The dominant loss remains cancellation, not an activation outage.

Cancellation feedback: **94 of 125 responses cited price (75.2%)** last week. In the recent three days, **45 of 56 (80.4%)** cited price. Responses are self-selected; do not generalize the exact percentage to every canceling user.

Detailed current-week attempts by plan: monthly 369 attempts / five activated; weekly 63 / 12 activated; yearly five / zero activated. Monthly is the overwhelming attempted/default path, while most activations come from weekly. This is not a randomized pricing experiment: intent, selection, and the default plan confound the comparison. It supports testing a clearer weekly/monthly commitment presentation after rollout, rather than declaring one plan causally superior or immediately discounting all prices.

Restore telemetry contains 76 starts and 76 `purchase_restored` events on 52 devices, with no `restore_failed` events. The restored events do not expose an outcome distinguishing actual restored entitlement from no purchase history; these counts cannot prove 76 useful restores. Physical-device purchase/restore verification remains a separate requirement.

## Revenue and recurring value

Verified positive charges rose from 10 to 19. Current week: 17 initial subscriptions, two renewals and one refund. Previous week included six initial subscriptions and four one-time payments. All current-week positive charges were App Store/RevenueCat in the observed ledger.

| Currency | Oct 14–20 gross | Oct 21–27 gross | Current-week refund |
|---|---:|---:|---:|
| USD | 44.93 | 74.87 | 4.99 |
| EUR | 19.98 | 11.98 | 0 |
| KRW | 7,700 | 0 | 0 |
| AUD | 0 | 14.99 | 0 |
| CAD | 0 | 12.99 | 0 |
| GBP | 0 | 4.99 | 0 |
| ZAR | 0 | 199.99 | 0 |

Do not sum these currencies. Historical RevenueCat records in this window do not carry the USD normalization property present in the current local normalization code; a comparable total needs sourced FX or recovered provider USD prices. The dashboard's `revenueTotals.net` is a history total, not weekly revenue; the period-specific financial aggregates were used here. Apple proceeds use the configured 15% Small Business scenario and differ from the provider commission estimate; neither is a bank-settlement statement.

**Delivery improved:** all 17 first-time paying accounts last week generated a successful report within 24 hours, versus six of eight the previous week. This uses server report records and does not imply every report was viewed.

**Recurring value remains weak:** nine of those 17 buyers canceled renewal within 24 hours. At the week-end snapshot, 20 subscriptions still had access: eight auto-renewing and 12 canceling. Canceling access is not the same as expired access. One refund occurred; small counts do not establish a refund trend.

The 14-day membership report has only six subscribers mature enough for seven-day outcomes: one performed a first protocol action and none had a second scan at least a day later. Meaningful-action retention after first evaluation is 0/19 eligible on D1 and 0/6 on D7. These are small, narrowly defined cohorts; the new Progress/Courses product has not been evaluated. Current-week observed protocol task completions were only three. The commercial interpretation is that many customers appear to treat the app as a one-off report, and the next app needs to establish a concrete next action and return reason.

## New operational failures and recent customer issues

### P0: Reminder cron is failing for all accounts because of invalid database time zones

There were **2,935 HTTP 500s** in October 25–27, plus **933** in the October 28 partial day. Failures began October 25 at 23:05 Pacific. A device with `Asia/Saigon` was updated at 23:05:05 immediately before the first failed job at 23:05:43. A later device contains `Europe/Kiev`.

Both strings fail the production PostgreSQL `timezone()` function with error **22023**, reproduced inside read-only transactions. The current scheduler evaluates each stored zone in a SQL expression over candidate devices, so one unsupported zone can fail the query globally. The reward-selection query itself succeeds; the SQL time-zone expression is the confirmed problematic operation. Canonicalize zones at registration, migrate existing aliases, validate against database support, and isolate invalid devices so one cannot block everyone. Verify actual protocol/reward push delivery after repair, not just a 200 response.

### P0: Stripe recovery cron no longer advances

There were **864/864 failed runs** in the recent three complete days, plus 187 failures today. The latest successful reconciliation checkpoint is **October 24 at 15:35 Pacific**. Failing runs take approximately **80.8 seconds**; the implementation explicitly aborts when its 80-second processing budget is exceeded during the event loop. This strongly suggests a catch-up/full-audit workload that cannot finish, but the exact provider event/work item has not been isolated by a runtime trace.

The apparently large unfinished-webhook backlog was checked: **all 1,161 outstanding receipts at the later drilldown are `stripe_reconciliation` job receipts**, not 1,161 unfulfilled customer purchase webhooks. Direct Stripe and RevenueCat webhook endpoints have no recorded technical failures in the current week. The recovery safety net is broken; this does not establish that ordinary purchase fulfillment is broken.

Repair with bounded, durable progress/cursor ownership, overlap/deduplication preserved, and explicit retry handling; verify a completed historical audit and a fresh incremental pass. Merely raising a timeout would not demonstrate reliable recovery.

### P1: Generated report validation failures

Five failed server reservations last week, affecting two customer accounts. Three occurred in the recent three days, on one of those accounts. All five saved failure reasons are: "The generated report could not be validated. Please retry; your scan credit is still available." Backend classification is `provider_bad_response`.

Both affected accounts later obtained successful scans; one also later canceled renewal. This is a retry/quality problem rather than evidence of a still-blocked paid account. Confirm invalid output fields/model/prompt, preserve credit/refund behavior, and bound automatic retry/fallback. Do not weaken the report validator just to improve the apparent success rate.

Recent-three-day completed-evaluation median increased to 40.1 seconds and p90 to 75.1 seconds, versus 30.0 seconds / 35.8 seconds in the prior three days. Successful sample sizes were 13 and seven timed events respectively. The full-week median improved versus the preceding week (35.0 vs 42.9 seconds), so median improvement conceals a newly slower tail.

### P1: Authentication still loses users

Client auth failures: 96/1,498 starts (6.4%) last week vs 25/520 (4.8%) previously. The recent three days are roughly flat against the preceding three days: 41/620 (6.6%) vs 45/707 (6.4%). Apple accounts for 38/41 recent failures: 16 native `ERR_REQUEST_UNKNOWN`, 16 session-exchange 404s, three 401s, two unknown errors and one provider-not-active. Google had three account-not-found outcomes.

Some 404s are the backend's explicit existing-account-only rejection, not server crashes. Trace whether a new user chose sign-in and got stranded instead of receiving an obvious create-account path. Apple 409s earlier in the week correspond to the missing-email/new-account path in server code; inspect recovery without claiming every native failure has that cause.

Recent client auth errors affected 29 devices; 15 later authenticated successfully and 14 have no later observed success. Separately there are 128 OAuth-state-missing and 33 other OAuth backend failures in the recent three days. Those are request counts and may include web/creator flows, retries or automated traffic; do not add them to client failures as unique users. Reproduce creator-link/in-app-browser→OAuth→callback, cookie/state lifetime, and sign-in/create intent on the installed build and the pending build.

### What appears to have stayed fixed

No new creator endpoint HTTP 500s in October 25–27; the 17 recorded last week stop on October 22 Pacific. No new handoff-create 503 cluster comparable with October 15. No observed new web scan HTTP 400 cluster, but there was only one successful web analysis in the recent period, so that is limited evidence. No stalled scan reservations or missing completed-report references at the snapshot. The latest legacy Battle delivery claims are October 21; none in October 25–27. Delivery claims are not proof of a notification being opened.

## Creator acquisition and attribution

Creators expanded from ten to 27 in the weekly submitted-post cohort and from 49 to 95 submitted posts. Current approvals cover 85 posts with a current recorded total of 5.23 million verified views. These are cumulative reviewed counts for that submitted cohort, not 5.23 million views independently measured as gained during the week.

Browser creator-link clicks grew 130→317, and associated distinct browser identities 108→251. Fourteen creators generated tracked browser traffic, versus five previously. Top current-week tracked creator traffic includes pain.psl (123 clicks / 100 visitors); direct and first-touch credits are alternative accounting views and must not be summed.

The current-week ledger has five signup events, two checkout events, 13 direct claim events across nine identities, **one recorded native attribution installation touch**, and **zero creator-credited payments**. All 19 positive customer billing events are `no_eligible_touch`, not merely pending attribution processing. The creator attribution cron is running successfully; running a reconciler cannot reconstruct a missing acquisition touch.

Installed 1.41 diagnostics show 1,105 devices with `NOT_FOUND`, 1,103 resolving to organic, 31 diagnostic errors and two storage failures. These statuses are not proof creators produced no demand: consumers can search the brand, install from the App Store, or lose their browser click during installation. The newer first-party recovery flow is not broadly present on the installed version. Also, **no Apple campaign download metrics were imported** in the 14-day window. We cannot report creator- or video-level download conversion from this dataset.

Creator-code lookup itself deserves investigation: 34 of 35 `attribution/link` backend requests last week returned 404, including 15 of 16 in the recent three days. That may be invalid/stale/mismatched codes or submitted-post URLs; the logs do not establish which. Test a known valid creator code and post-specific URL end to end before concluding the new resolver is broken.

Creator cash payouts were $2,161.31 last week, $1,420.00 the prior week, **$3,581.31 over 14 days**. Zero credited revenue is an attribution limit, not proof of zero causal return. Nevertheless, scaling that spend without a measurable paid-customer outcome is commercially risky. Retain creator/video codes, demonstrate click→install/recovery→account→purchase on an actual device, import official campaign metrics, and compare creators by qualified acquisition and retained buyers rather than views alone.

## Referrals and instrumentation

Credited friend referrals increased nine→30; inviters increased five→17. There were six referral-funded completed scans last week. The 14-day report has nine mature referred accounts: one reached mobile telemetry, two reached a paywall, none had an observed report view or paid purchase within seven days. The other 30 are not mature yet. Do not interpret the dashboard's current-week `paid7=0` as a mature conversion rate when its eligible denominator is zero. Audit referral signup identity/notification/return-to-app, then the reward redemption experience.

First-party ingestion remains timely: recent iOS receipt p95 is about 11 seconds and web about six seconds. Detailed purchase-attempt ID coverage improved from 63/168 (37.5%) to 437/437 (100%). This is a real instrumentation improvement already visible in the installed app, separate from the unreleased request-level scan and course/progress instrumentation. There are still zero `evaluation_request_*` starts/completions in the observed installed population; use reservations and reports as the scan truth.

No client or billing export progress was observed in the relevant PostHog pending rows. The export cron returns successful 200s almost immediately and explicitly no-ops without POSTHOG_PROJECT_KEY. Verify the production export setting before declaring a broken export pipeline. The data is present in the first-party database; these pending counts are not missing customer events.

Search Console and GA4 were not readable through GSC Wizard: both discovery calls were refused because that account has no active subscription/trial. Restore access at https://tool.gscwizard.com/settings/subscription for independent search-ranking/channel validation. First-party site traffic was still analyzed. A separate local Stripe probe used a **test** credential and returned no records; it was explicitly discarded and is not evidence about live Stripe payment activity. No provider financial completeness claim is made beyond the stored production ledger.

## Priority order

1. **Immediately, server-side:** fix the global reminder time-zone failure and stalled Stripe reconciliation. Neither depends on App Review.
2. **Immediately, report quality:** isolate the five validation failures and slow tail, test credit preservation plus bounded retries. Both customers recovered, but repeat failures and 75–96-second tail observations damage trust.
3. **Authentication:** distinguish account-not-found/user intent from technical OAuth failures; test embedded-browser state and Apple new-account/email paths with real production-like sessions.
4. **Release verification:** once the new app is approved, record the first real customer exposure per version. Validate purchase, cancel, restore-with-history, restore-without-history, account recovery and first-party creator attribution on physical hardware. No outcome uplift should be attributed to pending changes.
5. **Paywall value/commitment:** instrument the old/new release cohorts; test plan presentation and weekly versus monthly commitment. Primary metrics should include verified paid accounts, successful report view, refunds, 24-hour renewal cancellation and seven-day protocol/second-scan action, not button taps alone.
6. **Recurring value:** make the first recommended task concrete, save a next check-in date, show credible progress without promising physical change, and use repaired reminders. Courses/Progress efficacy must be measured after customers actually get them.
7. **Creator economics:** require measurement, not mandatory anchors. Validate a real paid attribution chain and code lookup; import official download campaigns; keep video IDs distinct. Avoid allocating a bigger views-based budget while all paid outcomes remain unattributed.
8. **Referral activation and reporting quality:** measure mature cohorts, expose no-history restore outcomes, keep currency totals separate, distinguish synthetic reconciliation receipts from unprocessed customer webhooks, and make intentionally disabled exports explicit.

No production configuration, code, financial records, or customer data was changed for this review.
