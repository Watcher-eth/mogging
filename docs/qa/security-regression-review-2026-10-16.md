# Security compatibility review — final narrowed candidate

**Cleanup — 2026-10-17:** Deferred implementation snapshots, the experimental lockfile backup and candidate build cache were deleted; the superseded test deployment was removed. Only the narrowed candidate and verification evidence remain. See [deferred work and requirements](./security-deferred-work-2026-10-17.md). These test results describe the October 16 candidate; main has since advanced and needs fresh integration validation.

The candidate has **no regressions detected in the verified flows**. This is not an absolute guarantee of zero production regressions. The owner explicitly permits deferring changes with compatibility risk. Production has not been deployed or migrated during this review.

Candidate: `/Users/watcher/Desktop/mogging/security-regression-review`, based on `44ef441fba90245f874cef6a91fee29a3717efe0`. The main checkout's application source and dependencies remain at baseline; pre-existing user changes were preserved. The candidate contains synthetic local configuration only and has no Vercel project link.

## Retained fixes

| Change | Behavior and compatibility evidence |
| --- | --- |
| Creator dashboard | Removes the unused company-wide views, acquisitions and payouts field and its queries. Owner submissions, accounts, payments and payout requests remain. No current web or mobile consumer reads `communityMetrics`. Ordinary users no longer receive it. |
| Campaign submission details | Approved/paid proofs are scoped to the requesting creator. Other creators' handles, URLs and amounts disappear from this detail list. Whole-campaign budget consumption and submission counts retain their original meanings, including exhaustion by another creator. Page labels describe the owner-only list. |
| Shared CTA templates | Approved assets stay reusable. Shared entries hide owner profile ID, creator name and private review notes. Owner/admin responses retain their full data, and pending/rejected review flows and existing PNG/MP4 upload URLs are preserved. |
| Admin guard | Confirms the session user ID belongs to the allowlisted session email in the database. Existing valid admin accounts and original unlock-cookie signatures work. This does not replace email verification, explicit roles or the separate admin password. |
| Sensitive caching | Sets `private, no-store` only through the existing auth wrapper on creator/admin API paths. Public APIs and SSR behavior stay unchanged. Bodies are unchanged except the intentional privacy restrictions above. |
| Dependencies | Retains tested Next.js 15.5.28, Drizzle 0.45.4, Sharp 0.35.5, PostCSS 8.5.30 and matching Next lint tooling. Overrides cover Sharp, PostCSS and source-map-js. Original AWS SDK and OG renderer versions stay. Authentication packages are restored to their original locked versions. |
| Example configuration | Removes credential literals from the example file. No new required environment variables or media flags remain in the active candidate. |

## Verified final candidate

- **525 existing tests pass on baseline and candidate, across 101 files each; zero failures or skips.** Each file runs in a separate process with identical synthetic configuration. This includes isolated local payout, invite, customer analytics and push integrations. Both checkouts receive the existing user test correction and the same mobile fixtures.
- **10 security groups pass** against real isolated PostgreSQL with creator A, creator B, an ordinary user and an admin. They cover owner access, cross-account denials, admin denials, valid admin access, template review/reuse, unchanged campaign budgets, legacy anonymous cookies, health fields and automatic avatar preservation. Auth identity and reliability monitoring are mocked in this matrix; provider generation is not invoked.
- **5 HTTP compatibility groups pass** against the built local Next.js server with real password/JWT sessions: wrong/correct password, token decoding, legacy session cookies, admin unlock and mismatched identity rejection, and logout. Accounts are synthetic and removed afterwards.
- **3 OAuth cookie checks pass with retained auth versions**: legacy state, PKCE and nonce cookies remain acceptable.
- **4 real report/share renders match baseline pixel-for-pixel** for the public portrait fixture: report, original story, precision and afterimage. Database share lookup is mocked; the actual handlers, image processing and original OG renderer run.
- The added cache-wrapper unit test passes; it verifies delegation and the creator/admin-only header boundary.
- Production build and TypeScript validation pass. The existing preview-page `img` lint warning remains.
- Final dependency audit: **35 advisory matches across 12 package names**, down from 72 across 18 in the original baseline. This is not a clean audit. Counts are registry matches, not independently exploitable issues.

Initial comparison failures were test setup errors: the analytics fixture was pointed at the wrong isolated port, and the temporary baseline checkout lacked the sibling mobile fixtures. Both were corrected before the final comparison.

## Deferred changes and unresolved exposure

1. **NextAuth/auth-adapter upgrade.** A direct cross-version test found that NextAuth 4.24.15 rejects state, PKCE and nonce cookies created by the current 4.24.14. That can break an OAuth login already in progress during deployment. The upgrade is deferred, not shimmed to bypass its new provider binding. The original auth dependency versions are retained. The failed experiment is saved separately from the passing final compatibility evidence; the associated advisories remain open.
2. **Anonymous ownership signing and ownership-ID removal.** Rejecting historical unsigned cookies would remove access to existing anonymous reports. Public anonymous ownership IDs and the original impersonation issue remain pending a recovery design.
3. **Private media gateway, expiring URLs and existing-object migration.** These can affect uploads, playback/seeking, cached reports and installed mobile clients. No active private-media code, required bucket configuration, migration apply mode or object deletion is in the reduced patch. Historical public creator evidence/report URLs remain an exposure if obtained.
4. **Generation authentication, billing and mobile changes.** Deferred because installed clients and included-versus-extra allowance semantics need a coordinated change. Original generation, persistence, quotas and billing are preserved; abuse exposure remains.
5. **Proxy removal/restriction, OAuth proof rules, reserved admin registration, new web login limits, global cache changes and public health changes.** Deferred because supported historical callers, provider behavior, shared-network limits or performance consequences are unverified.
6. **Campaign aggregate disclosure.** Budgets/counts remain unchanged to preserve live financial/UI contracts. Only individual creator proofs are filtered.
7. **Other dependency updates.** AWS SDK and the OG renderer major upgrade were removed. Remaining advisories need their own compatible fixes.

Automatic first-report-photo reuse as a public avatar is intentional and unchanged. Existing avatars are not replaced by later scans. The public leaderboard remains public.

## Release status and limits

There was no production release, customer-data mutation, alias change, storage migration or configuration change in this narrowing pass. The earlier deployment `dpl_BjyUehUJGzWyw3r1mZXW5jVUm1jX` is superseded and must not be promoted; its 19 passing checks describe an older revision only. The previously verified live deployment was `dpl_5nFPFYq2F4TUNW3cM2XXruhUEwEB`.

An earlier phase added an unused private-bucket environment setting and briefly reassigned the default Vercel alias while staging; that alias was restored. No customer assets were migrated. The reduced candidate does not require that setting.

The current candidate has not been deployed to staging/production. Live third-party OAuth, payment providers, production load, native binary behavior on Vercel Linux, long media playback and arbitrary historical/external clients are not established by these tests. Privacy field restrictions are intentional API behavior changes, not a promise of byte-identical responses to every consumer.

## Evidence and repeatable checks

- [Existing-suite comparison](./security-compatibility-comparison-2026-10-16.json)
- [Creator/user/admin matrix](./creator-access-verification-2026-10-16.json)
- [Built-server session checks](./security-session-compatibility-2026-10-16.json)
- [Retained OAuth compatibility](./security-oauth-compatibility-2026-10-16.json)
- [Deferred auth-upgrade incompatibility](./security-deferred-auth-upgrade-2026-10-16.json)
- [Rendering comparison](./security-rendering-comparison-2026-10-16.json)
- [Remaining dependency advisories](./dependency-audit-after-fixes-2026-10-16.json)
- [Original exposure findings](./api-exposure-audit-2026-10-16.md)

The scripts are in `scripts/security/`. They require a credential-free baseline checkout and dedicated local databases named `mogging_security_test`: port 55449 for security/session fixtures, 55448 for analytics/payout/push integrations and 55439 for invite integrations. Load the repository schema into those disposable databases first. Do not run the truncating fixture matrix against any database containing real data.

Run `compare-regressions.ts BASELINE_PATH`, `compare-rendering.ts BASELINE_PATH`, `compare-oauth-cookies.ts BASELINE_PATH` and `test-session-compatibility.ts BASELINE_PATH` with Bun from the candidate. The session check needs a current `bun run build`. Run `test:security` with `SECURITY_TEST_DATABASE_URL` explicitly pointing to the guarded port-55449 database. Run these database suites sequentially. Provider credentials are not needed. The read-only exposure audit is a separate tool; it was not rerun against production in this pass.
