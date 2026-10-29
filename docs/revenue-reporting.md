# Revenue reporting

The Revenue page uses deduplicated production billing events and excludes known internal accounts. Dates are Pacific time. Amounts remain in the original purchase currency; USD means USD-denominated purchases, not a converted global total.

| Previous presentation | Current presentation | Reason |
| --- | --- | --- |
| Net revenue meant payments minus refunds | Revenue, refunds, after-refunds collections, and estimated proceeds are separate | Collections were being confused with proceeds or profit |
| Active access included cancelled subscriptions | Paid subscriptions set to renew are separate from cancelled access, trials, billing retry and ended subscriptions | Cancellation intent is not yet churn |
| Currency detail hidden in diagnostics | Source, currency and country tables are visible | International purchases must not be omitted or added without conversion |

## Fee model

For Apple purchases, the report shows the requested **15% commission scenario**:

`estimated proceeds = signed amount × (1 − recorded tax percentage) × 0.85`

Tax percentages are provider estimates of the share of the original amount deducted as tax, not statutory tax rates. A negative refund reverses the corresponding estimated fees and taxes. This is a scenario, not proof that Apple applied 15% to a particular transaction. Check Small Business Program enrolment and its effective date in Apple and RevenueCat.

Provider-estimated proceeds remain separate: `signed amount × (1 − tax percentage − commission percentage)` as documented by RevenueCat. In the October 28 audit, most stored Apple commission estimates corresponded to about 30%, not the requested 15% scenario.

If any monetary event lacks required tax or processor fee information, full proceeds for that group are unknown. Known proceeds and the missing-event count remain available; unknown costs are not replaced with zero. Stripe fees require actual processor information. Proceeds do not deduct creator compensation, AI, hosting, business taxes or other operating expenses, so they are not business profit.

## Subscriptions and churn

- Set to renew: confirmed, unexpired paid access without cancellation intent, trial status, or an unresolved billing issue.
- Cancelled, access remains: cancellation intent is recorded, but paid access has not expired.
- Active trials and unresolved billing retry are separate.
- Ended in period: currently ended subscriptions whose expiry/refund falls inside the period, including subscribers who joined during the period.
- Start-cohort churn: subscriptions active at period start that have ended by the snapshot cutoff, divided by active subscriptions at period start. A zero denominator is unavailable, not 0%.
- Counts use provider/subscription identities, not unique people. All state is reconstructed from the recorded lifecycle; it is not a live provider account balance.

## Reconciling external totals

The reported $177 in App Store Connect and $250 in RevenueCat cannot be reconciled exactly without matching the date range, selected metric, currency conversion and store scope. $250 × 70% = $175 is consistent with a roughly 30% commission difference, but is not proof of the cause.

Apple Sales and Trends uses estimated conversion rates; Apple financial reports use settled transactions and fiscal months. RevenueCat has gross revenue, revenue net of taxes, and proceeds metrics. Compare matching definitions and dates. Future RevenueCat events also retain their original provider USD amount for reconciliation; historical events were not backfilled or guessed.

Sources:
- https://www.revenuecat.com/docs/dashboard-and-metrics/taxes-and-commissions
- https://developer.apple.com/help/app-store-connect/reference/reporting/sales-and-trends-reports-availability
- https://developer.apple.com/help/app-store-connect/getting-paid/download-financial-reports

## Verification

TypeScript and targeted lint passed. Dashboard, reporting-window, fee-policy and billing-normalization tests passed. Read-only synthetic PostgreSQL fixtures verified signed refunds, fee reversals, tax-before-commission arithmetic, separate currencies and unknown fee handling. Production read-only queries and the local-only browser preview verified actual subscription totals and currency switching. No production financial records were altered.
