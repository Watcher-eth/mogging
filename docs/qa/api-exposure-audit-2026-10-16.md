# Mogging API exposure audit

This document records the original audit baseline. Subsequent fixes, compatibility constraints and release status are tracked in [the remediation record](./security-remediation-2026-10-16.md). Automatic reuse of the first report photo as a public profile avatar is intentional and is preserved; it is not treated as a defect.

The candidate code and repeatable security scripts now live in the isolated worktree `/Users/watcher/Desktop/mogging/security-regression-review`. Any script commands below should be run from that worktree, not the restored main application checkout.

The tested production endpoints did not disclose private creator records or admin data to an unauthenticated caller. The source nevertheless contains exploitable anonymous ownership handling, an unrestricted server-side image fetch, unpaid image generation, and unnecessary disclosure of business metrics to ordinary accounts. Private images and creator evidence also use public object URLs. The local dependency versions match critical image-processing advisories and need urgent patching.

## Scope and production results

Checked `https://www.mogging.com` on October 16, 2026. The final production run completed at 22:31 UTC, or 16:31 in America/Mexico_City. Source baseline: commit `44ef441fba90245f874cef6a91fee29a3717efe0`, with the existing working-tree changes preserved. The deployed commit and installed production dependency versions were not verified.

The inventory contains **109 API route modules**, including 21 admin modules and 20 creator modules. Catch-all modules implement additional paths, so this is not a count of every method/path combination. Authentication references in the inventory are navigation aids, not evidence that every branch has been audited.

The production run made 58 checks against protected or gated routes, 13 public/diagnostic checks, and three forged-credential checks. Requests used GET or an empty JSON body on POST/PATCH. No valid mutations, account creation, payments, image generation, customer deletion, bulk extraction, or internal-network probing were performed. Normal request telemetry may be recorded by the application.

| Production surface | Observed result | Meaning |
| --- | --- | --- |
| Creator dashboard, accounts, submissions, CTA library and campaign APIs | 401 | No private creator records returned without a session |
| Admin directory, analytics, campaigns, messages and payment receipts | 401 | No admin records returned without a session |
| Admin metrics, payout settlement, reviews and settings with empty PATCH bodies | 401 | Supported write methods reject unauthenticated callers |
| Other protected/gated checks | 403, 404 or 405 | Origin, feature or method rejection; a 405 alone does not verify authorization |
| Admin invite session | 200 with configuration/unlock booleans | Expected public gate status, not an invite directory |
| Course maintenance cron | 200 with `enabled:false` | Disabled feature, not a scheduler bypass |
| Four other cron routes | 401 | Scheduler credentials required |
| Forged admin cookie, forged NextAuth cookie, forged mobile bearer | 401 | None granted access |
| Photo and PSL leaderboards | 200; each reports 103 entries | Public photos, names, scores, IDs and related metadata can be paginated without login; these counts overlap |
| User leaderboard | 200; reports 2 users | Public leaderboard participants, not total registered accounts |
| User search and one public leaderboard profile | 200 | Names, images and public profile fields are available without login |
| Health and app configuration | 200 | Runtime configuration status and feature metadata are public; no secret values observed |
| Courses and experimental landmark endpoint | 404 | Currently unavailable in production |
| `/.env`, `/.git/HEAD` | 404 | These direct paths did not disclose files |

Protected-route result totals were 37 responses with 401, one with 403, four with 404, 14 with 405, and two expected metadata responses with 200. No unexpected successful response or transport error occurred. Only one record per paginated sample was requested; evidence retains field names, counts and statuses rather than customer records.

Evidence: [production checks and route inventory](./api-exposure-evidence-2026-10-16.json). Re-run from the repository with `bun run scripts/security/check-exposure.ts`. Optional arguments are the target origin and output JSON path. The script returns a nonzero exit status for unexpected protected responses or transport failures; passing these checks is not a complete security certification.

## Findings and repairs

### Urgent dependency patches

Local installed versions are Next.js 15.5.15, Sharp 0.34.5, NextAuth 4.24.14, Auth core 0.41.2 and Drizzle ORM 0.44.7. `bun audit --json` returned 72 advisory matches across 18 package names, including development and transitive dependencies. Those matches are not 72 demonstrated production vulnerabilities; some overlap or require features the application does not use.

The most urgent match is Next.js image optimization: the maintainer identifies remote code execution through AVIF processing in affected releases and lists 15.5.24 as a patched release for that advisory. Other audit matches extend beyond that version, so use the current patched release rather than treating 15.5.24 as the complete upgrade target. This application enables image optimization, AVIF output and SVG handling; exact exploitability depends on deployed packages and the image-processing path. No exploit image was submitted. [Next.js maintainer advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4).

Sharp separately lists a runtime-dependent image-processing vulnerability affecting versions below 0.35.5. Patch Sharp to at least that release and check the native binaries actually shipped. [Sharp maintainer advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w).

Update NextAuth to at least 4.24.15 and the adapter's Auth core dependency to at least 0.41.3. The OAuth provider-confusion advisory is conditional on provider/linking configuration; the email-normalization advisory does not establish a takeover here because the source does not configure the email/magic-link provider. [OAuth advisory](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-x445-f3h2-j279), [email-provider advisory](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-7rqj-j65f-68wh).

Update Drizzle to at least 0.45.2 for its identifier-escaping advisory. No attacker-controlled SQL identifier was demonstrated in the reviewed handlers. [Drizzle maintainer advisory](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9).

Retest auth, image processing and database operations after the upgrades. Full registry evidence: [dependency audit](./dependency-audit-2026-10-16.json).

### High priority anonymous identity impersonation

`lib/leaderboards/service.ts:133` uses an anonymous ownership ID as the public profile ID, and line 353 includes `anonymousActorId` in returned photo records. `lib/auth/anonymous.ts` then accepts a caller-supplied UUID cookie as that identity without a signature or server-side session check.

Someone who obtains a published anonymous ownership ID can copy it into that cookie. The identity is trusted by the anonymous profile API, private analysis ownership checks and the anonymous deletion branch of `pages/api/user/me.ts:26`. Deletion reaches `deleteAnonymousProfile`, which removes the owner's photos, analyses and related records. This does not impersonate a registered user's NextAuth session or grant creator-admin access.

A local synthetic test confirmed both public disclosure of the ID and acceptance of a copied cookie by private-photo ownership checks. Another test confirmed that the DELETE handler calls the deletion service with that copied ID; the service was mocked and no database deletion occurred. The one production public profile sampled had no anonymous actor ID, so an affected live customer was not demonstrated.

Prefer removing obsolete anonymous management paths if anonymous reports are no longer supported. Otherwise, use a separate opaque session credential verified server-side, or a signed cookie whose signing key is private. Stop publishing ownership credentials, including the profile-ID fallback. Removing the explicit field alone leaves the fallback leak; signing alone does not remove unnecessary identifier disclosure. Invalidate unsigned ownership cookies and provide a deliberate recovery path for historical anonymous data.

### High priority unrestricted image proxy

`pages/api/share/image-proxy.ts:13–20` accepts arbitrary HTTP/HTTPS destinations and fetches them before inspecting the response. There is no allowed-host restriction, private-address check, explicit redirect restriction, fetch timeout or rate limit. The 12 MB limit is checked only after the complete response is buffered.

A synthetic test confirmed that a loopback destination reaches `fetch` and that an image response is returned. The test replaced fetch; no internal host was contacted. This establishes the source-level server-side request forgery primitive. Actual internal service reachability in production remains untested. Non-image responses are rejected after the request, so this is not proof that arbitrary internal JSON or credentials can be read through it.

Delete the proxy if direct image delivery or storage CORS is sufficient. Otherwise accept an owned asset ID, resolve it to an exact trusted storage origin, disallow redirects, and enforce a timeout and streaming byte limit. Keep any necessary network access policy in one shared owner.

### High priority unpaid image generation

`pages/api/analysis/potential-image.ts:11–14` rate-limits the caller and then invokes the image provider. It does not authenticate, verify entitlement, or consume the purchased `extra_potential_image` allowance. `lib/analysis/potential-image.ts` uses the application's provider key and can store the result publicly.

A local synthetic test confirmed that an unauthenticated request invokes generation. The provider call was mocked; production provider availability and spend were not tested. If enabled, callers can consume your generation budget without buying the feature. An IP quota alone does not enforce payment.

Remove the route if obsolete. Otherwise authenticate before generation, reserve the allowance atomically, and refund it on failure using the same reservation ownership pattern as paid evaluations. Add account-based quotas alongside the network limit.

### Medium priority business metrics available to ordinary accounts

The creator dashboard requires a login but does not require an approved creator. `lib/creator/service.ts:24–30` returns community metrics even when the caller has no creator profile. Those metrics include qualified views, first-time paid customers, total paid cents, paid creator count and approved submission count.

`listCreatorSprints` also exposes campaign budgets and submission counts to signed-in users. `sprintApprovedSubmissions` exposes approved/paid post handles, URLs, view counts and approved amounts. These may be intentional social proof, but a competitor can obtain them through an ordinary account under the current source policy. This is distinct from exposing the private creator directory, payout addresses or admin analytics.

A local fixture confirmed that an ordinary account with no creator profile receives all-program metrics. No ordinary-account production session was used. Decide which metrics are intentionally public, return only those, and keep acquisition and payout intelligence behind the appropriate approval/role check. Free registration is not an effective confidentiality boundary.

### Medium priority private assets use public URLs

`lib/storage/videos.ts:39` builds public URLs for creator assets in the same public bucket used for app photos. Creator account analytics and submission evidence use that function. `lib/storage/images.ts` similarly stores photos at public paths regardless of the database privacy flag and sets public cache headers.

Database checks protect record discovery, but possession of an asset URL can bypass the application login. Turning a photo private does not revoke its direct object URL or existing cached copies. Random keys reduce guessing; this finding does not establish bucket listing or a way to enumerate every private upload. A private production creator object was not fetched.

Put private reports and evidence in private storage. Authorize the requesting owner/admin before issuing a short-lived read URL. Migrate existing objects, remove public access to the old locations and purge caches where supported. Keep intentionally public content on the public delivery path.

## Additional hardening

- Public search, profiles and leaderboard reads lack application rate limits. Search uses SQL wildcard matching, so wildcard queries can broaden results. Bound reads and decide whether accounts without public content should appear. Authentication by itself will not prevent scraping through free accounts.
- Web credentials in `lib/auth/options.ts` have no application-level login limiter, unlike the mobile credentials endpoint. Add both account and trusted-network throttles. The rate-limit helper reads `x-forwarded-for`; validate the deployment's trusted proxy behavior before claiming it cannot be spoofed. No production brute-force or rate-limit bypass was attempted.
- Main admin access requires an email allowlist plus a shared unlock password. Local tests rejected ordinary users, missing unlocks and tampered tokens. Separate invite administration is protected by a shared code without a user identity. Consolidate privileged access under verified account identity and explicit roles; use MFA for privileged users. Ensure an unverified registered email cannot establish admin eligibility. The additional unlock password currently remains a separate barrier.
- Set `private, no-store` consistently on authenticated creator/admin responses. Several production rejections use the framework's `public, max-age=0, must-revalidate` default; this alone is not evidence of a cached private-data leak.
- Reduce public health output to the status needed by callers and keep detailed provider/configuration readiness behind authenticated diagnostics.

## Validation and remaining coverage

Six local synthetic audit tests passed: anonymous credential publication/ownership, anonymous deletion dispatch, arbitrary proxy target acceptance, unpaid generation dispatch, admin guard behavior, and ordinary-account metric disclosure. The existing three photo-access unit tests also passed. These audit tests demonstrate current defects; passing them does not mean those defects are fixed. All network, provider and destructive operations in the synthetic tests were mocked.

`bun run typecheck --incremental false` passed. Application source, dependency versions and production settings were not changed. Added artifacts are this report, sanitized production evidence, dependency audit evidence and the repeatable production check script.

Live cross-account creator access, valid admin sessions, webhook forgery, private storage policy, database network exposure/IAM, deployment secrets, secret history and provider control-plane permissions remain outside this pass. Before calling the system fully reviewed, run a staging matrix with two ordinary users, two creators and an admin, test ownership across every read/write method, and verify deployed package versions and private bucket policies. The current evidence supports “no direct anonymous creator/admin dump found,” not “all infrastructure is secure.”
