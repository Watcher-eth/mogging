# Mogging score reveal

The CTA template now uses one canvas renderer for its browser preview, PNG, and MP4. It draws the Mogging and App Store icons, circular portrait with the existing face overlay, featured category score and potential rings, and a two-column grid of creator-entered category scores. Rings, numeric values, and stat lines reveal on a shared timeline. Reduced-motion previews display the settled composition. Exports retain the requested animation.

## Initial verification

- Local Chrome with a mocked session and empty library responses; no production data was written.
- Uploaded the bundled model photo, completed real local landmark detection, selected Jaw, entered scores, and generated templates.
- Confirmed the main ring uses Jaw 7.8 rather than the overall score 6.4, alongside potential 8.7.
- Compared early and settled preview frames to confirm animation; replay under reduced motion preserved the settled frame.
- Downloaded the actual PNG and MP4. The video reports 1080 × 1920, four seconds, and no media error.
- Checked the preview at 390px width; increased the preview height from 40dvh to 64dvh for readability.
- Regenerated a square composition with all seven category scores; downloaded and visually inspected the PNG. Keyboard activation was used after the mobile format selector in the automated regeneration check.
- No browser runtime errors. Generator/export regression suite: 28 passing tests. Typecheck, targeted lint, and diff whitespace checks passed.

Samples: `/tmp/mogging-score-reveal.png`, `/tmp/mogging-score-reveal-square.png`, `/tmp/mogging-score-reveal.mp4`.

## Spacing, branding, and mobile-category revision

- Increased the portrait from 224 to 300 logical pixels and expanded section spacing. Simplified the title to Mogging and made the website CTA two prominent lines.
- Replaced the drawn App Store SVG with the exact PNG supplied by the user.
- Delayed the face overlay timeline by 650ms, so geometry visibly draws after the portrait enters. Browser pixel comparisons within the settled portrait confirmed that the overlay continues animating.
- Extended CTA videos to five seconds, preserving four seconds for the other templates.
- Matched all 11 mobile report categories and added its scored overall features: Cheekbone Structure, Skin Quality, and PSL. PSL fields and bars use 0–8; featured PSL potential converts from the shared 0–10 potential using the mobile report's scale conversion.
- Removed seven-stat export truncation. Reveal layouts use three columns above eight stats; the category scorecard also exports every selected value.
- Downloaded and inspected revised vertical and square PNGs, including all 14 scores. Real MP4 metadata: 1080 × 1920, five seconds, no media error. Reduced-motion replay remained settled. No browser runtime errors.

Revised samples: `/tmp/mogging-score-reveal-v2.png`, `/tmp/mogging-score-reveal-square-v2.png`, `/tmp/mogging-score-reveal-v2.mp4`.

## Templates 1–3 polish

- Template 1 now contains only a short editable emotional CTA and mogging.com. Removed technical headers, supporting paragraphs, and floating category tags.
- Template 2 follows the mobile story share layout: shared layout constants, bundled Geist font, gradients, full-face geometry, estimated percentile, neutral rank, and unboxed total/potential scores. Creator uploads are normalized before using the mobile overlay preset. Rank uses the neutral variant because creator photos do not provide gender; no gender is inferred.
- Template 3 uses the real Mogging icon, smaller PSL heading, no redundant report header, and more compact score cards. PSL values and bars use 0–8, converting the shared 0–10 scores when no explicit PSL value is supplied.
- All five previews now use the same canvas renderer as PNG/MP4 export; removed the obsolete separate reveal-preview implementation and copy controls for text that is no longer drawn.
- Local Chrome: real photo detection, animated replay, PNG downloads and four-second 1080×1920 MP4 playback for all three templates. No runtime/media errors. Reduced-motion replay remained settled; inspected the mobile-width preview.
- Visually inspected all three final PNGs. Typecheck, targeted lint, and 34 regression tests passed.

Samples: `/tmp/mogging-template-1.png`, `/tmp/mogging-template-2.png`, `/tmp/mogging-template-3.png`. Changes are local; no deployment performed.
