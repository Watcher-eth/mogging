# Admin reporting coverage

The analytics sidebar separates acquisition, authentication, onboarding, purchase flow,
scans, engagement, referrals, notifications, attribution, revenue, retention, and data health.
All current events in the shared web/mobile contract have one reporting owner in
`lib/admin/tracking.ts`. Supported milestones remain visible when no data exists,
including all 16 current onboarding screens (tracking revision 3, app 0.1.63 onward) in their display order.

| Collected data | Reporting location |
| --- | --- |
| Customer device activity, first app opens, server-confirmed scans, mature 24-hour paid delivery | Product overview; detailed funnels and report ledgers remain on their dedicated pages |
| First opens, landing pages, CTAs, store destinations, attribution diagnostics | Acquisition |
| First/last UTM, campaign, creative, paid media, referrer context | Acquisition, regardless of the event carrying the context |
| Authentication outcomes and stored anonymous/account identity links | Authentication |
| Screen views/completions/back/exit/skip, permissions, photos, consent | Onboarding |
| Paywall, product loading, plan selection, checkout, purchase outcomes, restore, access codes | Purchase flow |
| Server web-to-app handoff status | Purchase flow |
| Evaluation attempts, duration, completion and failure | Scans |
| Sessions, reports, categories, protocols, tasks, sharing, courses, progress, settings | Engagement |
| Referral intent, credited signups, granted rewards, lifetime inviter progress | Referrals |
| Observed push opens, current registrations by push service, retained reminder claims | Notifications |
| Creator link traffic, direct/first-touch customer and revenue credit, social-account breakdowns | Creator attribution; Attribution ledger retains provider/event detail |
| Verified billing lifecycle, provider/product/currency totals, trials, cancellation and expiry reasons, offers | Revenue |
| Mature return cohorts | Retention |
| Backend feature outcomes, latency, safe errors, traces, unfinished evaluations, health checks and alert records | Backend reliability |
| Raw receipt volume, ingestion delay, clock skew, selected metadata coverage and processing/export queues | Data health |

## Interpretation and limits

- Product overview checks for updates every minute while visible and on focus. It shows snapshot generation separately from the latest client activity timestamp; the latter is event time, not ingestion time. The authenticated API uses 60-second background cache revalidation, so a refresh may initially return the previous snapshot. A failed refresh retains the previous timestamps and displays an error. Billing/scan ingestion freshness is not independently established by these timestamps.
- Overview activity follows the platform filter; scan reservations and paid delivery cover all platforms. Completed scans use the server credit ledger, including free credits. Paid delivery uses only first verified payers with a complete 24-hour follow-up; pending payers are excluded, and an absent denominator displays no rate. Report generation and observed viewing share that denominator rather than being presented as a sequential funnel.
- Product overview's acquisition headline and customer activity series are labeled "First-time installs · observed" and use the existing distinct app-first-open events as an install proxy. They are not verified first-time App Store downloads; reinstalls, device resets and missing observations can affect counts. The duplicate first-open headline and paid-report-viewing headline are removed; detailed paid delivery remains below.
- A/B tests default to 30 days and the active test, with immutable archived definitions in a selector. Headlines use mature seven-day App Store click rates, their difference in percentage points, eligible browsers and pending counts. Wilson intervals and review checkpoints remain visible without declaring a winner. Assignment history uses Pacific entry-date buckets; secondary payment outcomes and shared handoff exclusions are expandable. Snapshot time is separate from the selected test's latest entry timestamp. The page refreshes every minute and on focus.
- A/B primary click numerators and their eligible denominators both exclude assignments with a recorded iPhone handoff, including historical entries that also contain a manual click. This keeps the comparison population consistent; secondary outcome counts still describe all assignments and are explicitly separate.
- Onboarding defaults to 30 days and separates tracked device–flow cohorts from broad event totals. A flow enters at its first compatible start observed inside the selected period; completion must match device and flow, follow entry, and occur within seven days before the snapshot cutoff. Only flows with a full seven-day follow-up enter the completion rate; recent completions still appear in completion counts. The trend chart groups completions by flow start date. Current screen definitions drive the key-stage/all-screen selector; legacy screen observations, tracking versions, interruptions and the separate all-version activation journey remain in expandable diagnostics. Drop-off ranks up to eight current screens by unresolved flow count among mature screen views, not raw percentage alone. Flows are not unique people and client completion is not verified revenue.
- Acquisition leads with distinct public-site browsers, store clickers, first app opens and source coverage for the selected platform. Headline/source-coverage totals and homepage-entry totals use uncapped aggregates, independent of the top 50 device source/campaign pairs and top 30 homepage sources. Homepage outcomes use compatible landing-entry IDs, not the broader website-browser population, and remain observed counts rather than mature conversion rates. Placement and tracking details are expandable; A/B test interpretation stays on A/B tests. Acquisition refreshes every minute while visible and on focus, with snapshot/event timestamps shown separately.
- Behavior uses production web/iOS/Android events in the selected 7/30/90-day window and platform; admin-route traffic is excluded. Server milestones and verified billing remain all-platform. Server milestones never count as devices.
- Stored operational records have their own scope notes. Identity links, handoffs and referral tables have no environment field. Push registrations include environment explicitly. Reminder records can precede sending and are pruned after 35 days; they do not prove device delivery.
- Creator attribution defaults to 30 days across all customer platforms. Independently deduplicated browser and paying-identity totals replace summed creator counts. Creator and credit-model selectors keep direct and first-touch outcomes separate; traffic always follows visited links. Currencies stay separate; recorded net is before fees/taxes. Linked billing uses provider event time, while legacy monetary credit uses attribution-record time. Non-monetary milestones cannot create revenue-chart points or revenue rankings. Activity and ranking selectors reuse the existing line/bar charts. Social-account and independent milestone details are expandable; deferred delivery is not a verified install. Snapshot/event/receipt times and allocation limitations are explicit. `/admin/attribution` uses the authenticated analytics API; local previews serialize only aggregate names, public handles and metrics, never the full creator workspace.
- Retention defaults to 90 days. Headlines show exact day-1/day-7/day-30 return after the earliest observed account-linked client scan completion, with eligible and pending samples. A weekly day-7 cohort trend uses the same outcomes and denominator; no mature sample means an unavailable rate, not 0%. Subscriber engagement remains a separate all-platform paid cohort; Courses/Progress retention is expandable. General activity, action totals and cancellation intent were removed from Retention because they do not measure return rates. Snapshot generation, linked activity and receipt times appear separately, with account-linking coverage. Platform filters scope both scan entry and return; first observed use on one platform need not be first company-wide use.
- Monetary totals stay separate by currency. Creator summary fields historically labelled USD now sum only USD. Direct and first-touch attribution describe overlapping credit and must never be added together. Revenue is the normalized billing source of truth.
- Revenue defaults to 30 days across all platforms. It leads with period net revenue, gross revenue, refunds/deductions and identified paying customers, with all-time net context and equal-length prior-period comparisons per currency. Net is before provider fees and taxes, not profit, MRR or ARR. Missing amounts remain unknown; comparisons are withheld for unknown amounts or missing live Stripe ledger purchases. Subscription access is a current confirmed minimum including trials; scheduled cancellations are an active-access subset, not churn. New paid subscriptions exclude renewals; one-off scan purchases count credits. Provider/product charts retain the existing animated bars; detailed currency, lifecycle and reconciliation reports are expandable. Snapshot, billing-event and receipt times are shown separately and refresh every minute/on focus.
- Reports expose allowlisted scalar context fields and aggregate coverage for eight identifier fields. Raw identifiers, tokens, provider payloads, photos and questionnaire answers are not exposed. Context tables retain the top 20 values per dimension/section; origin breakdowns cap at 300 groups, operational attribution tables at 200 groups, and billing/product/release tables at 100 groups.
- Missing money remains unknown. Empty windows retain the milestone catalog. “Awaiting data” means no observations in the selected slice, not proof of healthy instrumentation. Event totals are not sequential conversion funnels.
- Delivery delay includes batching, offline queues and clock differences; it is not API latency. Negative delays appear as clock skew.
- Existing admin allowlist/password protection applies to every page and API. Responses are private/no-store; queries are read-only and limited to twelve seconds (eight seconds for backend telemetry). Reliability includes generated service trace IDs for log lookup. No migration or mobile instrumentation changes are required for these reports. See [backend reliability](backend-reliability.md) for collection and alert activation.

## Verification

Coverage/unit tests validate event ownership, empty states, chart data and the shared contract.
The isolated `analytics_test` database tests ordering, filters, currencies, context ownership,
server device exclusion, operational records and sandbox exclusion. HTTP checks validate
authorization, methods, filters, cache headers and snapshot reuse. Production build and
desktop browser checks passed. Synthetic browser previews do not validate production data completeness.

The development-only `/admin/__product-overview-preview` reads real Overview aggregates, Acquisition with `?page=acquisition`, A/B tests with `?page=experiments`, Onboarding with `?page=onboarding`, Revenue with `?page=revenue`, Retention with `?page=retention`, Creator attribution with `?page=creator-attribution`, Creator performance with `?page=creator-performance`, or Creator economics with `?page=creator-economics`, from
the configured database using the same read-only query and 60-second snapshot cache policy.
It requires a loopback connection and localhost Host header, rejects cross-site requests,
and returns 404 outside development. Only the selected page's aggregates are serialized; detailed admin
routes retain their existing sign-in and unlock requirements. Period/platform changes query
the database again, and visible previews check for updates every minute and on focus.

Homepage experiment cohorts, mature conversion intervals, section reach, CTA placement,
and source reporting live in Acquisition. See [landing experiments](landing-experiments.md).

## Courses and progress

The mobile learning/progress pages emit only semantic boundaries:

| Event | Purpose |
| --- | --- |
| `course_viewed` | Course overview reach and saved lesson count |
| `course_lesson_viewed` / `course_lesson_exited` | Lesson reach, revisits, foreground reading duration |
| `course_lesson_completed` / `course_completed` | First locally saved completion; revisiting does not re-complete |
| `progress_viewed` / `progress_exited` | Progress reach, foreground use, empty/baseline/comparison state |
| `progress_area_viewed` | Deliberate score-history exploration, category only |
| `progress_action_selected` | Navigation to protocol or evaluations, not proof of a later task/scan |

Visits stop on loss of focus or app foreground and resume as a fresh visit. There are no
heartbeats, scroll/animation events, quiz-answer events, chart-point events, photos, personal
names, profile IDs or scores. Course/lesson IDs are static content IDs. Progress records only
self/other, not the person's identity. Mobile sessions emit `session_started` at a new
30-minute-inactivity session boundary.

Engagement shows unique device reach, active device-days (UTC), distinct device–lesson
completions, course completions and median observed foreground visit time. Missing exits
(e.g. force termination) leave duration unknown. A completion is saved locally; reinstalling
or clearing local progress may produce another client completion. Reporting deduplicates
within the selected window and does not claim verified learning or causal retention.

Retention reports exact D1/D7/D30 same-feature return after first meaningful use: a completed
lesson, deliberate progress-area open, or at least 10 seconds in a foreground lesson/progress
visit. First use is searched across earlier history; only mature, identified customer accounts
are eligible. First-scan return also recognizes these meaningful learning/progress actions.
Anonymous usage still appears under Engagement. Cohorts need time after release to mature.

Battle vote/filter events and Battle/Leaderboard screen/page collection are retired. Old
clients' retired events are dropped individually at ingestion; other events in that batch
continue to be accepted. Historical records are preserved but excluded from current customer
activity reports. No database migration is needed. Deploy the backend contract/reporting
before distributing the instrumented mobile build so new events are accepted.

### Authentication overview

The Authentication report uses production customer client events for the selected rolling
period and platform. It separates recorded sign-in starts, successful sign-ins, authentication
errors, explicit cancellations and post-login account setup errors. These are independent
event counts, including repeats, rather than new-customer counts or a conversion funnel.
Current mobile releases persist the session before reporting success; older classifications
are retained. Attempt-identifier coverage is shown without inferring an overall completion
rate. The animated activity chart omits empty time buckets; error bars group provider/stage
and retain every sanitized reason in underlying data.

Stored identity links use the same period/platform filter, deduplicate accounts independently,
and exclude known internal accounts. This ledger has no runtime environment field and does
not independently establish sandbox provenance. Guest recovery and report synchronization
remain separate activity paths under account continuity. Snapshot, latest-event and receipt
timestamps are visible, with a 60-second cache and visible-tab/focus refresh. The localhost
development preview renders the same read-only aggregates without an extra authenticated
operations request; normal admin routes remain authenticated.

### Purchase flow overview

Purchase flow uses uncapped aggregates of mobile purchase attempts begun in the rolling
period. A device identity, platform and attempt identifier define one attempt; repeat taps
with different attempt identifiers remain separate. Outcomes are observed through the
snapshot, without a fixed follow-up window. Attempt-start-time charts separate observed
purchases and access activation. Identical purchase/activation series share one line with
an explicit note. Observed purchase rates are not paywall conversion, positive-charge
conversion, net revenue or a causal paywall comparison.

The query groups the event stream with a windowed start timestamp instead of joining
every start back to the materialized event stream. This preserves the full reporting
population without the previous 2,000-timeline cap. Exact RevenueCat transaction/product
matches include production subscription starts, trial starts and one-time purchases.
Later purchase/activation observations supersede earlier cancellation/error signals.
Pending approvals, recent attempts, missing outcomes and activation-only signals remain
separate. Unknown types are not assumed to be subscriptions. Client observations exclude
known internal and sandbox activity; legacy runtime-unknown activity remains included.

Paywall reach, starts lacking linking identifiers, restores and voluntary cancellation
feedback have independent measurement scopes. Web handoffs use their creation period
and all-platform ledger status as of snapshot time, exclude known internal accounts,
and do not independently establish production payment or delivery. The ledger lacks
runtime environment metadata. No raw account, device, attempt or transaction identifiers
are serialized by the report. Detailed authenticated timeline APIs retain their existing
protection and cap. The localhost demo uses the same read-only snapshot and minute/focus
refresh policy as the redesigned admin report, with no extra diagnostics request.

### Scans overview

The Scans report separates backend request outcomes, saved report records and client
experience. Backend reservation records define the request population by start time,
across all platforms and access types. Completion rate is completed / (completed + failed);
pending and other statuses are excluded. The report shows current outcomes and the
number of cohort requests pending for more than five minutes, without claiming that all
pending records are actively processing or that every failure returns credit. Eligible
credit restoration is conditional and is not a cash refund. Stored reservation records
have no completion timestamp; no backend latency is inferred from report updates.

Saved reports are counted by creation time and current status, while distinct report
references are deduplicated independently across completed requests. Re-evaluation can
reuse an existing report, including a report created before the selected period. Completed
requests, new report records and client completions are not interchangeable or additive.

Client timing uses valid nonnegative durations on successful evaluation_completed events;
median and p90 exclude failed and missing completions. Evaluation timing includes client,
network and server work. Request-level network observations remain separate diagnostics
and can be absent on older releases. Client issue bars group evaluation failures by
platform/reason, with request errors and release observations in underlying data. No raw
account, report or device identifiers, photos or failure messages are serialized.

The shared entitlement exclusion now recognizes internal_release_verification alongside
release_verification, internal_test and smoke_test. Ordinary manual customer grants remain
included. The analytics cache policy version was advanced consistently for authenticated
and local-preview reads after this reporting-policy correction. Scans defaults to 30 days,
uses all-platform scope, refreshes every minute/on focus, and uses the same read-only
aggregates in the guarded localhost demo. Old duplicated client/credit/report charts and
the separate authenticated operations fetch are removed from the page.

### Engagement overview

Engagement now uses a dedicated uncapped customer-event report. Active product devices
include identified iOS/Android customer activity and web product-feature activity; marketing-
only web visits are outside the denominator. Qualifying engagement includes report or
protocol viewing, task/lesson/course/share completion, Progress detail opens, or at least
10 seconds of recorded foreground time in a lesson or Progress visit. The definition is
visible on the page. Overall devices are deduplicated independently of overlapping feature
rows. Multi-day engagement counts two or more qualifying Pacific calendar dates inside
the selected window, not cohort retention; a rolling 24-hour window can span two dates.

The animated chart focuses on engaged devices, using hourly buckets for 24 hours and daily buckets otherwise. Active-device counts and bucket engagement rates remain in the underlying data.
Bucket device counts must not be summed into period totals. Feature reach includes browsing,
while each feature's engaged-device count uses the stricter definition. Empty or unidentified-
only buckets are omitted; no telemetry is not proof of inactivity. Detailed learning and
Progress events depend on supported client releases. Empty feature detail tables are replaced
with explicit observation-limit messages.

Action counts retain distinct units: device/report opens; device/report/task/Pacific-date
checkmarks; device/course/lesson completions; device/course completions; share-completing
devices; and devices starting repeat scans. Required content identifiers and device identity
must be present for deduplicated action counts. Task checkmarks do not verify real-world
adherence, course completion does not verify learning, share completion does not prove
recipient delivery, and repeat-scan intent does not establish scan completion. Foreground
visit medians use valid exit durations from zero to 30 minutes; missing exits stay unknown.

Snapshot time and latest product-feature occurrence/receipt timestamps are separate. The
page defaults to 30 days, supports the selected platform, and checks each minute/on focus
through the existing 60-second snapshot cache. The guarded localhost preview renders the
same read-only aggregates. No raw account, device, report, task or visit identifiers are
serialized. Generic event inventories and duplicate feature-usage tables are removed from
the Engagement page; retention remains on its dedicated page.

### Customer Referrals overview

Referrals now uses uncapped signup-ledger cohorts and distinguishes the customer scan-
credit referral program from creator referrals. The primary counts are credited referred
accounts and distinct referring accounts in the selected rolling period. Known internal
accounts and current self-referrals are excluded; claimed guest inviter aliases are
consolidated. The signup ledger has no runtime-environment field, so production-only
provenance cannot be independently established for legacy credit records.

Seven-day outcomes use only credited accounts with a complete 168-hour follow-up. Newer
accounts remain pending and are excluded from the denominators. Every event must occur
at/after the referral credit and before credit plus seven days. Mobile activity, paywall
reach, own-report viewing and payment are independent outcomes, not a sequential funnel.
Own views match an account-linked client event to that account's currently completed stored
user report, excluding known internal/sandbox reports. Positive payment requires a linked,
normalized production charge with amount > 0; zero-value trials, missing amounts, refunds
and status-only events do not qualify. Counts can include a qualifying renewal and remain
historical positive-charge observations if a later refund occurs. No revenue or incremental
acquisition claim is inferred from these rates.

The signup trend uses credit-record creation time in Pacific time, with zero-record buckets
filled and boundary buckets marked partial. Inviter contribution bands aggregate period
signups without exposing individual names, codes or IDs. Bands do not establish lifetime
reward eligibility. Reward record creation follows the selected period; current available
stored credits and lifetime record counts use all grant dates. One-time, legacy per-signup,
revoked and other reward records remain separate. Expired, refunded/disputed or revoked
records do not enter available-credit totals. Zero balance does not prove a scan completed. Completed reward evaluations are counted separately from successful backend requests begun in the selected period and authorized by referral credits; reward holders are a different population from the referred-account outcome cohort.

Invite flow opens, invite share starts and recorded notification sends are supporting
observations with different populations. Share starts are emitted before a sharing action
completes, not proof of delivery or recipient visits. They are never used as a signup
conversion denominator. The page uses one read-only snapshot, defaults to 30 days, has
all-platform scope, and refreshes each minute/on focus through the existing 60-second cache.
The guarded localhost preview uses the same aggregates. Generic event inventories,
duplicate operational charts and individual inviter pseudonyms are removed from the page;
legacy authenticated operational endpoints remain protected and unchanged.

## Final analytics review

All 18 analytics navigation entries have a matching development-only real-data preview.
Detail links inside analytics stay in that preview; authenticated pages retain protected routes.
The chart resets its time scale when period, series, currency or time-zone scope changes.
Onboarding and Purchase flow offer mobile platform filters; an incoming Web filter is
normalized to all mobile platforms because those cohorts do not measure web flows.

Acquisition assigns source/campaign once per distinct actor, then aggregates actor-level
activity so repeated events cannot inflate its device counts. Headline totals remain
independent of ranked-table limits. Homepage placements join narrow scalar observations.
The redundant generic context-value breakdown is omitted from Acquisition and Onboarding;
their dedicated source/campaign, screen, milestone, origin and identifier-coverage views
remain available. This avoids sorting hundreds of thousands of duplicate diagnostic values
on every snapshot. Revenue retains its billing-context breakdown.
