# Shared campaign budgets and submission reservations

This release pairs migration 0065 with shared-budget accounting and server-enforced submission reservations.

Mogging Detailed Analysis and Mogging Detailed Analysis MGC share the original campaign's content and bonus budgets. MGC's stored duplicate budget is never added to the pool. Both versions display the owner's current budget and combined usage. Admins edit the original campaign to change the shared budget; audience visibility remains independent for each version.

For every campaign, pending and in-review submissions reserve their expected payout, calculated from their saved campaign terms, submitted views and audience. Drafts reserve nothing. A rereview reserves only the expected increase beyond prior approved earnings. Existing approved earnings and settled payments remain intact.

A request is accepted only if its entire expected payout fits. For example, $50 available accepts a $40 request and leaves $10. A later $20 request is rejected. Requests that exactly use the balance are accepted; further new submissions lock. Zero-increase rereviews can still update analytics. Approval replaces the request reservation with the actual approved amount, rejection releases the request reservation, and payout adjustments cannot consume funds reserved by other submissions.

All accepting and reviewing paths lock the shared budget owner before reading the balance. This serializes simultaneous submissions across the original and MGC versions. Bonus awards share the owner's bonus cap, including database trigger enforcement; their existing award identities and payment protections are preserved.

A compact yellow message appears below the submit button at 20% or less of the content budget available, after approved earnings and pending requests. Its Motion Primitives accordion expands to a maximum two-line explanation. The MGC content-origin notice and separate shared-budget disclaimer are omitted. At zero, a locked notice replaces the submit action. Bonus funds remain separate from content funds; unused bonus funds cannot fund a base video payout.

## Preview

Open `/creator/__mgc-preview` on the local dev server. Choose “20% left”, “$50 left”, or “Fully requested”. From $50, try $40 followed by $20. Switch campaign versions to confirm they share the same balance. This preview uses sample data and makes no financial writes.

## Verification

- Unit and request-path regression tests cover available funds, the 20% boundary, new submissions, rereviews, and admin approval/payment behavior.
- `CAMPAIGN_BUDGET_TEST_DATABASE_URL=postgres://.../campaign_budget_test bun test lib/creator/campaign-budget.integration.test.ts` runs only against an explicitly selected localhost test database. It checks payout parity, exact-fit requests, concurrent requests, reservation release, shared bonus enforcement, and campaign transfers. It never falls back to `DATABASE_URL`.

## Release order

After approval, apply `bun run db:migrate --only 0065_creator_budget_reservations` to production, then deploy the application update. The migration links existing MGC versions to their source campaign and introduces the expected-payout SQL function. Existing pending submissions are included automatically; no submission or payment records are rewritten. If historical combined demand already exceeds the pool, new submissions remain locked while admins review requests or increase the budget.
