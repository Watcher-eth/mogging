# Backend reliability

`/admin/analytics/reliability` shows live dependency readiness, backend outcomes,
latency, failure codes, trace IDs, unfinished evaluations, client failure signals,
and email-provider acceptance records. It refreshes every 15 seconds while open.

## Collection

`monitorBackend` wraps 68 API handlers covering evaluation, potential images,
authentication, subscriptions, checkout, webhooks, entitlements, handoffs,
attribution, reports, sharing, referrals, push registration, leaderboards,
creator operations and scheduled maintenance. It records safe machine codes,
duration and a generated trace; it never stores the request/response body.
Existing handler validation, authorization, responses and credit logic remain
owned by their existing implementation.

Technical failures include HTTP 5xx, provider errors, failed analyses inside
HTTP 200/201 responses, and completed transient analyses with broken persistence.
Ordinary 4xx rejections and “No face detected” are visible but do not trigger an
outage email. User-facing latency may additionally include upload/network/render time.

Evaluations emit a start signal after authentication and reservation, immediately
before generation. A start with no final request signal after five minutes appears
as unfinished for 24 hours. Interruption or telemetry loss can produce this signal;
monitoring never refunds credits or retries generation automatically.

Events reuse `analytics_events` with `source=backend`, `platform=server` and
dedicated `backend_request`, `backend_evaluation_started`, `backend_alert` names.
They stay outside behavioral device counts and PostHog user exports. No new
database migration or app release is required. Vercel `waitUntil` lets recording
finish after the response. Telemetry is best effort and cannot block a purchase
or change its result; its failures appear in hosting logs.

## Alerts and availability

- Production recipient: `RELIABILITY_ALERT_EMAIL=w@mogging.com`, configured in Vercel.
- Requires `RESEND_API_KEY`, a verified sender matching `PAYMENTS_EMAIL_FROM`
  (default `Mogging <support@mogging.com>`), and shared Upstash Redis credentials.
- The first technical failure attempts an email. Redis groups repeat failures by
  feature and code for 15 minutes. Failed sends release the cooldown for later retry.
  An accepted email is not proof of inbox delivery. Missing configuration is shown
  in the dashboard; local and preview events never send these alerts.
- `/api/cron/reliability` checks database/runtime readiness and unfinished scans
  every minute after deployment. It requires the existing `CRON_SECRET`.
- This is an internal dependency check, not independent hosting uptime monitoring.
  Configure an external HTTPS monitor for `https://mogging.com/api/health`, every
  60 seconds, with a 10-second timeout and two consecutive failures before an
  outage notification to `w@mogging.com`. That monitor must run outside Vercel so
  it can detect DNS/network/hosting failures when this application cannot execute.
- Platform-killed requests may have no final telemetry. Provider errors and
  storage degradation are detected from real requests; probes do not spend money
  generating AI reports. A passing database/configuration probe does not prove
  every provider is working.

Deployment activates the new collection and cron. Email sending additionally needs
the missing production Resend key and sender verification. External monitor
configuration remains a separate activation step.

## Verification

`bun test lib/reliability/outcome.test.ts` validates failed HTTP-201 analyses,
provider authentication errors, invalid-photo suppression and persistence degradation.
`bun run scripts/tests/reliability-alerts.ts` tests fake email/Redis transports,
recipient selection, grouping and delivery retries without sending real messages.
`scripts/tests/admin-reliability.ts` uses temporary localhost database fixtures to
test production/source isolation, latency validation, unfinished scans and client
release reporting. `scripts/tests/admin-analytics-http.ts` checks authorization,
private headers, health responses and monitored endpoint auth/trace behavior.
