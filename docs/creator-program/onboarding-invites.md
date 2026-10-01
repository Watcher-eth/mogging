# Preverified creator invitations

Apply migration `0039_creator_onboarding_invites` with `bun run db:migrate` before deploying these routes. This change does not migrate the live database automatically.

## Team workflow

1. Open `/admin/creators`, unlock creator admin, and select **Invitations**.
2. Enter the creator’s display name, TikTok handle, and matching HTTPS profile URL.
3. Add the Discord message link with their reviewed analytics. Confirm account ownership and review of the past 28 days of audience analytics before creating the invite.
4. TikTok’s public profile is queried for the avatar. If unavailable, provide a TikTok CDN profile-photo URL. The UI reports when no photo was found, and uses an initial if the photo cannot load.
5. Copy the unique link and send it privately to that creator. Links expire after 30 days and can be revoked in the same panel. The raw link is shown once; only its SHA-256 hash is stored. To replace a lost link, revoke it and create a new one.

The admin panel shows the actual generated 1200 × 630 PNG. Its background is the supplied face pattern at 55% opacity, with a transparent-to-white gradient beginning at 45% of the card height. All content is centered directly on the background: the creator’s avatar with a white border, their handle, Finish Setup, and a progress bar showing 66% complete.

## Creator workflow

The link opens a personalized invitation. Clicking **Claim your account** starts the existing creator login flow and remembers the claim in that browser tab. After authentication, the invitation automatically claims the prepared setup for the signed-in identity and opens payout setup. Closing the login dialog cancels the pending claim. This uses the authenticated session, never a user ID supplied by the client. Saving the payout method opens the creator dashboard.

Claiming the invitation creates or reuses their creator profile, sets creator verification to verified, and adds their TikTok account as an approved manual account with analytics already reviewed. The profile photo and Discord evidence reference are preserved. This is team verification; it does not grant TikTok OAuth credentials or fabricate an OAuth verification timestamp. Admins can open the original Discord evidence from the account review dialog.

The creator proceeds directly to **Select payout method**, then the existing dashboard and first-video submission flow. Existing payout details are preserved. The 66% value describes the prepared invitation’s setup milestone, not a calculation of all future dashboard activity.

## Claim behavior

- Invite reads and OG crawler requests never claim or change records.
- Claims require a same-origin authenticated POST and run in one transaction with row locks.
- A link can be claimed once. Retrying as the same user is idempotent; another user cannot claim it.
- Expired/revoked invites, suspended creator profiles, conflicting account ownership, and account limits are rejected without partially applying setup.
- Public HTML and PNG contain only the creator’s public profile information and invitation state. Evidence, reviewer identity, auth IDs, and payout details are excluded.
- Treat links as private, single-use claim links: whoever receives one can claim it with their login. They deliberately do not require the creator’s auth-provider email in advance.
- Discord may retain its own cached preview after a link is consumed or revoked. Server responses use no-store and the claim endpoint always checks current state.

## Validation

Run unit and API tests in separate processes to avoid the repository’s global Bun module mocks interfering with one another:

```sh
bun test lib/creator/invite-validation.test.ts
bun test lib/creator/claim-invite-api.test.ts
bun run typecheck
bun run build
```

The integration tests require a disposable local PostgreSQL database with the application schema on port 55439. They do not run against the normal application database:

```sh
TEST_CREATOR_INVITE_DATABASE_URL=postgresql://invite_test@127.0.0.1:55439/postgres bun test lib/creator/invites.integration.test.ts
```
