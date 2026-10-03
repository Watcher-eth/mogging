# Course Checkout integration

The existing course checkout in [lib/courses/commerce.ts](lib/courses/commerce.ts) uses hosted Stripe Checkout on the creator's connected account. This configuration applies to courses; existing analysis/mobile checkout settings are separate.

## Local setup status — October 2, 2026

The ignored `.env.local` contains sandbox credentials. The normal app keeps courses disabled and its original database. `bun run dev:courses` starts an isolated course server at `http://127.0.0.1:3003`; live course payments stay disabled. The current CLI listener forwards connected-account snapshot events to `127.0.0.1:3003/api/payments/stripe-connect-webhook` and its signing secret is saved only in the ignored environment file.

The real course UI now uses authenticated backend APIs. Database-backed editor saves, Bunny uploads/protected playback, admin publication, free enrollment, private lesson access, library membership, and automatic completion were verified. Backend integration tests pass with mocked payments/refunds/webhooks. A new sandbox connected account was created, but charges/payouts remain disabled until hosted onboarding is completed. A real paid purchase/refund is still required.

Remaining: rotate the secret key pasted into chat; confirm the platform business country (Stripe returns `DE`, whereas the original plan assumed US); complete seller onboarding, private R2 configuration, email delivery, Bunny CDN protection, and staging purchase/refund verification. See [provider setup](docs/courses-provider-setup.md). The CLI listener must remain running for local delivery; after restarting it, use its new signing secret and restart the isolated course server.

## Values to replace

There are no placeholder mode, return URLs, or Price IDs in the course Checkout call. One-time payment mode is already set. Return URLs use the configured site origin; Price IDs come from the creator-account Products/Prices created when a paid course is approved. Do not manually create one platform Price per course.

## Configured parameters

| Parameter | Value |
| --- | --- |
| `mode` | `payment` |
| `ui_mode` | `hosted_page` (installed Stripe SDK: 22.1.0) |
| `billing_address_collection` | `auto` |
| `phone_number_collection.enabled` | `false` |
| `allow_promotion_codes` | `false` |
| `submit_type` | `auto` |
| `integration_identifier` | `hosted_web_0001` |
| `origin_context` | `web` |
| `automatic_tax.enabled` | Order snapshot of `COURSE_STRIPE_TAX_ENABLED`, default `false` |

`payment_method_collection` is omitted for one-time payments. The existing tax toggle is preserved so explicitly enabled tax collection is not silently disabled. Order metadata, buyer reference, expiry, creator account routing, and idempotency are retained for payment reconciliation and course access. The client continues to use the installed SDK's default API version.

## Setup and next steps

1. Rotate the test secret key pasted into chat at [Stripe API keys](https://dashboard.stripe.com/test/apikeys). Save its replacement as `STRIPE_SECRET_KEY` in `.env.local` and the matching deployment environment. Never add secrets to source code or public environment variables.
2. Configure Connect separately from Checkout. Enable existing-account OAuth at [test OAuth settings](https://dashboard.stripe.com/test/settings/connect/onboarding-options/oauth), and set `STRIPE_CONNECT_CLIENT_ID`. Register the exact callback `${NEXTAUTH_URL}/api/creator/courses/connect/callback` for the environment. New accounts use the existing hosted onboarding flow.
3. Create a webhook destination for **connected accounts** at `${NEXTAUTH_URL}/api/payments/stripe-connect-webhook` and set `STRIPE_CONNECT_WEBHOOK_SECRET`. Use the installed SDK's API version and the event list in [the backend setup guide](docs/courses-backend.md#stripe). Existing scan payments use their separate webhook secret and endpoint.
4. Set `NEXTAUTH_URL` to the application's origin. Enable `COURSES_ENABLED` only in the intended test environment; keep `COURSE_LIVE_PAYMENTS_ENABLED=false`. Use `COURSE_STRIPE_TAX_ENABLED=false` to match this Checkout Studio configuration.
5. The course UI is connected to server APIs. Verify checkout/order/enrollment behavior with a fully onboarded sandbox seller before exposing course routes in production.
6. In staging, onboard a test creator, approve a paid test course, and purchase it using Stripe test card `4242 4242 4242 4242`, any future expiry, and any three-digit CVC. Use test mode only. Verify return URLs, repeated requests, webhook delivery, paid access, delayed/failed payments, and refunds. Returning from Checkout alone must never grant access; verified provider state does that.

The flow is buyer request → immutable local order → creator-account Checkout → signed Connect webhook/provider reconciliation → enrollment and purchase-email outbox. No application fee or transfer is created. No new payment route or dependency was needed; this change adds only this checklist and updates the existing course Checkout parameters.

## Validation

Course typecheck, targeted unit tests, and full local backend integration tests pass. Real provider/browser checks are documented in [course verification](docs/courses-ui-preview.md). Paid provider responses in the integration tests were mocked; successful free enrollment does not establish paid checkout or refund readiness.

References: [Checkout API](https://docs.stripe.com/api/checkout/sessions/create), [Connect OAuth](https://docs.stripe.com/connect/oauth-standard-accounts), [Stripe testing](https://docs.stripe.com/testing), [Stripe support](https://support.stripe.com).
