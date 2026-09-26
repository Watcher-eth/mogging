# CTA photo feedback and alignment QA — September 26, 2026

Deployment: https://mogging-k50i1uhw5-glimpseback.vercel.app (aliased to https://www.mogging.com)

## Changes
- Selected files immediately create local preview cards inside the upload area.
- Preparing/mapping states show a shimmer, status text, and disabled progression while work remains.
- Ready photos expose a mouse/touch pointer editor with keyboard nudging and reset.
- Drag frames remain local to the editor, update at most once per animation frame, and commit to generator state on release.
- Nearby contours follow anchor corrections. Preview and export read the same image landmarks.
- Included pending creator red/yellow semantic-color changes; unrelated admin edits excluded using a release snapshot.

## Verified
- TypeScript and targeted ESLint pass.
- 27 alignment/content-generator tests pass, including clamping, baseline immutability, and preservation through export normalization.
- Vercel production build succeeds.
- Live sample public/model8.png: immediate Preparing photo card, inline thumbnail, Ready state.
- Pointer drag moved left eye inner from (43.5026%, 35.3966%) to (49.531%, 37.5208%); Reset restored the baseline.
- Keyboard ArrowRight moved nose tip from 50.1136% to 50.3136%; persisted through details, template generation, export, and return to Photos.
- Mobile 390×844 and desktop 1280×900 layouts inspected.
- Generated 5 sample templates; MP4 rendering reached Your video is ready.
- Download confirmed on disk: mogging-editorial-vertical (3).mp4; ffprobe reports H.264, 1080×1920, 4 seconds, 1,061,823 bytes.
- Browser download-event helper did not report the download, so the saved file was verified directly.
- No shared CTA library submission or account/payout changes made.

## Limits
- Physical iOS/Android touch performance was not tested. Pointer handlers support touch with capture and touch-action:none on handles.
- Mobile screenshot: /tmp/creator-cta-alignment-mobile.png

## Inline-layout follow-up
Removed nested upload/photo cards after creator feedback. The empty upload target keeps its dashed outline; selecting a photo removes that outline and background. Ready photos mount the alignment editor immediately, without expansion state or a toggle. The image uses its natural aspect ratio, with shimmer retained during processing. Targeted lint and TypeScript pass.
