# Course production release

The course frontend and backend are connected and tested locally. This checklist covers the remaining provider configuration and production verification. Nothing has been deployed or enabled for live selling. Hosting remains free, with no Mogging sales commission. The existing Stripe account is a personal account registered in Germany. The owner has confirmed a US company with an EIN; the new US business account still needs Stripe activation. The local sandbox is German.

## 0 Prepare hosted staging and real-provider tests

The owner selected Neon staging on October 3; production database selection will follow measured test results. Use a separate database and stable HTTPS staging origin before changing production. The October 3 Vercel audit found `DATABASE_URL` configured for both Preview and Production, with no course-specific settings. Those values could not be read back; isolation is not verified. Override the database explicitly on the intended staging branch or separate project before deploying it.

1. **Database:** create an isolated Postgres database. Recommended immediate test option: [Neon Free](https://neon.com/blog/neon-free-plan-1-gb-per-project), currently 1 GB storage and 100 CU-hours per project/month. Save the connection string privately as `COURSE_STAGING_DATABASE_URL` in `.env.local` for deployment preparation; the application still uses `DATABASE_URL`, which must receive this staging value on Vercel. Match the database region to the backend function region. Course tables reference the shared app's users, so this database needs the main-app schema as well as the course migrations.
2. **Schema:** initialize an empty staging database from a schema-only export of the current application database, plus a separate export of its migration-ledger metadata. Include any existing course schema. Copy no customer, order, payment or credential rows. Apply only missing course migrations through the scoped migrator. If using a fresh schema export from code for a disposable test, treat it as a fixture rather than a production migration baseline. Do not run local fixture scripts against the hosted database. Create fresh staging creator, administrator and buyer accounts through the app, then approve the test seller normally.
3. **Hosting:** select a stable staging hostname and configure encrypted branch-specific Preview variables. Set `COURSES_ENABLED=true`, `COURSE_PUBLIC_LAUNCH_ENABLED=true` (Vercel Preview builds run in production mode) and `COURSE_LIVE_PAYMENTS_ENABLED=false`. Keep production flags closed. An ignored owner-only `.local/course-staging.env` contains the sandbox/provider preparation and independent auth/admin/cron secrets; hosted database, origin, destination secrets, Redis and email values are still pending. Configure staging `DATABASE_URL`, sandbox `COURSE_STRIPE_SECRET_KEY`, OAuth client ID, separate webhook secrets, `NEXTAUTH_URL`, independent auth/admin/cron secrets and Redis configuration. Audit inherited main-app payment variables too: staging must not expose the live scan Checkout. Never copy `.env.local` wholesale into Vercel.
4. **Providers:** create sandbox HTTPS destinations using the same scopes, formats and event lists as the live destinations below, with staging URLs and fresh secrets. Local Stripe CLI signing secrets cannot verify Dashboard destination deliveries. Register the staging OAuth callback. Add the exact staging origin to R2 upload CORS and Bunny embedding restrictions. Prefer a separate staging bucket/library; if temporarily reusing current verification assets, retain their IDs and do not delete shared provider objects. Ensure deployment protection permits Stripe and Bunny webhook requests while retaining the handlers' signature checks. Updating a library's single webhook destination can redirect production processing, so review shared-library routing before switching it.
5. **Preflight:** load the target configuration privately and run `bun run check:courses-release --staging`. This read-only mode requires sandbox credentials, live payments disabled, matching enabled HTTPS destinations and the course migration hashes. It also verifies Bunny protection and R2 access/CORS. Upload a ready video and a private resource first. A passing configuration check still needs actual webhook and email delivery tests.
6. **Hosted test:** use genuine sandbox payments and providers through the deployed UI. Onboard the creator, build/upload/save/approve an unlisted course, purchase it, test a declined card and 3D Secure, verify access and progress, download its attachment, then test partial and full refunds. Replay genuine events and confirm that access/reporting stay consistent. Verify account restrictions, signed Bunny processing events and expiry. Run maintenance with its staging bearer secret; Vercel Preview deployments do not automatically run production cron schedules. Add actual verification and receipt delivery as soon as Resend is verified.

Record the deployment identifier, migration hashes, provider event IDs, expected/actual outcomes and any unresolved failures without storing secrets. Finish with a desktop/mobile and keyboard walkthrough of the real integrated data, then polish the UI. After staging passes, configure the final US live account and production database, repeat the live preflight, and run a small unlisted purchase/refund pilot.

### Database choice and cost

Hetzner is a practical low-cost option for a continuously running database if we own operations. Its European CX33 has 4 shared vCPUs, 8 GB RAM and 80 GB NVMe; the published server price is €8.49/month excluding VAT and IPv4 ([specifications](https://www.hetzner.com/cloud/cost-optimized/), [prices](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)). [Server backups](https://docs.hetzner.com/cloud/billing/faq/) add 20%, and [IPv4](https://docs.hetzner.com/cloud/servers/primary-ips/overview/) adds €0.50/month. That totals about €10.69/month before independent Postgres backup storage, taxes and any network add-ons; €11–15 is an initial planning estimate, not a capacity guarantee. Check availability and region-specific prices before ordering.

For Hetzner production, prepare Postgres with verified TLS, a bounded connection pool/PgBouncer, separate staging and production roles/databases, restricted network access, updates, monitoring, off-server database backups with WAL recovery and a tested restore. A single server is not highly available. Vercel's dynamic egress complicates firewall allowlisting; [Static IPs](https://vercel.com/docs/networking/static-ips) or another reviewed connectivity arrangement may add cost. Measure latency from the actual backend region and a representative workload before claiming a performance advantage. A US legal entity does not require a US database region.

## 1 Configure live Stripe

1. Switch out of the sandbox into the intended US business in [Stripe Dashboard](https://dashboard.stripe.com/). Finish business verification and Connect activation. Choose **Platform**, with creators collecting direct payments and using the full Stripe dashboard. Processing fees and payment losses are assigned to Stripe in the account configuration.
2. Create a separate US account under the same login if the legal entity meets Stripe's US requirements; an activated German account cannot change country. Keep the existing account available for its payments and refunds. Courses now use their own `COURSE_STRIPE_SECRET_KEY` and client; the existing main-app `STRIPE_SECRET_KEY` must stay on its original account. New-account Products, Prices, customers and connected accounts must not be assumed to transfer. Then obtain the correct live platform key from [API keys](https://dashboard.stripe.com/apikeys). Rotate the sandbox secret previously pasted into chat.
3. In [Connect settings](https://dashboard.stripe.com/settings/connect), obtain the live OAuth client ID and register `https://mogging.com/api/creator/courses/connect/callback`. Use separate credentials and callbacks for staging.
4. In [Workbench webhooks](https://dashboard.stripe.com/workbench/webhooks), create both destinations below. Save their separate signing secrets in encrypted production environment variables. Use the exact event lists in [backend Stripe setup](courses-backend.md#stripe).

| Destination | Events from | Format | URL | Secret |
| --- | --- | --- | --- | --- |
| Course purchases and refunds | Connected accounts | Snapshot, `2026-08-26.dahlia` | `https://mogging.com/api/payments/stripe-connect-webhook` | `STRIPE_CONNECT_WEBHOOK_SECRET` |
| Creator readiness | Your account | Thin | `https://mogging.com/api/payments/stripe-connect-account-webhook` | `STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET` |

Accounts v2 account notifications use **Your account**, while direct-charge purchase events use **Connected accounts**, as documented in [Stripe event routing](https://docs.stripe.com/connect/accounts-v2/migrate-integration#webhook-events). Test accounts, Products, Prices and orders are not portable to live mode. Actual creators complete their own live onboarding; course approval creates their live Products and Prices automatically.

### Prepare destinations before US activation

Both destinations were created and verified disabled on October 3, 2026 in German live account `acct_1T1HPNFDMXBpu9el`:

- **Mogging course purchases — DE preparation:** `we_1UMh3JFDMXBpu9elMA88pPBH`, 16 connected-account snapshot events, API version `2026-08-26.dahlia`.
- **Mogging creator account status — DE preparation:** `ed_61VW51q6x0H10BZ9916UAfMkJrBC62DxM5E4g0DDkJUm`, 8 own-account thin events.

Their signing secrets are saved separately in ignored `.local/stripe-de-live-webhooks.env` with owner-only permissions. Keep them disabled until their production handlers, database and matching credentials are deployed. Registration does not verify delivery. Do not load these German live secrets into the local sandbox or overwrite `.env.local` with them. Existing main-app webhook destinations remain active.

When the US account is ready, recreate both destinations in that account with the same URLs, scopes, formats and event lists, then configure their new signing secrets alongside the US course API key and OAuth client ID. Destinations and connected accounts belong to their Stripe account; changing keys does not transfer them. Use `COURSE_STRIPE_SECRET_KEY` for the US course account. Preserve the German account's existing main-app `STRIPE_SECRET_KEY`, Prices and webhook configuration. Course credentials never fall back to the main-app key.

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
| Stripe | Dedicated `COURSE_STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, both destination secrets above |
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

October 3 release preparation additionally verified dedicated course/main-app Stripe credentials (including missing-key and sandbox/live guards), all 20 backend integration groups, and scoped migrations on fresh disposable Postgres databases. Both migrations recorded their correct hashes and repeat runs were no-ops. These checks do not initialize the hosted staging or production databases.

- Production build and typecheck passed. Production routes return 404 with the public flag disabled and render with it enabled; sample props are false in production.
- 20 focused unit tests and 20 backend integration groups passed. Backend provider mocks cover concurrency, identity/ownership, signatures, replay, refunds/disputes, enrollment expiry, uploads, publication snapshots and watched coverage. The authenticated HTTP suite also passed with real cookie identity, administrator unlock, save conflicts, cross-site protection and deferred-email maintenance.
- Real sandbox purchase, partial/full refund, duplicate event delivery, cancellation and expiry passed through the authenticated application and genuine Stripe events.
- Actual declined-card and 3D Secure challenge/success checks passed; private access stayed denied until payment succeeded. Open disputes denied access, a real sandbox won dispute restored it with the original expiry, and a lost dispute kept access denied. Genuine closed-dispute webhooks were processed.
- Real Bunny protected playback/thumbnails and private R2 uploads/downloads passed. The read-only provider preflight passed with local sandbox configuration.

Sandbox checks are evidence for integration behavior, not proof of live activation. Resend delivery, live HTTPS delivery, production migrations/settings and a real pilot purchase remain release requirements. [Stripe's Connect testing guide](https://docs.stripe.com/connect/testing) also notes that sandbox capabilities can differ from live behavior.

These results cover the course checks. The repository's combined `bun test` run has previously shown shared mock leakage between unrelated suites; it is not claimed green by this release verification.

## Rollback

Set `COURSE_LIVE_PAYMENTS_ENABLED=false` to stop new live purchases while retaining reconciliation and refunds. Set `COURSE_PUBLIC_LAUNCH_ENABLED=false` if course pages must be hidden. Preserve the database, connected-account IDs, Stripe credentials and webhook destinations so existing orders and learner access remain recoverable. Turning `COURSES_ENABLED` off also disables course APIs/webhooks, so it is not the first payment rollback step.
