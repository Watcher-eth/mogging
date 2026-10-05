# Mobile overlay engine snapshot

These files are exact copies of `mogging-mobile/src/overlay-engine` so the standalone web deployment can render the same facial geometry without importing files outside its repository.

When the canonical mobile files change, copy `landmarks.ts`, `schema.ts`, `layout.ts`, `resolve.ts`, `enrich-landmarks.ts`, `face-map-points.ts`, and `report-presets.ts` here unchanged and run the creator generator tests.

`processing-presets.ts` snapshots the scan presets and descriptive labels from the mobile onboarding screen. The web analysis and paywall share these presets and the report canvas renderer; the processing sequence starts with the mobile face-map reveal. Sync this snapshot when the mobile scan sequence changes.

The web adapter in `../report-overlay.ts` uses the mobile report line weights, point halos, label styling and timings in a 360-point viewport. The analysis report, creator preview, PNG and MP4 all draw through that adapter. `components/analysis/report-image-panel.tsx` resolves these presets against the loaded photo dimensions and observed viewport; never position normalized image anchors directly as viewport percentages. Always enrich detector contours before resolving indexed presets; raw MediaPipe contour lengths differ from the mobile contract. Real detections never use demo fallback points.

The full face map matches the mobile Skin Age visualization: 160 decorative samples within the detected outline, revealed in 18 bands. These dots are a visualization, not extra measured landmarks or a skin-age prediction.

Mock reports also snapshot `src/data/report.ts` as `report-data.ts` and `src/lib/category-action-plan.ts` as `category-action-plan.ts`. Keep these copies unchanged when syncing the mobile app. `../mock-report.ts` ports the report screen's iPhone dimensions, card layout, typography, colors, gradient and 2.2-second shimmer into the shared preview/export painter. It uses the mobile label layout rather than the web panel's inset labels, and the Overall overlay converts the overall score to PSL, as the mobile screen does.
