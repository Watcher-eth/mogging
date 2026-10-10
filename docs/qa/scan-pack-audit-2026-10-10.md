# Scan-pack purchase audit — October 10, 2026

## Production findings

Initial read-only audit of October 9 in America/Mexico_City (06:00 UTC October 9 to 06:00 UTC October 10), focused on the mobile buyer in question, release 0.1.65(69).

- Three 3-scan packs and **four** single scans granted 13 credits. Purchases were production, not sandbox. Current purchased balances are zero, with no refunds or revocations.
- Twenty credit reservations: **13 completed**, seven failed, none pending. Every failed reservation returned its credit.
- Completed reservations reference 12 distinct saved reports. Re-evaluating the same image updates its existing report after a fresh provider analysis; fewer report IDs does not establish a duplicate charge.
- The app emitted eight evaluation-completed events. The existing dashboard counts these client events, so it undercounts backend completions. This audit did not reproduce the exact dashboard filters under which the user saw no scans.
- The buyer has no persisted billing events, despite persisted payment entitlements. Production recorded 42 RevenueCat webhook HTTP 400 responses in this window. A reproducible parser defect rejects nullable entitlement/trial fields allowed by RevenueCat. Rejected production payloads were not retained, so this does not prove all 42 errors had that cause. Immediate app purchase sync recovered the scan credits independently.
- Seven evaluation attempts failed because provider output did not satisfy the legacy report contract: missing categories, empty optional measurements, overlong recommendation text, or truncated JSON. These are analysis reliability failures, not missing purchased credits. Completed server reports do not prove every response was successfully rendered by the client.

## Local fixes

1. Accept null entitlement IDs and trial-conversion flags in RevenueCat events, preserving existing normalization and validation of incorrectly typed values.
2. Show backend-confirmed completed, failed, pending, and distinct saved-report counts in the admin scans view alongside existing client-observed metrics.

The backend ledger is explicitly all-platform and independent of client platform filters because reservations do not reliably record platform. Known sandbox entitlements are excluded. Counts use reservation start time in UTC.

The initial audit made no production changes. The follow-up below restores verified billing history; code fixes remain local. Existing mobile endpoints and persisted report schemas are unchanged.

## Verification

- 39 payment, reporting-window, and chart-data unit tests passed.
- 22 mobile payment-response, retry, legacy/v2, and historical-report tests passed.
- TypeScript typecheck passed.
- Isolated PostgreSQL purchase integration: valid nullable consumable webhook, authentication, duplicate delivery, immediate authenticated sync, three packs plus three singles resulting in 12 saved reports, request replay without another spend, exhaustion, and restore without refilling spent packs.
- Existing scan tests also cover concurrent spending, calendar limits, failed/expired reservations returning credits once, refunds, account isolation/deletion, unpaid checkout, and preserved response codes.
- Billing persistence integration passed, including webhook deduplication, retries, ordering, refunds, and identity aliases.
- Admin analytics integration passed with backend ledger fixtures, platform-filter independence, sandbox exclusion, and the existing 20,000-event performance fixture within its eight-second budget.

RevenueCat API responses and creator attribution were mocked in the isolated purchase test. Credit granting, webhook handling, authenticated purchase sync, reservation accounting, and saving reports used real application code and a disposable database. This is not a real Apple StoreKit purchase or an end-to-end device checkout test; that remains a separate verification step.

Reference: [RevenueCat webhook event fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields).

## Root-cause investigation and repair follow-up

### Billing

Inspected all seven original production purchase events in RevenueCat. Each showed failed webhook delivery and `entitlement_ids: null`, confirming the nullable-field rejection for these purchases. The buyer bought three packs and four singles, totaling **$49.93**. The historical 42 HTTP 400s were not individually inspected, so other payload failures cannot be excluded.

Restored those seven verified original events using `scripts/admin/reconcile-revenuecat-events.ts`. Its default is dry-run; apply validates original IDs, timestamps, products, production environment, customer ownership, currency and prices, and inserts only missing lifecycle records. It never grants credits or processes purchases. A subsequent dry-run found all seven present. Production verification confirmed seven records totaling $49.93 and all seven entitlement balances identical to the pre-repair snapshot.

Invalid webhook payloads now emit field-level diagnostics without customer payloads. Webhook HTTP 400s trigger an integration reliability alert instead of being silently classified as ordinary client errors.

### Provider responses

The legacy provider requested a large report with a 2,800-token budget, conflicting feature-count instructions, and strict validation that rejected empty optional measurements. It did not retry invalid output. The observed failures were one overlong recommendation, two empty measurement cases, three missing-category cases, and one truncated JSON response.

Raised the output budget to 6,000 tokens, clarified category placement and feature counts, and made recommendation limits explicit. Empty optional measurements are omitted; real values are preserved. Fresh provider output must contain all 11 distinct legacy categories and valid scores. Invalid/incomplete output receives at most one corrective generation within one shared 100-second budget and one credit reservation. Timeout, authentication, rate-limit and HTTP server errors do not cause additional generations. No scores or missing categories are fabricated. Historical report schemas remain unchanged.

A real provider request using the bundled model image completed in 56 seconds with all 11 categories, four features per category except six for overall, and recommendation lengths within the contract. The provider requires temperature 0.6; it remains unchanged.

### Client analytics

Completion tracking previously happened later in the UI flow, after a cancellation guard, and ordinary queue delivery delayed disk persistence by one second and transport by ten seconds. Outcomes are now recorded immediately when the API result arrives, including after UI cancellation. Completion/failure and purchase outcomes persist immediately, send ahead of ordinary screen-event backlog, and survive failed delivery/restart with their original event IDs. Queue capacity preserves critical events first.

The underlying Expo iOS file move implementation already replaces the destination safely; no filesystem workaround was needed. These delivery weaknesses are established from code, but device logs are unavailable to prove why each of the five historical completion events was absent. Backend reservation counts remain authoritative and do not depend on client telemetry.

### Follow-up verification

- 91 backend analysis/payment/reliability/reporting tests passed.
- 20 mobile queue, response, legacy/v2 and layout compatibility tests passed.
- Isolated PostgreSQL scan-pack integration passed, including provider regeneration, one credit per reservation, saved-report replay, failed-scan refunds, nullable webhook handling, purchases and restore.
- Backend and mobile TypeScript checks passed.
- Production billing backfill was verified; provider and mobile code changes are not deployed or released. Mobile delivery improvements require a new app build. A real Apple StoreKit checkout was not performed.
