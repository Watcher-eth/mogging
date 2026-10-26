# Creator visual engine

## Team handoff — no deployment

The work is shared on `codex/cta-studio-motion` in the web and mobile repositories. The web branch disables its own automatic Vercel deployments in `vercel.json`; pushes to this branch are for collaboration only. Neither production branch is updated by this handoff. Keep this rule while iterating on the handoff branch.

Run `bun install` and `bun run dev` in the web repository, then open `http://localhost:3000/creator/__motion-preview` for the bundled sample, or `/creator/cta-generator` for the Post builder. The sample route returns 404 outside development, and the Post builder tab and panel are development-only. Production retains the existing CTA, mock report, and Protocol tabs. Enabling the new studio in production must be a separate release change.

The companion mobile branch contains the portable `report-v2/ui-contract.ts` and the native consumers of that contract. Check out both repositories side-by-side to run `bun scripts/sync-report-ui.ts --check`. The web renderer already includes the contract copy, so running its preview does not require the mobile checkout or an iOS build.

The CTA Studio post builder opens the visual engine using the current post input and uploaded faces. The engine compiles the post into a versioned composition, previews it, and exports silent H.264 MP4 at 1080 × 1920 / 30 fps.

## Contracts

- `video-composition.ts`: validated composition, scene and animation-track schemas; preset compiler; scene selection and retiming.
- `motion-primitives.ts`: 70 registered primitives and pure progress samplers.
- `video-portrait.ts`: cached person segmentation, head-and-shoulders crop, and matching landmark transforms.
- `video-layout.ts`: fixed 9:16 report framing, paired face/metric stages, deterministic entrance easing.
- `script-edit.ts`: custom-script parsing, reading-pace timing and short-shot segmentation.
- `report-choreography.ts`: semantic scrolling, gradient borders, spotlights and native-card expansion.
- `video-renderer.ts`: asset preparation and a timestamp-driven canvas renderer shared by preview, PNG capture and MP4 export.
- `video-project.ts`: local project ZIP export/import with images and landmark metadata.

```ts
const composition = compileAnalysisVideo(plan, input, imageIds, 'brand', reports)
const prepared = await prepareVideo(composition, images)
drawVideoFrame(context, prepared, 12_500, 1080, 1920)
const mp4 = await exportCompositionMp4(prepared, onProgress, abortController.signal)
```

No animation reads wall-clock time, random numbers or playback history. Frames can be rendered in arbitrary order. `requestAnimationFrame` only chooses which timestamp to preview; export evaluates exact 30 fps timestamps.

Every scene has a source (`portrait`, `report`, `component`, `screen`, or `title`), a headline, an optional subtitle, report/score data, and independent animation tracks. The first scene is normalized to full-screen even for legacy imports and reordered projects; opening title/component sources become full-screen reports. Track time is local to the scene, in milliseconds. Camera and gesture anchors use normalized canvas coordinates. Cursor gestures may specify normalized `from` and `to` points. Multiple tracks compose in array order. Transitions use the previous scene's final frame as the outgoing source.

The editor supports scene duration changes, duplication, reordering and removal. Retiming scales local animation times and reflows the later scenes. Tracks expose primitive, start, duration, intensity and focal point. JSON provides the complete composition contract for programmatic authoring.

## Primitive catalog

| Group | Primitives |
| --- | --- |
| Transition (16) | Cinematic flow, screen push, matched reframe, card reveal, hard cut, crossfade, dip to black, exposure flash, wipe left, wipe right, wipe up, zoom cut, whip left, whip right, blur dissolve, glitch slice |
| Report (5) | Feature metric entrance, scroll to section, expand native card, gradient highlight, section spotlight |
| Camera (12) | Canvas framing (legacy), punch in, slow push, pull out, pan left, pan right, pan up, pan down, handheld drift, snap reframe, focus rack, report scroll |
| Entry (9) | Fade in, rise in, drop in, slide in left, slide in right, scale pop, blur in, mask reveal, line draw |
| Exit (6) | Fade out, sink out, slide out left, slide out right, scale down, blur out |
| Text (7) | Type on, word build, kinetic pop, tracking expand, score count, cursor blink, underline draw |
| Cursor (4) | Tap, drag, circle, swipe |
| Cinematic (7) | Letterbox, cyan glow, scan line, privacy bar, freeze frame, split screen, parallax separate |
| Overlay (4) | Landmark stagger, contour trace, metric bar fill, shimmer pass |

Text-specific primitives act on the headline; `score-count` requires a number in that headline. Geometry primitives require a usable face map or category overlay. `report-scroll` acts on report sources. Split-screen can use `secondaryImageId`. Captured screens preserve the source's pixels and aspect ratio; report sources remain editable.

## Reference audit and recipes

The 17 saved contact sheets cover all three source videos at about 2–3 samples per second. They were inspected again during implementation. This is a sampled frame audit, not a reconstruction of every source frame. Transitions shorter than the sampling interval cannot be timed precisely from those sheets.

Observed mechanics drive the default recipes:

- Creator editorial: light report surfaces, crisp matched cuts, readable metric cards and short face cutaways.
- Feature breakdown: faster app navigation with section emphasis and occasional feature crops.
- Mogging editorial: white/light backgrounds, website-style typography, directional screen pushes, rounded card reveals and blue-to-mint UI borders.

The revised defaults use app-led editorial motion rather than the references' glowing type. The legacy fade/glow primitives remain available as explicit choices but are not automatically added.

## Script-directed recutting

Paste narration into the studio and select a reading pace, then choose **Recut from script**. `scriptToPlan` estimates durations from words and sentence boundaries. Report navigation uses short shots; consecutive fragments of one feature explanation coalesce into a single scene rather than restarting its title and meter. `cueId` preserves the sentence identity. The compiler infers the spoken category and section (face scan, overall score, category score, named feature, potential, or action plan). Timing remains an estimate until voice alignment is added.

All report and captured-screen scenes fill the 1080 × 1920 canvas edge-to-edge, including legacy projects that stored smaller or enlarged framing. Full-report camera scaling is disabled. The old layout-scale track is accepted for compatibility but hidden from the library. There is no phone-thumbnail mode. Reports preserve their native logical proportions and scroll inside the full viewport. Full-screen report shots hide external headlines.

Editorial scenes pair a large centered cutout portrait and the correct white category geometry with a native metric below. The selected metric is painted directly by `drawReportComponent`, also used inside the full report, as a full-width mobile row up to 992 px wide. It never crops a report screenshot. The face occupies a 1000 × 1050 stage; the metric sits beneath it without overlap. Closings use the same visual grammar. Captions explicitly load the portal's bundled Geist font and are composed into the same scene surface as the image and metric, so the entire composition transitions together.

Slider/graph/gauge cues and feature explanations select paired feature stages. `component-focus` controls the native metric entrance. Cards fade and settle upward, meter fills and indicators start at zero, and displayed values roll to the exact report value; score denominators stay fixed. Report cards use precomputed viewport-entry timestamps to trigger the same motion as scrolling reveals them. Initially visible cards stagger slightly; continuing the same report does not restart their entrances.

`cinematic-flow` uses one shared scene graph for same-subject app/editorial and editorial/editorial handoffs. The selected component is omitted from its original report location, then drawn once with interpolated bounds. Surrounding app furniture clears before that component travels through the white space. A report whose hero has scrolled offscreen cannot drag a cropped neck across the UI: the centered cutout enters only after the app background clears. Editorial handoffs keep one subject and one metric shell. Text and metric content exchange at the midpoint, while facial measurement geometry morphs continuously. Other explicitly selected transition primitives retain their own behavior.

`section-expand` changes the selected component's bounds before the report painter draws it. It no longer samples a region from the report canvas or stacks a duplicate component above the app. Neighbors remain in place and the component returns to its original bounds.

`overlay-morph.ts` resamples real resolved paths by arc length, matches stable IDs first, and interpolates their vertices. Unmatched paths contract to anchors or grow into the next measurement. Eye-spacing cues use the pupils; inner-eye-gap cues use the inner corners; tilt cues use each eye's inner/outer corner pair. Continuous measuring lights travel along the white paths during holds. All geometry is deterministic at arbitrary timestamps.

Playback uses `@number-flow/react` in positioned HTML slots for numeric values. Those slots replace the canvas glyphs, rather than covering another score. Pausing, scrubbing, PNG capture and MP4 exports use a deterministic canvas rolling-digit adapter with fixed digit widths and unchanged units/denominators. NumberFlow's DOM animation itself is not embedded in exported video. Shared components already visible in a report retain their settled values instead of counting from zero again.

Report exports omit simulated OS clock, notch, signal, battery and home indicator by default while retaining actual app category and share controls. Captured screenshots default to a 6% top / 3% bottom system-UI crop, adjustable per scene through `captureInsets`.

Feature cues such as “highlight eye spacing on the user image” or “show the jaw contour without the report” select a segmented head-and-shoulders portrait with matching white category geometry. The silhouette and remapped landmarks share a uniform contain transform; a subtle shoulder-edge feather removes the rectangular photo boundary. Segmentation uses the existing bundled selfie model and runs once per source, before rendering. Failure blocks export with a specific error instead of silently restoring the photo background. Explicit report/scroll/evaluation cues retain app scenes. Short feature and component captions receive `type-on`; the complete caption is wrapped before revealing characters so earlier words stay in position. An understated chapter label and short rule anchor the headline. Both source and text effects remain manually editable.

`mockReportRegions` exposes the actual painter layout, including content-dependent tile reflow and action-plan heights. Report tracks store semantic section IDs. Scrolling carries its ending position into the next report shot of the same category, while category/share app controls stay fixed. Captured screenshots use an undistorted cover crop; portrait images and overlays share the same crop and camera transform. All legacy report framing resolves to the full canvas.

Report-card values and action-plan content can be edited in the scene panel and reflow immediately. JSON additionally supports explicit `fromScroll` and `toScroll` positions. Region parity tests compare every reported feature's rectangle with its actual painted text coordinates, including longer values that change card rows.

## Mobile UI integration

Editable report scenes reuse `drawMockReport`, the portal's canvas implementation of the mobile report layout, with real category schemas and the shared overlay geometry. They do not execute the React Native screen. `screen` sources accept actual captured app screenshots for native UI pixels. Dynamic native interaction recording is a separate adapter; this implementation animates the captured screen as an image and animates editable reports programmatically.

The mobile app's `report-v2/ui-contract.ts` supplies portable card dimensions, text sizes, spacing and visualization palettes. Native `ExpandedRubricCards` and `RubricVisualization` consume that contract; the canvas adapter consumes its synchronized copy. Run `bun scripts/sync-report-ui.ts --check` from the web repository to verify parity, or omit `--check` after changing the native contract. This shares the visual contract and data, not the React Native runtime. Full reports and editorial components use the same web component painters for scores, feature cards, category scores, potential and action plans.

The renderer keeps the portrait and landmark geometry in the same camera transform. Report scroll preserves the report's fixed chrome and existing parallax behavior. It can use actual report data in `source.report`; the presets start from editable creator fixtures and the entered overall, potential and featured scores.

## Export and reuse

Project ZIP stores `composition.json`, `assets.json` and image bytes. Opening a project validates the timeline and manifest, restores the image URLs and preserves landmark geometry. ZIP imports support the engine's uncompressed ZIP format, up to 80 MB. Composition imports are limited to 180 seconds, 250 contiguous scenes and 30 tracks per scene. Asset IDs resolve locally; composition JSON cannot execute scripts or fetch arbitrary remote sources.

MP4 export uses the existing bounded WebCodecs encoder queue. Cancellation throws through the renderer and closes the encoder/frame resources. Audio is intentionally added in a later stage. Preview honors reduced-motion preferences and pauses when the page is hidden; exported motion follows the authored timeline.

The development-only `/creator/__motion-preview` route exercises the same editor with bundled imagery. It returns 404 outside development and has no private creator data or authentication overrides.
