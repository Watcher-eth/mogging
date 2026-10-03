# Creator campaigns rollout

Apply only the campaign migration with `bun run db:migrate --only 0041_creator_sprints` **before deploying these application changes**. This migration adds campaigns and nullable submission fields; it does not rewrite historical submissions, payments, account identities or tracking links.

In Admin → Creators → Campaigns, create a draft with its budget, dates, platforms, milestone payouts, audience thresholds, publication window, rules and briefs. Publish it when ready. No campaigns are automatically seeded or published. Creator screens show scheduled, active and ended campaigns.

Maximum milestone amounts are total payouts, not cumulative bonuses. Default campaigns group verified Tier 1 audience into A (≥30%, pays 100%), B (22.5–<30%, pays 65%), C (15–<22.5%, pays 40%), and D (<15%, pays 20%). Maximum milestone amounts stay unchanged. Custom campaign audience rates are saved in its terms; minimum views must still be met. Submission terms are snapshotted. Subsequent campaign edits apply to new submissions. Approval reserves campaign budget under a transaction lock; sent payments retain the approved amount and cannot be reversed or repriced from the review form.

Accounts now connect with a handle or profile URL and immediately expose the existing permanent attribution code. Social OAuth and account audience recording are removed from the connection UI. Sign-in providers and existing referral URLs continue working. No temporary bio ownership challenge is added.

Video submissions still require an uploaded, continuous analytics recording filmed with a second device. Views and Tier 1 audience are checked by the moderator; this release does not introduce automatic platform analytics scraping. Money separates reviewed unpaid earnings, actual sent cashouts and payout methods. Historical earnings retain the previous payout calculation.

Verification: production build, TypeScript, 67 targeted tests covering validation, attribution identity, recording ownership, campaign terms, budget reservations and payment immutability. Desktop and 390px mobile UI checks used isolated fixtures; production/database end-to-end verification remains a rollout check after migration.

The migration command checks every recorded Drizzle hash instead of only the greatest timestamp. A scoped run leaves older migrations pending; a later `bun run db:migrate --only 0040_course_platform` applies the pending course migration. The unscoped command applies all remaining migrations and halts if an already-recorded migration file has changed. Use the project command rather than `drizzle-kit migrate` after an out-of-order migration.

The campaign migration was applied and verified on October 2, 2026. The course-platform migration was deliberately left pending. No campaign was seeded automatically, and the application has not been deployed by this migration step.

The first campaign, Mogging Face Analysis, was explicitly published on October 2, 2026 with a $3,000 USD budget for 30 days. Its maximum payouts retain the original ladder ($15 / $45 / $65 / $96 / $183 / $259 / $325). Each milestone also snapshots all original 20%–40% audience-tier amounts; verified shares between tiers use the lower qualifying tier. The overview only advertises maximum payouts.
