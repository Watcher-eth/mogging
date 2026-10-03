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

Signed embed playback was tested against library 768882: signed requests succeeded and unsigned requests were rejected. Its playback metadata currently reports CDN token authentication disabled. In **Stream → library → Security**, keep embed token authentication enabled and enable **CDN Token Authentication** before selling access; embed protection alone does not protect direct video files. These settings use different keys. Allow `mogging.com`, `www.mogging.com`, and the development hosts while testing. See [Bunny Stream security options](https://bunny.net/docs/stream/security-options).

## Isolated development

`bun run setup:courses-dev` creates fixtures in the dedicated local `mogging_courses_dev` database (the local PostgreSQL server must be running on port 55432). `bun run dev:courses` serves them at **http://127.0.0.1:3003**, with separate cookies and build output. Credentials are saved only in ignored `.local/course-accounts.json`. The normal app continues using its original database and has courses disabled. Do not run fixture setup against staging or production.

Forward sandbox connected-account events to `127.0.0.1:3003/api/payments/stripe-connect-webhook`. The CLI listener signing secret differs from the deployed Dashboard destination secret. Before launch, apply the course migration in staging, use staging origins and secrets, complete seller onboarding, and verify a real sandbox checkout/refund, attachment upload/download, and transactional email delivery. Keep live course payments disabled until these pass.
