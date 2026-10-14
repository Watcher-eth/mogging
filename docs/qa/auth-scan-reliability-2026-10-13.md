# Authentication and scan reliability remediation — 2026-10-13

Production deployment: `dpl_3jQpoZUqFcUbsggT26q4tot8DtcB`, promoted and verified on `www.mogging.com`. Mobile release prepared: **0.1.72 (76)**; app and widget versions verified in the compiled simulator binaries. This is not an App Store submission or a physical-device authentication test.

## Scan connection failures

The two historical failures only retained `fetch failed`; DNS, TLS, socket reset and other underlying causes cannot be reconstructed. The deployed implementation requests Kimi's streamed completion instead of waiting silently for the entire report. It collects one bounded response, requires a terminal event and successful finish reason, and validates the complete report before saving or unlocking it. Truncated output never becomes a successful report.

One known early connection failure may retry within the existing 100-second total provider deadline and the same scan reservation. Body interruptions, unknown transport errors, long generation failures, authentication errors and HTTP rate limits do not start an automatic second long generation. Safe transport codes and connection/body stage are retained. Existing failed-reservation refunds and successful-report replay remain intact.

The full scan was verified on `dpl_3DPv7DbiY3JWALzBJpMnUoDgkBGm`; the final deployment additionally preserves allowlisted TLS certificate/SSL error codes, with passing regression tests and staged/production health checks. Controlled Vercel production-environment scan using the bundled public model image: **61,413 ms backend**, 67,211 ms including the CLI request overhead. All eleven report categories persisted; sharing was created; one credit was consumed; replay returned the same report in **1,798 ms** without another credit or generation. Temporary account, session, entitlement, report, share and uniquely hashed uploaded demo image were removed.

This verifies a working scan through the deployed infrastructure, not the permanent resolution of an unidentified historic network failure.

## Scan latency

Measured stages on that Vercel scan:

| Stage | Duration |
| --- | ---: |
| Access checks and reservation | 3,098 ms |
| Image storage, parallel with provider | 331 ms |
| Provider response headers | 4,682 ms |
| First generated output | 4,683 ms |
| Complete provider report | 55,444 ms |
| Complete backend request | 61,413 ms |

Most of the measured delay is report generation, approximately 50.8 seconds after first output. Streaming maintains an active connection; it does not itself make the model generate faster. Valid client detector geometry now suppresses redundant model-generated landmark coordinates, preserving the native detector as the single geometry owner. The same eleven report categories and validation requirements remain.

Two direct-provider bundled-image checks also succeeded at 45,459 ms / 2,458 completion tokens and 44,014 ms / 2,169 tokens. The latter skipped duplicate landmarks. These are different sampled generations, not a controlled estimate of customer speed improvement. Customer scans must confirm the post-release latency distribution.

## Google OAuth

The installed NextAuth v4 logger is shared globally. A stable logger now reads AsyncLocalStorage request context, ensuring concurrent callbacks mark their own response rather than the latest request to configure the logger. The backend monitor respects the explicit semantic outcome when NextAuth responds with HTTP 302.

Missing state is classified `failed / oauth_state_missing`; provider `access_denied` is `rejected / oauth_cancelled`. Raw metadata, cookie values, tokens and arbitrary error messages are never dumped into the new auth diagnostics. State is correlated through a one-way truncated SHA-256 fingerprint; cookie presence and trace are logged without cookie values.

Verified the full redirect chain on the staged deployment and public production domain: callback → NextAuth error → sign-in → dedicated recovery page. The recovery starts a fresh Google authorization flow; it never accepts a callback without its valid state/PKCE cookies. Duplicate sign-in taps are guarded synchronously. Production initiation uses `www.mogging.com`, Google authorization, S256 PKCE, and two Secure, HttpOnly, SameSite=Lax security cookies.

Exactly three historical missing-state records and one provider-denial record were corrected using their verified Vercel trace IDs. Original properties were backed up before the transaction. Controlled QA service events were removed by their exact test traces so these probes do not inflate customer failures; the test evidence was preserved separately.

The historical browser's reason for losing its state cookie remains unproven. New initiation/callback correlation can distinguish elapsed/stale flows from missing or replaced browser state. State and PKCE checks were not relaxed.

## Apple authentication

The installed Expo Apple Authentication `requestAsync` defaults to Expo's background AsyncFunction queue while creating/presenting Apple's authorization UI. A reproducible, idempotent postinstall patch dispatches this operation to the main queue. The app checks foreground state and provider availability and guards duplicate taps with a ref before any asynchronous work.

The Expo bridge previously reduced native NSError details to `ERR_REQUEST_UNKNOWN`. The patch retains only allowlisted native error domains and numeric root/underlying codes. The client analytics contract permits those sanitized fields, keeps cancellation distinct from failure, and shows an actionable retry message instead of exposing a diagnostic JSON string. There is no automatic retry of an Apple authorization sheet.

Both patched Swift files parsed and compiled in the actual iOS simulator build. Expo export, prebuild and TypeScript checks succeeded. Final compiled app and widget both contain **0.1.72 (76)**. The original customer's unknown error is not proven to have been caused solely by the queue defect. A physical iPhone test on the new build is still required: Apple prompt presentation, cancellation, successful account entry, and the returned session/report access.

## Verification

- 32 focused backend tests passed, covering streaming chunk boundaries/UTF-8, terminal events, validation, early connection retry, bounded total deadline, interrupted bodies, auth failure semantics, concurrent request isolation and existing account-access rules.
- 11 mobile auth/share regression tests passed, including cancellation, safe native error telemetry and retained share geometry.
- Local PostgreSQL credit integration suite passed: reservation concurrency, failure refunds, retry, saved-report replay, exhausted credits and account isolation. Temporary test database was stopped.
- Both TypeScript checks passed; focused React lint passed; production build passed.
- Real staged API scan, saved report, credit consumption, share creation and replay passed.
- Production health, Google secure-cookie initiation, recovery rendering and persisted semantic failure classification passed.
- Native simulator build succeeded after prebuild; app/widget version consistency verified.

Remaining release evidence: real-device Apple sign-in on build 76 and subsequent customer scan reliability/latency. The audit's separate missing alert-email credentials and disabled optional PostHog export were not changed by this remediation.
