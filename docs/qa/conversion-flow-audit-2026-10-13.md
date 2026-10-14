# Conversion flow audit — October 13, 2026

## Evidence and limits

The reviewed production window ends October 13 at 12:30 Mexico City time. Fifteen devices attempted an initial subscription: ten cancelled, one reported errors, four had no terminal outcome, and none completed. Fourteen selected monthly and one weekly, all on 0.1.65 (69).

RevenueCat confirms `mogging.pro.monthly` is an approved App Store subscription, attached to `pro`, and mapped to `$rc_monthly` in the default offering. Its live transaction list is empty. Product configuration is not evidence that Apple's native confirmation prompt was displayed. The shipping-device prompt/cancellation check and a real sandbox subscription receipt remain pending; no live purchase was made.

The production preflight used a disposable test account: catalog and provider verification succeeded, initial credits stayed zero, and an invented receipt was rejected. The account was removed after testing.

## Scans

Two attempts on the same photo failed after approximately 74 and 71 seconds with stored `fetch failed` errors (`provider_unknown`). These are transport errors, not invalid report validation. Three other attempts succeeded and saved reports. The failed photo remains failed: later successes were different photos, not recovery of the original image.

The three-credit pack has three completed reservations, two failed reservations, and zero remaining credits. Failed attempts did not consume the pack. A local integration test confirms a failed reservation refunds its credit, a new request updates the same photo to a complete report, and replay does not spend twice.

A live provider-only request using the bundled demo image returned an eleven-category validated report in 33.4 seconds, with 2,559 completion tokens. This does not establish a production latency improvement. New stage timings distinguish access reconciliation, image storage, provider duration, and output size. Transport errors retain only allowlisted network cause codes. Interrupted response bodies no longer cause a report-regeneration attempt. Total provider deadlines and billing safeguards are unchanged.

## Upload

The shipping build has no picker/preparation-stage diagnostics. Eleven of 44 observed upload flows have no continuation recorded; median screen time is about 50 seconds, which includes user interaction. Do not interpret it as image-processing latency.

The existing removal of the extra photo-library permission gate and more sensitive head coverage are retained. Added diagnostics distinguish camera start/completion/cancellation/pause/failure, image preparation, landmark detection, validation failure, and picker outcomes. They contain counts, durations, modes and results, never image bytes, paths, or landmarks. These changes require a new mobile binary; an iOS release export is verification, not an App Store release.

## Acquisition and homepage test

The active assignment and both homepage designs remain unchanged. The iPhone handoff no longer emits a false homepage exposure or renders a homepage while navigating to the store. Its automatic and manual destinations have separate reporting. Historical handoff visitors are excluded from homepage click denominators.

At the fixed audit cutoff, A has five homepage store clicks from 82 eligible browser assignments and B has thirteen from 91. The original recorded assignment counts remain available for traffic inspection. Creator-portal pageviews and browsers are separate from public-site activity; browser counts across surfaces overlap. First opens and redirects are explicitly distinguished from attributed installs. No missing attribution is relabelled as organic.

## Validation

- Provider tests cover safe transport errors, response-body interruption, validation correction and shared deadlines.
- Local PostgreSQL tests cover subscription allowances, signed webhook handling, immediate verified sync, replay, concurrency, refunds, expiry, account isolation, stored reports and same-photo recovery.
- Experiment integration tests cover historical false exposures, current handoffs without exposures, matching outcomes, deduplication and seven-day windows.
- Production read-only aggregation matches the audited homepage counts.
- Mobile tests cover cancellation classification, safe purchase stages, analytics queue delivery, report parsing and head-coverage sensitivity.
- Web/mobile typechecks and changed web component lint pass; iOS bundle export succeeds.

## Remaining checks

1. Shipping-device monthly prompt and cancellation, followed by a sandbox purchase through receipt verification, subscription allowance activation and report access.
2. Release mobile diagnostics and inspect new upload/camera traces before attributing all unfinished flows to a specific cause.
3. Observe new provider transport cause and stage timings on production scans; the current evidence does not identify the underlying socket failure or prove the 82-second wait is resolved.

## Deployment

Server and admin reporting fixes were staged, verified, and promoted to https://www.mogging.com as `dpl_Cu3TAgWb72aS3tVxkbjrS18EZoPq` (READY). Staged checks: public configuration HTTP 200, iPhone handoff HTTP 200, unauthenticated admin HTTP 401, new diagnostic ingestion HTTP 202 with four accepted and zero rejected, and four persisted test-only events. Post-promotion checks confirmed both assigned homepage designs render on the live domain and admin analytics remains authenticated.

Mobile upload/camera diagnostics exported successfully to `/private/tmp/mogging-flow-audit-mobile-export`; they have not been released to App Store users. No production customer photo was reprocessed in this audit.

RevenueCat also shows historical sandbox monthly renewals from September 26–30. This confirms earlier sandbox receipt processing, but does not validate a fresh purchase on the currently shipping build. The immediate post-deployment error-log check returned no error records for the promoted deployment.
