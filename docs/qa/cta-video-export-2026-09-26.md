# CTA video export — September 26, 2026

## Reproduction

On production, uploaded the bundled public/model.png sample, entered all six scores, generated five templates, and selected Video (MP4). Rendering completed with “Exported 4-second MP4”; there was no persistent preview or save link. This reproduced the fragile handoff after rendering, but the reporting creator's device/browser and exact error have not yet been supplied.

## Fix

- Keep the generated File and object URL in a preview dialog until the user closes it.
- Download MP4 is now an explicit user-clicked link; supported devices also offer native file sharing. No video is uploaded to a server to export it.
- Replace the underspecified H.264 level 3.1 candidate with level 4, appropriate for the existing 1080px formats.
- Bound pending video frames and close encoders/frames on failure.
- Fall back to native MP4 MediaRecorder where WebCodecs is unavailable or fails. Never label WebM as MP4. Stop capture tracks on success/failure.
- Append temporary download anchors and keep generic download object URLs alive longer.

## Automated validation

31 tests passed across export, content generation, and CTA library. Export regression coverage includes absent WebCodecs, unavailable MP4 recording, recorder construction failures, track cleanup, and missing restored images. TypeScript and targeted lint pass.

Native sharing is offered only when navigator.canShare accepts the generated file. It has not been exercised on a physical phone. The fallback has automated control-flow coverage; real-device recording still needs confirmation on the reporting creator's browser.

Reference: https://webkit.org/blog/11353/mediarecorder-api/ documents native MP4 recording from canvas media tracks. https://www.w3.org/TR/webcodecs/ defines encoder queue/flush behavior.

## Live verification

Deployed to https://mogging-r8ty6lcry-glimpseback.vercel.app, aliased to www.mogging.com. Production build passed.

After reloading production, selected the bundled photo again, generated templates and exported the vertical MP4. The persistent preview opened. Media metadata reports width 1080, height 1920, duration 4 seconds, readyState 4 and no error. Played through to currentTime 4 / ended true with no error.

The explicit Download MP4 link was exercised, but the in-app automation's download capture timed out (including its downloadMedia helper). Therefore file delivery to the creator's device is not independently signed off. No claim that the reporting creator's exact failure is reproduced or resolved across all browsers. Device/browser details remain requested.

Screenshot: /tmp/mogging-cta-video-fixed.png

## Guided creator flow follow-up

- Reused the submission stepper for Photos → Details & Scores → Preview & Export.
- Browser verified: Continue disabled without a ready photo; sample `public/model.png` becomes ready; missing scores keep the user on step 2 with an error; back/forward retains photos and all six entered scores; generation advances to five templates; MP4 generation opens the ready dialog.
- Libraries/history are collapsed by default. Optional library submission is collapsed on the export step.
- Browser verified payout contact placeholder and USDC on Base / Ethereum labels; no payout settings saved.
- Browser verified payout/setup and content notices follow the submission form.
- Typecheck and targeted lint passed; 33 generator/export/validation tests passed. Production build passed. Download-to-disk remains unverified in the in-app browser.
