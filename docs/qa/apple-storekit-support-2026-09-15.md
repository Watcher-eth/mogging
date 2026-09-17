# Apple Developer Support request — production subscriptions unavailable

Submitted September 15, 2026 with user authorization. Apple confirmed case **102964170126** under App Setup → Availability and Pricing. Response pending.

Subject: Approved subscriptions return no StoreKit products in live App Store app after Paid Apps Agreement activation

App: Mogging: Face Rating
Apple app ID: 6771414050
Bundle ID: app.mogging.scan
Affected binary: 0.1.49 (52), reported installed from the public App Store.

All three auto-renewing subscriptions return no purchasable products on a real device:

- mogging.pro.weekly (Apple ID 6786464594)
- mogging.pro.monthly (Apple ID 6786467155)
- mogging.pro.yearly (Apple ID 6786467535)

The app uses RevenueCat, whose product fetch reports that none of the configured products could be fetched from App Store Connect. A direct product request through the SDK also returns no products. No purchase is started.

Verified September 15, 2026:

- All subscriptions and their subscription group are Approved in App Store Connect.
- All three subscriptions are available in all countries/regions.
- Monthly subscription has current pricing for new subscribers; weekly and yearly have current pricing sections.
- Paid Apps Agreement is Active, effective September 15, 2026 through June 8, 2027. Banking and tax forms show Active.
- The archived 0.1.49 (52) binary has bundle ID app.mogging.scan, the exact three product identifiers above, and the expected RevenueCat iOS public SDK key.
- RevenueCat's default offering contains the corresponding weekly/monthly/annual packages. All three grant the pro entitlement. Apple API credentials validate successfully.

Please check whether these approved subscriptions have been activated in the production StoreKit catalog after agreement activation, whether any account-level commerce restriction remains, and whether any action is required on our side. We have followed TN3188 and cannot identify an approval, product identifier, or territory mismatch.

Affected storefront: Germany. User reports using their normal Apple Account and an iOS 27 beta on the affected device. Exact beta build and device StoreKit logs are not yet available. Recent account activation and beta-specific behavior are hypotheses, not confirmed causes.

No credentials or customer account details are included in this request.
