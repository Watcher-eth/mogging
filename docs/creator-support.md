# Creator support assistant

The creator portal includes `/creator/support` and a lazy-loaded chat launcher. GLM 5.3 Flash (`z-ai/glm-5.3-flash`) runs through OpenRouter using the AI SDK's bounded tool loop. Set `OPENROUTER_API_KEY` on the server; the existing `NEXTAUTH_SECRET` signs conversation context. Neither credential is sent to the browser.

## Local demo

Use Node 22+ on PATH, then:

```sh
NEXT_DIST_DIR=.next-support-demo CREATOR_SUPPORT_LOCAL_DEMO=1 bun run dev --hostname 127.0.0.1 --port 3100
```

Open `http://127.0.0.1:3100/creator/__support-demo`. It uses synthetic creator data, including when GLM is connected. The interface labels the sample data without showing provider names or token counts; engine and usage remain server response diagnostics. The demo page and API return 404 in production and require an explicit development flag. The demo cannot write to the database. The app's analytics event component is skipped on the demo route.

Try:

- `Show my submissions` → three status paragraphs and grouped shared submission cards; select “Explain decision & earnings” for verified metrics, saved review feedback, and a payout breakdown.
- `Why was my face scan breakdown submission rejected?` → saved failures, verified audience, campaign rules with other rules faded, and concrete next steps.
- `Show campaign milestones at 22.5% audience` → the portal’s milestone UI and server-calculated illustrative amounts.
- `Show examples from that campaign` → the existing campaign video carousel and a campaign-specific CTA action.
- `Show my analytics for the last 7 days` → a staggered multi-series chart with metric toggles and exact values.
- `Help me create a CTA` → copyable draft and CTA Studio/guide buttons.
- `How do I submit a video?` → button to preview the submission flow. Live accounts open the existing submission dialog.
- `Why is my approved submission not paid yet?` → GLM uses scoped submission/payment/bonus reads.
- `Can you improve the CTA for my Mogging video without misleading claims?` → GLM retrieves current guidance and drafts a CTA.
- `What is the weather?` → scope redirect with zero model calls.

## Access boundary

`createSupportDataSource(session.user.id)` resolves and validates the creator profile. The model never chooses an owner and has no database credentials, SQL execution, general HTTP fetch, administrative endpoint, or write tool. Individual submission queries combine record ID with ownership. Campaigns exclude drafts. Payment fields are explicitly selected and exclude destinations/provider references. Referral reads return only the creator's invitation/reward totals, not invitees' private details. Conversion analytics reuse the existing owner-scoped aggregation service and expose no customer identities.

Conversation history is HMAC-signed, expires after 30 minutes, binds to the authenticated user, and holds at most six 900-character messages. Clients cannot supply assistant/system history. Responses are `private, no-store`; private reads are never cached across requests/users. The short-lived tool cache exists only inside one request. Prior answers are not fresh evidence: the agent is instructed to retrieve current account facts again.

Portal actions use an enumerated destination registry. Submission and campaign links use IDs returned by authorized tools. Model output is rendered as plain text; cards and charts come from typed server artifacts, not generated executable UI. Opening a form does not submit it. Portal forms retain their existing validation and explicit user submission behavior.

## Efficiency and limits

- Conservative local scope admission rejects known unrelated/instruction-extraction requests and asks for clarification on unknown topics, without inference. Only tightly bounded contextual followups bypass keyword admission. This is not a perfect semantic classifier; model instructions enforce creator scope on admitted requests too.
- Exact common retrieval/navigation intents and a basic CTA use deterministic responses and zero model tokens. Complex explanations use GLM. Selecting a submission explanation preloads authorized evidence and needs only one model call. The selected submission’s campaign-example action is also a zero-model lookup.
- Only tools relevant to the current/previous creator question are offered. Help content imports the portal's source constants and retrieves up to three sections.
- Tool results send compact summaries to GLM; full chart series and UI card payloads bypass the model.
- At most four model steps, six tool invocations, and 2,200 output tokens per step (including reasoning), with low reasoning effort, no automatic retries, and a 45-second deadline. GLM requires reasoning; it is not falsely disabled. Disconnecting cancels upstream generation.
- 20 requests/minute and 200/day per creator, using the existing rate limiter. Production durability depends on the existing Upstash configuration. OpenRouter requests disallow provider data collection and require parameter support; unavailable compliant providers fail closed.

Submission explanations use saved campaign terms when available, saved checklist failures and reviewer notes, verified versus submitted views/audience, the last approval snapshot, and full owner-scoped payment aggregates. Missing checks are unknown, not failures. A rejected re-review does not erase prior approval or payments. Campaign artifacts retain every applicable rule, emphasize relevant rules, and offer a full-contrast toggle. Examples reuse the public campaign carousel and are resolved by registered campaign format. Explanations may use two to four paragraphs, up to 250 words.

Status explanations must distinguish approved amounts from scheduled payments, pending from paid, bonuses from content payments, revenue from earnings, and direct attribution from estimates. The agent cannot guarantee an approval, bonus, or payout date. Provider failures show a retry path without exposing raw provider payloads. No persistence or database migration is required.

## Verification

```sh
bun test lib/creator/support/support.test.ts
bun test lib/creator/support/data.test.ts
bun test lib/creator/support/evidence.test.ts
bun run typecheck
bunx eslint components/creator/support/*.tsx components/creator/submission-card.tsx lib/creator/support/*.ts pages/api/creator/support*.ts
NEXT_DIST_DIR=.next-support-check bun run build
```

The tests cover zero-call scope/instant responses, forged client identities, signed history ownership/tampering, matching chart windows/totals, owner-qualified SQL predicates, draft campaign exclusion, and suspension. Use separate Bun test processes because module mocks persist between files in this repository. Browser QA additionally checks charts, cards, dialogs, copying, and GLM answers against synthetic data. A live creator session is required to exercise production account reads end to end.

## Chat interface

The support UI uses locally owned Prompt Kit primitives (`components/prompt-kit`) for the compound prompt input, suggestions, messages, copy actions, and tooltips. Sources are adapted from https://github.com/ibelick/prompt-kit with its MIT notice retained. The composer supports autosizing, Shift+Enter, IME composition, keyboard submission, cancellation, and a latest-message control.

Motion Primitives' existing `AnimatedGroup` and `TextShimmer` provide short response entrances and a waiting state; the chat honors reduced motion for both. The shimmer source is from https://github.com/ibelick/motion-primitives, with its MIT notice retained in `components/core`. No additional runtime dependency was required. Colors, typography, and controls use the creator portal's design tokens. Submission cards, campaign milestones, example videos, review feedback, and analytics continue to render through the shared portal components.

Response paragraphs render at most two complete metric/value phrases as inline pastel pills with matching circular metric icons. Conversions and attributed revenue take priority, duplicate metrics and unlabeled amounts stay plain. `inline-facts.ts` classifies nearby units/statuses without changing the text or adding inference calls; dates, durations, list numbers, and IDs remain ordinary text. The presentation does not certify or calculate facts. The response copy action still uses the original plain text. Instant analytics answers include the exact same window totals as the attached chart. Formatting and summary consistency are covered by `inline-facts.test.ts` and `support.test.ts`.

## Video conversion questions

Natural conversion/performance questions prefetch an owner-scoped video report before inference, including “How well did my video convert this week?”. Calendar weeks start Monday and are labeled UTC; last week and rolling windows are explicit. The attribution service filters clicks and events at their activity timestamps while keeping first-install/first-customer deduplication over full history. Optional windowing leaves existing all-time callers unchanged. Per-video daily series support a selected video's own chart; posting-date cohorts use recorded posting dates, never guessed submission dates. Unknown posting dates and unassigned activity remain explicit. The native conversion video card is shared with the Conversions page.

The model receives formatted USD amounts, direct/estimated attribution, and server-calculated period activity ratios. No performance benchmark or same-visitor cohort is implied. Unsupported benchmark, cents, or cohort-rate claims fall back to the factual data summary. Compound requests can still use other scoped tools. Provider failures retain a useful data answer. Signed context carries a selected video into period followups.

Copy, native share (with a copy fallback), and portal actions share one response footer below all artifacts. Sharing uses the answer text and never creates a public page or publishes automatically. Model names, providers, and token counts are absent from the interface; server usage remains available for diagnostics.

Additional regression checks: `bun test lib/creator/support/video-analytics.test.ts` and `bun test lib/creator/support/conversion-window.test.ts` (separate processes).

Chat artifacts use flush, borderless layouts. The chart’s inline presentation removes the category-label gutter, hover cursor rectangle, nested data disclosure, and single-bucket footer; a single-day chart measures its own height. Native conversion cards act as keyboard-accessible clickable rows with subtle pointer hover/press scaling and honor reduced motion. All returned videos (up to eight) render without extra “Explore” or expansion pills. Composer suggestions/slogans are omitted after a response, and portal footer links carry destination-specific leading icons. Unassigned conversions are noted only when nonzero.

## Mogging Support drawer and chart entries

The assistant is named Mogging Support. Its tighter profile caption reads “Here to help with campaigns, submissions, and general questions.” The launcher uses Vaul 1.1.2 as a nonmodal right drawer with rounded corners, explicit close/Escape/handle dismissal, and background interaction. Its content width is one third of the viewport minus a 12px inset below 1280px, and one quarter minus the inset at 1280px and above. There is no minimum-width override. Container queries stack controls at narrow widths. The demo header has a “Preview side drawer” trigger using the same component with sample data.

One-day analytics show every metric in a stacked bar list, with a common scale for counts and a separately labeled USD scale for revenue. Rows stagger by 45ms with 240ms bar growth. Multi-day analytics initially show all three activity series, retain every daily point, and put USD revenue on a separate selectable scale. Metrics and lines enter with short staggered timings; repeated toggles remain immediate. Accessible daily tables expose the plotted values without adding visible clutter. Campaign milestones also enter in a short stagger. All entry motion honors reduced-motion preferences; the Vaul transition is 280ms.

Checks: `bun test lib/creator/support/chart-metrics.test.ts` covers count/currency scales, zero activity, and net refunds; the support suite covers the zero-token Mogging Support identity response. Browser checks measure the drawer caps at 390px, 1024px, and 1280px, verify Escape dismissal, and verify all 30 daily observations and separate revenue rendering.

### Direct section links and inline requirements

Support section actions use real Next.js links to the specific portal page and anchor, including in the local demo. Campaign and submission cards navigate directly to their dedicated records; the demo-only flow and sample-detail preview dialogs have been removed. The live new-submission action still opens the existing submission form.

Content requirements and content rules actions also render shared portal policy directly beneath the answer, without an extra model call for exact requests. The general guidance is clearly labeled; campaign-specific rule or submission-evidence cards take precedence to avoid repeating generic policy. The model is instructed to fetch and render native campaign, milestone, and submission UI whenever available rather than defer an answer to the portal.

### Compact requirements and daily message allowance

The campaign creative-brief timeline is shared by the campaign page and support through `CampaignRequirementList`. In chat, rows use short labels and expandable full policy text. Requirement relevance is matched to the creator’s latest question, prioritizing titles over incidental matches in details. Relevant rows expand with blue emphasis; other rows stay present at reduced opacity and return to full contrast on hover or keyboard focus. Campaign-specific rule cards use the same component and their server-provided focus IDs. A “Show all at full contrast” control restores the complete list.

Each authenticated creator can send **four messages per UTC calendar day**, including instant responses. The allowance is separate from signed chat memory: new chats, browser refreshes, and other devices cannot reset it. Redis atomically reserves a slot before agent execution, caps concurrent requests, and expires the counter at midnight UTC. Failed agent requests refund their slot once. Production requires the existing Upstash Redis configuration and does not fall back to a per-instance counter; a development-only in-memory store is available without Redis. GET on the support endpoint reads the creator’s allowance without consuming a message. POST returns the updated allowance, or HTTP 429 with remaining/reset metadata before running the agent when exhausted.

The composer shows remaining messages, refreshes the allowance every minute and on focus, and disables sending at the limit. The local sample creator has its own four-message allowance. Tests cover concurrent admission, creator isolation, midnight rollover, idempotent refunds, production storage requirements, and relevance matching.

### Performance answers and relevant artifacts

Broad questions such as “How well did my video do this week?” and “How are my videos doing?” now enter the windowed video analytics path before model generation. General video performance renders conversion charts, a separate latest-recorded-views bar chart, and the existing submission cards grouped into In review, Approved & paid, and Rejected. A named video scopes both its analytics and its submission lookup through the owner-bound data source. Conversion-only questions retain the conversion UI; views-only questions show view bars and current status without irrelevant conversion content.

View bars explicitly represent cumulative recorded snapshots, with each value labeled verified or submitted. They do not claim views gained in the selected period, since that requires a view-history source. Missing view values remain unknown. General status counts cover the account’s current statuses; displayed recent cards are a bounded sample, separate from the analytics date window.

Retrieving initial help guidance no longer automatically creates section links. Requirements/rules actions require a relevant explicit content or submission-flow question. Analytics answers receive no generic policy guidance and pure analytics questions cannot invoke help tools, preventing unrelated content requirements from appearing below an otherwise correct performance response.

Chat submission cards retain the portal component, with smaller thumbnails and tighter padding. Wider answers use two columns, drawers use one, and in-review cards omit the redundant decision-explanation footer to reduce the gap between videos. Regression tests cover broad phrasing, prior requirements context, named-video isolation, views-only rendering, and exact snapshot labels.

### Selective response presentation

This supersedes the earlier broad performance layout: each answer includes at most two rich UI sections, selected by relevance before being returned to the client. General performance uses one metric-focused chart and compact submission rows; it does not append view charts or per-video analytics cards. Views-only requests show just the recorded-views comparison unless status was also requested. Navigation links are limited to two. Model answers default to two short paragraphs and avoid repeating the status UI in prose.

Chart selection follows the data: one observation displays numeric metrics; short daily count series use columns; longer or explicitly requested trends use lines; video comparisons and cumulative recorded views use horizontal bars. The requested metric is selected initially, with conversions as the general-performance default. Comparison rankings use that metric rather than silently ranking revenue questions by conversions.

Submissions always use one full-width horizontal row per post, with a 44×56 preview and no separate explanation footer. There is no two-column chat grid. Rows remain clickable to their dedicated submission page.

### Discord support

Discord uses the same `executeCreatorSupport` service as `/api/creator/support`, with the same owner-scoped data source, OpenRouter GLM model, and atomic four-message UTC-day ledger keyed by the app user ID. Discord IDs are never passed as creator ownership IDs. `/connect`, `/help`, `/allowance`, and `/reset` do not consume daily messages; support questions, submission summaries, campaigns, and performance requests do. Provider failures/unavailability and failed delivery refund the reservation.

`/creator/discord` is the account connection and disconnect page, also linked from portal support. Connection requires an authenticated portal session, same-origin POST, and Discord OAuth `identify` consent. The callback requires the same portal user, an HttpOnly SameSite cookie, and an expiring single-use Redis state. A dedicated `creator_discord_links` table uniquely binds each app user and Discord identity, separately from NextAuth login accounts. Connecting does not enable Discord sign-in. OAuth credentials are discarded and revocation is attempted after identity verification. Either-side conflicts require explicitly disconnecting first. Suspended users cannot connect or use creator support but retain control over disconnecting their existing identity.

`/api/discord/interactions` accepts bounded raw requests, verifies Ed25519 signatures and timestamp freshness, checks the application/guild/member, rejects DMs and bot users, deduplicates interaction IDs in Redis, and throttles commands. Chat SDK acknowledges every accepted slash command with the ephemeral flag. Results are sent only by editing that interaction's original response; there is no public-channel or DM fallback. Mention parsing is disabled. Rich responses contain at most two relevant sections, optional locally rendered chart PNGs, and first-party portal links. No creator data is sent to an external chart rendering service.

Discord conversation memory is signed, bounded, and retained for 30 minutes, keyed by the verified app user, Discord identity, link creation time, guild, and channel. A per-creator Redis lock prevents overlapping Discord requests. Before delivery the link and active creator access are rechecked, so disconnecting/relinking during generation revokes the old result. The SDK state adapter uses the existing Upstash REST connection; no Gateway listener, message-content intent, or additional Redis service is needed.

Campaign policy always comes from live accessible portal campaign records, not Discord channel history or a hardcoded campaign ID/rate table. Current campaigns are prioritized over upcoming/ended records in bounded discovery; selecting a specific accessible campaign still works after it ends. Each tool response identifies the campaign dates/time phase. New questions read current terms again; historical decisions/calculations retain the submission's saved terms, even if the campaign was later changed or unpublished. A current time phase is not evidence of budget or acceptance eligibility. New campaigns become discoverable automatically through the existing portal visibility rules.

#### Configuration and release

1. Apply `bun run db:migrate --only 0067_creator_discord_links` to the intended database before enabling the integration. The migration only adds the identity-link table, foreign key, and unique Discord identity index; it does not alter campaign terms or creator records.
2. Set server-only `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, and `DISCORD_CLIENT_SECRET` locally and in the deployment environment. The public application ID (`1565455254227783811`) and Mogging Creators guild ID (`1526698974847963268`) have verified defaults; `DISCORD_APPLICATION_ID` and `DISCORD_GUILD_ID` can override them for a future app/server move. Credentials never have defaults. Existing `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, OpenRouter, database, and Upstash settings are reused. Do not commit secrets.
3. Add the exact OAuth redirect `https://www.mogging.com/api/creator/discord/callback` to the application's OAuth2 settings. Local testing requires its own exact callback URL matching the local `NEXTAUTH_URL`.
4. Deploy the routes, then set the application's Interactions Endpoint URL to `https://www.mogging.com/api/discord/interactions`. Discord must verify the signed PING.
5. Run `bun scripts/setup/discord-support.ts` to print the guild-locked install URL and configured endpoint URLs. The install requests zero bot permissions. Install with `bot` and `applications.commands` scopes, keep privileged intents off, and restrict command availability using server integration/channel settings as needed.
6. Run `bun scripts/setup/discord-support.ts --register` to upsert the standalone guild-scoped support commands and remove this app’s legacy `/mogging` command. This preserves other commands and does not post or alter server messages/channels.
7. Validate with two distinct creator accounts: connect each identity, check private own-data responses in the same channel, consume a mixed total of four portal/Discord questions, verify the fifth is refused, and test disconnect/relink plus a campaign transition. Clear test consumption only through the normal UTC reset; do not reset a real creator's allowance for rollout.

Run mock-based suites independently because Bun module mocks persist within a test process: `bun test lib/creator/discord/<suite>.test.ts`. The bot suite exercises the actual Discord adapter and shared support service with fixture data and captured HTTP delivery; it is not a live Discord/provider test. The linking suite covers state, ownership, conflicts, and OAuth handling; webhook suites cover signatures, scope, and replay. Existing support tests cover owner-bound database queries, campaign snapshots, and presentation selection.
