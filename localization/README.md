# Localization working set

The canonical translation source for web and mobile lives here. `en.json` owns message IDs and source meaning. Base catalogs cover German, Spain Spanish, international French and Simplified Chinese. `de-CH.json` and `es-419.json` contain only regional overrides; Austria shares the German catalog. `locales.ts` preserves regional formatting preferences separately from the wording locale.

Keep Mogging/mogging and looksmaxxing unchanged. Battle and Pro remain feature names. German uses “Protokoll” for the feature, per the user’s review. “Plan” refers to subscription choices. Validate the selected feature terms during native review. Download and web-section headings have owner-approved exceptions to preserving iPhone and Pro from the source across all locales. Spanish uses protocolo for the personal feature and suscripción for recurring billing; French uses programme and abonnement; Chinese uses 提升方案 and 订阅方案. Use informal, respectful language; avoid invented jargon, gender assumptions, stronger claims, and literal translations of marketing metaphors. French wording should be understandable across French-speaking countries; country-specific terminology, payment methods and pricing still need validation. Latin American Spanish is a neutral shared base, not a substitute for testing important target countries.

## Commands

From `moggingnew`, using Bun:

- `bun run i18n:sync`: validate and generate catalogs and locale resolution for both sibling repositories. Commit generated mobile files with the mobile changes; deploys do not require the sibling checkout.
- `bun run i18n:check`: verify generated files, message coverage, placeholders, protected terminology, numerical facts and locale regression tests. Requires both sibling repositories in this workspace.
- `bun run i18n:review`: refresh the candidate inventory and side-by-side HTML/JSON review packet.

Edit source catalogs, never generated files in `lib/i18n` or mobile `src/i18n`. Contexts in review exports show direct `t()` usages; computed IDs require manual context review. Source and translation hashes identify the exact revision being reviewed. Catalog changes require a new review.

## Preview

Web locales and the compact flag selector are enabled in production, per the user’s release request. Automatic locale redirects remain disabled. Localized homepages use homepage B and have canonical/hreflang/sitemap entries. Other translated routes remain noindex until their bodies are localized. Localized homepages remain excluded from the English landing experiment.

Mobile language selection persists on-device and overrides device preferences. Onboarding uses the device language automatically, with no language menu. The native Settings menu offers “Use device language” and persistent manual overrides. The previous development-only provider gate has been removed. ExpoLocalization is now linked through CocoaPods; native build/launch and a partial German rendered smoke check passed. Complete journeys, permission resources and native editorial review remain pending. No mobile production release was performed by this localization task.

## Current coverage and remaining work

Initial batch: homepage B marketing text/FAQ, navigation labels, welcome and protocol introduction copy, and main settings labels. Added subscription cards/checkout copy, mobile paywall text, homepage demo copy/accessibility labels and footer labels. German wording incorporates the user’s requested corrections; the remaining translations are drafts.

Remaining: legacy homepage, remaining auth dialogs, analysis/upload/results flows, full app personalization/auth/capture/remaining purchase surfaces/report/protocol/battle/sharing screens, settings details and confirmation dialogs, server errors, generated analysis prose, push notifications, widgets, native permission resources, emails, support/legal pages, courses/media, SEO alternates and store metadata.

`inventory.json` is an AST-derived **candidate list**, not an exhaustive coverage percentage. It does not reliably capture copy in arrays, concatenations, embedded images, native files, external services or model outputs. Manually reconcile those surfaces before claiming coverage.

## Release quality gate

1. Complete the entire advertised locale journey and reconcile candidate strings; no unexplained English fallback.
2. Review all fixed copy in context. The user reviews German; native editors review Spanish, French and Chinese. Independently scrutinize payment/privacy text, claims and recommendations.
3. Score meaning (35%), naturalness (25%), terminology (15%), tone (15%) and readability (10%) from 1–5. Require ≥4.5 weighted overall and ≥4 in each dimension. Any critical or major defect blocks release regardless of aggregate score.
4. Review rendered desktop/mobile web and app screenshots, small phones, larger text, accessibility labels, and Chinese fonts. Include regional date/number/unit formatting and provider prices.
5. Evaluate at least 50 consented or synthetic report fixtures per locale, including uncertainty, missing data and lengthy prose. Preserve canonical scores, IDs, measurements, recommendations and uncertainty; language switching must never rescore a face.
6. Complete 5–8 native-user comprehension sessions per locale. Verify their understanding of report meaning, next actions and billing. Record findings; these are qualitative sessions, not a representative statistical study.
7. Save reviewer identity, source/translation hashes, defects, corrections, scores and screenshot evidence. Re-review changed strings. AI agreement/back-translation alone is not native approval.

Do not assign a “human-level” score until that evidence exists. The initial automated checks only establish structural correctness; the current draft does not pass the complete-journey gate.

## Provider prices

Web subscription prices come from the three existing STRIPE_MOBILE_*_PRICE_ID settings and Stripe currency_options. Default currency follows deployment country headers when that currency is available for all tiers; users can choose another configured currency. Language controls formatting, not exchange rates. The displayed currency and minor-unit amount are sent to checkout and revalidated against Stripe; unsupported currencies or changed quotes are rejected. When multiple currencies are configured, explicit-currency checkout disables Adaptive Pricing so the displayed currency remains selected. With only one shared currency, cards identify that currency and retain Stripe account currency behavior at checkout. Existing first-month creator discounts remain supported. Prices exclude any promotion applied at checkout.

Without configured provider prices the cards show an unavailable state and checkout is disabled. Local .env.local currently uses a sandbox key with no Mogging subscription price IDs. Live staged-production verification returned 499, 999 and 4999 USD minor units for weekly, monthly and yearly plans. USD is the only currency shared by all three configured prices; requesting EUR or CHF currently falls back to USD. Additional card currencies require provider configuration. After promotion, public-page and live API checks passed. A real monthly checkout opened in German, showed the existing first-month discount ($8.99 then $9.99/month), and returned to /de on cancellation. Stripe’s product title remains English. No paid transaction was performed.

Mobile subscription prices use RevenueCat/StoreKit priceString verbatim, so the App Store account storefront determines the currency. No USD fallback. Savings compare actual weekly and longer-period products only when their currency matches; comparison amounts use the selected display language and are labelled as comparisons with weekly billing. A complete native purchase review is still required.

## Editorial review record

assessment.json records the source and translation hashes, corrected findings, regional wording decisions and outstanding scope/native validation. This is AI review evidence, not native approval. The user explicitly authorized the current web deployment; the complete-product/native release gate remains the target for broader rollout.


## Mobile rollout working set

`mobile-scope.json` records 10 journey checklists, 52 acceptance cases and the current verification status. `mobile-glossary.json` records terminology and approval status. `mobile-inventory.json` and `mobile-review.html` include arrays, computed text and native copy; likely code values are flagged, not silently discarded. Regenerate them with `bun run i18n:review`. Counts remain review candidates, not approved message counts or coverage percentages.

The implementation sequence and source decisions are in `../../mogging-mobile/docs/localization-rollout.md`. Stable onboarding IDs and a version 12 saved-state migration preserve existing English choices before display localization. Canonical report normalization, preselected action plans and a strict presentation projection are implemented. The personalization preview adds 62 messages with stable choice IDs in all base languages and Swiss spelling overrides. `mobile-personalization-review.json` records source/translation hashes and pending editorial checks. Report semantic evaluation, native resources and remaining complete journeys are still outstanding.
