# Scan upgrades

Settings opens an upgrade sheet immediately. It restores the account session or offers the same Apple/Google sign-in controls as onboarding. Successful sign-in continues inside the sheet.

The app loads scan products and localized prices directly from the native RevenueCat/App Store SDK. Unavailable products cannot be purchased. Existing Pro users see that evaluations are included.

## Store configuration required before release

Create/import two **consumable** App Store products into the existing RevenueCat project:

| Default product ID | Credits | Server setting |
| --- | --- | --- |
| `mogging.evaluation` | 1 | `REVENUECAT_SCAN_PRODUCT_ID` |
| `mogging.evaluation.pack3` | 3 | `REVENUECAT_SCAN_PACK_PRODUCT_ID` |

Use actual existing IDs via these settings if products already exist. Match the mobile EXPO_PUBLIC_SCAN_PRODUCT_ID and EXPO_PUBLIC_SCAN_PACK_PRODUCT_ID settings to the server IDs when overriding defaults. Configure pricing, localizations and availability in App Store Connect. Do not attach consumables to the Pro entitlement.

Set `REVENUECAT_SECRET_API_KEY` on the API server and `REVENUECAT_WEBHOOK_AUTH_TOKEN` for `/api/payments/revenuecat-webhook`. The Pro entitlement defaults to `pro`. Deploy the API before shipping the app changes. No database migration is needed.

The inspected local environment had no RevenueCat server key or scan product IDs. Live purchasing remains to be verified with configured products and an Apple sandbox account.

## Purchase behavior

- Purchases stay inside the native App Store flow. POST `/api/payments/upgrades` verifies transactions and syncs credits using the authenticated account ID. The app checks this service before opening a chargeable purchase; it never redirects scan checkout to the website.
- Client transaction IDs only identify what to confirm. They cannot grant a product, credit amount or another account ownership.
- The existing payment ledger stores RevenueCat purchase IDs with a `revenuecat:` prefix in its unique checkout-session key. Repeated sync, webhooks and restore cannot duplicate a grant or refill spent credits.
- The app applies the server balance after verification. A delayed verification offers **Retry purchase sync**, which never starts another purchase.
- Account startup, foreground refresh and webhooks recover purchases if the app closes before sync finishes.
- Refunds clear remaining credits. One evaluation spends one credit from one locked scan pack; potential-image extras are excluded. Pro access does not spend scan credits.

Reference: [RevenueCat consumables](https://www.revenuecat.com/docs/platform-resources/non-subscriptions), [Customer API](https://www.revenuecat.com/docs/api-v1/customers).

## Verification

Run `bun run scripts/smoke/scan-credits.ts` with `SCAN_CREDIT_TEST=1`, `REVENUECAT_SECRET_API_KEY=local-test-key` and `DATABASE_URL` pointing at a disposable local PostgreSQL database. The script refuses non-local databases and mocks only RevenueCat HTTP responses.

It covers the authenticated catalog and purchase API, fabricated transactions, replay/restore, account isolation, repeat purchases, concurrent spending, extras isolation, refunds, subscriptions and provider failure.

The sign-in sheet was opened and visually checked in iOS Simulator. Signed-in store UI and actual App Store purchasing require the configuration above.
