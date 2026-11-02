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

Countries are the primary output. Age, average watch time, explicitly labeled drop-off time, viewers and views are optional. Never infer drop-off from an unlabeled curve, infer age from appearance, or count repeated countries while scrolling. The payout policy uses explicitly displayed Tier 1 countries; Other remains unallocated. Use the existing country catalog in `lib/creator/audience.ts` for Tier 1 membership.

Verification:

```sh
bun test scripts/creator/analytics-extraction.test.ts
bun run typecheck --incremental false
```

## Production integration

Apply only `0069_creator_audience_checks` before releasing the code. It adds one nullable JSON column and a partial queue index; it does not change earnings or payment records. The release is based on production commit `6a1b6ed`, preserving Creator Studio, the monthly bio-link tracker and the combined social-account history panel.

New submissions and fresh analytics rereviews queue a check atomically with the recording. Their API routes start the worker after responding; the minute cron recovers queued work. Database row locking prevents duplicate claims. Each result belongs to one storage key. Timeouts become manual-review flags and paid work is not automatically retried. A late worker cannot overwrite a replaced recording or an approved manual review.

The Linux worker uses bundled FFmpeg to sample the final fifteen seconds and a bounded opening window. Extreme pixel-rate recordings use keyframes, with duplicate JPEGs removed before paid calls. Jev locates complete and partial panels; localization does not approve their numbers. Gemini reads up to six selected frames, prioritizing a clear country panel or five dispersed partial views. Jev verifies post scope, named-row coverage and exact percentages. Blurred transition frames do not contradict readable evidence. A fresh unanchored extraction uses a compact set of supporting frames; changed readings need fresh independent verification. Formats, protocols, subprocess credentials, download size, runtime and the $0.009 model budget remain bounded. Temporary recordings are removed after sampling.

Tier 1 membership and the sum of displayed percentages are calculated in code. The user confirmed that Other stays unallocated; it no longer forces manual review because hidden countries might change a tier or bonus. When Other is readable, named countries plus Other must reconcile with 100% within printed rounding, which catches omitted rows. New readings record `basis: displayed_countries`; older verified results retain their original validation rules. Reviewers can override successful checks; edits clear confirmation, saved overrides persist, and the reviewer/source are included in approval snapshots. Existing approved or paid metrics are not rewritten by the worker.

The initial production-path tests accepted two high-tier examples at approximately $0.00533 and $0.00443 in model charges; the original full-audience uncertainty rule flagged the third example. That rule has since been replaced by the displayed-country policy above. Costs exclude hosting compute and existing video retention. The worker uses the project's `GEMINI_API_KEY` and `OPENROUTER_API_KEY`. Optional age/viewing metrics never block country processing.

Release verification includes the payout/review regression suites, policy tests, TypeScript, and browser checks of successful automatic values, blocked unreadable cases, explicit overrides and reconfirmation after edits. The broad test run found fourteen failures reproduced against an unmodified archive of production commit `8be9834` (existing Studio expectations and local HTTP/Discord environment limitations); those unrelated tests are not modified by this release.

## Retained analytics and earnings

Migration `0070_creator_submission_analytics` retains one analytics observation per submission and recording key, with its assessment timestamp, country/age breakdowns, watch/drop-off time, viewers, views, evidence times and field verification results. Existing completed readings are backfilled as recorded; optional legacy metrics remain unverified. Rereviews retain the earlier recording's observation. Partial metrics survive country-verification failures, and superseded jobs can retain their observations without changing a reviewer's decision.

The existing Jev verification call checks optional metrics alongside the countries. Confirmed abbreviated views are usable for reach tracking; automatic earnings require a separately confirmed exact count. The payout estimate follows the assessed audience, verified exact views when available, and the submission's saved campaign rates. Explicit reviewer edits remain authoritative. Missing metrics produce no estimate rather than an invented zero.

Post History shows the retained observations. Creator Performance uses the latest independently checked view count per post, with coverage, without summing rereview snapshots. Approximate platform counts remain labeled as such. Observations join through the submission to its creator, account and campaign for subsequent attribution analyses alongside existing link/conversion events. The model budget remains $0.009 per check; the richer development sample cost about $0.0055, excluding hosting.

## Manual-review audit

The November 2 cohort contained 16 completed checks: six automatic and ten flagged. Five flags came from the old hidden-country/tier/bonus rule, two from missing the country panel in the sampled window, two from treating unreadable transitions as conflicting values, and one from decoding a 220 MB 4K/120 fps HEVC HDR recording. Keyframe sampling recovered the latter in about 17 seconds.

The replay recovered eight of the ten flagged cases while preserving the six previous successes: 14/16 automatic. The remaining partial-panel recordings stay manual when coverage cannot be independently confirmed within budget. Model costs averaged approximately $0.0050 per check, with all attempts below $0.009. This is a replay of the development cohort, not a held-out accuracy estimate. Stage, frame-selection and independent-reading diagnostics are retained for future audits. Existing approvals, manual overrides and payments are preserved.

Two verified replays differ from saved manual percentages: 59.7% versus 67.5% (the latter also counts Spain and Romania, outside the configured Tier 1 list), and 22.9% versus 20.2% (the recording shows Germany 4.7, UK 3.9, Canada 3.5, Italy 2.9, Australia 2.7, France 2.7 and Poland 2.5). The second difference crosses the 22.5% payout threshold. These comparisons are retained in the local audit report; existing approved records and payments were not rewritten.
