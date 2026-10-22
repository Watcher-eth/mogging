# Creator attribution architecture and implementation plan

> Historical audit and proposal. Implementation and production rollout are recorded in [the implementation report](creator-attribution-implementation-2026-10-21.md). The phase estimates below are superseded.

We should own creator attribution end to end using our existing Next.js API, Postgres, Expo app, storage, scheduler, and billing integrations. The highest return comes from fixing referral capture and continuity, then deriving creator economics from verified transactions. Another link provider would leave several of the current failures intact.

This plan covers creator setup, submitted posts, referral routing, app installation and recovery, guest/account identity, payment attribution, reporting, and evaluation. It proposes implementation; production behavior and payouts were not changed during the audit.

## Evidence from the last seven days

The database audit covers **October 14, 2026 at 5:50 p.m. through October 21 at 5:50 p.m. Pacific**, a rolling seven-day window. Exact UTC boundaries are in [the data snapshot](../artifacts/creator-attribution-2026-10-21/data.json). Queries ran inside a read-only repeatable-read transaction. The follow-up used the same boundaries in a later read-only transaction. Timestamps were selected as text to avoid local parsing of UTC values stored without timezone information.

| Observation | Result | Meaning |
| --- | ---: | --- |
| Newly submitted posts | 62 from 13 creators and 16 social accounts | Meaningful posting activity exists. This is a submission cohort, not necessarily posts published during the week. |
| Approved or paid submissions | 58 | Four submissions were rejected. |
| Recorded view values on accepted submissions | 4,046,298 | Sum of admin view values where available, otherwise creator claims. These are cumulative submitted values, not verified new views during this week, unique viewers, or qualified audience views. |
| Approved compensation on the 62 submissions | $1,833.10 | Approved amounts, including submissions already marked paid. |
| Payout records created in the window | $1,327.75 paid; $9.60 pending | Different accounting cohort from approved compensation; do not add these amounts together. |
| Referral requests | 177 total; 149 not marked as bots | Bot classification is imperfect and these are requests, not verified interested people. |
| Distinct browser identifiers on non-bot referral requests | 127 | Browser identifiers do not establish unique people. |
| Non-bot requests for pain.psl | 130 of 149, or 87.2% | One account dominates recorded referral traffic. |
| Publishing accounts with zero non-bot referral requests | 14 of 16 | The account-level referral path is largely unused or unobserved. |
| New mobile creator attribution rows | 0 | No new durable mobile creator touches were captured. |
| Creator ledger during the week | 1 checkout; 0 payments, signups, paywall views, or installs | This cannot establish that creators generated no customers. |
| Customer iOS first-open observations | 491 installation IDs | In-product installation observations, not App Store verified downloads. |
| Customer iOS paywall and purchase observations | 318 installation IDs viewed paywalls; 158 started purchases; 7 completed purchases | Independent event populations; these are not an ordered first-open conversion cohort. |
| Customer RevenueCat production money events | 7 subscription starts plus 2 one-time purchases across 7 billing identities | Real transactions exist despite absent creator credit. |
| Customer Stripe production money events | 2 one-time purchases | Additional web transactions exist. |
| New submissions with manual economics metrics | 0 of 62 | The separate manual economics workflow supplies no funnel evidence for this cohort. |

Customer behavioral counts follow the dashboard's internal-account and linked-identity exclusions, sandbox transaction/session exclusions, production filter, and creator/admin-surface exclusions. Billing totals exclude explicitly internal accounts and sandbox events. Creator clicks and submission activity are raw operational counts; they are not filtered customer acquisition cohorts. Billing aliases and anonymous browser IDs are not people counts.

We must not divide 149 requests by 4.05 million submitted cumulative views and call the result CTR. Their exposure windows, traffic routes, and eligibility differ. Likewise, seven paying identities cannot tell us how many customers creators actually caused.

The older October 17 audit is not the basis for these numbers. Across all recorded history, the creator ledger contains only two install events from July and three checkout events; there is only one mobile attribution row. Historical rows are not proof that the current installation flow works.

### What the submitted posts establish

All 62 submissions have a social account, post URL, and analytics-evidence asset. None has a stored caption, posting timestamp, or original video URL. Fifty-five have a canonical post key. Analytics-evidence assets include recordings; the field name `analytics_screenshot_url` does not mean they are all screenshots. Eighteen submissions use the custom format and 44 the general format.

Two public Instagram posts illustrate different gaps:

- [kvara_1717 reel](https://www.instagram.com/reel/Depn7mZNSPV/), with 161,318 recorded views, has a public caption inviting viewers to get ratings with `@moggingcom`, without a referral code. Its submission is approved. Its stored campaign rules include a caption-code requirement and its review checklist marks the sprint rules met. The caption could have changed after review, so this is a present-day mismatch requiring revalidation, not proof of what a reviewer originally saw.
- [heli.psl reel](https://www.instagram.com/reel/DekGJ-Ntr1e/), with 108,000 recorded views, includes `referral code: mogging-heli.psl`. Its account still has zero recorded referral-link requests during the window. Putting a code in a caption alone does not demonstrate that viewers notice it, know where to enter it, or complete attribution.

Public TikTok inspection was limited by login overlays and playback availability. The audit covers metadata and requirements for all 62 submissions, with spot checks of accessible public content; it is not a frame-by-frame review of every video or evidence recording. The absence of stored originals limits systematic CTA timing analysis.

## Current architecture and where it loses information

| Layer | Existing owner | Gap or limitation |
| --- | --- | --- |
| Creator identity | `creator_profiles`, `creator_social_accounts`, OAuth/manual review | Only 4 of 97 accounts are OAuth connected. Account setup is not proof that a published referral placement exists. |
| Content and compensation | `creator_submissions`, sprint snapshots, review checklists, payout records | Submission begins after a 20,000-view milestone. Earlier exposure and failed posts are absent. Posting timestamps and captions are unpopulated. |
| Referral identity | `creator_tracking_links` and aliases | Links identify social accounts; no durable post/placement field travels through clicks and purchases. Same-handle sharing can also lose platform specificity. |
| Routing | `/r/[slug]`, `createCreatorAttributionClick`, signed cookie/token | Captures browser visits and offers app/store/web destinations. Explicit code entry and native slug exchange use the same click factory as browser visits. Their origins are not stored separately. |
| Installed-app opening | AASA `/r/*`, Expo URL handler, `/api/attribution/link` | Production AASA includes `/r/*`, verified by direct fetch. This does not prove dispatch works on shipped versions or inside TikTok/Instagram. |
| Fresh iOS installation | Reopen creator link or manually enter code | Normal App Store installation does not preserve our browser cookie/token into the app automatically. Current success depends on deliberate recovery or the optional provider path. |
| Mobile persistence | `src/attribution/core.ts`, SecureStore, `mobile_creator_attributions` | Durable first/current touch and retries already exist, but zero new server rows show that the successful path was not observed in this window. |
| Account continuity | `/api/attribution/claim`, guest claiming, analytics identity links | Existing guest-to-account migration moves attribution rows. There is no general browser-account referral recovery into a new app install without a token. |
| Billing | RevenueCat/Stripe webhooks, `subscription_events`, creator event projection | Money facts are durable. Creator matching occurs at webhook time and can miss attribution arriving afterward. Renewals can select the latest touch rather than a frozen acquisition decision. |
| Reporting | Creator attribution dashboard plus manual economics dashboard | Two inputs describe related economics. Manual submission metrics are empty for the week; automatic account attribution has no payment credit. Missing data must stay visibly unknown. |

The native URL handler emits `attribution_link_received` for URLs before confirming they are creator links. The 38 customer installation IDs with Universal Link observations therefore do not establish 38 failed creator referrals. Existing telemetry cannot distinguish all those routes.

The detailed attribution engine diagnostic callback only logs in development. Production analytics receives some outer link events, but not the full resolve/claim/retry lifecycle. The AppsFlyer diagnostics reported NOT_FOUND on 479 installation IDs and ERROR on 11, with no observed FOUND group. Those provider statuses do not identify where first-party recovery failed.

Local source and deployment are separate evidence. The local `/r` route renders a landing page for visitors; the mobile documentation describes ordinary browser store redirects. Resolve this documentation/implementation mismatch before rollout. The source still contains an optional OneLink wrapper controlled by `APPSFLYER_ONELINK_BASE_URL`; its deployed configuration was not verified.

## Attribution we should build

We need three explicit forms of evidence: observed referral interactions, verified transactions allocated under a stated rule, and estimates of incremental impact. A valid signed token proves that our server issued a referral token; it does not prove someone watched a particular video or that the video caused a purchase.

### Give each post an identity before it earns views

Extend the existing submission lifecycle with a lightweight draft/registered state. Create the submission ID, campaign snapshot, and optional post-specific code before publishing. Keep the existing submission as the owner of the published post; do not create a competing content database. A draft is not a payout request and does not enter the moderator approval queue.

After publication, bind its canonical post key, published URL, posting timestamp, caption, and account. Continue registering posts below 20,000 views; retain the threshold as a compensation eligibility rule. This gives us the denominator of attempted creatives instead of only winners.

Preserve one simple creator code, with existing slugs and aliases continuing to work. Offer an optional short post suffix for exact creative credit. A creator-level code establishes creator-level evidence only. A shared bio link establishes account-level evidence unless the visitor explicitly selects a post; never assign it automatically to the creator's newest video. Backfill the seven missing canonical post keys where the existing public links establish them, without changing prior approval or compensation decisions.

Add optional submission and placement dimensions to the existing click/touch records. Keep the existing account-link identity; a post code resolves to that identity plus a submission. Explicit placement values distinguish bio, story, QR, direct app link, code entry, and account recovery. Resolve ownership on the server.

### Make the creator CTA carry usable credit

Generate a ready-to-use caption and an exportable CTA overlay using the current creator tools and storage. Show a readable creator code during the early product moment, explain where to enter it, and repeat it at the close. A concrete variant is: “Try Mogging. Enter HELI in the app.” Actual aliases must be uniquely reserved before being offered.

Use a clickable bio link where the creator can support one, and story links where available. Keep caption codes for accounts without clickable placement. A QR is useful for desktop/cross-device viewing, but is secondary for someone already watching on the same phone. Do not depend on TikTok project anchors: the current requirement is paused and platform availability is outside our control.

Before approval, capture evidence of the actual caption, visible code, CTA timestamp, and clickable placement when applicable. Store the observation time and evidence reference. Give requirements stable semantic IDs rather than relying on positional checklist indices whose meanings change with the guide. Apply new campaign terms prospectively; do not retroactively remove agreed compensation.

For systematic content review, add a reusable published-video upload using existing R2 storage, then sample a few frames around the CTA. Local FFmpeg plus Apple Vision OCR can flag missing/unreadable codes; moderator review remains authoritative for uncertain findings and changing captions. These jobs consume our compute/storage but require no new paid attribution or AI service.

### Preserve attribution through installation

| Journey | Proposed first-party handling | Evidence retained |
| --- | --- | --- |
| App already installed | Universal Link → server exchange → existing resolve/claim flow | Validated referral touch; first app open remains a separate event. |
| New iPhone install, no account saved | Landing offers “Copy code and install”; onboarding has a clear optional creator input and user-initiated Paste | Explicit code claim linked to this installation/account. It is not proof of the original browser click. |
| New iPhone install, user saves an account before leaving | Optional “Save my creator offer” authenticates on web and binds the referral; the same account in app retrieves the server association | Authenticated continuity, without relying on browser cookies being readable in the native app. |
| New iPhone install, user returns to the link | Existing creator page offers a tested app-opening action | Direct referral recovery. Preserve the original click token where available. |
| Viewer searches the App Store after watching | Optional “Who sent you?” accepts a code or creator selection | Self-reported acquisition evidence, separately labeled. |
| Android install, once it is a supported acquisition route | Put an opaque signed referral in Play's `referrer`; retrieve through Play Install Referrer and resolve server-side | Store-referrer evidence plus a separate app first-open observation. |

Code application must succeed independently of signing in or qualifying for a discount. The current hook combines attribution, account requirements, eligibility checks, and offer loading in one user action. Keep those operations separate so “creator saved” is a truthful status even if offer loading fails. Preserve the current eligible discount; changing the incentive requires an economics decision and should not block measurement.

Add a small creator confirmation during onboarding and carry it through the paywall. Keep direct-link users out of unnecessary code entry. Let users skip recovery, and keep normal purchases working if attribution is unavailable. If a verified transaction arrives before a successful referral write that was already in progress, reconciliation should use the original occurrence times and an explicit bounded grace rule.

Use a native user-initiated paste control rather than reading the clipboard at launch. Apple documents [UIPasteControl](https://developer.apple.com/documentation/uikit/uipastecontrol) for this interaction. Our secure storage and signed tokens remain useful; neither establishes automatic browser-to-app continuity on a clean iOS install.

We can reproduce routing, aliases, fallback pages, explicit recovery, identity continuity, and reporting ourselves. For an anonymous iPhone visitor who installs and opens without returning a link, pasting a code, or using a shared account, the app has no deterministic creator identifier to retrieve from our current design. Fingerprinting would produce uncertain matches and Apple [prohibits deriving device data to uniquely identify it](https://developer.apple.com/app-store/user-privacy-and-data-use/). The engineering response is to design a reliable explicit bridge and measure the remaining unknown share.

For browser-to-app buttons, test a separate associated subdomain if same-domain Safari navigation stays in the browser. Apple describes this behavior in its [Universal Link debugging guidance](https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links). Add a subdomain only if device testing establishes the need.

### Make one server attribution decision and project verified money

Keep `subscription_events` as the owner of financial facts and reuse the existing webhook receipt leases. Creator attribution should be a reproducible allocation of those facts, with `creator_attribution_events` serving as the existing creator projection. Manual economics fields should not become another source of installs or customers.

Retain all valid touches with source, method, occurrence time, account/installation ownership, and optional submission. Use the earliest valid touch for acquisition reporting and the latest eligible touch before the initial purchase for direct conversion reporting. Preserve those as different views; choose and version the compensation rule explicitly. Keep the existing 30-day referral window initially so we can measure changes without changing several variables at once.

Freeze the acquisition decision on the initial subscription transaction or original subscription identity. Renewals, refunds, and reversals inherit that decision. A later creator code can be an assisted touch; it must not silently move an existing subscription's acquisition credit. Use transaction occurrence time rather than webhook delivery time to decide eligibility.

Create an idempotent reconciliation job using the existing scheduler and ledgers. Retry unallocated financial facts after delayed attribution or verified identity resolution. Store the reason when allocation fails: no eligible touch, ownership conflict, expired window, missing identity, or pending evidence. Ordinary post-purchase code entry should not backfill acquisition automatically; allow only a bounded, auditable correction policy. Retain self-reports as assists outside that rule.

Count first-time paying customers using the canonical account and billing history across Stripe/RevenueCat, including guest-to-account migration and verified aliases. The current install-derived attribution key is not sufficient for cross-device customer deduplication. Do not merge different customers because they share an installation or a public creator code. Preserve currencies; show native-currency totals or an explicitly sourced conversion, and distinguish gross revenue from contribution margin.

The public install endpoint currently accepts a valid click token and a client-supplied installation ID; the provider's deferred-delivery provenance is not independently established there. Label such observations accurately and add rate limits/replay defenses. An authenticated user or signed referral does not prove a causal install. Use “attributed app first open,” “explicit claim,” and “store referrer” as separate concepts instead of fabricating a verified-install funnel.

### Instrument failures and remove competing reporting inputs

Use the existing batched analytics transport for safe engine events: exchange started/succeeded/failed, resolve accepted/rejected, claim saved, recovery skipped, and reconciliation allocated/unmatched. Extend both allowlists together. Record method, safe route class, release version, retry stage, and bounded reason codes. Never log full tokens, credentials, copied text, or arbitrary URLs.

Classify creator URLs before emitting creator-specific receipt events. Distinguish a browser landing from a native exchange and manual code entry in the database. Otherwise code entry increases the supposed click denominator while null anonymous IDs are omitted from browser-unique counts. Use unique constraints and serialized updates where needed to keep first touch stable during simultaneous resolves.

Unify the creator economics and attribution dashboards around the existing ledgers. Keep approved view observations as evidence with a timestamp/source; show stale or missing evidence explicitly. Deprecate manual clicks, installs, and paid-customer entry once the derived reporting is validated. Avoid forcing every conversion through `views ≥ clicks ≥ installs ≥ customers`; recovered codes, installed users, and self-reports follow different paths.

Use the same customer/internal/sandbox policy as the main analytics dashboard. Expose account-level and post-level coverage separately, with unknown post credit left unknown. Financial totals and creator allocations must reconcile without counting first-touch and last-touch presentations as two payments.

## Independent measurement of the unknown share

Add stable, collision-free App Store campaign tokens mapped to creator/platform; use post tokens only when there is enough volume. The current implementation truncates a mutable slug to 30 characters. Preserve historical mapping when handles change instead of relying on string truncation. Verify the provider token on the actual destination.

Import Apple's available campaign exports through its native reporting interface/API into our reporting store. This is an aggregate cross-check for downloads, sales, and subscriptions; it does not supply an individual signed creator token to the app. Apple documents a 24-hour first-download attribution window, minimum reporting thresholds, and suppressed small groups in [campaign analytics](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links/). Missing/suppressed rows must remain unknown, not zero. Start with creator/platform buckets because our volume is low.

For content observations, request TikTok `video.list` access and creator authorization before planning automated video refresh. Existing scopes are profile/stat scopes, not `video.list`. TikTok's [Query Videos API](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query) verifies ownership and returns video details for an authorized user. Store permitted metrics at publication and approximately 24 hours, 72 hours, and seven days. Until platform access is approved, creator evidence plus human review is the fallback; do not make a fragile scraper a launch dependency. Instagram automation needs a separate account-type/permission assessment.

To estimate view-through and search-driven lift, run scheduled creator activation comparisons after posting timestamps are captured. Stagger comparable creators or posting periods, use repeated baselines, and control for paid spend, releases, geography, and weekday effects. Avoid overlapping campaigns where possible. Label results as estimates with uncertainty; a spike after a video is not individual attribution. Maintain contractual payouts while testing future bonus structures.

With seven RevenueCat paying identities this week, a short revenue A/B test will be underpowered. First prove mechanics, then compare completed claims and store exits while continuing to monitor purchases. Wait for a meaningful sample before declaring a revenue winner. Track total verified revenue per eligible landing as well as claim rate so extra recovery steps cannot appear successful merely by reducing the acquisition funnel.

The business objective is more retained paying customers and contribution per creator dollar, with attribution coverage as a diagnostic. There were purchase-cancellation observations on 132 customer iOS installation IDs this week. Better attribution will not itself fix purchase abandonment; use the existing purchase stages and cancellation feedback to assess that separately. Show mature realized revenue alongside any forecast 90-day margin, and retain the unknown acquisition bucket when comparing creators.

## Implementation sequence and acceptance criteria

Effort estimates assume one engineer familiar with both repositories and exclude external approval and App Store review time. Work should ship in small increments and preserve old links throughout.

| Priority | Work and existing code owners | Estimate | Acceptance criteria |
| --- | --- | --- | --- |
| 1 | Production diagnostics and accurate event sources: mobile attribution runtime/core, shared analytics contracts, `/api/attribution/*` | 1–2 days | Controlled first-party test reaches a durable mobile touch, account claim, and paywall event; failures have a visible bounded reason. Internal tests stay out of customer reporting. |
| 2 | Repair capture/recovery UX: creator page, `creator-code.tsx`, onboarding/paywall, release compatibility | 2–4 days | Creator saving works independently of discount eligibility. Test installed cold/warm app, fresh install with paste/reopen, Safari, TikTok, Instagram, offline retry, invalid code, reinstall, and account switching. Attribution failure never blocks purchase. |
| 3 | Transaction-time allocation and reconciliation: attribution service, billing ledger/webhooks, existing cron | 3–4 days | Sandbox purchase, duplicate webhook, delayed claim, guest save, renewal, refund, and second-device cases allocate once under the documented rule. Ordinary late code entry does not seize existing acquisition credit. |
| 4 | Register posts early and enforce attribution evidence: submissions, post identity, creator generator, review checklist | 3–5 days | New pilot posts have a submission identity, publication time, caption/placement evidence, and source-labeled view observation. Existing published codes keep resolving. Below-threshold posts are measurable without becoming payable. |
| 5 | Unified reporting and Apple campaign import: existing admin attribution/economics views and scheduler | 2–3 days | Every allocated payment traces to a verified financial fact. First/last touch do not double totals. Unknown creator/post and suppressed Apple rows are visible. Manual funnel counts cease to drive live economics. |
| 6 | Pilot, CTA experiments, and ongoing content observations | 3–5 days plus observation time | Run the cohort below, review breakpoints daily, and change defaults only after mechanics and conversion guardrails hold. Platform API approval can proceed separately. |

This is roughly **14–23 engineering days**, with the first useful diagnostics/recovery release within the first week. Android Install Referrer is a later platform-specific task if Android acquisition becomes material; the observed customer activity is overwhelmingly iOS.

### Pilot using this week's creators

Start with **pain.psl**, whose 130 non-bot requests make it the best existing traffic path for validating landing-to-app continuity. Add **kvara1771 and xeyynn1**, whose submitted cumulative view values are high but whose links have no observed traffic. Add **kvara_1717 and heli.psl** to compare Instagram tag-only and code-bearing examples. These are three creator identities across five social accounts: kvara1771, xeyynn1, and kvara_1717 belong to the same creator profile. Randomization and causal analysis must account for that shared owner.

For the first deployment, keep the current public links and compensation intact. Introduce source dimensions and diagnostics first. Release the mobile handler and recovery UI before changing link routing assumptions. Then deploy clearer landing/CTA variants, reconcile known financial facts, and unify reporting. Retire the creator-specific OneLink wrapper after compatibility testing; existing paid-media integrations can remain separate from the creator path.

Run one change at a time where traffic is sparse: first verify the current path on real devices, then compare a prominent optional Paste/code recovery against the current input; test optional account-saving as a later variant. Randomize by eligible landing visitor, persist assignment, and avoid mixing installed-user and fresh-install flows. Record exposures and completion times. A rise in claims alone is insufficient if total purchase conversion falls.

Release gates:

- Every controlled valid referral/purchase journey reconciles to the expected creator exactly once. Every controlled negative case remains unallocated for the correct reason.
- Every newly registered pilot post has a canonical identity, observed posting time, and CTA/caption evidence; migrated exceptions are explicit.
- Every production verified payment with an eligible, provably owned touch has either an allocation or an actionable reason within 24 hours. This is conditional coverage, not a promise that all buyers become attributable.
- All first-party referral paths work with the optional OneLink configuration absent. Older installed app versions retain a usable web/code fallback.
- Dashboards show observed claims, attributed first opens, paid customers, revenue, refunds, and unmatched cases with compatible date/cohort filters.
- Report purchase conversion, latency, support failures, and missing telemetry alongside recovery completion. Set expansion targets after the first working baseline instead of inventing an attribution-rate forecast now.

We cannot retrospectively reconstruct exact creator ownership for last week's untracked purchasers from timestamps alone. Preserve that week as a baseline, backfill only demonstrable existing identity/token evidence, and leave the remainder unknown.

## Audit artifacts and source map

- [Read-only audit script](../artifacts/creator-attribution-2026-10-21/audit.ts) and [data snapshot](../artifacts/creator-attribution-2026-10-21/data.json).
- [Follow-up queries](../artifacts/creator-attribution-2026-10-21/followup.ts) and [follow-up evidence](../artifacts/creator-attribution-2026-10-21/followup.json).
- [Production AASA fetched during the audit](../artifacts/creator-attribution-2026-10-21/live-aasa.json).
- Schema: `lib/db/schema.ts`; attribution/routing: `lib/creator/attribution.ts`, `lib/creator/link-routing.ts`, `pages/r/[slug].tsx`, `pages/api/attribution/*`.
- Content/review: `lib/creator/service.ts`, `post-identity.ts`, `formats.ts`, `post-guidance.ts`, `submission-review.ts`, `sprints.ts`, and `lib/admin/creator-service.ts`.
- Billing/identity: `lib/payments/billing-ledger.ts`, `pages/api/payments/revenuecat-webhook.ts`, `lib/auth/mobile-guest.ts`, and existing payment handoffs.
- Reporting: `lib/admin/audience.ts`, `lib/admin/analytics.ts`, `components/admin/creator-economics-dashboard.tsx`, `lib/admin/creator-economics.ts`.
- Mobile: `mogging-mobile/src/attribution/{core,runtime,appsflyer}.ts`, `src/app.tsx`, `src/components/creator-code.tsx`, `src/api/revenuecat.ts`, and `docs/creator-attribution.md`.

No application code, schema, campaign terms, payouts, or production records were changed. No new service was purchased. The saved evidence contains public post links and internal operational data and should stay in the existing project access boundary.
