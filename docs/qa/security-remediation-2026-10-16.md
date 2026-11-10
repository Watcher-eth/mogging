# Security remediation status

**Cleanup — 2026-10-17:** Deferred implementation snapshots, the experimental lockfile backup and candidate build cache were deleted; the superseded test deployment was removed. Only the narrowed candidate and verification evidence remain. See [deferred work and requirements](./security-deferred-work-2026-10-17.md). These test results describe the October 16 candidate; main has since advanced and needs fresh integration validation.

A reduced, unreleased candidate is available at `/Users/watcher/Desktop/mogging/security-regression-review`. **No regressions were detected in the verified flows.** Production remains unchanged during this review; the main checkout's runtime source and dependencies are at baseline.

The candidate fixes unnecessary company-wide creator metrics, other creators' campaign proof disclosure, private review metadata in shared templates, mismatched admin identities and caching of authenticated creator/admin API responses. It keeps the tested framework/image/database dependency updates and removes the incompatible authentication upgrade.

Validation: 525 existing tests pass on both baseline and candidate; 10 security groups, 5 built-server HTTP groups and 3 legacy OAuth-cookie checks pass; four report/share renders match the baseline pixels. Production build and TypeScript validation pass.

A specific regression was caught: NextAuth 4.24.15 rejects OAuth cookies created by the current version during an in-progress login. That upgrade was deferred. Private-media migrations, legacy anonymous-session signing, generation/billing/mobile changes, proxy removal and other unverified contract changes were also left out. Automatic report-photo avatars and public leaderboard behavior remain intact.

This is not a claim of absolute zero regressions or fully repaired production security. The anonymous ownership issue, historical public private-media URLs, unrestricted proxy and generation abuse remain open. The final dependency audit has 35 advisory matches across 12 package names.

See [the final compatibility review](./security-regression-review-2026-10-16.md) for exact scope, evidence, residual risks and repeatable checks. The earlier protected staging deployment is superseded and must not be promoted.
