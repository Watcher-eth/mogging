# Web paywall experiments

The current analysis paywalls are the control. Start with a shorter mobile web paywall that keeps the photo, pricing, billing terms, plan selector and primary action. The detailed benefits can be expanded. Desktop uses the same experiment machinery and a separate readout.

## Run a test

- Pick one change and one primary metric. The primary outcome is a positive, Stripe-confirmed subscription payment within 24 hours of the browser’s first recorded plan impression. One browser counts once per device category. Use first-charge dollars per exposed browser alongside paid conversion for price tests.
- Put `WEB_PAYWALL_EXPERIMENT` in the web deployment’s server environment. Leave it unset to serve the existing paywalls. One experiment can enroll at a time. Use a new ID for each test and keep that ID and configuration stable through the final 24-hour conversion window. For a rollback, unset the variable. Open checkout pages created before rollback retain their Stripe price.
- Choose a fixed three-to-five-day enrollment window and a sample requirement per arm. Mobile and desktop have independent allocations and results even if both run a length test. Review under **Admin → Analytics → Experiments → Web paywall · A/B tests** using a date range that contains the entire experiment.
- Price tests change the default monthly plan on one surface. Use an existing active USD monthly Stripe price on the exact same Stripe product as the control. The server checks the amount, currency, interval, tax settings and live/test mode. Existing mobile and desktop catalogs, plan entitlements and creator eligibility remain separate. Intro offers are withheld in both price arms so the tested amount is visible. Never change the underlying control price mid-test.

Five-day length example. Use future timestamps when activating.

```json
{
  "id": "mobile_short_v1",
  "kind": "length",
  "surface": "mobile",
  "startsAt": "2026-11-10T18:00:00Z",
  "endsAt": "2026-11-15T18:00:00Z",
  "minimumPerArm": 500
}
```

Price tests use `"kind": "price"`, `"surface": "mobile"` or `"desktop"`, a `"stripePriceId"` and the matching integer `"unitAmount"` in cents. Confirm the treatment price in Stripe test mode first. Checkout rejects a stale price or mismatched assignment before opening Stripe.

## Validate before release

- Run `bun test lib/payments/web-analysis-recovery.test.ts lib/analytics/contract.test.ts`.
- Run `bun scripts/tests/web-journey.ts` with `WEB_JOURNEY_TEST_DATABASE_URL` pointing to the isolated localhost `web_journey_test` PostgreSQL database on port 55448. The fixture uses temporary tables.
- Start a local development server on port 3393, then run `bun scripts/tests/web-paywall-browser.ts`. Set `WEB_PAYWALL_BROWSER_EXECUTABLE` to a local Chrome binary or use the installed Playwright Chromium. Set `WEB_PAYWALL_BROWSER=webkit` to run with Playwright WebKit. The browser test uses demo photos and mocks every payment request. It checks upload, preview, both arms, displayed price, stale-quote recovery and the hosted-checkout redirect.
- Before live enrollment, run a Stripe test-mode payment on each changed surface. Check the presented amount and renewal interval in Stripe, cancel and retry, restore the photos on return, confirm that access is granted once and that the report opens. Smoke-test a physical iPhone in Safari and the Instagram and TikTok in-app browsers. Check camera permission denial, upload fallback, interrupted connectivity and back navigation.

## Read results and decide

Use the [Fogg Behavior Model](https://behaviordesign.stanford.edu/resources/fogg-behavior-model) to prioritize one hypothesis per test.

| Lever | First hypothesis | Where to measure |
| --- | --- | --- |
| Ability | A customer can finish capture with a usable photo even if camera access or guided rotation fails | Photo-ready per capture, permission outcomes, upload fallback, checkout errors |
| Prompt | One clear action with the price and interval visible increases checkout taps | Paywall to tap, tap to Stripe session, paid per exposure |
| Motivation | A concise preview and fewer competing details improve paid conversion | Paid per exposure, first-charge dollars per exposure, creator and browser mix |
| Motivation and ability | A different monthly price changes demand and first-charge revenue | Paid per exposure, dollars per exposure, refunds and first renewal |

During enrollment, use the report to catch broken prices, failed sessions or uneven allocation. Pause for a reproducible blocker, incorrect billing or a confirmed tracking fault. Review Safari, Instagram, TikTok and desktop browsers as diagnostic segments. Decide after enrollment plus 24 hours using the preplanned minimum, effect size and uncertainty, and keep refund, report delivery and renewal guardrails in the release decision. The display reports gross USD first charges before fees and refunds. Use [Web Journeys](https://www.mogging.com/admin/analytics/web) and Stripe to reconcile the rest. [Microsoft guidance on trustworthy experiment decisions](https://www.microsoft.com/en-us/research/articles/patterns-of-trustworthy-experimentation-during-experiment-stage/)

At 5% control conversion, detecting a change to 10% with 80% power and a two-sided 5% significance level takes about **435 exposures per arm**. Detecting 5% to 7.5% takes about **1,470 per arm**. These are planning estimates for equal allocation. A five-day test receiving 100 paywall browsers per day gets about 250 per arm. Record it as inconclusive and use the funnel diagnostics to choose the next test. For 30 starts/day, plan for about 600 eligible paywalls/day at 5% or 300 at 10%.
