# Creator visual engine

## Motion and voice iteration — 26 October 2026

Editorial scenes use a large centered face with a full-width native metric underneath, with a second portrait-focused layout. The compact side-by-side layout is retired; legacy projects normalize it to the centered layout. The same layout resolver drives ordinary frames and shared-element transitions. Category scores expand from their native report row into a readable score card using the existing report component painter. Full report scenes omit navigation/share controls and use the complete viewport with an eased white fade at the bottom. Ordinary mock report exports retain their app controls. Captured-screen scenes retain their source pixels.

The text catalog adds masked line reveals, soft word reveals and spoken emphasis. Line breaks are measured before revealing text. Aligned words drive matching headline-word entrances and emphasis. Defaults use line or word reveals; type-on remains available. Category-to-category app navigation uses screen pushes, creator edits use matched reframing, and editorial handoffs retain shared elements. Portrait contour tracks now control the actual geometry reveal; previously those tracks were ignored on the cutout stage. Cached contour paths avoid resampling unchanged facial geometry on every frame.

### Voiceover contract

The studio accepts local audio plus word timestamps, previews them on the audio clock, and exports H.264 video with an AAC audio track. No speech provider, transcription service or paid generation API is wired yet. A future voice adapter should synthesize the exact output of `narrationText(composition)` and return the audio plus this provider-independent alignment format:

```json
{
  "words": [
    { "text": "Open", "startMs": 300, "endMs": 600 },
    { "text": "eyes.", "startMs": 700, "endMs": 1000 }
  ]
}
```

Times are absolute milliseconds from the start of the supplied audio. Convert provider seconds to milliseconds before importing. Tokens must match the complete timeline narration in order; punctuation and case can differ, but omitted, substituted or extra words fail alignment. Timestamps must be finite, ordered, non-overlapping and within the decoded audio. Number pronunciation must match the script; write spoken numbers in the script when the provider emits words rather than digits.

`alignVideoVoiceover` sets scene boundaries from the first spoken word of each scene, preserves leading and inter-scene silence, and holds the final scene to the audio end. Word times are stored relative to their scene. Text, geometry and report tracks default to the first word; the track editor can bind any effect to a specific spoken word. Audio-aligned scenes cannot be reordered or resized until the audio is detached. Recutting or rebuilding the style detaches it. Project ZIPs include audio bytes and aligned timing, while older silent ZIPs remain supported.

AAC support is checked before encoding; unsupported or failed audio exports report an error. Audio is submitted in bounded PCM packets, drained without intermediate flushes, and muxed with the video. Codec padding may slightly extend the container beyond the authored duration. Preview, PNG and MP4 share the same deterministic visual renderer; only preview uses the audio playback clock.

Motion references informing this iteration: [Animate with springs, WWDC23](https://developer.apple.com/videos/play/wwdc2023/10158/), [Enhance your UI animations and transitions, WWDC24](https://developer.apple.com/videos/play/wwdc2024/10145/), and [Create custom visual effects with SwiftUI, WWDC24, text transitions](https://developer.apple.com/videos/play/wwdc2024/10151/). The implementation uses continuity, stable text layout and restrained stagger rather than branded sequences.

## Unified canvas components

The preview contains one canvas and no positioned HTML numeric layer. Every editable report card, card label, meter and value is a named component painted in its parent's coordinate system. Portrait geometry is a child of the portrait. Headline and image transforms share the scene content scope.

In the track editor, **Animate component** selects a scene group or a specific canvas component. A component track uses `target: 'element'` and `elementId`; it supports transforms, entrances, exits, clipping reveals, expansion and highlights. For example:

```ts
const track = {
  ...createMotionTrack('rise-in', 'element', scene.durationMs),
  elementId: 'scores/current/value',
}
```

The inspector enumerates actual rendered nodes rather than maintaining another coordinate table. Unknown component targets fail preparation with an actionable error. The same nodes render during preview, pause, arbitrary-time seeking and export. Captured screenshots remain single image components; use an editable report source to animate individual controls and metrics.

Portrait preparation caches segmentation separately from the geometry-dependent crop. Changing landmarks or image dimensions rebuilds the crop and remapped geometry together, preventing stale overlay coordinates from surviving face-alignment edits.

## Team handoff — no deployment

The work is shared on `codex/cta-studio-motion` in the web and mobile repositories. The web branch disables its own automatic Vercel deployments in `vercel.json`; pushes to this branch are for collaboration only. Neither production branch is updated by this handoff. Keep this rule while iterating on the handoff branch.

Run `bun install` and `bun run dev` in the web repository, then open `http://localhost:3000/creator/__motion-preview` for the bundled sample, or `/creator/cta-generator` for the Post builder. The sample route returns 404 outside development, and the Post builder tab and panel are development-only. Production retains the existing CTA, mock report, and Protocol tabs. Enabling the new studio in production must be a separate release change.

The companion mobile branch contains the portable `report-v2/ui-contract.ts` and the native consumers of that contract. Check out both repositories side-by-side to run `bun scripts/sync-report-ui.ts --check`. The web renderer already includes the contract copy, so running its preview does not require the mobile checkout or an iOS build.

The CTA Studio post builder opens the visual engine using the current post input and uploaded faces. The engine compiles the post into a versioned composition, previews it, and exports H.264 MP4 at 1080 × 1920 / 30 fps, with AAC when aligned local voiceover is attached.

## Contracts

- `video-composition.ts`: validated composition, scene and animation-track schemas; preset compiler; scene selection and retiming.
- `canvas-layout.ts`: named canvas components, inherited transforms/clipping, inspection and shared placements.
- `motion-primitives.ts`: 87 registered primitives and pure progress samplers.
- `motion-presets.ts`: shared Motion Primitives appearance states and deterministic easing for DOM/canvas adapters.
- `video-explainer.ts`: validated graphic content, ten layouts and their native named component painters.
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

Every scene has a source (`portrait`, `report`, `component`, `screen`, `title`, or `explainer`), a headline, an optional subtitle, report/score data, and independent animation tracks. Legacy opening title/component sources become full-screen reports; portrait-audit openings retain their portrait framing, and explainer openings retain their native graphics. Track time is local to the scene, in milliseconds. Camera and gesture anchors use normalized canvas coordinates. Cursor gestures may specify normalized `from` and `to` points. Multiple tracks compose in array order. Transitions use the previous scene's final frame as the outgoing source.

The editor supports scene duration changes, duplication, reordering and removal. Retiming scales local animation times and reflows the later scenes. Tracks expose primitive, start, duration, intensity and focal point. JSON provides the complete composition contract for programmatic authoring.

## Primitive catalog

| Group | Primitives |
| --- | --- |
| Transition (20) | Transition panel, graphic layout morph, focus cut, luma cut, cinematic flow, screen push, matched reframe, card reveal, hard cut, crossfade, dip to black, exposure flash, wipe left, wipe right, wipe up, zoom cut, whip left, whip right, blur dissolve, glitch slice |
| Report (8) | Blue border beam, lift tile to center, spoken checklist check, feature metric entrance, scroll to section, expand native card, gradient highlight, section spotlight |
| Camera (12) | Canvas framing (legacy), punch in, slow push, pull out, pan left, pan right, pan up, pan down, handheld drift, snap reframe, focus rack, report scroll |
| Entry (11) | In-view blur grow, animated section, fade in, rise in, drop in, slide in left, slide in right, scale pop, blur in, mask reveal, line draw |
| Exit (6) | Fade out, sink out, slide out left, slide out right, scale down, blur out |
| Text (12) | Text Effect scale, spoken shimmer captions, masked line reveal, soft word reveal, spoken emphasis, type on, word build, kinetic pop, tracking expand, score count, cursor blink, underline draw |
| Cursor (4) | Tap, drag, circle, swipe |
| Cinematic (8) | Regroup feature points, letterbox, cyan glow, scan line, privacy bar, freeze frame, split screen, parallax separate |
| Overlay (6) | Measurement sweep, landmark halos, landmark stagger, contour trace, metric bar fill, shimmer pass |

Text-specific primitives act on the headline; `score-count` requires a number in that headline. Geometry primitives require a usable face map or category overlay. `report-scroll` acts on report sources. Split-screen can use `secondaryImageId`. Captured screens preserve the source's pixels and aspect ratio; report sources remain editable.

## Reference audit and recipes

The [reference study](creator-video-reference-study.md) breaks down all four detailed-analysis campaign posts plus the supplied kinetic infographic, including time ranges, source links, sampling limits and reusable visual grammar. The remote posts were sampled from their official players, not downloaded; their exact original-frame and word timing is unverified. The supplied recording was decoded across all 1,751 frames for motion measurements, with denser visual inspection around major layout changes.

Observed mechanics drive the default recipes:

- Creator editorial: light report surfaces, crisp matched cuts, readable metric cards and short face cutaways.
- Feature breakdown: faster app navigation with section emphasis and occasional feature crops.
- Mogging editorial: white/light backgrounds, website-style typography, directional screen pushes, rounded card reveals and blue-to-mint UI borders.

The revised defaults use app-led editorial motion rather than the references' glowing type. The legacy fade/glow primitives remain available as explicit choices but are not automatically added.

**Visual format** and **Variation** rebuild from the current narration script. Five recipes share the same scene/track renderer: App-led analysis, Portrait feature audit, Measurement explainer, Minimal kinetic explainer, and Explainer + app proof. Seeds vary arrangement and white/ink treatment, never the supplied scores or narration. Twelve tested seeds across five recipes produce sixty deterministic configurations; this is a constrained vocabulary rather than sixty separately authored films.

Image-free explainer scenes support statement, comparison, scale, dial, calendar, story, constellation, pillars, sequence and evidence layouts. All cards, labels, values, rulers and illustrative points are code-native named components. Comparison cards can shrink into the following routine's context rail without losing their identities or restarting their values. `layout-morph` interpolates the actual roots and matching unchanged children; unchanged contents stay visible while changed content leaves and enters. A constellation followed by a spoken split/groups cue preserves the point IDs and adds `graphic-regroup`, which can bind to aligned narration. Minimal explainers retain complete sentence beats; hybrid explainers keep explicit app-proof cues as editable report scenes.

The scene panel exposes graphic layout, tone, item labels/values, add/remove and illustrative dot count. Its normal component inspector targets the same native nodes. Counts come from explicit script content; constellation marks are labeled illustrative and are not fabricated study populations or face landmarks. The engine does not infer research results from reference videos.

The graduated ruler, radial instrument and calendar use the supplied minimalist reference's hierarchy without importing its fitness claims. The calendar reads actual weekdays/frequency from the script and offers manual weekday toggles; it does not invent a schedule. Paper-and-ink story illustrations use conceptual faceless figures with ordinary word-bound emphasis tracks. The live **Storyboard** panel renders settled, lazy-loaded shot thumbnails through the same canvas renderer, without downloading video. See [motion adapters and the Shorts Animator review](creator-animation-adapters.md) for source references, architecture comparisons and deliberate exclusions.

## Script-directed recutting

Paste narration into the studio and select a reading pace, then choose **Recut from script**. `scriptToPlan` estimates durations from words and sentence boundaries. Report navigation uses short shots; consecutive fragments of one feature explanation coalesce into a single scene rather than restarting its title and meter. `cueId` preserves the sentence identity. The compiler infers the spoken category and section (face scan, overall score, category score, named feature, potential, or action plan). Timing remains an estimate until a voiceover and word alignment are attached.

All report and captured-screen scenes fill the 1080 × 1920 canvas edge-to-edge, including legacy projects that stored smaller or enlarged framing. Full-report camera scaling is disabled. The old layout-scale track is accepted for compatibility but hidden from the library. There is no phone-thumbnail mode. Reports preserve their native logical proportions and scroll inside the full viewport. Full-screen report shots hide external headlines.

Editorial scenes pair a larger centered cutout portrait and white category geometry with a foreground native metric card. The selected metric is painted directly by `drawReportComponent`, also used inside the full report, as a mobile row up to 992 px wide. It never crops a report screenshot. The portrait and metric share the named layout in `video-layout.ts`; the card overlaps the lower portrait by roughly 200 px, with a soft shadow owned by its surface node. Labels, meters and values never cast their own shadows. Full reports retain flat native cards. A small app-icon/wordmark lockup replaces the category eyebrow and decorative rule; it is independently targetable as the `brand` node. Captions use the bundled Geist font and share the scene surface with the image and metric.

Slider/graph/gauge cues and feature explanations select paired feature stages. `component-focus` controls the native metric entrance. Cards fade and settle upward, meter fills and indicators start at zero, and displayed values roll to the exact report value; score denominators stay fixed. Report cards use precomputed viewport-entry timestamps to trigger the same motion as scrolling reveals them. Initially visible cards stagger slightly; continuing the same report does not restart their entrances.

`cinematic-flow` reads the canonical scene placements and interpolates matching portrait, headline and metric nodes. It calls the ordinary scene renderer once for the visible tree, switching data at the low-opacity midpoint. Image and facial geometry remain in the same parent coordinate system throughout. Layout inspection uses the same painters; completed source layouts are cached per prepared composition. There is no separate cutout/card handoff painter.

Unrelated screens use a 360 ms `focus-cut`: exchange the whole scene at peak defocus with a restrained push, then resolve sharply. Closing chapters use a 280 ms `luma-cut`, exchanging at a dark shutter midpoint. Neither blends two readable layouts. Continuing the same report cuts immediately; shared subjects keep `cinematic-flow` at up to 620 ms. Legacy non-shared `cinematic-flow` tracks fall back to the focus cut rather than a paper wipe. Reduced motion bypasses all transition travel, blur and shutter effects. Existing projects retain their authored track durations; recutting applies the new defaults.

`section-expand`, gradient outlines and spotlights resolve through the component's own canvas node. Parent transforms carry its text, values, meters and children together. Highlight borders are painted by that node, and expansion respects the viewport width. No duplicate component or screenshot patch is placed over the report.

`border-beam` traces a light-blue traveling segment around a selected tile. `section-lift` uses the node's actual world transform to enlarge and center it, then return it exactly; the report paints that tile last, once, so surrounding cards cannot cover it. Adding a highlight no longer changes a report source into a standalone component. Clipping paths are cleared before descendant painters run, preventing accidental strokes along viewport boundaries. Default report scrolls now take up to 1500 ms rather than 900 ms.

Shared metric roots and their white surfaces stay visible throughout a handoff. Their bounds resize continuously; outgoing label/meter/value nodes leave before the incoming children settle with a short stagger. The renderer does not fade the whole card to zero or draw a replacement card over it.

New editorial captions default to `caption-swish`: stable word positions, a masked left-to-right reveal, restrained vertical settle and a light-blue shimmer. `captionWordCues` uses matched speech timestamps when supplied, including pauses; unmatched title words use ordered positions in the same speech timeline. Without alignment, timing is explicitly estimated from narration. Recutting applies this default to existing projects.

Editorial action-plan scenes use only larger checkbox/text rows on white, without the report header, score explanation or enclosing card. Recommendations still come from the shared action-plan data. A row checks after its matching spoken action finishes, or from an explicit `todo-check` track targeting `action-plan/item:0` (or another row). Unmentioned actions stay unchecked. These are presentation cues, not saved user task-completion state.

Jaw video overlays use the detected lower jawline between the actual jaw anchors, interpolated locally through the measured contour. Closed cheek polygons and diagonal jaw-to-chin shortcut lines are removed; insufficient geometry is omitted rather than fabricated. `measurement-sweep` and `landmark-halo` add optional light-blue emphasis to the same contour/anchors in report and portrait scenes.

`video-face-treatment.ts` owns detected feature contours and their presentation. Narration selects actual app anchors and contour families: pupil spacing, inner corners, upper/lower lids, brows, nasal bridge/base, lip sections, chin/jaw, cheeks and the facial perimeter. General hooks no longer default to an eye/mouth loop. The app preset supplies native path metadata; only observed source points are used, and low-confidence geometry is suppressed. Cross-face baselines, arbitrary boxes and inferred bone measurements remain excluded. A cue-seeded seven-beat sequence varies studio isolation, moving grazing light, rim/soft light, progressive traces, opposing traces and sparse anchors on a 2.4-second clock. Non-lighting categories use local paths, segment sweeps and anchors instead. Eyes, nose, cheeks and hairline can use feathered multiply/soft-light exposure emphasis. A reusable gradient-only surface gates the effect to a soft face envelope, keeping white portrait backgrounds clean without redrawing or downsampling the photograph. This is cinematic 2D emphasis, not a physically reconstructed light field. Lighting precedes geometry; angled cheek studies alternate lighting-only and contour beats. Angle arcs require an explicit angle/corner/direction cue, with short local tangent rays rather than a triangle spanning the face. Reduced motion preserves a static presentation. Generic anatomy uses the bundled CC0 Khronos skull, never a reconstruction of the subject; see `creator-anatomy-assets.md`.

## Dashboard and proof choreography

Score comparisons and sparse score summaries use a reusable dashboard layout: subtle light-gray rounded panels on white, left titles, right values, and straight, curved, segmented or tracking rulers. All values come from supplied report inputs. Single-value summaries can retain supplied feature-score context rather than leaving an empty score in the middle of a slide. The active spoken category expands into a hero panel while sibling panels contract into a 1:2 bento; measured word starts drive these handoffs when available, otherwise timing is explicitly estimated. Groups reuse the existing motion-primitives appearance sampler and shared component IDs, so entry and layout morphs do not duplicate labels or gauges. Meter geometry is clipped inside its owner panel. Overall/potential hero scores never receive border beams; beams are restricted to actual metric tiles.

For videos at least ten seconds long with a source image, compilation reserves at least two fully visible seconds of report/app proof inside the first ten seconds, allowing transition time. PCM assembly and measured-word alignment recheck the window without changing original narration or word IDs. Short consecutive cues can keep the same report on screen across their cut boundaries. Marlon and Johnson each also have two authored white industrial explainers. Source/usage and illustrative-data notes remain in composition/project metadata, not a rendered footer; retain required source attribution in accompanying publication credits.

Playback, pause, scrubbing, PNG and MP4 all paint the same canvas digits with fixed-width cells and stable units. The HTML NumberFlow slots and their coordinate export adapter have been deleted. A value never changes renderer when playback starts or stops.

Video report scenes omit app and simulated OS chrome and use an eased bottom fade. Ordinary app-style mock reports retain their controls. Captured screenshots default to a 6% top / 3% bottom system-UI crop, adjustable per scene through `captureInsets`.

Feature cues such as “highlight eye spacing on the user image” or “show the jaw contour without the report” select a segmented head-and-shoulders portrait with matching white category geometry. The silhouette and remapped landmarks share a uniform contain transform; a subtle shoulder-edge feather removes the rectangular photo boundary. Segmentation uses the existing bundled selfie model and runs once per source, before rendering. Failure blocks export with a specific error instead of silently restoring the photo background. Explicit report/scroll/evaluation cues retain app scenes. New captions use `caption-swish`; the complete caption is wrapped before revealing words so earlier words stay in position. The small original brand lockup anchors the stage. Both source and text effects remain manually editable.

`mockReportRegions` is the single source of report layout, including content-dependent tile reflow, eye-color rows, growth headings, source cards and action-plan heights. Drawing, scroll extents, entrances and the component inspector consume that layout. Report tracks store semantic component IDs. Scrolling carries its ending position into the next report shot of the same category.

Report-card values and action-plan content can be edited in the scene panel and reflow immediately. JSON additionally supports explicit `fromScroll` and `toScroll` positions. Region parity tests compare every reported feature's rectangle with its actual painted text coordinates, including longer values that change card rows.

## Mobile UI integration

Editable report scenes reuse `drawMockReport`, the portal's canvas implementation of the mobile report layout, with real category schemas and the shared overlay geometry. They do not execute the React Native screen. `screen` sources accept actual captured app screenshots for native UI pixels. Dynamic native interaction recording is a separate adapter; this implementation animates the captured screen as an image and animates editable reports programmatically.

The mobile app's `report-v2/ui-contract.ts` supplies portable card dimensions, text sizes, spacing and visualization palettes. Native `ExpandedRubricCards` and `RubricVisualization` consume that contract; the canvas adapter consumes its synchronized copy. Run `bun scripts/sync-report-ui.ts --check` from the web repository to verify parity, or omit `--check` after changing the native contract. This shares the visual contract and data, not the React Native runtime. Full reports and editorial components use the same web component painters for scores, feature cards, category scores, potential and action plans.

Editorial portrait stages, including category, overall and potential scores, use borderless titles, original values and industrial timelines over a full-width progressive blur-to-white neck fade. Their timelines share the dashboard instrument painter, without duplicate mini-scales. Ticks stagger in, numeric values roll, and qualitative values track beneath the cursor. Native in-app report cards retain their own visualization contract. Branding belongs to the centered footer, not the feature stage.

Shared transitions measure layout without rasterizing photos, lighting fields, progressive blur or anatomy. Non-shared cuts cache the settled outgoing scene and cross-dissolve continuously rather than switching images at their midpoint. Face instruments use detected anchors for pupil and inner-eye spans, canthal guides, facial thirds and bilateral comparisons in the eye-aligned coordinate frame. Oblique views suppress frontal comparisons; profile geometry uses the same cropped coordinates as its portrait.

All editorial comparison and pillar grids, including the qualitative Marlon and Johnson explainers and sequence context panels, share the near-white rounded instrument panels and timeline painter. Qualitative panels retain descriptions without fabricated scores. Inactive graduations keep a contrast floor, including on curved instruments. Grid entrances avoid full-panel blur, and shared transitions fade changed ruler treatments rather than swapping them abruptly. Different background tones use a continuous dissolve instead of a shared-layout midpoint switch.

Sequence context panels occupy the full 960-point content width, rather than shrinking into thumbnail-sized objects; routine rows fit below them in the same centered content group. Report portrait fades are independent of hero dimming and use one continuous gradient with an opaque tail, preventing image-edge seams during tile lifts. Dissolves use a restrained center-anchored push-in that settles exactly into the next scene without full-frame blur.

The renderer keeps the portrait and landmark geometry in the same camera transform. Report scroll preserves the portrait/geometry parallax relationship. It can use actual report data in `source.report`; the presets start from editable creator fixtures and the entered overall, potential and featured scores.

## Export and reuse

Project ZIP stores `composition.json`, `assets.json` and image bytes. Opening a project validates the timeline and manifest, restores the image URLs and preserves landmark geometry. ZIP imports support the engine's uncompressed ZIP format, up to 80 MB. Composition imports are limited to 180 seconds, 250 contiguous scenes and 30 tracks per scene. Asset IDs resolve locally; composition JSON cannot execute scripts or fetch arbitrary remote sources.

MP4 export uses the existing bounded WebCodecs encoder queue. Cancellation throws through the renderer and closes the encoder/frame resources. Aligned local voiceover is muxed as AAC; automatic voice generation remains a separate adapter. Preview honors reduced-motion preferences and pauses when the page is hidden; exported motion follows the authored timeline.

The development-only `/creator/__motion-preview` route exercises the same editor with bundled imagery. It returns 404 outside development and has no private creator data or authentication overrides.

## Evaluation examples and captions

The studio offers five complete 40–70 second example scripts, one for each existing format: app-led analysis, portrait feature audit, measurement explainer, minimal kinetic explainer, and explainer with app proof. Each uses the current input scores and its own reading pace. Load one and play it directly; no MP4 download is needed. The app-led hook and portrait audit use shorter shot targets, measured contour traces, and restrained portrait reframes.

All captioned scenes share the speech-led lyrics painter described in [the caption design study](creator-caption-design.md). Precise narration synchronization still requires an aligned voiceover; these examples do not generate speech automatically.
# Editorial portrait direction

The Marlon and Johnson examples now use a persistent `study` in each script direction: a chapter `id`, a deliberate `operation`, an `activeId`, and up to three labeled photo/feature `references`. Operations are establish, planes, contour, light, inspect, compare and recap. These are explanatory choices, not randomly selected decoration. The native renderer retains reference identities while the subject reframes; the recap enlarges those same references into a contact sheet. Reference photos are included in the project asset manifest even when they never occupy the main portrait slot.

Reference entrances use the chapter clock; repeated sentences within one operation share its original start time. Neither resets at a sentence cut. Study shots omit generic slow-push camera tracks, and different-image handoffs within a chapter keep evidence stationary. The main portrait uses the full width with smaller, rounded feature cutouts floating near the outer edges. Their positions leave the central face unobstructed, and labels sit inside the images. Thin background-colored separators replace edge glow. A barely visible drafting grid fades into the page. Contour/inspect operations use active anatomy; establish/compare operations use whole-face reference instruments. Feature crops also paint their registered overlays throughout the evidence rail and recap. Every crop expands to the rounded aperture's aspect ratio and fills it edge-to-edge, rather than showing unequal gray letterboxing. Recaps partition one shared photograph through a bento of rounded apertures, preserving a common source scale and offset. The photo starts assembled, opens into separated pieces, holds, then rejoins without missing source pixels; one operation clock spans caption cuts. Reduced motion holds the separated state. The first evidence photo supplies this mosaic; each category's geometry is regenerated on that actual photo, not copied from another view. Cheek evidence occupies the upper tile; lower details follow their source-image horizontal positions. Orbital detail labels sit inside frosted image corners; recap labels appear as light pills beneath the separated pieces and fade away before reassembly. Qualitative bone panels use the bundled 3D anatomy and bounded illustrative morphs rather than abstract trapezoids or unmeasured numeric-looking sliders. Captions continue to use the existing word-aligned renderer.

Portrait cues support `editorial: "context" | "detail" | "compare"` in the existing scene JSON and the scene editor. Context establishes the whole portrait; detail enlarges detected anatomy; compare offsets the portrait beside a registered detail crop. Missing geometry suppresses the inset rather than inventing a feature position. Source images, script ranges and word-aligned caption timing remain unchanged. Staging survives project ZIP round trips and same-script recuts.

Marlon and Johnson examples use these compositions and revisit earlier portraits to resolve their opening argument. New example narration requires a new voiceover/alignment; existing recordings are not rewritten. Reload an example to get its updated script and direction.

Face treatments now follow the spoken subject instead of hashing cue IDs or cycling styles every 2.4 seconds. Paired contours reveal together with a short stagger; profile contours settle rather than disappear periodically. Feature lighting now uses a subject-masked 2.5D shader, with approximate normals registered to detected anchors; glass geometry remains separately clipped to the face boundary. Cutouts use source-colour-guided mask enlargement during preparation, not per-frame processing. This improves edge alignment but does not reconstruct missing hair strands or provide physical 3D relighting.

Caption typography, word highlighting and timing stay in the existing caption renderer. White editorial stages use its dark-ink path; full photographs keep their existing protected light captions. Different-photo cinematic handoffs add coordinated lateral travel and a shallow arc; same-photo reframes retain the shared-element path. Reduced motion bypasses spatial transitions.

## Portrait instruments and effects

Borderless portrait metrics place category left and numeric score/unit right on one shared header row. Qualitative values remain beneath the cursor. The shared timeline painter offers linear, arc, segmented, tracking, shallow-arc and balanced treatments, selected from the category and metric semantics rather than the item index: angular contours use arcs, eye/brow shapes use shallow arcs, bilateral relationships use balanced scales, surface conditions use segments and projection/change uses tracking. Alternate variants stay in the appropriate instrument family. Every graduation retains its contrast floor throughout entry.

Unchanged instrument-grid content retains the same item order, layout and ruler style across consecutive cues, including imported projects. Saying another category does not move or resize its tile. New or changed content may introduce a new arrangement. A shared caption-height budget for each unchanged grid run prevents vertical jumps between short and long cues. First entrances are staggered, and qualitative diagrams draw along their paths; continued objects stay settled. Two-item grids use equally substantial panels so the second visualization cannot be clipped beneath its header.

See [portrait effects and illustrative studies](creator-image-studies.md) for glass contours, region outlines, subject-masked selective lighting and cursor-driven liquify. These settings live in scene JSON and follow the original script timing. The caption renderer and measured word IDs are unchanged.

The web report and mock report share `face-treatment`, `glass-overlay` and `metric-timeline` primitives. Video-specific modules re-export these primitives rather than retaining competing renderers. Curved instruments fill their apertures, use fewer rounded graduations and place cursor labels below the complete measurement boundary. Report instruments use actual supplied positions and scales, including eight-point PSL scores; unavailable measurements show no invented cursor. Eye and hair color remain color palettes rather than numeric instruments. Web report grids interleave graphics and observations without shuffling either sequence. The same report presentation is maintained in the separate `moggingnew` webapp checkout. Score calculation and caption timing are unchanged.

Sparse straight and curved instruments use widely spaced rounded graduations and a warm orange cursor. The web Overall grid preserves its authored order while alternating graphic and score-only tiles. Its portrait shares the existing static three-layer progressive blur with course imagery, combining softly feathered edges and a broad white shoulder fade without adding an animation loop.


## Creator preparation workflow

The creator screen has one person selector, five recipe-backed styles, a tall phone preview with liquid-glass controls, and one large Download video action at the bottom. It does not expose script/voice editing, the advanced example library, project imports/exports, or a second toolbar. Its selection and recipe are the only authored UI state; composition is derived from them, so stale competing timelines cannot survive a style change.

`video-layout.ts` owns the current video size: 1080 × 2340 (9:19.5). Composition validation, compilation, preparation surfaces, the live canvas, the GPU wave and MP4 export use those dimensions. The video fills the matching phone display without object-fit cropping, added inset padding or nonuniform scaling. Layout whitespace belongs to the rendered video: caption side insets, top safe space, portrait stages, metric positions, graphic centering and footer clearance are authored for the taller canvas. Native app reports use the taller viewport to show more content at the same scale. Legacy 1080 × 1920 project metadata migrates on parse, preserving narration and timing while adopting the current layout.

The five styles use the same compiler and renderer: portrait study, app walkthrough, feature breakdown, kinetic type and visual story. Style selection restarts the preview, waits for the new prepared composition, runs the 420 ms preview-only refraction wave, and resumes playback. Rapid changes only commit the latest preparation. Reduced motion shows the new frame immediately without autoplay. The wave is not included in exported pixels.

`creator-catalog.ts` owns subjects and production briefs. Marlon and The Rock reuse the existing photo-study scripts and supplied images. Obama and Clavicular have drafts and need photos. Custom uploads accept 1–3 JPG/PNG/WebP originals, up to 20 MB each, with a short edge of at least 1080 px and a long edge of at least 1920 px. Dimensions and face detection must pass before replacing the current person. Larger originals are encouraged; upscaling is not a quality improvement. Built-in legacy sample images retain their actual sizes for review.

The source script, speech generation, alignment and project-packaging libraries remain available for production preparation outside this simplified screen. This creator preview currently exports silent MP4s and says so beside Download; finalized voice assets are still pending. No request queue, access-control changes or deployment was introduced.

White-slide content uses one 960px column with 60px side margins, shared by captions, report metrics and graphic groups; editorial portraits extend to the full 1080px video width. Top captions start at y=260 below the phone UI. Portrait stages are 1720px tall and center unused vertical space around the subject, keeping the portrait composition centered and larger without stretching. The prepared cutout trims excess side space using the detected face outline while retaining the complete head and registering overlays into that same crop.

The creator studio now applies the authored visual directions by recipe: Visual story uses complete photo-study chapters, lighting, evidence details, recap mosaics and app proof; Portrait study uses the authored portrait chapters; Kinetic type keeps authored explanatory diagrams. Other beats choose existing anatomy and photographic primitives from the narration rather than falling back to empty statement slides or repeating default scores. Connective sentences retain the established illustration. Expression graphics include their photo in the project manifest even when the video starts with an explainer.

Repeated portrait metrics use one elapsed clock across matching consecutive scenes. Unchanged graphics hold their layout; unrelated graphics crossfade without an empty morph midpoint. Shared target geometry is cached rather than re-measured for every frame. `videoMotion` owns the 300ms editorial cut cap, 420ms portrait entrance and 420ms style wave. Portrait cutouts remove additional unused side space while keeping the complete head, and illustrated panels use larger apertures within the shared safe column.

The mobile report adapter follows `mogging-mobile/src/lib/metric-timeline.ts`, `report-portrait-fade.tsx`, `report-v2/rubric-cards.tsx` and the report potential/checklist sections. Report rulers render directly in logical phone points: 10px end insets, mobile tick counts, weights, opacity and blue/warm cursors. Their width no longer depends on available height. Feature order, 16px card padding, 22px corners and `#fafbfc` surfaces follow mobile. The portrait uses four cached progressive blur layers, the seven-stop white fade over its lower 44%, and separate 6%/4% side fades. Potential uses the green-to-blue progress bar, glass target marker, current/delta labels and borderless native checklist.

White-slide portraits, floating detail groups and recap mosaics share the portrait stage center. Wide source crops convert normalized vertical face height to horizontal image units before sizing, so landscape portraits no longer shrink unnecessarily. Reference apertures follow their highlighted feature: wide for upper-frame, eye and mouth studies; taller for jaw taper and nose studies; source-aware for other details. Floating cutouts use a subtle 5px background-colored border, 40px corners and no edge glow. Landscape details are 320px wide and portrait details are 250px wide, inset 32px from the video edges to reduce overlap with the main face. The recap keeps its separator only while its tiles are apart.

Editorial portraits use the full video width from y=460 through y=2180, including scenes with floating evidence. Detail zoom is capped at 1.45× the contained image size, and focal offsets clamp to the photograph so the composition retains surrounding context. A narrow 1.8% side feather softens full-width edges while preserving the existing bottom fade. Evidence cards retain their own safe insets.

### Narrated overlays and continuous cuts

Portrait preparation resolves face geometry from the actual narration, including authored editorial studies. Distinct sentence-level cues follow the same spoken-word timestamps as captions and recorded voiceover alignment. Identical geometry is held rather than revealed again. Contour changes on the same photograph use distance-sampled path interpolation, with independently dissolving measurement instruments and a slightly stronger default glass opacity. Continuous face shots retain their overlay through the cut; changes of photograph do not morph unrelated anatomy.

Report-to-editorial boundaries use the `liquid-ripple` primitive, sharing the style-picker refraction shader. The video renderer updates the incoming texture as the scene animates, so this transition also runs during MP4 rendering. The wave lasts at most 420 ms and shortens for short beats; report-to-report continuity keeps its existing transition. A continuous dissolve handles unavailable WebGL, while reduced motion directly selects the settled incoming frame. Within-face changes use geometry morphs rather than a ripple.


### Studio post submission

`/creator/video-studio` is gated by `creator_profiles.video_studio_access`; admins enable it through Creator access. The page and `/api/creator/studio` enforce the gate independently. The development motion preview remains untracked; `?submit=preview` opens an explicitly non-persisting dialog preview.

After an encoded MP4 is registered, its hash and actual audio-aligned composition are saved in `creator_studio_generations`. This immutable snapshot includes the subject/story, script revision and sections, image IDs, recipe/variation, cuts, word timings, overlays and motion tracks. Download opens the embedded post-link dialog. Recent unsubmitted exports can be reopened after posting.

Feature breakdown (`measurement-explainer`) selects the existing Face Feature Comparison campaign. All other styles require the existing Detailed Analysis **MGC** campaign (`terms.mgcSourceCampaignId`); they cannot silently fall back to regular Detailed Analysis rates. Campaign audience restrictions also apply. Saved campaign terms govern later earnings; no new payout formula is introduced.

A posted studio video is an ordinary non-draft submission linked through `studio_generation_id`, with no analytics or earnings at registration. It is excluded from the approval queue until its first milestone analytics are submitted. The first action is Review; later cycles use the existing rereview flow. Analytics and payments remain on the same submission, allowing attribution joins to the immutable generation.

Migration `0068_creator_studio.sql` adds the access flag, immutable generation records and submission link. The Studio release is integrated with current main's campaign audience and shared-budget reservation services. Studio posts use the existing MGC saved terms; the campaign owner row governs budget availability. Early access is enabled for the existing three selected creators on the MGC campaign, and can be managed through Creator access.

Local integration verification: load the schema into a disposable localhost PostgreSQL database, then run `STUDIO_TEST_DATABASE_URL=postgres://USER@127.0.0.1:PORT/DATABASE bun test lib/creator/studio-submission.test.ts`. Storage verification alone is stubbed; registration, ownership, idempotency, saved rates, queue eligibility and review transitions use the real database.
