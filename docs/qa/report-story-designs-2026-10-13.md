# Mobile report stories — 2026-10-13

## Changes

- Settings support and report-support emails now address `w@mogging.com`.
- Report sharing starts with one picker: Original, Precision (CTA template 2), Afterimage (CTA template 6).
- Preview and native/Instagram/TikTok sharing use the same generated PNG, actual report photo, and report scores. The older standalone share screen now uses this export instead of hard-coded example metrics.
- Every design exports 1080 × 1920. Text is inset from the story controls. The original design keeps its visual treatment, with safer top/bottom margins.
- Only the selected design loads. Switching or closing cancels obsolete requests; failures expose retry. The local image cache includes the selected design and render version.
- API validation now preserves `detectorRevision`. Previously Zod dropped it, and the overlay engine consequently suppressed current iPhone landmarks as outdated. Obsolete detectors and unusable geometry still produce no guessed overlays.

## Verification

- Both TypeScript checks passed. Changed server files passed ESLint; the mobile check had no errors and retains existing React Native/DOM-rule warnings.
- Final iOS production JavaScript/assets export passed. No mobile native dependency was added; version 0.1.71 (75) remains prepared for the user's Xcode archive.
- Nine sharing tests passed, including PNG dimensions, distinct photo treatments, backwards-compatible default design selection, invalid images, and validation-to-overlay regression coverage.
- Final staged production deployment: `https://mogging-cwh8nys4y-glimpseback.vercel.app`.
- All three deployed API POSTs rendered valid 1080 × 1920 PNGs. Comparing decoded pixels against GETs without landmarks confirmed visible overlays: Original 299,063 pixels; Precision 160,142; Afterimage 160,264.
- Promoted deployment `dpl_4Hm4TcDbWGMzHt6YW22Mdrqi3ati` to mogging.com. Repeated all three POST/GET comparisons on `https://www.mogging.com`; dimensions and overlay pixel counts matched the staged build.
- Test fixtures used the bundled model image and sample scores, and were removed in `finally`; no customer photos/accounts were edited and no real social post was sent.

## Release boundary

The renderer is deployed separately from the mobile build. Users receive the picker/support address after the mobile release. Native Instagram handoff and the picker have not been exercised on a physical device in this task; the iOS bundle and deployed image pipeline were verified.

## Portrait height and report-anchor follow-up

- Precision and Afterimage now use a 936 × 1536 portrait at y=192: 80% of the 1920-pixel story height. Their header moves down to y=230, with score content up at y=1450 and translucent washes retaining photo visibility under text.
- Original's header moves up to y=150 and its score block moves up to a 300-pixel bottom inset.
- Sharing now receives the exact displayed report landmarks and natural image dimensions. It does not re-detect or mutate those anchors. Standalone sharing still uses the existing detector fallback. The render cache version is `story-designs-v14`.
- Previous sample previews used old fixed demo calibration. New sample previews were detected by executing the exact shared `FaceLandmarkDetector.swift` implementation with Apple Vision on the bundled model, then applying the mobile enrichment function.
- A parity check confirmed exact equality of all ten share/report primitives at 1080 × 1920 and 936 × 1536.
- Ten mobile sharing/source/framing/attribution tests passed, including proof that sharing preserves report anchors/image dimensions and does not re-detect supplied geometry. Nine server sharing tests passed. Type checks and the iOS export passed.
- Final follow-up renderer promoted to `https://www.mogging.com`: deployment `dpl_b1r7JhogdfchiHA2FTCexUuyAHwP` (`mogging-r0l8h4qdp-glimpseback.vercel.app`). All three production POST exports passed the native-landmark/decoded-pixel comparison: Original 428,228 changed overlay pixels; Precision 272,065; Afterimage 274,330. Every image is 1080 × 1920. Temporary fixtures were removed.
- Updated sample contact sheet: `/private/tmp/mogging-report-story-designs-80-percent.png`. Final mobile export: `/private/tmp/mogging-story-final-mobile-export`.
