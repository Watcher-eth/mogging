# Course Stripe integration

The Stripe-generated Accounts v2 blueprint is adapted to Mogging's free-hosting, no-commission model. The example Cookie product, €1.23 application fee, €10/month creator subscription, customer tax capability and simulated identity/terms values are intentionally omitted. Real paid course products/prices are created automatically on each creator's connected account when a course is approved.

## Implemented

- Merchant-only Accounts v2 creation and Stripe-hosted account links, with stable account IDs and idempotent creation.
- Existing accounts resume onboarding with their actual applied configurations. Stripe requires an exact match, including legacy recipient configurations; new course accounts remain merchant-only.
- Full Stripe dashboard access; Stripe collects processing fees and payment losses.
- Real merchant card-payment and payout capability checks, outstanding requirements, and live/test account isolation.
- Existing-account OAuth uses v1 authentication, then refreshes the same account ID through v2.
- One-time hosted Checkout direct charges, immutable local orders, verified provider reconciliation, enrollment, refunds/disputes and receipt outbox. No platform application fee or creator subscription is charged.
- Signed, deduplicated snapshot purchase events and separate thin account events. Main-app scan payments retain their existing webhook and SDK version.
- Course API requests explicitly use `2026-08-26.dahlia`. No dependency upgrade or database migration is needed for Accounts v2; existing account identifiers are retained.
- The creator can continue onboarding until both payments and payouts are enabled.

## Required webhook destinations

| Purpose | Events from / format | Endpoint | Environment secret |
| --- | --- | --- | --- |
| Course purchases/refunds | Connected accounts / snapshot, version `2026-08-26.dahlia` | `/api/payments/stripe-connect-webhook` | `STRIPE_CONNECT_WEBHOOK_SECRET` |
| Creator account readiness | Your account / thin | `/api/payments/stripe-connect-account-webhook` | `STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET` |

Use the exact event lists in [backend setup](docs/courses-backend.md#stripe). The live URL prefix is `https://mogging.com`, assuming that is the deployment's canonical origin. Thin account events belong to **Your account**, even though the resource represents a creator connected to Mogging.

For local account notifications, use:

```sh
stripe listen --events-from @self --all-thin --forward-to http://127.0.0.1:3003/api/payments/stripe-connect-account-webhook
```

Save that listener's signing secret only in `.env.local` as `STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET`. Keep the connected-account snapshot listener running separately. The sandbox thin-event listener was started and configured during verification; signing secrets were never printed in chat.

## Verified — October 2, 2026

- Production build and targeted ESLint pass. The authenticated creator pricing page refreshes real Accounts v2 requirements and keeps onboarding available while payments or payouts are disabled.
- Full disposable-database course regressions with mocked payment/refund providers, plus Accounts v2 onboarding, capabilities, requirements, environment checks, account closure, thin-event signatures/deduplication and OAuth replay/country checks.
- Real sandbox merchant creation, hosted account links and capability refresh of the existing local creator without changing its account ID.
- Brave browser verification found and fixed legacy-account link configuration matching. The existing test creator now reaches Stripe's hosted signup form; password creation remains a user handoff before identity/terms and paid checkout verification.
- Real thin-event delivery through Stripe CLI to the local endpoint returned HTTP 200. Real snapshot delivery was verified earlier.
- R2 uploads/private downloads and Bunny protected playback/thumbnails were verified separately; see [course verification](docs/courses-ui-preview.md).

## Verified — October 3, 2026

- Created a separate synthetic sandbox merchant, using Stripe's documented successful test identity values. The user completed Stripe-hosted account setup with test bank details. Accounts v2 reports both card payments and payouts active, with no outstanding requirements. The original creator/account was preserved.
- Published an unlisted €10 course on a separate local fixture creator through normal creator submission and administrator review. Stripe Product/Price and hosted Checkout were created on that seller's account. Retrying checkout reused its pending order/session.
- Completed the actual hosted Checkout in Brave with Stripe's test card. Genuine Stripe CLI snapshot delivery marked the local order paid and granted the private lesson. Provider data confirms no application fee or transfer; creator reporting showed €10 sales and one active student.
- Refunded €3 through the authenticated creator API: access remained. Refunded the remaining €7: access was revoked and reporting showed €10 refunds and zero active students. Retrying both request keys returned the same two refunds. Genuine partial/full refund webhook delivery was separately confirmed.
- Replayed the real paid event after payment and after full refund: duplicate processing was acknowledged without duplicate enrollment/receipt records or restoration of revoked access. The receipt remains queued because Resend is deferred.
- Verified the cancel return URL grants no access, and an actually expired Stripe Checkout becomes expired locally while private access stays denied.
- Completed real declined-card and 3D Secure challenge/success Checkouts. Declines and pending authentication did not grant paid access; authenticated success did. Genuine payment-failed and paid events were processed.
- Triggered actual sandbox disputes with Stripe's documented dispute test card and submitted synthetic winning/losing evidence. Open disputes denied private access; a won dispute restored it with the original expiry; a lost dispute kept it denied. Genuine closed-dispute events were recorded as processed.
- The authenticated HTTP suite passed against the isolated app, including cookie identity, separate administrator unlock, version conflicts, cross-site write protection, publication/private projections, pagination and maintenance with email deferred.
- These checks used the isolated local course database and sandbox credentials. No live purchase, production deployment, or real-money payout was performed.

## Still required before live selling

1. Verify the deployed integration with live settings and a reviewed creator pilot. The local sandbox purchase, cancellation/expiry, partial/full refund, decline, 3DS, won/lost dispute, webhook delivery, reporting and access checks passed. The original local creator still has separate onboarding requirements; its state does not block these fixture checks.
2. The existing Stripe account is a German personal account. A new US business account is intended; confirm legal-entity eligibility, create/activate the account and configure Connect. The shared main-app/course Stripe key must be separated or migrated deliberately before changing production credentials, preserving existing payments and refunds. The local sandbox remains German.
3. Put the correct live platform `STRIPE_SECRET_KEY`, live OAuth `STRIPE_CONNECT_CLIENT_ID`, and both live destination secrets into the deployment's encrypted environment settings. Register `${NEXTAUTH_URL}/api/creator/courses/connect/callback`. Keep sandbox keys local; rotate the previously pasted sandbox secret. Each environment needs its own correct configuration.
4. Use production creator profiles/accounts and publish actual course prices; do not import sandbox account, product, price or order IDs into production.
5. Follow [production release steps](docs/courses-release.md): apply both course migrations, configure production media and HTTPS destinations, and verify tax settings. Production pages now require the explicit `COURSE_PUBLIC_LAUNCH_ENABLED` gate, which defaults to false. Keep `COURSE_LIVE_PAYMENTS_ENABLED=false` until the release checks pass. The read-only `bun run check:courses-release --live` command checks configuration, migration hashes and provider readiness without enabling sales.
6. Finish deferred Resend configuration and receipt/verification delivery testing. Then enable live purchases for the initial creator pilot.

References: [Accounts v2](https://docs.stripe.com/connect/accounts-v2), [existing-account compatibility and event routing](https://docs.stripe.com/connect/accounts-v2/migrate-integration), [event formats](https://docs.stripe.com/event-destinations), [Connect testing](https://docs.stripe.com/connect/testing).
