import { sql, type SQL } from 'drizzle-orm'

type CampaignId = string | SQL
export function campaignBudgetPoolId(id: CampaignId) {
  return sql<string>`(select coalesce(budget_campaign.budget_pool_id, budget_campaign.id) from creator_sprints budget_campaign where budget_campaign.id = ${id})`
}
export function campaignPoolMember(campaignId: SQL, poolCampaignId: CampaignId) {
  return sql`exists (select 1 from creator_sprints pool_member where pool_member.id = ${campaignId} and coalesce(pool_member.budget_pool_id, pool_member.id) = ${campaignBudgetPoolId(poolCampaignId)})`
}
export function campaignContentBudgetCents(id: CampaignId) {
  return sql<number>`(select budget_owner.budget_cents from creator_sprints budget_owner where budget_owner.id = ${campaignBudgetPoolId(id)})`
}
export function campaignBonusBudgetCents(id: CampaignId) {
  return sql<number>`(select coalesce((budget_owner.terms->>'bonusBudgetCents')::int, 0) from creator_sprints budget_owner where budget_owner.id = ${campaignBudgetPoolId(id)})`
}
// A transferred rereview retains its prior earnings in the original budget.
export function campaignCommittedCents(id: CampaignId) {
  return sql<number>`(
    coalesce((select sum(s.approved_amount_cents) from creator_submissions s where ${campaignPoolMember(sql`s.sprint_id`, id)}), 0)
    + coalesce((select sum(t.amount_cents) from creator_campaign_transfers t where ${campaignPoolMember(sql`t.from_sprint_id`, id)}), 0)
    - coalesce((select sum(t.amount_cents) from creator_campaign_transfers t where ${campaignPoolMember(sql`t.to_sprint_id`, id)}), 0)
  )::float8`
}
// Pending requests reserve only the amount beyond previously approved earnings.
// Computed from saved terms, so rejections release reservations without rewriting money.
export function campaignPendingCents(id: CampaignId, excludeSubmissionId?: string) {
  return sql<number>`coalesce((select sum(greatest(0,
    creator_campaign_expected_payout(s.sprint_terms, s.view_count_threshold, s.us_audience_percent)
    - coalesce(s.approved_amount_cents, 0))) from creator_submissions s
    where ${campaignPoolMember(sql`s.sprint_id`, id)} and s.status in ('pending', 'in_review') and not s.is_draft
    ${excludeSubmissionId ? sql`and s.id <> ${excludeSubmissionId}` : sql``}), 0)::float8`
}
export function campaignBonusCommittedCents(id: CampaignId, paidOnly = false) {
  return sql<number>`coalesce((select sum(p.amount_cents) from creator_payments p where ${campaignPoolMember(sql`p.bonus_sprint_id`, id)} and ${paidOnly ? sql`p.status = 'paid'` : sql`p.status <> 'cancelled'`}), 0)::float8`
}
export function campaignPaidCents(id: CampaignId) {
  return sql<number>`(
    coalesce((select sum(p.amount_cents) from creator_payments p join creator_submissions s on s.id = p.submission_id where ${campaignPoolMember(sql`s.sprint_id`, id)} and p.status = 'paid' and p.currency = 'USD'), 0)
    + coalesce((select sum(least(t.amount_cents, (select coalesce(sum(p.amount_cents), 0) from creator_payments p where p.submission_id = t.submission_id and p.status = 'paid' and p.currency = 'USD'))) from creator_campaign_transfers t where ${campaignPoolMember(sql`t.from_sprint_id`, id)}), 0)
    - coalesce((select sum(least(t.amount_cents, (select coalesce(sum(p.amount_cents), 0) from creator_payments p where p.submission_id = t.submission_id and p.status = 'paid' and p.currency = 'USD'))) from creator_campaign_transfers t where ${campaignPoolMember(sql`t.to_sprint_id`, id)}), 0)
  )::float8`
}
