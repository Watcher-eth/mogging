# Submission conversations

Creators open any submission in `/creator/submissions` to see Messages first, with Details for evidence, requirements and payments. Admins open a submission and choose Messages. Blue bubbles are your own messages; grey bubbles are replies. Messages refresh every ten seconds while the conversation is open.

Review notes are still the latest saved review summary. A changed nonempty note appends a team message in the same transaction as the review; saving an identical note does not duplicate it. Clearing a review note does not delete conversation history. Migration `0043_submission_chat` carries existing notes into their conversations using the submission's last update time (the old system did not record note timestamps or prior revisions).

Unread counts only include the opposite side's messages. Reading at the bottom of the conversation advances a persistent read position through the latest loaded message, without clearing messages that arrive afterward. Admins share one team inbox/read position. This is an internal read position, not a public “Read” receipt.

Before releasing this code, apply migration `0043_submission_chat` to the target database with `bun run db:migrate --only 0043_submission_chat`, then deploy. No production migration or deployment was performed during implementation.

## Verification

- `bun run typecheck`
- `bun test lib/admin/creator-sprint-payments.test.ts`
- `CREATOR_CHAT_TEST_DATABASE_URL=postgres://<user>@127.0.0.1:<port>/<disposable-test-db> bun test tests/creator/submission-messages.test.ts`

Integration tests require an explicitly configured local database. They use temporary tables and a disposable schema, and verify ownership, idempotency, timestamp-accurate pagination, unread/read behavior, and migration of old notes.

# Tracking TikTok caption mentions

TikTok API for Business has an official Mentions API for posts explicitly mentioning the authorized business account in the caption:
https://business-api.tiktok.com/portal/docs/mentions-api-get-started/v1.3

Its search documentation limits results to eligible public posts in the past 90 days among the top 1,000 most-liked mentioning posts, with age exclusions. Account authorization must settle for 24 hours before pulling data. Therefore search results cannot be presented as a guaranteed count of every post.

The API also exposes mention webhook configuration and retrieval of a mentioned post's details:
https://ads.tiktok.com/gateway/docs/index?doc_id=1772372080226305&identify_key=c0138ffadd90a955c1f0670a56fe348d1d40680b3c89461e09f78ed26785164b&language=ENGLISH

Recommended integration, after confirming approved access and the current webhook authentication contract:

1. Authorize @moggingcom once as the brand business account. Creators do not need another OAuth connection for this brand mention feed.
2. Collect caption mention notifications prospectively and reconcile/backfill with available mention search results.
3. Store each detected TikTok video ID once, with posting time, handle, caption, URL, detection source and last available metrics.
4. Match handles to creator accounts and video IDs to submitted posts; retain unmatched posts separately. Exclude the brand's own posts and comment-only mentions from creator post totals.
5. Report detected posts, submitted posts, detected-but-unsubmitted posts, unique creators and posting trends. Explain coverage limits in the UI.

This integration is not connected yet: the account's business status, approved Mentions API permissions and authorization have not been confirmed. Until available, collecting published URLs separately from payout/evidence submission gives a reliable count of posts creators explicitly register, including videos below the view minimum.

The focused chat tests pass. A broader test run also exposed two existing expectation mismatches in `lib/admin/creator-payment.test.ts` (the current schema accepts arbitrary bounded metrics) and `lib/creator/submission-review.test.ts` (the existing content-policy wording includes “unclear app images”). These were confirmed against HEAD and are unrelated to the chat change.
