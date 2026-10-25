import { sql, type SQL } from 'drizzle-orm'

// A transferred rereview keeps its original earnings in the original campaign.
// Only additional approved earnings consume the destination campaign's budget.
export function campaignCommittedCents(id: string | SQL) {
  return sql<number>`(
    coalesce((select sum(s.approved_amount_cents) from creator_submissions s where s.sprint_id = ${id}), 0)
    + coalesce((select sum(t.amount_cents) from creator_campaign_transfers t where t.from_sprint_id = ${id}), 0)
    - coalesce((select sum(t.amount_cents) from creator_campaign_transfers t where t.to_sprint_id = ${id}), 0)
  )::float8`
}

export function campaignPaidCents(id: string | SQL) {
  return sql<number>`(
    coalesce((select sum(p.amount_cents) from creator_payments p join creator_submissions s on s.id = p.submission_id where s.sprint_id = ${id} and p.status = 'paid' and p.currency = 'USD'), 0)
    + coalesce((select sum(least(t.amount_cents, (select coalesce(sum(p.amount_cents), 0) from creator_payments p where p.submission_id = t.submission_id and p.status = 'paid' and p.currency = 'USD'))) from creator_campaign_transfers t where t.from_sprint_id = ${id}), 0)
    - coalesce((select sum(least(t.amount_cents, (select coalesce(sum(p.amount_cents), 0) from creator_payments p where p.submission_id = t.submission_id and p.status = 'paid' and p.currency = 'USD'))) from creator_campaign_transfers t where t.to_sprint_id = ${id}), 0)
  )::float8`
}
