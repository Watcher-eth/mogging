# Creator guide source notes

Updated September 23, 2026 from the supplied announcement, June 2026 spreadsheets, and two reference documents:

- Positive examples: https://docs.google.com/document/d/1UFz4KZ21VmjEl69jdbZC1q3_5evthK3EnLCt93dp6h8/edit
- Negative examples: https://docs.google.com/document/d/1jKZYY0dxwsDBVyHmdXQ2oKnBLbTfV3wbMmapx6uuUew/edit
- `acceptable-looks-related- videos-june-2026.xlsx`, sheet `Looks`, rows 2–1197.
- `not-acceptable-looks-related-videos-june-2026.xlsx`, sheet `Not Looks`, rows 2–1066.

## Content and provenance

`lib/creator/formats.ts` owns the enforceable format brief displayed in the guide, submission sidebar/dialog, and moderator checklist. Existing elements, requirements, restrictions, and their positional review IDs are preserved. New requirements and restrictions are appended. No payout calculation or approval logic is changed.

`lib/creator/guide-examples.ts` annotates every screenshot example in source order. The positive document has 14 screenshots, with its final two treated as one before-and-after example. The negative document has 15 screenshots. Explanations and suggested rewrites are editorial adaptations for Mogging, not invented individual moderation decisions.

26 screenshots are stored as WebP under `public/creator-guide`. Positive images 1 and 2 and negative image 1 contain another app’s branding and are represented by transcribed hooks and explanations instead. The remaining images preserve the supplied visual evidence. No third-party video has been downloaded or rehosted. Screenshots are not linked to spreadsheet rows without evidence of a match.

`lib/creator/june-video-references.json` contains all 2,261 source rows: 1,196 acceptable and 1,065 non-acceptable. There are no duplicate or conflicting URLs across the files. Entries retain account, canonical video URL, classification, and original sheet row. Tracking query parameters and the unnecessary Discord username column are omitted. Source labels describe historical looks relevance, not current Mogging approval, fraud findings, or payout eligibility. The sources contain no per-video rejection reasons. Live availability of every video is not verified.

## Adaptation decisions

- All app references in authored guidance use Mogging. PSL remains only as appearance-rating vocabulary.
- Preserve hook within 3 seconds, clear Mogging product moment, closing CTA, @mogging tag, original public posts, 30-day submission window, and connected-account requirement when available.
- Preserve physical second-device analytics recordings, visible username, recent 28-day window, full geography list, unedited continuous take, readable evidence, and account-specific bio attribution link.
- Preserve existing geography thresholds, countries, view milestones, payout cap, cumulative milestone treatment, review snapshot, and payout-destination rules. Posting daily on both platforms remains optional guidance.
- Adopt the supplied looks relevance, engagement farming, excluded-niche, celebrity-edit, account-review, and anti-bot rules as requested guidance. This does not implement a new automatic fraud-detection or payout-forfeiture system.
- Do not republish the source announcement’s July 2–3 / July 7–14 payment schedule, processing apology, assertions of widespread fraud, or “more than 50%” June claim as Mogging facts. The spreadsheet counts themselves do not support that percentage.
- Positive references do not waive Mogging’s originality, truthful-results, product, CTA, verification, or analytics requirements. Comments are an audience signal, not a quota or substitute for content review.

## Guide destinations

- `/creator/guide#video-requirements`
- `/creator/guide?topic=examples`
- `/creator/guide?topic=account`
- `/creator/guide?topic=payout`

## Verification

- Production build and TypeScript check passed. The full build reports an existing `next/image` lint warning in `pages/analysis.tsx`, outside this change.
- Targeted lint passed for changed creator pages and components.
- All 18 submission-review and payout tests passed, including preservation of existing review IDs and the expanded checklist fitting the API limit.
- All 2,261 imported rows were compared against the source exports, including account, classification, source row, and canonical HTTPS URL.
- Browser checks covered desktop and 390px mobile layout, screenshots, URL search with tracking parameters, account search, platform filtering, pagination, classification switching, and keyboard topic navigation. No browser errors or horizontal mobile overflow were observed.
- Static guide content was previewed locally using the existing unauthenticated presentation option, then that temporary option was removed. The normal sign-in gate was verified afterward. No authenticated submission or payment was made, and no deployment was performed.
