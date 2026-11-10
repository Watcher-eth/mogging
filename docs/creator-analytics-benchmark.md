# Creator analytics extraction benchmark

The offline runner is `scripts/creator/benchmark-analytics.ts`. It does not update submissions, moderator decisions or payouts. Recordings, frames and results belong in the ignored `.local/audience-benchmark/` directory.

## Run

Requires Bun, ffmpeg and ffprobe. The default OCR engine uses macOS Vision and Swift; `--ocr-engine tesseract` uses the installed Tesseract executable instead. No new dependencies are required.

```sh
bun scripts/creator/benchmark-analytics.ts \
  --input /path/to/analytics.mov \
  --out .local/audience-benchmark/example \
  --mode ocr
```

Modes:

- `ocr`: local text recognition and country/percentage row pairing.
- `jev-ocr`: local OCR followed by Jev's classification of each frame's audience scope. OCR owns the numerical values.
- `jev-frames`: Jev image classification of candidate panels; this selects frames but does not extract country values.
- `gemini-frames`: OCR selects frames covering countries, age and optional metric labels; Gemini extracts structured fields from those images.
- `gemini-video`: Gemini receives the complete video, without audio, resized to at most 1280 pixels and sampled at one frame per second.
- `all`: runs every method. This is a comparative experiment, so costs from its separate methods add together.

Gemini reads `GEMINI_API_KEY` or `GOOGLE_API_KEY`. Jev reads `OPENROUTER_API_KEY` preferentially, or `TYPESAFE_API_KEY`. Supply credentials through the existing environment or Bun's `--env-file`; never commit them. The runner does not retrieve credentials from hosting or save them in its outputs.

Candidate frames cover the opening 15 seconds at 1 FPS and the final 5 seconds at 2 FPS. Overlaps are deduplicated. `--opening-seconds` and `--tail-seconds` override these bounded windows, up to 60 seconds each. Use a fresh output folder when changing the input or sampling windows. Frame/OCR caches are local; paid model calls run again when explicitly requested.

The default model is `gemini-3.1-flash-lite`. Before generation, the runner counts input tokens and reserves the full 2,000-token output allowance. It skips calls whose estimated model cost exceeds $0.008. There are no automatic retries or paid tools. The direct-video baseline skips files exceeding its conservative inline upload cap. Actual usage and calculated model cost are saved separately from runtime; compute and storage costs are excluded.

## Initial experiment — November 2, 2026

Three recent TikTok submissions were selected before extraction. Their recordings were 19.39, 12.12 and 6.73 seconds. Submitted audience claims were withheld from extractors. Ten named country rows per recording were checked against the decoded images. These are development samples, not a held-out accuracy estimate.

| Method | Named country rows correct | Model API cost per recording |
| --- | --- | --- |
| Apple Vision OCR | 30/30 | $0; local compute extra |
| Apple Vision OCR + Jev text classification | 30/30 | $0.000257–$0.000368 |
| OCR-selected frames + Gemini 3.1 Flash-Lite | 30/30 | $0.002007–$0.002578 |
| Direct video + Gemini 3.1 Flash-Lite, 1 FPS | 30/30 | $0.000966–$0.001392 |
| Tesseract, sparse-text mode, original frames | 0/30 | $0; local compute extra |

Jev image-based panel selection was also exercised on one recording, at $0.001271. It is a selector, not a numerical extraction result. Prices above come from API usage; Gemini uses published standard token rates and OpenRouter returns the Jev charge.

The visible named-country Tier 1 sums were 59.7%, 22.9% and 68.5%. They differ from creator-entered claims of 67.5%, 20.2% and 66.1%. The first claim matches the sum of all ten named countries, including non-Tier-1 countries. This is a review discrepancy, not evidence of intent.

Every recording includes an unresolved Other share (32.5%, 64.3% and 25%). The observed Tier 1 sum is therefore not proof of the full audience distribution. The runner deliberately leaves `completeTier1Percent` null. Local OCR failed to pair Other's percentage on the tilted first recording; the selected-frame Gemini result captured it.

Selected-frame Gemini used 3–5 frames per recording. It recovered average watch times of 11.7s, 11.6s and 10.8s, plus video views of 27.4K, 51.2K and 55.7K. Total viewers were recovered where shown (7.9K and 46.0K). Direct video missed the 10.8s watch time and returned a coarser 55K view counter in the shortest clip. No explicit drop-off time was established in these samples. Age extraction worked on readable panels but was inconsistent on a blurred transition; optional age results require corroboration and must remain unverified.

Gemini 2.5 Flash-Lite returned an availability error for this account, despite appearing in the model list. The successful experiment used 3.1 Flash-Lite. Apple Vision's success does not establish Tesseract or Linux deployment quality; the Tesseract baseline used no perspective correction or specialized preprocessing.

## Interpretation

The measured model costs fit the one-cent target. A production recommendation still needs compute/storage accounting, longer recordings, Instagram samples, non-English panels, unreadable examples, and a held-out set. Jev's provisional confidence threshold is not calibrated for approval. Preserve the recording and field timestamps, return unknown for missing values, and keep moderator values authoritative while testing.

Countries are the primary output. Age, average watch time, explicitly labeled drop-off time, viewers and views are optional. Never infer drop-off from an unlabeled curve, infer age from appearance, count repeated countries while scrolling, or treat Other as zero Tier 1. Use the existing country catalog in `lib/creator/audience.ts` for Tier 1 membership.

Verification:

```sh
bun test scripts/creator/analytics-extraction.test.ts
bun run typecheck --incremental false
```
