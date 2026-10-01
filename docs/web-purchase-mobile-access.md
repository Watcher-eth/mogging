# Web purchase → mobile evaluation

Purchases belong to the authenticated account, not the browser or install ID. A paid checkout grants credits once through `grantEntitlementFromCheckoutSession`, shared by the Stripe webhook and authenticated return-page recovery. The database's unique checkout ID prevents concurrent redirects, webhooks, retries, and later restores from refilling spent credits.

The return page checks ownership and verifies an unfinished local grant against Stripe before issuing a signed, short-lived handoff. Only the authenticated buyer can renew an expired or consumed handoff; renewal invalidates the previous token and never grants another purchase. Consumption can be retried by the same install after a lost response, returning a usable mobile account session. Another install cannot replay that consumed token.

The mobile app persists incoming handoffs and starts consumption on cold launch, warm links, and foreground recovery. Pending writes are serialized: completing an earlier request cannot erase a newer link. Transient failures retry with backoff; permanent errors offer recovery. Successful activation resumes the selected photo's evaluation when one is pending. Purchase routes go to Reports rather than competing with onboarding authentication navigation.

Stripe access does not depend on RevenueCat SDK initialization or a successful RevenueCat network response. A failed Stripe refresh retains only the last verified, unexpired billing period; it does not extend periods or create extra allowances. Successful reconciliation applies cancellations. Refund/dispute state cannot be replaced by an active subscription refresh within the same billing period; a later verified billing period can restore access. Expired or revoked purchases cannot issue handoffs or redeem codes.

The explicit `mogging://app/handoff` open action works from the website's own Safari domain. Both HTTPS associated domains and the native scheme are configured. Activation emails and old homepage receipt links lead to the same verified return page; local storage and query parameters are no longer treated as proof of payment. Missing account history is guarded so a partial account-summary response cannot crash the confirmation page.

This follows [Stripe's fulfillment guidance](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted): retain webhooks and also trigger idempotent fulfillment from the return page to recover delayed delivery.

## Verification

Use an isolated localhost PostgreSQL database. These scripts reject non-local test URLs and create/drop their own schema. Provider responses are fixtures; no real charges, emails, model calls, or customer rows are involved.

```sh
PAYMENT_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/postgres bun run scripts/tests/payment-handoff.ts
SCAN_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/postgres bun run scripts/tests/scan-allowances.ts
bun test lib/payments
bun run typecheck
```

In `mogging-mobile`:

```sh
bun run scripts/tests/payment-handoff.ts
bun run typecheck
```

Coverage includes delayed and duplicate webhooks, concurrent creation/consumption, wrong accounts, unpaid/forged checkouts, token tampering and cross-device replay, expired/consumed link renewal, activation-code retries, lost response recovery, persisted mobile sessions, real evaluation reservations and result replay, allowance boundaries, provider outages, refunds/cancellations, and expired credits. Mobile client checks cover accepted/rejected link routes, concurrent pending-token writes, malformed/expired responses, and typed error handling. Browser checks cover badge colors at desktop/mobile widths, automatic and manual activation retries, wrong-account rejection, legacy receipt routing, and the app-opening URL.

## Release acceptance

Deploy the web changes and ship the updated mobile build. This workspace has no Stripe key, webhook secret, handoff signing secret, or activation email key configured, so the live account and delivery configuration have not been inspected. Confirm the deployed environment supplies Stripe credentials, the webhook secret, and a stable handoff secret of at least 32 characters (or a sufficiently long NEXTAUTH_SECRET). Keep checkout success, async payment success, subscription updates/deletion, paid invoices, refunds, and disputes enabled for the deployed webhook.

Before release, complete a real Stripe test-mode checkout on an installed iPhone build. Check closed/open/backgrounded app entry, installation before opening the receipt again, an interrupted response, account sign-out, duplicate delivery, and a refunded purchase. Automated local tests do not establish a 100% availability guarantee for external providers, device keychain storage, or network delivery.
