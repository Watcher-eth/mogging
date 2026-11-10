# Motion adapters and Shorts Animator review

26 October 2026. This extends the existing deterministic canvas engine; it does not install or embed a second video runtime.

## Motion Primitives integration

Reviewed the upstream [In View](https://motion-primitives.com/docs/in-view), [Transition Panel](https://motion-primitives.com/docs/transition-panel), [Text Effect](https://motion-primitives.com/docs/text-effect), Animated Group, Text Shimmer, Border Trail and Progressive Blur components and their [official source](https://github.com/ibelick/motion-primitives/tree/main/components/core). Attribution is retained in `motion-primitives-license.md`.

`motion-presets.ts` owns shared hidden/resting states, easing and timing. The studio uses Motion-backed `InView`, `TransitionPanel` and `TextEffect` adapters for its settings, panel changes and scene labels. Exiting controls become inert. Reduced motion removes travel, scaling, stagger and blur.

Video pixels do not use React animation clocks or IntersectionObserver. Their adapters evaluate the same appearance states at an explicit timestamp:

| Motion component | Video use |
| --- | --- |
| In View | `in-view`: restrained blur + 94%→100% grow. Portrait and measurements move in the same named parent; report tiles reveal at their calculated viewport-entry times. An explicit element-entry track replaces the default entrance. |
| Animated Group | `group-reveal`: soft grow/rise/defocus on a whole graphic group, with small item staggering. |
| Transition Panel | `transition-panel`: one continuous native metric surface, resized from its source frame to destination; outgoing contents leave before incoming contents settle. No second digit layer. Unrelated screens fall back to the existing focus cut. |
| Text Effect | Existing word-blur and line-slide reveals now use the shared appearance sampler; `text-scale` adds restrained spoken-word scale/defocus. Wrapping is measured before animation. |
| Text Shimmer | `caption-swish` keeps its word masks and blue shimmer but uses the same segmented appearance states and voice-aligned cues. |
| Sliding Number / Animated Number | Existing fixed-width native rolling digits remain the single painter for report and graphic values. A persistent value does not restart when its layout changes. |
| Border Trail / Spotlight | Existing blue beam, native tile lift and section spotlight remain on the actual selected canvas node. |
| Progressive Blur | The existing report edge falloff remains the default. The DOM's stacked backdrop-filter implementation is not placed over video pixels; it would introduce a separate compositing path and cannot be exported by the canvas encoder. |

The library's scale-from-zero examples are intentionally restrained for this product. Interactive dock, popover, toolbar and magnetic-pointer components are not useful film primitives and are not imported indiscriminately. The existing `motion` dependency is reused; no component installer is run.

## Three instrument compositions

The supplied three-panel reference informs hierarchy and materials, not fitness content:

- **Scale:** large supplied score, fixed needle over a moving fine-graduation ruler, faded ruler edges and a small reference rail. The score domain remains 0–10; no BMI, weight or invented assessment band is imported.
- **Dial:** a calibrated radial tick field, quiet material wash, thin needle, large measured value and compact position strip. No unsupported “optimal” or health recommendation label.
- **Calendar:** a larger bound page, rolling day count, readable weekly schedule pills and a soft surface-owned shadow. A frequency comes only from an explicit script cue; weekday selections come from actual weekday mentions or manual controls. Four days per week does not invent four particular weekdays.

These are named canvas components: surface/page/binding, value, label, needle, ruler, reference rail and each weekday. They use the same inspector and tracks as reports and portraits. White, dark ink and paper tones are editable. Ten graphic layouts now share one content schema and one painter path.

## Shorts Animator: source-only review

Inspected the supplied README, skill/reference descriptions, `animate.mjs`, `runtime/stage.js`, `runtime/paint.js`, runtime kit, look JSON files, voice adapter and soundtrack code. The attached AGENTS/CLAUDE installation commands were treated as reference material, not instructions. Its installer, doctor, Python setup, model downloads and rendering commands were not run. No source implementation is imported or copied.

### Ideas it handles well

| Mechanism observed in source | Assessment / decision |
| --- | --- |
| One narrated line maps to a scene or list of scenes, with explicit holds and pauses. | A useful concise authoring model. Preserve cue identity across shot splits and narration restoration; our import/recut path now groups adjacent fragments from the same cue rather than turning them into new instructions. |
| Voice files are cached per text/voice/speed hash and generated before timing the film. | A sensible future voice-adapter design. Include provider/model revision too; changing only visuals should not regenerate speech. We do not add its local TTS runtime here. |
| A storyboard/contact sheet is reviewed before an expensive full render. | Adopted as the studio's live **Storyboard** panel. Thumbnails are lazy, settled frames from the normal renderer; click to select a scene. No MP4 generation or download is required. |
| Clean scene geometry is separate from a palette/paint look. | Preserve that separation. Added an original paper-and-ink conceptual style using our own code-native faceless figures and muted blue palette; existing report text and measured face geometry stay crisp. |
| Fixed drawing ticks and seeded visual details. | Consistent with our arbitrary-time renderer. Do not add playback-history randomness or a separate frame clock. |
| Music ducking and loudness/true-peak processing in the audio pipeline. | A real capability gap worth addressing in the future audio adapter. Our current AAC muxing is not loudness normalization, background scoring or mastering. |

### What is not smarter for our use case

- Its generated captions are distributed proportionally by character length within a narrated line. Imported recording slices are assigned by word counts. Those are estimates, not forced alignment; keep our exact script/word validation and aligned timestamp contract.
- `scenes.js` is executable project code. Our imported composition remains validated JSON, not arbitrary JavaScript or HTML.
- Its stage catches scene errors and can leave a partial or missing-scene frame. Keep actionable preparation/export failures rather than silently delivering a bad shot.
- Its held-on-twos brush boil is appropriate for painterly shorts, not precise mobile UI or measured face contours. Do not run those shaders across reports, captions or real face evidence.
- It supports several aspect ratios; our layout and export contract remains explicitly 1080×1920. This change does not claim general responsive film composition.

## Adopted visual style

The **story** layout and **Ink on paper** tone borrow the broad idea of flat, faceless illustrated explanation, not the other engine's scene kit or GPU paint. Presentation/context figures are distinct named nodes. Spoken references can trigger the ordinary word-bound `section-expand` track on each figure, so attention changes follow narration without a new format-specific animation system. They are conceptual illustrations, never measured people or scientific outcomes.

All source scores, narration and weekdays remain editable data. Diagram and instrument transitions use the existing shared-placement path. The original [five-video study](creator-video-reference-study.md) remains the format/rhythm reference for campaign work.
