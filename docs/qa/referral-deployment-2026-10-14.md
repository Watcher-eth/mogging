# Referral deployment — 2026-10-14

Production deployment: `dpl_AMxztniwJfvrjzukXe6KGmm5J1Rw` (`mogging-ftdciu1h8-glimpseback.vercel.app`), promoted to `www.mogging.com`.

Baseline: `dpl_qEt691wjToZ2c6RbY9d29mtW2NuY`. All 1,002 deployed source file hashes matched the existing production snapshot before changes were applied. The release preserves the creator, sharing, authentication, and provider fixes already in production. No environment changes or database migration were needed.

Runtime changes:

- `pages/[referral].tsx`: Google account-backed invitation signup before installation, confirmed signup status, first-touch preservation, and explicit copy/download recovery instructions.
- `lib/admin/analytics.ts`: redemption milestones and daily totals use confirmed `referral_signups` records, including historical signups. Client redemption claims do not inflate ledger counts. Server-authoritative redemptions have account counts and no invented device identities.

Verification:

- Staged snapshot: 11 targeted tests pass; TypeScript passes; Vercel production build succeeds.
- Referral analytics transaction test passes date bounds, duplicate-claim rejection, daily totals, and account/device distinction. Fixtures rolled back.
- Staged and live invitation: HTTP 200, Google signup available, correct invitation code, signed cookie issued, `Cache-Control: private, no-store`.
- Live HTTP smoke: invitation → cookie → three new accounts → mobile login without browser cookie → same account IDs and attribution → exactly one evaluation credit. Disposable accounts, sessions, and reward removed afterward.
- Final production inspection confirms the expected deployment is READY and serves `www.mogging.com`.

The HTTP smoke uses credentials to verify the shared account/session boundary. Physical Google OAuth across a fresh App Store installation remains a device acceptance check. The website's account-backed path works with existing mobile Google sign-in; the paste recovery UI and sample-photo paywall overlay fix require the upcoming mobile build. No mobile release or purchase was performed in this deployment.
