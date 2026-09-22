# Apple push notifications

The iOS app registers directly with Apple through the local `MoggingPush` Swift module. The backend sends HTTP/2 requests directly to APNs with ES256 token authentication. There is no Expo push token or Expo notification service.

## Schedule and copy

All times are 18:00 in the device's last reported IANA time zone. “Biweekly” is currently interpreted as two social reminders per week.

| Day | Title | Body | Tap destination |
| --- | --- | --- | --- |
| Wednesday | Battle for the crown 👑 | Swipe. Pick your winner. Decide who mogs. | Battle tab |
| Saturday | Who mogs in your friend group? | Invite your friends and settle it. | Friends invite modal |
| Monday | Your next move is waiting | Still on today's protocol: {unfinished task title}. Make it count. | Protocol tab |

Change `lib/push/schedule.ts` and its tests to adjust the cadence. The scheduler query uses the same exported weekday/hour constants.

## Production status (September 22, 2026)

- Migration `0032_push_notifications.sql` applied to the production Railway database.
- APNs key `BBHU969G85`, team `PC925LQ278`, verified in Apple Developer as team-scoped for sandbox and production. Push Notifications is enabled for `app.mogging.scan`.
- APNs credentials and a generated `CRON_SECRET` configured as sensitive production variables in Vercel project `mogging` (Glimpse).
- Backend deployed to `https://www.mogging.com`. Vercel confirms the every-minute cron in `vercel.json` is enabled. The endpoint returns 401 without authorization and 200 with authorization.
- Native permission sheet opens after onboarding, a completed evaluation, and leaving the report. Apple’s system prompt appears only after tapping Turn on Notifications. Not Now is remembered on the installation.
- App Store distribution export succeeded for version `0.1.52` build `55`. The embedded distribution profile was checked and has `aps-environment=production`. IPA: `../../artifacts/push-notifications/Mogging-0.1.52-55.ipa`. This build has not been uploaded to TestFlight/App Store.
- Existing installed apps need the new native build; deploying the backend alone does not register them. No end-to-end physical-device APNs receipt has been verified yet.
- Validation: mobile typecheck and 55 tests passed; backend typecheck and six scheduling tests passed (DST, fractional offsets, midnight boundaries, unfinished task selection). The native enable button was verified to open Apple’s permission alert. Both APNs gateways returned `BadDeviceToken` for a deliberately invalid token; this confirms gateway connectivity but does not substitute for a real-device delivery test.

## Backend setup for another environment

1. Apply migration `0032_push_notifications.sql` using the repository's database migration workflow against the intended database (`bun run db:migrate`; if the deployment uses schema push, `bun run db:push`). The schema is additive, and account deletion cascades to notification records.
2. Create an APNs token authentication key in Apple Developer for the team that owns `app.mogging.scan`. Enable Push Notifications for that App ID.
3. Configure these server-only secrets in the backend deployment:
   - `APNS_KEY_ID`: key identifier for the APNs `.p8` key.
   - `APNS_TEAM_ID`: Apple Developer team identifier.
   - `APNS_PRIVATE_KEY`: full `.p8` contents, including PEM header/footer; literal `\n` escapes work too.
   - `CRON_SECRET`: a long randomly generated secret.
4. Deploy the backend. The committed `vercel.json` configures Vercel to invoke the scheduler every minute (`* * * * *` in UTC). For another host, configure the same cadence. Invoke `GET /api/cron/push-reminders` with `Authorization: Bearer <CRON_SECRET>`.
   - For a Railway/external cron service, run `bun scripts/notifications/send-reminders.ts` from the backend directory. Set `PUSH_REMINDER_URL` to the backend origin and `CRON_SECRET` to the matching secret. The script exits after one invocation.
   - The every-minute scheduler checks each device’s IANA time zone and begins sending at 18:00 local time, including fractional UTC offsets and daylight-saving changes. The eligible window ends at 19:00 to allow retries; database reservations limit each reminder to one attempt after an ambiguous outcome. A once-daily UTC cron will miss users’ local delivery windows.
   - Alert on non-2xx responses and `partial: true`. Repeated runs and concurrent invocations are deduplicated by the database.

Credentials are server-only. Never put the APNs private key or cron secret in the mobile app or commit them.

## Build and test iOS

1. Run `pod install` in `mogging-mobile/ios` after adding the module; the lockfile now includes `MoggingPush`.
2. Regenerate signing profiles after enabling Push Notifications. `aps-environment` is included in the app config and already exists in the native entitlements. Distribution signing supplies the production entitlement.
3. Build a new native app. An OTA JavaScript update cannot add this bridge. Expo Go cannot load it.
4. Sign in, complete onboarding and an evaluation, then exit the report. The native notification preview appears once; tap Turn on Notifications to open Apple’s permission prompt. Registration retries on foreground, token changes, task changes, and network failure. Denial is respected; permission can be changed in iOS Settings.
5. Test a development-signed app with sandbox APNs and a TestFlight build with production APNs. The bridge reads the signed embedded provisioning profile rather than assuming every Release build is production.
6. Verify each payload below while the app is foregrounded, backgrounded, and terminated. Taps wait for session restoration and navigation readiness. For the simulator, save a payload to a file and use `xcrun simctl push booted app.mogging.scan /absolute/path/payload.apns`.

```json
{"aps":{"alert":{"title":"Battle for the crown 👑","body":"Swipe. Pick your winner. Decide who mogs."},"sound":"default"},"target":"battle"}
```

Use `"target":"invite"` to open the invite modal, or `"target":"protocol"` to open Protocol. Simulator injection tests routing; it does not verify provider credentials or APNs delivery.

## Data and delivery behavior

- Only authenticated iOS accounts that grant notification permission register. Registrations stop receiving notifications when their mobile session expires; launching and signing in again refreshes registration.
- A user gets a push on their most recently active registered device. Device tokens rotate safely, and invalid tokens are removed on APNs rejection.
- Task completion is persisted by calendar date and task family. The app syncs the displayed protocol's next 38 dates and task completion flags. Completed days and dates with no snapshot are skipped. Offline edits cannot reach the sender until the device reconnects; task text always comes from the latest successful sync, not a guessed task.
- Sign-out unregisters the device before clearing local state. A failed unregister leaves the account signed in and offers retry, avoiding orphaned registration. Account deletion cascades registrations automatically.
- An atomic user/kind/date reservation prevents duplicate sends. Explicit APNs rejections release the reservation for retry. A process crash or ambiguous transport failure retains it, choosing a possible missed reminder over duplicate notifications. APNs collapse identifiers add protection, and expiration is zero to prevent delayed stale task notifications.
- A 6 p.m. delivery is best effort: system Focus settings, permissions, network availability, and APNs can affect presentation.

Apple references: [Registering with APNs](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns), [Sending requests to APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns).
