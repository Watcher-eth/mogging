# Payment backend release — 2026-09-17

- Production: https://www.mogging.com
- Deployment: https://mogging-ayszkldqo-glimpseback.vercel.app
- Vercel ID: `dpl_9u5MmqzKXavYcNFMovTK2Z1ihd16`
- Status: promoted, Ready.
- Source: isolated snapshot of `00ed412` plus the reviewed payment changes. Source changes remain uncommitted locally; no unrelated mobile changes were released.
- Build: Next.js 15.5.15, successful production build. Existing non-blocking image lint warning remains.

## Database

Applied `0030_referral_links` (existing additive prerequisite) and `0031_scan_allowances` together inside the Vercel production environment. The transaction checked the migration journal and balance integrity, acquired a migration lock, and recorded both migration hashes. New expiry and period columns were verified. No production secrets were exported.

## Verification

- Candidate and public production health: HTTP 200, database healthy.
- App configuration: authentication and payment enforcement enabled.
- Valid unauthenticated entitlement request: HTTP 401.
- Valid unauthenticated analysis request: HTTP 401 before model work.
- Historical runtime-log query through the connector was unavailable (403); this is not a clean-error-log claim.
- Real App Store purchases were not made during deployment.

## Mobile status

The mobile UI changes are in the workspace and passed tests/type checking. They have not been uploaded to TestFlight or released to the App Store. Backend limits are live for existing clients; the automatic purchase-sheet UI requires the updated mobile build.

## Rollback reference

Previous production deployment: `dpl_8mso55YgqGArb1bJoeEJbLMZpQUa` (`https://mogging-5pzxnszy6-glimpseback.vercel.app`). The migration is additive and need not be reversed for an application rollback, but the old code would restore unlimited subscription scanning. Prefer a forward fix for payment enforcement issues.
