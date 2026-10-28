import { canReserveSubmission } from './campaign-budget-state'
import { sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { campaignBudgetPoolId, campaignCommittedCents, campaignPendingCents } from './campaign-accounting'

type Transaction = Pick<Parameters<Parameters<typeof db.transaction>[0]>[0], 'execute'>
// Every submission, rereview, approval, and bonus locks the same owner row.
export async function lockCampaignBudget(tx: Transaction, campaignId: string) {
  const [owner] = await tx.execute<{ id: string; budget_cents: number; terms: { bonusBudgetCents?: number } }>(sql`
    select id, budget_cents, terms from creator_sprints where id = ${campaignBudgetPoolId(campaignId)} for update`)
  if (!owner) throw new ApiError(404, 'Campaign budget not found')
  return owner
}
export async function requireSubmissionBudget(tx: Transaction, campaignId: string, requestedCents: number, options: { rereview?: boolean; committedAdjustmentCents?: number; excludeSubmissionId?: string } = {}) {
  const owner = await lockCampaignBudget(tx, campaignId)
  const [balance] = await tx.execute<{ committed: number; pending: number }>(sql`select ${campaignCommittedCents(campaignId)} as committed, ${campaignPendingCents(campaignId, options.excludeSubmissionId)} as pending`)
  const available = owner.budget_cents - balance.committed - balance.pending - (options.committedAdjustmentCents ?? 0)
  if (!canReserveSubmission(available, requestedCents, options.rereview)) {
    throw new ApiError(409, 'Not enough campaign budget remains for this request. Pending submissions reserve budget. Refresh the campaign to see availability.')
  }
  return owner
}
