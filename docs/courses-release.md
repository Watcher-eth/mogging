# Course production release

The course frontend and backend are connected and tested locally. This checklist covers the remaining provider configuration and production verification. Nothing has been deployed or enabled for live selling. Hosting remains free, with no Mogging sales commission. The user clarified that the existing Stripe account is a personal account registered in Germany. A US business account is intended; its legal-entity eligibility and activation still need confirmation. The local sandbox is German.

## 1 Configure live Stripe

1. Switch out of the sandbox into the intended US business in [Stripe Dashboard](https://dashboard.stripe.com/). Finish business verification and Connect activation. Choose **Platform**, with creators collecting direct payments and using the full Stripe dashboard. Processing fees and payment losses are assigned to Stripe in the account configuration.
2. Create a separate US account under the same login if the legal entity meets Stripe's US requirements; an activated German account cannot change country. Keep the existing account available for its payments and refunds. The application currently shares one Stripe client/key between courses and main-app payments, so separate course credentials or a reviewed full migration is required before changing production keys. New-account Products, Prices, customers and connected accounts must not be assumed to transfer. Then obtain the correct live platform key from [API keys](https://dashboard.stripe.com/apikeys). Rotate the sandbox secret previously pasted into chat.
3. In [Connect settings](https://dashboard.stripe.com/settings/connect), obtain the live OAuth client ID and register `https://mogging.com/api/creator/courses/connect/callback`. Use separate credentials and callbacks for staging.
4. In [Workbench webhooks](https://dashboard.stripe.com/workbench/webhooks), create both destinations below. Save their separate signing secrets in encrypted production environment variables. Use the exact event lists in [backend Stripe setup](courses-backend.md#stripe).

| Destination | Events from | Format | URL | Secret |
| --- | --- | --- | --- | --- |
| Course purchases and refunds | Connected accounts | Snapshot, `2026-08-26.dahlia` | `https://mogging.com/api/payments/stripe-connect-webhook` | `STRIPE_CONNECT_WEBHOOK_SECRET` |
| Creator readiness | Your account | Thin | `https://mogging.com/api/payments/stripe-connect-account-webhook` | `STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET` |

Accounts v2 account notifications use **Your account**, while direct-charge purchase events use **Connected accounts**, as documented in [Stripe event routing](https://docs.stripe.com/connect/accounts-v2/migrate-integration#webhook-events). Test accounts, Products, Prices and orders are not portable to live mode. Actual creators complete their own live onboarding; course approval creates their live Products and Prices automatically.

Confirm launch tax settings and seller/customer terms before accepting live purchases. `COURSE_STRIPE_TAX_ENABLED` enables automatic calculation on connected-account Checkout; it does not establish registrations or resolve responsibility for taxes.

## 2 Configure production media

- **Bunny library 768882:** save library API, read-only, player-token and CDN-token keys privately. Set the webhook to `https://mogging.com/api/courses/bunny-webhook`. Keep player and CDN token protection enabled, restrict embedding origins to the actual deployment origins, and disable public original downloads, direct play and unprotected fallback playback. Test signed playback and unsigned raw files from the deployed app.
- **R2 bucket `mogging-course-resources`:** keep `r2.dev` access disabled and no public custom domain. Ensure the deployed R2 credentials can access this bucket as well as the existing photo bucket; preserve the main app's storage behavior. Set CORS for `https://mogging.com` and the exact staging origin, methods `PUT` and `HEAD`, required upload headers, and exposed `ETag`. A local origin passing CORS does not prove production CORS works.

The local provider checks pass. Production webhook URLs, deployed credentials, public-access settings and production-origin CORS still need verification.

## 3 Save deployment configuration

Set the following in the project's encrypted **Production** environment. Preview deployments need separate sandbox credentials and a staging database. Never point general preview builds at live commerce data.

| Configuration | Variables |
| --- | --- |
| Release controls | `COURSES_ENABLED`, `COURSE_PUBLIC_LAUNCH_ENABLED`, `COURSE_LIVE_PAYMENTS_ENABLED`, `COURSE_STRIPE_TAX_ENABLED` |
| Stripe | Existing `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, both destination secrets above |
| Bunny | `BUNNY_STREAM_LIBRARY_ID=768882`, `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_READ_ONLY_KEY`, `BUNNY_STREAM_TOKEN_KEY`, `BUNNY_STREAM_CDN_TOKEN_KEY` |
| Course resources | `COURSE_R2_BUCKET_NAME=mogging-course-resources`; existing `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` with bucket access |
| Email | `RESEND_API_KEY`, `PAYMENTS_EMAIL_FROM`, optional `PAYMENTS_EMAIL_REPLY_TO` |
| Existing shared services | Production `DATABASE_URL`, `NEXTAUTH_URL=https://mogging.com`, `NEXTAUTH_SECRET`, Redis credentials, admin credentials and `CRON_SECRET` |

The Vercel audit found existing shared-service variable names, but no course-specific configuration. Sensitive production values could not be read back, so their validity has not been verified. Local `.env.local` changes do not configure Vercel. Environment changes apply to a new deployment.

Keep all release flags false while preparing. To verify deployed APIs privately, set `COURSES_ENABLED=true` while keeping the public and live flags false. Only open production course pages with `COURSE_PUBLIC_LAUNCH_ENABLED=true` after the release checks. The main-app navigation stays hidden until launch is explicitly approved. Production never falls back to sample courses.

## 4 Apply the database migrations

Take a production database backup and verify recovery access first. Apply the same two migrations to staging, then production using the intended private database configuration:

```sh
bun run db:migrate --only 0040_course_platform
bun run db:migrate --only 0042_course_watch_progress
```

The scoped migrator records each migration independently. Do not use fixture setup or `db:push` against production. No production migration has been applied by this task.

## 5 Verify the deployed integration

With the target environment loaded privately, run:

```sh
bun run check:courses-release --live
```

This read-only command checks required configuration, US Stripe activation, destination scope/format/events, migration hashes, Bunny signed thumbnails and unsigned denial, and R2 object access/upload CORS. Upload one private verification resource and ensure one ready video exists before running it. The command does not enable purchases, accept terms, send email or modify provider settings. Passing it does not prove matching webhook secrets or email delivery.

Then verify these actual deployed flows:

1. Complete a real creator's onboarding and admin approval. Upload a video and attachment from the browser, save/reload an edited course, approve it and keep the pilot unlisted.
2. Check anonymous and unenrolled denial of paid lessons/downloads; enrolled playback renewal, attachment bytes, reading completion and video completion at 95% watched coverage. Check desktop/mobile layout, keyboard ordering and save-conflict/error states.
3. Verify genuine Stripe deliveries to both HTTPS destinations, signature rejection, duplicate delivery, account restriction and recovery. Verify the signed Bunny processing webhook as well.
4. Confirm `/api/cron/courses` runs every five minutes with the configured bearer secret. Check reconciliation, cleanup and deferred email processing. Confirm production Redis limits are active and provider error/backlog alerts have an owner.
5. Regression-check existing scan Checkout/webhooks and photo uploads. Their key configuration and billing behavior must still work.
6. After Resend is ready, deliver and consume a verification email and deliver one receipt to a real mailbox. Verify retries do not duplicate receipts. Use `courses@notify.mogging.com` on a verified sending subdomain if desired, with reply-to `gabe@mogging.com` or `w@mogging.com`; existing personal mailboxes can stay as they are.
7. After these checks, enable live payments for the reviewed pilot and complete one small real purchase and refund with the user handling payment. Confirm the actual seller-account charge, zero Mogging fee, private access, reporting, receipt and full-refund revocation. Keep the pilot unlisted until this passes.

## Verification completed locally

- Production build and typecheck passed. Production routes return 404 with the public flag disabled and render with it enabled; sample props are false in production.
- 20 focused unit tests and 20 backend integration groups passed. Backend provider mocks cover concurrency, identity/ownership, signatures, replay, refunds/disputes, enrollment expiry, uploads, publication snapshots and watched coverage. The authenticated HTTP suite also passed with real cookie identity, administrator unlock, save conflicts, cross-site protection and deferred-email maintenance.
- Real sandbox purchase, partial/full refund, duplicate event delivery, cancellation and expiry passed through the authenticated application and genuine Stripe events.
- Actual declined-card and 3D Secure challenge/success checks passed; private access stayed denied until payment succeeded. Open disputes denied access, a real sandbox won dispute restored it with the original expiry, and a lost dispute kept access denied. Genuine closed-dispute webhooks were processed.
- Real Bunny protected playback/thumbnails and private R2 uploads/downloads passed. The read-only provider preflight passed with local sandbox configuration.

Sandbox checks are evidence for integration behavior, not proof of live activation. Resend delivery, live HTTPS delivery, production migrations/settings and a real pilot purchase remain release requirements. [Stripe's Connect testing guide](https://docs.stripe.com/connect/testing) also notes that sandbox capabilities can differ from live behavior.

These results cover the course checks. The repository's combined `bun test` run has previously shown shared mock leakage between unrelated suites; it is not claimed green by this release verification.

## Rollback

Set `COURSE_LIVE_PAYMENTS_ENABLED=false` to stop new live purchases while retaining reconciliation and refunds. Set `COURSE_PUBLIC_LAUNCH_ENABLED=false` if course pages must be hidden. Preserve the database, connected-account IDs, Stripe credentials and webhook destinations so existing orders and learner access remain recoverable. Turning `COURSES_ENABLED` off also disables course APIs/webhooks, so it is not the first payment rollback step.
