# Admin reporting coverage

The analytics sidebar separates acquisition, authentication, onboarding, purchase flow,
scans, engagement, referrals, notifications, attribution, revenue, retention, and data health.
All 67 events in the shared web/mobile contract have one reporting owner in
`lib/admin/tracking.ts`. Supported milestones remain visible when no data exists,
including all 16 current onboarding screens (tracking revision 3, app 0.1.63 onward) in their display order.

| Collected data | Reporting location |
| --- | --- |
| First opens, landing pages, CTAs, store destinations, attribution diagnostics | Acquisition |
| First/last UTM, campaign, creative, paid media, referrer context | Acquisition, regardless of the event carrying the context |
| Authentication outcomes and stored anonymous/account identity links | Authentication |
| Screen views/completions/back/exit/skip, permissions, photos, consent | Onboarding |
| Paywall, product loading, plan selection, checkout, purchase outcomes, restore, access codes | Purchase flow |
| Server web-to-app handoff status | Purchase flow |
| Evaluation attempts, duration, completion and failure | Scans |
| Sessions, reports, categories, protocols, tasks, sharing, battles, settings | Engagement |
| Referral intent, credited signups, granted rewards, lifetime inviter progress | Referrals |
| Push opens, current registrations by environment/timezone, reminder records | Notifications |
| Creator milestones and subscription lifecycle, direct/first-touch link credit by currency | Attribution ledger; Creator attribution retains its account drilldown |
| Verified billing lifecycle, provider/product/currency totals, trials, cancellation and expiry reasons, offers | Revenue |
| Mature return cohorts | Retention |
| Backend feature outcomes, latency, safe errors, traces, unfinished evaluations, health checks and alert records | Backend reliability |
| Complete event catalog, identifier coverage, release/schema delivery delay, clock skew, processing/export health | Data health |

## Interpretation and limits

- Behavior uses production web/iOS/Android events in the selected 7/30/90-day window and platform; admin-route traffic is excluded. Server milestones and verified billing remain all-platform. Server milestones never count as devices.
- Stored operational records have their own scope notes. Identity links, handoffs and referral tables have no environment field. Push registrations include environment explicitly. Reminder records can precede sending and are pruned after 35 days; they do not prove device delivery.
- Monetary totals stay separate by currency. Creator summary fields historically labelled USD now sum only USD. Direct and first-touch attribution describe overlapping credit and must never be added together. Revenue is the normalized billing source of truth.
- Reports expose allowlisted scalar context fields and aggregate coverage for eight identifier fields. Raw identifiers, tokens, provider payloads, photos and questionnaire answers are not exposed. Context tables retain the top 20 values per dimension/section; origin breakdowns cap at 300 groups, operational attribution tables at 200 groups, and billing/product/release tables at 100 groups.
- Missing money remains unknown. Empty windows retain the milestone catalog. “Awaiting data” means no observations in the selected slice, not proof of healthy instrumentation. Event totals are not sequential conversion funnels.
- Delivery delay includes batching, offline queues and clock differences; it is not API latency. Negative delays appear as clock skew.
- Existing admin allowlist/password protection applies to every page and API. Responses are private/no-store; queries are read-only and limited to eight seconds. Reliability includes generated service trace IDs for log lookup. No migration or mobile instrumentation changes are required for these reports. See [backend reliability](backend-reliability.md) for collection and alert activation.

## Verification

Coverage/unit tests validate event ownership, empty states, chart data and the shared contract.
The isolated `analytics_test` database tests ordering, filters, currencies, context ownership,
server device exclusion, operational records and sandbox exclusion. HTTP checks validate
authorization, methods, filters, cache headers and snapshot reuse. Production build and
desktop browser checks passed. Browser previews use synthetic records and do not validate
production data completeness.

Homepage experiment cohorts, mature conversion intervals, section reach, CTA placement,
and source reporting live in Acquisition. See [landing experiments](landing-experiments.md).
