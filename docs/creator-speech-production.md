# Script, performance and audio timing

The creator studio now uses the [modular production workflow](creator-modular-production.md), including section cuts, ranked visuals, reusable recordings and audio export. The two studies below remain historical renderer fixtures; they are not the new studio campaign scripts.

## Two editable studies

- **Marlon · One face, three perspectives**: approximately 67 seconds. One argument: defined cheek contours and a tapering lower face contrast with the softer mouth. The observations explain relationships rather than announcing shots or effects.
- **Dwayne Johnson · Contour, structure, expression**: approximately 70 seconds. One argument: jaw width, border definition and expression are different characteristics, illustrated through a broad lower frame, generic mandible anatomy and the smiling portrait.

These are visual studies, not numeric celebrity evaluations. Report values remain illustrative. Supplied photos are local editorial references; no redistribution license or endorsement is assumed. Confirm usage rights before publishing.

Authored directions select explicit `imageId` values; missing IDs fail validation. Same-script recuts preserve image, profile annotation and delivery. Every sentence receives the intended direction even when a paragraph has multiple sentences. A directed sentence owns one scene, preventing automatic shot splitting from assigning a later photo or performance note halfway through it. Camera/rendering instructions stay in visual direction; source and illustrative-data notes remain in project metadata rather than spoken narration or a video footer. Early app-proof scheduling may change a cue's visual treatment, never its approved words.

The earlier campaign study was visual, not a transcript audit. A fresh attempt to retrieve TikTok narration encountered sign-in/age gates; no source transcript was invented. These scripts are original commentary on supplied photos, not a claimed transcription or close copy of QOVES videos.

## Voice configuration

The requested character names are performance references, not official Gemini voice IDs. Each composition uses one stock voice, not several personalities switched between sentences.

| Study | Voice | Performance |
| --- | --- | --- |
| Marlon | Puck, upbeat | Precise, quietly commanding authority; warm late-night texture; contained playful curiosity. Around 175 words/minute as a prompt target, not a guaranteed speed setting. No hype or comic impersonation. |
| Johnson | Charon, informative | Calm documentary expert; clean technical articulation and purposeful contrasts. Around 155 words/minute as a prompt target. No trailer voice, Johnson imitation or unsupported diagnostic certainty. |

Stock voice, sustained direction, per-cue direction, emphasized phrases and post-cue pauses are editable. Direction and emphasis use `speech_metadata.style`; the text field contains only verbatim narration. Pauses add known silent PCM samples after a segment, not director notes in captions. No celebrity voice cloning is performed.

## Gemini configuration

Uses the current [Gemini speech-generation API](https://ai.google.dev/gemini-api/docs/speech-generation): `gemini-3.8-flash-tts`, Interactions REST, mono 24 kHz signed 16-bit PCM. No SDK dependency is added. Model access and quota must be enabled for the Google project.

Set `GEMINI_API_KEY` on the server, then restart development if needed. Never use a `NEXT_PUBLIC_` key or put credentials in project ZIPs. The loopback development preview does not require a database. Other access requires creator-admin authentication and production rate limiting. POST must be same-origin; responses are non-cacheable. Narration and performance notes reach Gemini; when automatic alignment is configured, generated PCM audio also reaches Google Cloud Speech-to-Text. **Photos, landmarks and reports are not transmitted.** `store: false` is requested for synthesis; this does not guarantee all provider retention policies.

Neither provider key was configured during implementation. **Real synthesis, recognition and subjective voice quality have not been auditioned or verified.** Local configuration, missing-key and cross-origin checks were verified; synthetic PCM tests cover assembly and retiming. Synthetic tests are not real generated narration.

## Timing contract

1. Composition owns narration, delivery, image selection and visual direction.
2. Generate one directed scene at a time. Cancellation stops subsequent requests; an in-flight provider request may still incur usage. Independent cue generation can introduce timbre/prosody differences: audition the complete result.
3. Assemble PCM in script order, with authored silence. Sample counts determine exact segment boundaries and WAV duration. Reject incomplete, wrong-order, oversized or invalid clips.
4. Retime existing scenes/tracks to the audio. Reject obsolete results if the script/timeline changed during generation. Preview and export share the resulting timeline and audio.
5. With `GOOGLE_SPEECH_API_KEY` and Cloud Speech-to-Text enabled, each generated PCM cue is then recognized using `enableWordTimeOffsets`. Observed start/end times are merged using PCM sample counts and authored pauses. If unavailable, mark timing `segments`; word placement remains **estimated**, and audio is preserved.
6. Match recognized words against the original script before marking timing `words`. Mismatches do not rewrite it: preserve the audio with estimated timing and expose the measured transcript for review. Verified imports remain supported. Recognition offsets are audio-derived, not guaranteed sample-perfect; [Google documents variable timestamp accuracy](https://docs.cloud.google.com/speech-to-text/docs/reference/rest/v1/speech/recognize).

## Original script anchor

`composition.script` is the approved content: version, deterministic revision and stable cue IDs, with text and non-spoken delivery. Word IDs derive from cue identity and lexical index; unchanged cues retain IDs when another cue is inserted. `scriptWords()` exposes original character offsets without persisting a second word-text owner.

Every scene carries a `scriptRange` with original cue, word range and character range. Scene narration and delivery are validated projections, not independent editable scripts. `recording` binds observed global word times to original word IDs, script revision and the assembled audio's SHA-256. Scene caption timings and spoken motion tracks must project that same clock; stale script revisions, mismatched audio, changed scene wording, missing words and drifted timing are rejected.

Recutting approves the draft and creates its content revision. Explicit scene reordering creates a revised script and invalidates the recording. Detaching or regenerating audio clears old recording bindings. ZIP restore verifies audio bytes against the recorded fingerprint. The production brief includes original script, derived word IDs, measured recording and scene projections, all as JSON. No provider transcript becomes a new content source.

“Copy speech brief” copies script, voice direction, per-cue nuance, image selection and current scene boundaries, with timing provenance. It does not download a large video. Existing project ZIPs persist these fields and attached audio.

## Angled-view annotations

`profileStudy` selects jaw, cheek or projected contour angle, visible image side, and profile/three-quarter view. Detected contours stay attached to the transformed source photograph. Traces, angle rays and arcs enter sequentially and ease out before the next treatment. Reduced motion preserves meaning.

Angles use **image pixels**, not aspect-distorted normalized coordinates. They describe visible image directions, not gonial, mandibular-plane or cranial-base skeletal angles. Supplied portraits are not calibrated cephalograms. No bone measurement is inferred through skin, and the generic skull does not manufacture one. Missing/degenerate angle evidence falls back to a visible contour rather than invented anatomy.
