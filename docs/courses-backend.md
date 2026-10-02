# Mogging creator courses backend

## What is implemented

Course selling runs inside the existing Next.js Pages Router application and PostgreSQL database. No extra service, language runtime, queue service, frontend dependency, or paid auth provider is needed. Bunny transcodes/streams videos and R2 serves attachments directly; application servers never relay file bytes.

Creators use their own Stripe Standard accounts through Connect. Existing accounts connect through OAuth; new accounts use Stripe-hosted onboarding with a full Stripe dashboard, processing fees charged to the account, and Stripe responsible for payment losses. All Products, Prices, Checkouts, payment reads, balances and refunds are scoped to that creator's account. No application fee, hosting subscription, destination charge, or transfer is created. Connect does not by itself resolve contractual or tax responsibilities.

Implemented features:

- Seller profiles, immutable country/handle, onboarding, connection status, reconnecting a deauthorized account, manual approval and suspension.
- JSON course drafts with sections, lessons, text, videos, attachments, previews, pricing, access duration and refund policy. Optimistic versions prevent competing saves. Editing clears a pending review; published content remains unchanged until a new version is approved.
- Public catalog and seller/course lookup with lesson content and provider identifiers stripped. Filtering and bounded pagination.
- Direct creator-account Checkout, immutable order/price snapshots, concurrent request deduplication, recovery of unknown Checkout outcomes, and free enrollments.
- Separate signed Connect webhook endpoint, durable event receipts with retryable leases, provider-state reconciliation, and paid access.
- Expiring enrollments, private lesson APIs, short-lived playback/download URLs, learner progress and library. Archiving closes new sales while preserving purchased access. An admin content block disables lesson access.
- Account-scoped full/partial refunds with mandatory idempotency keys. Full refunds revoke access; partial refunds preserve it. Disputes suspend access and a won dispute restores it. Older refunded orders cannot revoke a newer enrollment.
- Direct resumable video uploads, private signed attachment uploads, metadata verification, seller quotas, reference-safe deletion and signed Bunny webhooks.
- Creator student lists, orders, revenue/refund totals by currency, actual processing fees separately by fee currency, and whole-account Stripe available/pending balances.
- Email verification, a purchase-email outbox, periodic reconciliation, abandoned-upload cleanup and audit records for admin decisions.

The first release uses one-time USD/EUR purchases with 1–3,650 days of access. Subscriptions, installments, coupons, affiliate commissions, automated instructor tax reporting, certificates, quizzes, communities, student exports, video captions/AI features, and custom domains are future scope. There is no frontend yet. Text lesson bodies should be rendered as safe Markdown/plain text; sanitize any HTML renderer.

## Services and credentials

Reuse existing accounts/keys wherever available. Put secrets in local `.env.local` and the deployment provider's encrypted environment settings, never in chat, Git, or a `NEXT_PUBLIC_` variable. The appended `.env.example` entries are placeholders.

### Stripe

Use the existing US Stripe business. Enable Connect, choose **Standard/full-dashboard accounts**, and support the actual countries you will onboard. The API allowlist includes US, Germany, EU countries, UK, Switzerland and Norway; Stripe availability/capabilities still govern onboarding.

Required configuration:

- `STRIPE_SECRET_KEY`: platform secret key; start with a sandbox/test key.
- `STRIPE_CONNECT_CLIENT_ID`: Connect OAuth client ID for the corresponding environment.
- Register the exact OAuth redirect URI: `https://mogging.com/api/creator/courses/connect/callback` (and your staging equivalent).
- Create a **connected-account** webhook endpoint at `https://mogging.com/api/payments/stripe-connect-webhook` and store its secret in `STRIPE_CONNECT_WEBHOOK_SECRET`. This is separate from the existing scan-payment webhook and `STRIPE_WEBHOOK_SECRET`.
- Subscribe to `account.updated`, `account.application.deauthorized`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.updated`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `refund.created`, `refund.updated`, and `refund.failed`.
- Use the installed Stripe SDK's API version (`2026-04-22.dahlia`) for this endpoint. Accounts v1/controller properties are deliberately used rather than a preview Accounts API.
- Creators must finish KYC, enable card payments/payouts, and configure their public business/support details. They manage bank accounts and payouts in Stripe's own dashboard.
- Have a tax adviser establish who is responsible for US sales tax and EU VAT/digital-service taxes, including whether Mogging has marketplace obligations. Creators need appropriate registrations/settings before sales. `COURSE_STRIPE_TAX_ENABLED=true` enables automatic tax in Checkout, billed/configured on each connected account. It does not create tax registrations, remit every tax, or make legal responsibility disappear. Leave live purchases disabled until this has been resolved and staging has passed.

`COURSE_LIVE_PAYMENTS_ENABLED=false` blocks new live purchases; reconciliation/refunds for existing orders continue. Do not disconnect or replace the platform Stripe key after accepting payments. The seller-account connection is immutable, with reconnection allowed only to the same account. Balance responses are explicitly for the creator's **entire Stripe account**, including unrelated business revenue; course revenue is in the local ledger.

### Bunny Stream

Create one shared Stream library, choose **Volume Network**, and disable expensive optional features initially.

- `BUNNY_STREAM_LIBRARY_ID`: numeric library ID.
- `BUNNY_STREAM_API_KEY`: library write API key, server only.
- `BUNNY_STREAM_READ_ONLY_KEY`: library read-only API key, used to verify webhook HMAC signatures.
- `BUNNY_STREAM_TOKEN_KEY`: player token authentication key, server only.
- Configure the library webhook URL as `https://mogging.com/api/courses/bunny-webhook`.
- Enable player token authentication and the CDN token protection required for paid content. Disable direct play, public original downloads, MP4 fallback downloads, and early/original playback. Restrict allowed embedding origins to Mogging/staging.
- Verify **both** unsigned iframe access and raw CDN playlist/original URLs are denied. A signed iframe alone is not sufficient proof that a paid video cannot be fetched directly. This remains a live-provider staging check.
- Playback tokens last 15 minutes. The player should request a fresh token when reopening an expired lesson; previously issued URLs remain usable until their short expiry even after enrollment revocation. Signed access is not DRM or protection against screen recording.

TUS credentials last one hour and do not expose the API key. The creator reserves an expected duration and bytes before uploading. After encoding, the server checks provider-reported duration/storage before accepting the video. Bunny does not provide a hard per-upload byte/duration cap through this signing method; an oversized upload can incur processing/storage cost before being rejected. Uploads require an authenticated, approved seller, are rate limited, and have concurrent-safe reservations. Use reviewed/invited creators during launch; watch provider spend and library metrics. Do not describe these quotas as a hard spending ceiling.

### Cloudflare R2

Reuse the existing Cloudflare account/S3 credentials if appropriately scoped, but create a **separate private** bucket for course resources.

- `COURSE_R2_BUCKET_NAME`: private course bucket, different from the existing public image/video bucket.
- Reuse `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Existing app R2 configuration remains unchanged. Ensure the key can access the new bucket.
- Disable `r2.dev` public access and do not attach a public custom domain.
- Configure CORS for exact production/staging origins, `PUT` and `HEAD`, `Content-Type`/required S3 headers, and expose `ETag`. Signed browser upload URLs last 15 minutes; download URLs last five minutes.
- The upload reserves content type and length; completion verifies actual object metadata. Resources are PDF, plain text, PNG or JPEG, up to 100 MiB each. Downloads force attachment/octet-stream to avoid rendering uploaded active content in the application origin. Metadata verification is not antivirus scanning; add scanning if untrusted self-service creators are opened later.
- Configure a lifecycle rule to abort incomplete multipart uploads. Successful uploads are removed through the reference-checked delete endpoint; abandoned unfinished uploads are cleaned by maintenance. Audit the Bunny library for orphaned UUID-titled videos after failed create requests: unlike Stripe, video creation does not have provider idempotency, so a lost create response can require provider-side cleanup.

### Existing application services

- PostgreSQL: reuse `DATABASE_URL`; apply `drizzle/0040_course_platform.sql` through the normal migration process after staging review. No production migration has been run by this task.
- Authentication: reuse NextAuth, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` and existing accounts. Purchasing/free enrollment requires a verified deliverable email; the backend can send and consume a one-time verification code. Social-login users with placeholder email addresses can verify a separate course contact email without altering their login identity.
- Resend: reuse `RESEND_API_KEY`, a verified sending domain and `PAYMENTS_EMAIL_FROM`; optionally `PAYMENTS_EMAIL_REPLY_TO`. No marketing automation is required.
- Upstash: reuse `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in production so rate limits work across server instances. The existing in-memory fallback is suitable for local development, not a distributed production limit.
- Scheduling: configure a random `CRON_SECRET` of at least 32 characters. `vercel.json` adds `/api/cron/courses` every five minutes. Another hosting provider can call the endpoint on that schedule with `Authorization: Bearer <CRON_SECRET>`. Feature-disabled runs return a harmless skipped result.
- Admin: reuse `CREATOR_ADMIN_EMAILS`, `CREATOR_ADMIN_PASSWORD` and the existing admin-unlock cookie. Course moderation uses the same authentication plus audit records.

## Feature flags and quotas

- `COURSES_ENABLED=false` by default. Course APIs return 404 until enabled; webhooks are unavailable until configured.
- `COURSE_LIVE_PAYMENTS_ENABLED=false` by default. Keep false during sandbox/staging.
- `COURSE_STRIPE_TAX_ENABLED=false` by default. Set explicitly based on approved tax setup before accepting live payments.
- `COURSE_VIDEO_QUOTA_SECONDS=72000`: 20 hours per seller, counting reserved/processing uploads.
- `COURSE_RESOURCE_QUOTA_BYTES=2147483648`: 2 GiB of attachments per seller.
- Maximum 30 courses and 1,000 retained/reserved assets per seller. A course has at most 30 sections and 300 lessons. Draft request bodies are limited to 2 MiB, other course request bodies to 64 KiB.
- Video uploads declare up to two hours and 5 GiB of source data per asset. Encoded storage is capped at 10 GiB per video after provider verification.

Storage allowances help bound free hosting; delivery grows with actual watch time. Track Bunny usage and spend per library, correlate video IDs with `course_assets`, and set budget alerts with the providers. Add per-creator exceptions only once observed usage justifies them. Do not add Redis caching or a Rust service before query/provider metrics demonstrate a need.

## API contract for the frontend

Successful JSON responses use `{ "data": ... }`; errors use `{ "error": { "code", "message", "details"? } }`. Private routes are `Cache-Control: private, no-store`. Cookie-authenticated writes reject cross-site requests. IDs are UUIDs; amounts are integer minor currency units. Dates are ISO strings. Student/creator/admin authorization is server-side on every request, including playback renewal.

### Public/student routes

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/courses` | Catalog: `page`, `limit`, optional `seller`, `category`, `q`; items + `hasMore` |
| GET | `/api/courses/lookup/:sellerSlug/:courseSlug` | Public published course; paid content omitted |
| GET | `/api/courses/library` | Signed-in student's enrollments, activity and redacted curriculum; up to 100 |
| GET | `/api/courses/:courseId` | Enrolled user's curriculum and saved progress, including archived courses |
| GET | `/api/courses/email` | Own verified/pending course contact email |
| POST | `/api/courses/email` | Optional `{ email }` selects a course contact address; send verification code; one send/minute |
| POST | `/api/courses/email/verify` | `{ token }`; consumes hashed one-time code |
| POST | `/api/courses/:courseId/checkout` | `{ orderId, url, expiresAt }` or `{ enrolled: true }` for free courses |
| GET | `/api/courses/orders/:orderId` | Buyer's own order, reconciled from Stripe; poll sparingly |
| GET | `/api/courses/:courseId/lessons/:lessonId` | Authorized lesson body and safe asset metadata |
| GET | `/api/courses/:courseId/lessons/:lessonId/assets/:assetId` | Authorized short-lived video/download URL |
| PUT | `/api/courses/:courseId/lessons/:lessonId/progress` | `{ positionSeconds, completed }` for an enrolled user |

Owners can use `?draft=true` on lesson and asset reads; students cannot. Anonymous reads are allowed only for explicitly marked previews in a published, available seller's course. A checkout return URL never grants access. Poll the owned order and/or refresh the library until a verified paid webhook/provider read grants access.

### Creator routes

Base: `/api/creator/courses`; session required throughout.

| Method | Relative path | Input/result |
| --- | --- | --- |
| PUT | `/seller` | `{ slug, country, bio?, supportEmail }`; creates/updates seller |
| GET | `/seller` | Profile/status and Stripe requirements |
| POST | `/connect` | OAuth URL for an existing Standard account |
| GET | `/connect/callback` | Stripe OAuth callback; user-bound one-time state, redirects to creator page |
| POST | `/connect/onboarding` | Hosted onboarding URL for a new account or unfinished onboarding |
| GET | `/connect/status` | Refresh capabilities/requirements from Stripe |
| GET | `/` | Creator's courses, including draft/published versions |
| POST | `/` | `{ slug, content }` -> new course |
| GET | `/:courseId` | Owned course draft, version and publication/review state |
| PUT | `/:courseId` | `{ version, content }`; 409 on stale version |
| POST | `/:courseId/submit` | `{ version }`; validates ready assets/complete content, queues approval |
| POST | `/:courseId/archive` | `{ version }`; closes new sales, preserves purchased access |
| POST | `/:courseId/uploads` | Validated video/resource reservation -> TUS headers or signed PUT URL |
| GET | `/:courseId/assets` | Uploaded/processing asset status |
| POST | `/:courseId/assets/:assetId/complete` | Verify actual provider object/video; returns processing/ready state |
| DELETE | `/:courseId/assets/:assetId` | Allowed only when absent from both draft and published content |
| GET | `/:courseId/students` | `page`, `limit`; student name/avatar and enrollment/access status |
| GET | `/dashboard` | `page`, `limit`, `from`, `to`, `courseId`; orders + per-currency totals/fees |
| GET | `/balance` | Whole Stripe-account available/pending funds, explicitly labeled |
| POST | `/orders/:orderId/refund` | `{ amount? }`, **`Idempotency-Key: <UUID>`**; omit amount for remainder |

Generate stable section/lesson UUIDs in the builder. Reorder arrays to reorder curriculum; preserve IDs when editing. Store plain JSON; send the full draft with its current version. On 409, reload and offer the creator a chance to reconcile edits. Never send Stripe account IDs, charged amounts, or enrollment expiry as trusted client input.

Course content example:

```json
{
  "title": "Practical style",
  "summary": "Build a consistent wardrobe",
  "description": "The complete course description",
  "coverUrl": null,
  "category": "style",
  "language": "en",
  "outcomes": ["Understand fit"],
  "refundPolicy": "Contact the creator within the published refund window",
  "price": { "amount": 4900, "currency": "usd", "accessDays": 365 },
  "sections": [{
    "id": "<UUID>", "title": "Getting started",
    "lessons": [{
      "id": "<UUID>", "title": "Fit basics", "kind": "video",
      "body": "Optional supporting notes", "videoAssetId": "<uploaded asset UUID>",
      "resourceAssetIds": [], "preview": false
    }]
  }]
}
```

For video uploads: POST `{ kind: "video", title, contentType, sizeBytes, durationSeconds }`, then upload using a browser TUS client to the returned endpoint with the returned headers/metadata. Poll asset completion/status while encoding. For resources: POST `{ kind: "resource", title, contentType, sizeBytes }`, then PUT file bytes to the signed URL with the exact content type. Call completion before referencing a ready asset in a publication.

### Admin routes

Base: `/api/admin/courses`; existing admin authentication/unlock required.

| Method | Relative path | Result |
| --- | --- | --- |
| GET | `/` | Submitted review queue, oldest first, up to 100 |
| GET | `/sellers?page=1` | Seller registration/status queue, 50/page |
| PATCH | `/sellers/:sellerId` | `{ status: "enabled" | "pending" | "suspended" }` |
| GET | `/:courseId` | Full draft/publication metadata for review |
| GET | `/:courseId/lessons/:lessonId` | Draft content for review |
| GET | `/:courseId/lessons/:lessonId/assets/:assetId` | Signed draft video/resource for review |
| POST | `/:courseId/review` | `{ version, decision: "approve" | "reject", note? }`; approves exact submitted version |
| PATCH | `/:courseId` | Optional `listed`, `salesEnabled`, `contentBlocked`; audited moderation |
| GET | `/:courseId/audit` | Latest 100 admin decision records |

Approve seller identity/content first; creators never auto-approve themselves. Paid publication automatically creates the seller-account version-specific Product/Price pair; nobody needs to manually enter every course in the Stripe dashboard.

## Recovery and operational notes

Order reconciliation requests expanded Checkout/PaymentIntent/Charge/balance data in one provider request where supported, with fallback retrievals and an additional dispute read only for disputed charges, then updates the order and enrollment together. Reads/writes are serialized per order; failed webhooks release their processing lease and return an error for retries. Access expiry uses the original payment timestamp, not webhook arrival time. The same order cannot repeatedly extend access. One buyer/course pending order is enforced by a partial unique index; provider writes have durable idempotency keys.

Scheduler work is bounded (three orders, three refund requests, three assets, three emails per run) with a 40-second soft budget. A durable five-minute lease/deduplication record prevents duplicate scheduled runs. Failed rows remain retryable. Server termination recovers on the next lease/retry. Monitor failure counts and pending-row age; increase batch sizes or move the same workers to a background runner when actual traffic requires it. Stripe/network timeouts can still consume the execution budget; webhook retries and persisted work recover rather than losing access events.

Unknown Checkout responses are recovered with the original order/key/payload. Refund requests reserve remaining refundable funds before Stripe writes; successful response handling reconciles payment state before releasing the reservation. An unknown refund response must be retried with the **same** UUID; do not generate a new key for the same intended refund. This conservative reservation can temporarily block other refunds until the original request finishes. Known refund IDs are retrieved rather than recreated on retries. The scheduler retries pending requests; unknown outcomes older than 23 hours require reconciliation in Stripe before another write, protecting against Stripe's idempotency retention expiring. Failed/pending external refunds and missed webhook deliveries need operational monitoring; the Stripe dashboard remains the source of truth for payout/refund operations.

The catalog currently reads indexed SQL without an additional cache so a sale halt or takedown takes effect on the next request. The course JSON model avoids hundreds of relational reads per course and preserves an explicit reviewed publication snapshot. Publication atomically writes a public catalog projection alongside the reviewed snapshot; catalog/library reads fetch only this projection. PostgreSQL JSONPath selects only the requested lesson for lesson reads, avoiding transfer/parsing of entire private courses. Learner/creator lists are bounded; an unusually large student library (>100 courses) needs pagination before that scale is reached.

## Validation and staging rollout

Commands use Bun:

```sh
bun run typecheck
bun test lib/courses/validation.test.ts
# Create an EMPTY disposable local PostgreSQL database named mogging_courses_test first.
COURSE_TEST_DATABASE_URL=postgres://USER@127.0.0.1:PORT/mogging_courses_test bun run scripts/tests/courses.ts
```

The integration script refuses nonlocal/non-test databases and nonempty schemas, installs the existing schema plus the **actual new migration**, and uses isolated provider mocks. It covers migration application, ownership, private content, draft/publication isolation, competing saves, concurrent Checkout dedupe, verified purchases, fixed expiry, refunds, dispute resolution, old/new order interactions, video verification, playback authorization, archives, takedowns, lost-response recovery, webhook signatures/dedupe, email sending and HTTP authentication/origin/order checks. It does not prove live provider settings or real card/bank behavior.

Rollout:

1. Apply the migration to staging, enable courses, configure sandbox Connect and media/email providers.
2. Onboard one US and one German test creator using existing-account and new-account flows. Confirm all writes happen on the creator account and there is no platform commission or hosting invoice.
3. Upload a real TUS video and private resource. Verify unsigned iframe/CDN/original access and unauthorized resource reads are denied; test token expiry and CORS.
4. Publish a test course; purchase it, repeat webhooks, interrupt/retry Checkout, test a delayed payment, partial/full refunds and a dispute. Confirm existing scan payments still work on their separate endpoint.
5. Verify Stripe Tax settings, contractual/refund terms, email deliverability, cron authorization/retries, Redis limits, backups and provider budget alerts.
6. Build the frontend against these APIs and run the complete real-browser flow. Only then enable live course payments and approved creators.

Creator handles/course slugs already identify tenants without separate deployments. The frontend can map `mogging.com/<creator>/courses/<course>` or `mogging.com/courses/<creator>/<course>` to the same lookup API. Subdomains can later use wildcard DNS/TLS and host rewrites, with explicit auth/cookie/callback handling; this backend does not provision DNS or claim those URLs already exist. Checkout returns target `/courses/library` and `/courses`; onboarding returns target `/creator/courses`, which the frontend phase must implement.

Provider references: [Stripe controller properties](https://docs.stripe.com/connect/migrate-to-controller-properties), [Standard account OAuth](https://docs.stripe.com/connect/oauth-standard-accounts), [Bunny TUS uploads](https://bunny.net/docs/stream/tus-resumable-uploads), [Bunny player authentication](https://bunny.net/docs/stream/token-authentication), [Bunny signed webhooks](https://bunny.net/docs/stream/webhooks).

Repository-wide validation: all 52 existing/new test files pass when run in isolated Bun processes with provider credentials unset. The combined `bun test` command currently has shared `mock.module` leakage between existing creator/admin test files; two fallback tests also assume R2/Upstash are unset. The new integration script deliberately runs in its own process to avoid adding to that issue.
