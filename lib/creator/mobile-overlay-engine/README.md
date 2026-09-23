# Mobile overlay engine snapshot

These files are exact copies of `mogging-mobile/src/overlay-engine` so the standalone web deployment can render the same facial geometry without importing files outside its repository.

When the canonical mobile files change, copy `landmarks.ts`, `schema.ts`, `layout.ts`, `resolve.ts`, `enrich-landmarks.ts`, `face-map-points.ts`, and `report-presets.ts` here unchanged and run the creator generator tests.

The web adapter in `../report-overlay.ts` uses the mobile report line weights, point halos, label styling and timings in a 360-point viewport. Preview, PNG and MP4 all draw through that adapter. Always enrich detector contours before resolving indexed presets; raw MediaPipe contour lengths differ from the mobile contract. Real detections never use demo fallback points.

The full face map matches the mobile Skin Age visualization: 160 decorative samples within the detected outline, revealed in 18 bands. These dots are a visualization, not extra measured landmarks or a skin-age prediction.
