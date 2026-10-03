# Course provider setup

The course pages remain development-only. Keep `COURSE_LIVE_PAYMENTS_ENABLED=false` until the complete sandbox flow has passed.

## Private R2 attachments

1. Open [Cloudflare R2](https://dash.cloudflare.com/?to=/:account/r2) and create a **Standard** bucket named `mogging-course-resources` in the same account as the app's existing bucket.
2. Keep **Public Development URL disabled** and do not attach a custom public domain. Paid attachments are downloaded using short-lived, authenticated links.
3. Under **Settings → CORS Policy → Add CORS policy → JSON**, paste:

```json
[
  {
    "AllowedOrigins": ["http://127.0.0.1:3003", "http://localhost:3000", "https://mogging.com", "https://www.mogging.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add an exact staging origin if we test there. CORS does not make the bucket public. [Cloudflare's CORS instructions](https://developers.cloudflare.com/r2/buckets/cors/).

4. The app already has `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Make sure that credential has **Object Read & Write** access to the new bucket. If it is limited to the existing bucket, create a credential authorized for **both** buckets before replacing the app's existing credentials; its existing image uploads still need access to the old bucket.
5. Add to the ignored `.env.local` file:

```dotenv
COURSE_R2_BUCKET_NAME=mogging-course-resources
```

Do not change `R2_BUCKET_NAME` or `R2_PUBLIC_BASE_URL`: those are for the existing app images. Videos go to Bunny Stream; this bucket is for PDF, TXT, PNG and JPEG lesson attachments. No Worker or public CDN is needed for these downloads.

Verified October 2, 2026 using real R2 uploads/downloads, normal local app authentication, and a browser upload/reload/download. `bun run test:courses-r2` runs the provider checks against the isolated app at `127.0.0.1:3003` and local test accounts. It creates only synthetic courses/files, validates access and expired signatures, removes its completed test objects, and checks the existing photo helper with a unique synthetic image. Never point these fixture checks at production. Before deployment, copy the same required environment settings into the deployment environment and retest uploads from its exact HTTPS origin; local `.env.local` settings do not configure the deployment.

## Transactional email

Keep the existing `gabe@mogging.com` and `w@mogging.com` mailboxes. A transactional sender does **not** need its own paid mailbox.

1. Create a [Resend account](https://resend.com/signup).
2. In [Domains](https://resend.com/domains), add **notify.mogging.com**.
3. Copy the exact DNS records shown by Resend into the domain's DNS provider, then verify the domain. Add records for the sending subdomain/return path; preserve the existing **mogging.com root MX records** for personal inboxes. Do not enable inbound mail for this sender.
4. In [API Keys](https://resend.com/api-keys), create a **sending-only** key scoped to that verified domain.
5. Add these values to `.env.local` (the API key belongs in the file, not chat):

```dotenv
RESEND_API_KEY=replace-in-your-local-file
PAYMENTS_EMAIL_FROM="Mogging Courses <courses@notify.mogging.com>"
PAYMENTS_EMAIL_REPLY_TO=gabe@mogging.com
```

Use `w@mogging.com` for reply-to if preferred. A future `support@mogging.com` forwarding alias is optional; no new inbox is required. [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction).

Restart `bun run dev:courses` after changing environment variables. Domain verification and real email delivery still need to be tested before launch.

## Bunny playback security

Library **768882** now has CDN token authentication enabled. Signed embedded playback works, and unsigned direct thumbnails and playlists return 403.

Keep `BUNNY_STREAM_TOKEN_KEY` for embedded player signing. For protected lesson thumbnails, open **Stream → library 768882 → API → Pull Zone → Manage → Security → Token authentication** and copy that zone's Token Authentication Key into `.env.local`:

```dotenv
BUNNY_STREAM_CDN_TOKEN_KEY=replace-in-your-local-file
```

These keys protect different layers. Do not replace the working embed key. Signed thumbnails were verified against the actual Pull Zone **6733935** (`vz-2cd7d640-d1d.b-cdn.net`). That zone restricts direct requests by referrer, so the app retrieves signed thumbnails server-side using Bunny's player referrer, after checking course ownership or lesson access. Only raster images up to 2 MiB are accepted, with five-minute private browser caching. Video streaming still goes directly through Bunny's player. See [Bunny Stream security](https://github.com/BunnyWay/documentation/blob/main/stream/security.mdx) and [CDN signing](https://github.com/BunnyWay/BunnyCDN.TokenAuthentication).

## Isolated development

`bun run setup:courses-dev` creates fixtures in the dedicated local `mogging_courses_dev` database (the local PostgreSQL server must be running on port 55432). `bun run dev:courses` serves them at **http://127.0.0.1:3003**, with separate cookies and build output. Credentials are saved only in ignored `.local/course-accounts.json`. The normal app continues using its original database and has courses disabled. Do not run fixture setup against staging or production.

Forward sandbox connected-account events to `127.0.0.1:3003/api/payments/stripe-connect-webhook`. The CLI listener signing secret differs from the deployed Dashboard destination secret. Before launch, apply migrations **0040_course_platform** and **0042_course_watch_progress** in staging, use staging origins and secrets, complete seller onboarding, and verify a real sandbox checkout/refund, attachment upload/download, and transactional email delivery. Keep live course payments disabled until these pass.

`CRON_SECRET` protects `/api/cron/courses`; configure it in the deployment as well as locally. Maintenance reconciles payments, polls video processing, cleans abandoned uploads, and retries receipt delivery. Without `RESEND_API_KEY`, receipts remain queued without consuming retry attempts; other maintenance continues. Verify the existing scheduler against the staging deployment before launch.
