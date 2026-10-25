# Creator-to-creator referral program

This is separate from subscriber referral links/codes and campaign budgets.

## Terms implemented

- A new Creator Studio profile joins through a personal /creator/join/<code> URL.
- One immutable inviter per profile, attributed at profile creation. Existing creator profiles cannot be attached retroactively.
- The first valid link sets a signed, HttpOnly, SameSite=Lax, 30-day first-touch cookie. Login and OAuth retain it. Across browsers/devices, the creator must reopen the link before registering; no probabilistic matching.
- The first five distinct approved videos reserve permanent slots, serialized on the referral row in the approval transaction. Rejections and rereviews never free/reuse slots or create another slot.
- The inviter earns 5% of normal USD post payments actually marked paid for those videos. Pending/failed/cancelled transfers, campaign bonuses, manual non-post payments, and referral bonuses are excluded. The invited creator receives their full normal payout.
- The commission is floor(total settled normal cents / 20), calculated cumulatively per video. This cannot inflate through split payouts; fractions of a cent carry forward in the cumulative basis.
- Later settled milestone increases on those same five videos can earn additional commission. Sixth/later videos cannot.
- Awards enter creator_payments as independent pending referral bonuses. They appear in Money, admin outstanding payments, overview bonuses, and bundled payout requests. They do not consume campaign content/bonus budgets.
- Existing requested bundles are immutable. Later awards remain outside the existing request and join a subsequent payout.
- Manual cancellation is final for that credited amount; reconciliation never silently reissues it. Failed payouts can be retried using the original payment.
- Suspended creators and shared payout/social identities are held. Cashout eligibility is checked again before settlement. A persisted identity hold needs an administrative investigation; there is no automatic identity override.

## Ownership and recovery

creator_referral_links owns personal link identity.
creator_referrals owns the inviter relationship and review hold.
creator_referral_awards owns the five slots, settled basis, and cumulative issued commission.
creator_payments owns payment state and receipts; referral awards are not a second cash balance.

Normal individual-payment and bundled-settlement hooks reconcile after their payment transaction commits. The authenticated creator-attribution cron retries missed accruals, oldest checked relationships first. A failed bonus sync cannot roll back or resend the underlying creator payment.

All award creation is one transaction, serialized with consistent profile locks and the referral lock. A crash cannot commit a payment without updating its cumulative issued total.

## Release

Apply drizzle/0062_creator_referrals.sql before deploying code that selects the new payment column or reads these tables. NEXTAUTH_SECRET must be present for cookie signing. The existing creator-attribution cron must remain enabled.

No production migration or deployment was performed while implementing this feature. The migration and financial flows were exercised on a separate localhost PostgreSQL instance.

## Verification

- Pure policy/cookie tests: rounding, tampering, expiration, future cookies.
- Isolated database tests: actual migration, concurrent signup attribution, existing/self referral rejection, concurrent five-video cap, rereviews, partial payouts, event replay, exclusions, frozen bundles, cancellations, identity/suspension holds, real approval-history/payment-review hooks, bundled source settlement and inviter cashout.
- UI previews: /creator/__submission-preview?view=overview and ?view=conversions use sample data only.
