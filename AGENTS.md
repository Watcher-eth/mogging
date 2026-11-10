# Agent Instructions

## Mandatory Project Skills

When working in this repository, always inspect and use the applicable skills in `.agents/`.

Use Bun for all package management and project commands in this repository. Prefer `bun install`, `bun run ...`, and `bunx ...`; do not use npm, pnpm, or yarn unless explicitly requested.

At the start of any non-trivial task:

1. List the available `.agents/*/SKILL.md` files.
2. Read the relevant skill instructions before editing code.
3. Apply the relevant rules from the skill and its referenced files.
4. If a skill appears relevant but is not applicable, state why before proceeding.

Current project skill folders include:

- `.agents/emil-design-eng`
- `.agents/next-best-practices`
- `.agents/vercel-composition-patterns`
- `.agents/vercel-react-best-practices`

Backend work should at minimum check `.agents/next-best-practices` before implementation. Frontend or React component work should also check the Vercel React/composition skills and `emil-design-eng` when design quality is relevant.

## Creator voice preference

The user prefers Koda (`en-us-koda`), the narrator in the approved round-three Clavicular script, most. Use it more often in future creator videos and use it as the default whenever no voice has been chosen. Match its brisk, upbeat, conversational delivery. Explicit voice choices take precedence.

## Creator catalog continuity

New scripts and characters are additive. Keep existing people, scripts, photos and recordings available, including Zendaya, The Rock (johnson), and Trump. Put newly approved scripts first and select them by default for their character; do not replace the full character catalog with a release subset.

## Creator score narration

Integrate real scores naturally into the story, for example: “His jaw scores seven out of ten on Mogging.” Never narrate assessment provenance or age: no “in this saved/old Mogging report/photo/portrait,” “the front portrait’s report,” or “that number describes the image.” Keep source bindings and assessment details in internal production notes.

Keep the story’s image sequence natural. Do not cut to an older portrait solely to authenticate or deliver a score. Use an appropriate assessed story image; flag a missing assessment internally instead of borrowing another image’s score or writing a spoken explanation for the mismatch. Story-relevant before/after comparisons remain available.

Show revised script wording before generating replacement voiceovers or videos. Preserve existing recordings until the revised wording has been reviewed.

## Creator report layout and tracking

Report/app UI screens always fill the complete video width and height, with captions at the bottom above the TikTok description area. Keep this separate from portrait framing. Do not shrink reports into a portrait card or move their captions to the top when changing photographic scenes.

Feature-outline variation changes drawing treatment, not anatomy. Use current image-specific detector geometry, refine visible edges where supported, and invalidate stale landmark caches when the detector changes. Never displace jaw or cheek paths to manufacture variation, connect an eyebrow into a guessed shape, or substitute a face boundary for a missing cheekbone contour.


## Private follower Studio

Keep non-celebrity follower characters out of the public catalog and public assets. The private workspace belongs to the pinned rizzlord.ratings creator profile; only that owner and w@mogging.com can read or generate its characters. Enforce three new upload jobs per UTC day on the server, and resume the same saved person on retry. Private scripts and assessments must never be written to deployment logs. Keep names optional; the first three starter portraits are unnamed.

## Creator narration tone and invitations

Use plain, concrete feature descriptions. Avoid forced swagger, social-attention claims and slogans such as “brow authority,” “jaw conviction,” “controlled Mogging,” “the pipeline collects attention,” or “Mogging math.” Vary the structure and feature order for each person. Scores must fit the individual, never repeat a default set across people. When the user explicitly requests editorial ratings without an analysis-provider call, keep those ratings identified internally as subjective editorial judgments; never attribute them to a provider or an actual Mogging report. End each new script with a natural, direct Mogging.com invitation tied to the features discussed, and show the usual visual CTA during that closing invitation. Revised narration still requires review before voiceover generation.


## Face effect and scientific evidence direction

- Use a fixed eye line and controlled, reversible changes to one feature. Paired features move together; caption cuts must not restart the morph. Keep other detected features pinned. Texture changes (such as brow contrast) must not be represented as stretched skin. True density/removal needs a registered edited-photo pair.
- In explicitly selected formats using measurement pills, place compact, matching score/measurement pills directly under the actual projected chin. Show matching spoken scores; also select roughly one third of otherwise unlabelled overlay windows deterministically. Preserve the existing two-second overlay hold. Bind assessment scores to the current image, never default/mock scores or an edited face. Ratios and image-plane angles are valid image annotations; never invent cm/mm from an uncalibrated photo or animate a new attractiveness grade from a warp.
- Future scripts should use one or two relevant scientific evidence cards when supported by reviewed primary research. Keep authors, citations, study names and provenance out of the narration. Attach curated study/claim IDs to an exact relevant section anchor in `section.evidence`. Show the card during that claim, with at least three seconds to read it. Keep study populations and limitations in the source registry. A paper never validates an individual's Mogging score or a universal ideal. Do not shrink report UI or move its bottom captions for a citation.


## Text transition and style scope

Use Torph (`torph/react` for web interfaces) for new smooth text/value replacements. Preserve the established caption animation. Canvas video exports use Torph's segment matching with a deterministic video clock. Keep replacement pills intrinsic to their actual content, with a continuous container morph and matching text movement.

Reference videos supply techniques, not a replacement identity for every format. Keep experimental presentation scoped to its selected style. Photographic captions belong at the top; report/app UI captions remain at the bottom. Do not add the “Mogging / Face Studies” heading to videos.

Face overlay material: use translucent, softly diffused glass ink and frosted surfaces. Never add black contour under-strokes, dark marker fills, or black edge shadows to white face guides. Preserve anatomical alignment, line variation and timing.

Preview canvas and MP4 pixels stay 1080 × 1920 (9:16). The simulator models a taller 9:19.5 modern phone, reserving 9% for bottom navigation. Fill the remaining feed with aspect-preserving cover cropping; never stretch the video or center it with empty bars. Keep captions and important annotations inside the crop-safe side margins. Keep the compact scan invitation immediately below the notch/status area, above the feed header, and photographic captions below the feed header. Use the shared header anchor for periodic and closing invitations.

## Reference-driven editorial planning

Use `docs/qoves-elvis-reference.json` for the reviewed QOVES reference, timed visual observations, technique catalogue and script/motion rules. Catalogue statuses distinguish working code from choreography specifications and missing media; do not claim that every reference technique is already rendered.

- Choose one person-specific argument and its evidence before selecting effects. A reported-claim counterexample, campaign reading, chronology and hidden-edit mystery are different structures; vary them instead of rewriting the same hook.
- Keep the source portrait persistent through hero/card/comparison changes. Captions, claims, evidence inserts and annotations have independent lifetimes. Caption splits must not restart an image treatment.
- Time each visual arrival to the relevant recorded phrase. A change from geometry to texture can motivate a material change; a sentence boundary alone does not justify a transition.
- Use `region-patch`, `focus-brackets` and `anchor-ring` as local observations, not new anatomical measurements. Keep clean variants and the two-second hold. The optional brush reveal restores original colour pixels and must be motivated by the narration, never used to whiten skin.
- A quote needs a verified attribution. A turntable needs a reviewed source clip or multi-view asset. A registered line-art reveal needs a registered destination. Never replace missing evidence with invented words, hidden anatomy, coordinates, calibrated units or scores.
- Keep studies attached to exact reviewed claims, readable for at least three seconds. Do not inherit scientific assertions merely because the reference displays citations. Preserve our caption, report, brand and safe-area rules rather than adopting the reference's full visual identity.

Creator video content styles are Mogging Editorial (portrait-audit, report-led, measurement-explainer, hybrid-story), Qoves (feature-study; story scripts only), and Fern (documentary-studio). Derive the content style from the selected recipe; loading people or scripts must preserve it. Reuse the campaign examples carousel for style previews. Fern fits its camera to native image detail instead of relaxing resolution checks.


## Qoves editorial production

Use `docs/qoves-round2-reference.json` alongside the Elvis study for the reviewed November 2026 references. The Qoves content style defaults to `editorial-story`; retain `feature-study` as its alternate recipe. Apply reference planning after saved-story source bindings so the Studio and primitive gallery use the same renderer. Preserve the other content styles and existing recordings.

- Rulers, protractors, drafting props and line-art strokes use neutral grays. Keep photographic colour unchanged. Text carriers stay white with soft shadows and rounded, compact surfaces, including in dark mode.
- Use persistent feature trays, phrase-bound cursor moves, shared tile expansion and three-way comparisons when they advance the argument. A tool prop does not alter pixels; a texture/grooming reveal needs its reviewed registered photo pair. Never relabel three poses as three states of an edit.
- The shared `referenceEditorialBrief` owns script and cut direction for cumulative-tradeoff, prediction/context and claim/counterexample stories. Pass it to future story-generation requests; do not copy reference wording or narrator identity. Exact phrase anchors use the recorded word clock. Missing anchors stay absent.
- A photograph colour strip displays sampled pixels, not a recommendation, population measurement or score. Keep source pages and genuine context footage bound to reviewed assets; never invent charts or scientific results to fill a composition.
