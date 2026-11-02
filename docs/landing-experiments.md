# Homepage experiments and paid outcomes

The single owner for experiment IDs, versions, allocation and review checkpoints is
`lib/analytics/landing.ts`. Do not change an existing treatment or its decision
metric in place. Historical assignments and Stripe metadata remain readable.

## Current test

`landing_homepage_v3` compares the old homepage with the new homepage and iPhone
previews. It is the only active randomized homepage experiment. Versions 1 and 2
are archived, not new opportunities to reallocate traffic.

The preregistered primary outcome remains mature App Store click rate after seven
days of follow-up. It measures store intent, not downloads, installs or purchases.
The current checkpoint is at least 14 observed days and 1,000 eligible browsers
per arm; this does not guarantee enough power or a winner. Inspect assignment
balance and source mix and use the full available cohort. Do not stop early based
on a daily rate or retrofit purchases as the primary outcome after seeing results.

The site's business objective, confirmed November 2, is completed paid purchases.
Future randomized experiments must specify a provider-verified paid outcome,
minimum worthwhile effect, observation period, sample plan and refund/delivery
safeguards before launch. If traffic cannot support a paid-conversion test, keep
collecting or run a bounded descriptive study; do not declare a winner from a
proxy such as a CTA click.

## Existing measurement

- A first-party cookie holds the visitor assignment; the server renders the arm.
  There is no client-side switch or remote experiment-service request.
- Record the first observed homepage exposure and compatible outcomes after that
  exposure, within seven days and inside the reporting period. Pending visitors
  do not count as mature failures.
- Stripe-created checkouts preserve assignment. A paid outcome requires a
  positive-amount, server-confirmed paid checkout. Count each converting browser
  entry once; this is not a count of payment transactions, new customers or
  completed reports. Billing and currencies remain in the verified billing ledger.
- Admin → Analytics → Experiments now displays the mature paid-entry diagnostic.
  Its availability does not change the running test's original primary metric.
  Missing paid-outcome fields remain unavailable, not zero.
- Do not imply a deterministic web-to-App-Store-install join. Automatic iPhone
  handoffs occur before treatment and remain outside the primary click denominator.
- Guide footer actions use existing `landing_cta_clicked` and, for store links,
  `app_store_redirected` events with `surface=editorial_guide`, the public guide
  path and `placement=guide_footer`. These are actions, not purchases. They do not
  become homepage exposures or acquire internal UTMs.

## Reporting and daily work

The existing admin dashboard and `scripts/seo/snapshot.ts` use the same reporting
queries. The script runs bounded, read-only database transactions, captures
explicit current/prior windows and a separate 90-day experiment cohort, and saves
aggregate JSON locally. It never runs migrations, changes entitlements or sends
financial data to an external service. Missing reports are explicit failures.

The daily operating runbook and experiment queue are in
`/Users/watcher/Desktop/mogging/artifacts/seo-growth/`. That queue governs new work;
this file owns the measurement rules for the existing homepage experiment.

## Verification

Existing tests cover stable allocation, historical assignment compatibility,
cohort timing, server-paid outcomes, free-checkout exclusion, duplicates,
assignment imbalance, pending visitors and interval uncertainty. Focused paid-rate
checks distinguish a mature zero from a missing field and an immature cohort.
Browser checks cover the guide content, navigation and responsive layout. No
real paid checkout is created for verification.
