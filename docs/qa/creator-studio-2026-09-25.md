# Creator Studio QA — September 25, 2026

Production deployment: https://mogging-aml5iwa6e-glimpseback.vercel.app (aliased to https://www.mogging.com).

## Changes deployed

- Six account-verification instructions now use a minimal numbered timeline. Requirements are unchanged; avatar badge remains bottom right.
- Shared browser/API validation for creator profiles, social accounts and submissions.
- Published post links require HTTPS and supported TikTok/Instagram post paths (including TikTok short links). Unrelated sites, profile-only URLs, credentials in URLs and spoofed domains are rejected.
- Selected social account and post platform must match, including on the server.
- Optional profile URLs must match the platform and username. Handles are normalized before validation.
- Payout forms validate trimmed name, email, required network/wallet and basic network-specific wallet syntax. Only the chosen payment method is sent.
- API submission thresholds must be one of the actual payout ladder options.
- Empty evidence files are rejected client-side; existing API MIME/size limits remain enforced. Screenshot input resets so the same file can be reselected.
- Server derives evidence URLs from the authorized storage key rather than trusting the supplied URL.
- Hidden submission steps are inert and hidden from accessibility navigation.
- CTA title length checked before rendering/upload; copy length bounded and nonnumeric scores rejected.

## Browser checks completed

- Connected TikTok account visible in Accounts, Overview and submission selector.
- Creator-link Copy button updates and clipboard matches displayed account link.
- Verification modal opens/closes, displays all six original instructions, profile photo and physical-recording requirements.
- Unsupported verification recording type rejected.
- Submission empty required fields blocked; format requirements preview opens/closes.
- Unrelated published URL rejected on deployed site; Instagram post rejected when TikTok account selected; supported TikTok URL advances.
- Submission back navigation retains draft values.
- Analytics screenshot required before review; unsupported screenshot type rejected.
- Screenshot selection/removal UI and earnings estimate checked with local-only fixture: 40K base $20, 40% U.S. tier $45.
- Review summary matches draft; final submission disabled until requirements confirmed.
- Submission history empty state and Pending filter work.
- Overview displays one connected account and matching empty earnings/submission counts.
- Guide topic switching and expandable checklist work.
- Invalid PayPal email blocked by native form validation; invalid crypto wallet blocked by shared validation. No payout details saved during these tests.
- Instagram profile URL on unrelated domain rejected before account creation.
- CTA missing-photo error works. Restoring local history explains that original images must be reattached. Missing-photo export fails with actionable message.
- Bundled public/model.png successfully detects a face and generates five CTA templates with test scores. No CTA submitted for approval.
- Verification timeline inspected at normal and mobile-width viewport; temporary viewport reset.

## Automated verification

58 tests passed across validation, TikTok identity/permissions, payout calculations, submission review, CTA library and content generation suites (3 snapshots). TypeScript and targeted ESLint passed. Production build passed; unrelated existing img warning in pages/analysis.tsx remains.

Validation tests cover supported/unsafe/spoofed URLs, profile mismatch, malformed profiles, invalid email/wallet, tampered thresholds, missing confirmation, unsupported MIME types and oversized/empty metadata.

## Still requires completion before claiming full E2E readiness

- Actual physical analytics recording upload, saved evidence playback, pending-review persistence and admin approval/rejection.
- Genuine published post + analytics screenshot final upload/submission, refresh persistence, moderation and payout state transitions.
- Real Instagram connection creation (only invalid input paths tested).
- CTA export buttons were exercised and rendering returned idle, but browser download capture timed out. PNG/MP4/ZIP file delivery remains unconfirmed.
- CTA personal/shared library upload and moderation were not exercised with a genuine asset.
- Payment execution was not performed.

No fabricated analytics were submitted and no verification/approval was granted. Test URLs and screenshots were only used in unsaved drafts. URL syntax/domain validation does not prove that a post exists, is public, belongs to the creator, or satisfies the program; those require review/provider checks. Wallet syntax validation does not prove ownership or deliverability. File metadata validation alone does not inspect media contents.
