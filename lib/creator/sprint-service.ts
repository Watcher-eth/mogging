import { launchCampaign, LAUNCH_CONTENT_BUDGET_CENTS, LAUNCH_BONUS_BUDGET_CENTS } from './campaign-launch'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import {
  sprintInputSchema,
  type CreatorSprint,
  type SprintProof,
} from './sprints'
import type { z } from 'zod'
import type { CampaignPreview } from './campaign-preview'

export async function getCampaignPreview(id: string): Promise<CampaignPreview | null> {
  const [row] = await db.select({
    id: schema.creatorSprints.id,
    name: schema.creatorSprints.name,
    description: schema.creatorSprints.description,
    status: schema.creatorSprints.status,
    budgetCents: schema.creatorSprints.budgetCents,
    terms: schema.creatorSprints.terms,
    startsAt: schema.creatorSprints.startsAt,
    endsAt: schema.creatorSprints.endsAt,
  }).from(schema.creatorSprints).where(and(
    eq(schema.creatorSprints.id, id),
    inArray(schema.creatorSprints.status, ['published', 'ended']),
  )).limit(1)
  if (!row) return null
  const { terms, ...preview } = row
  return { ...preview, budgetCents: row.budgetCents + (launchCampaign(terms) ? terms.bonusBudgetCents ?? 0 : 0), startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() }
}

export async function listCreatorSprints(
  admin = false,
): Promise<CreatorSprint[]> {
  const rows = await db
    .select()
    .from(schema.creatorSprints)
    .where(
      admin
        ? undefined
        : inArray(schema.creatorSprints.status, ['published', 'ended']),
    )
    .orderBy(desc(schema.creatorSprints.startsAt), sql`case ${schema.creatorSprints.terms}->'formats'->0->>'id'
      when 'launch-general-looksmaxxing-v1' then 0
      when 'launch-feature-comparison-v1' then 1
      when 'launch-detailed-analysis-v1' then 2
      else 3 end`)
  if (!rows.length) return []
  const totals = await db
    .select({
      sprintId: schema.creatorSubmissions.sprintId,
      status: schema.creatorSubmissions.status,
      count: sql<number>`count(*)::int`,
      cents: sql<number>`coalesce(sum(${schema.creatorSubmissions.approvedAmountCents}),0)::float8`,
    })
    .from(schema.creatorSubmissions)
    .where(
      inArray(
        schema.creatorSubmissions.sprintId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(
      schema.creatorSubmissions.sprintId,
      schema.creatorSubmissions.status,
    )
  const spending = await db.select({
    id: schema.creatorSprints.id,
    paidCents: sql<number>`coalesce((select sum(p.amount_cents) from creator_payments p join creator_submissions s on s.id = p.submission_id where s.sprint_id = creator_sprints.id and p.status = 'paid' and p.currency = 'USD'), 0)::int`,
    bonusUsedCents: sql<number>`coalesce((select sum(p.amount_cents) from creator_payments p where p.bonus_sprint_id = creator_sprints.id and p.status <> 'cancelled'), 0)::int`,
    bonusPaidCents: sql<number>`coalesce((select sum(p.amount_cents) from creator_payments p where p.bonus_sprint_id = creator_sprints.id and p.status = 'paid'), 0)::int`,
  }).from(schema.creatorSprints).where(inArray(schema.creatorSprints.id, rows.map(row => row.id)))
  const spendingById = new Map(spending.map(row => [row.id, row]))
  return rows.map((row) => {
    const counts = {
      pending: 0,
      in_review: 0,
      approved: 0,
      rejected: 0,
      paid: 0,
    }
    let usedCents = 0
    for (const total of totals)
      if (total.sprintId === row.id) {
        counts[total.status] = total.count
        usedCents += total.cents
      }
    return {
      ...row,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      usedCents,
      paidCents: spendingById.get(row.id)?.paidCents ?? 0,
      bonusUsedCents: spendingById.get(row.id)?.bonusUsedCents ?? 0,
      bonusPaidCents: spendingById.get(row.id)?.bonusPaidCents ?? 0,
      counts,
    }
  })
}
export async function sprintApprovedSubmissions(
  sprintId: string,
): Promise<SprintProof[]> {
  const sprint = await db.query.creatorSprints.findFirst({
    where: eq(schema.creatorSprints.id, sprintId),
  })
  if (!sprint || sprint.status === 'draft')
    throw new ApiError(404, 'Campaign not found')
  const rows = await db
    .select({
      id: schema.creatorSubmissions.id,
      handle: sql<string | null>`coalesce(${schema.creatorSocialAccounts.handle}, (
        select min(account.handle) from creator_social_accounts account
        where account.creator_profile_id = ${schema.creatorSubmissions.creatorProfileId}
          and account.platform::text = lower(${schema.creatorSubmissions.platform})
          and account.handle is not null
        having count(*) = 1
      ))`,
      title: schema.creatorSubmissions.title,
      platform: schema.creatorSubmissions.platform,
      postUrl: schema.creatorSubmissions.postUrl,
      views: schema.creatorSubmissions.adminViewCountThreshold,
      amountCents: schema.creatorSubmissions.approvedAmountCents,
      status: schema.creatorSubmissions.status,
      createdAt: schema.creatorSubmissions.createdAt,
    })
    .from(schema.creatorSubmissions)
    .leftJoin(
      schema.creatorSocialAccounts,
      eq(
        schema.creatorSubmissions.socialAccountId,
        schema.creatorSocialAccounts.id,
      ),
    )
    .where(
      and(
        eq(schema.creatorSubmissions.sprintId, sprintId),
        inArray(schema.creatorSubmissions.status, ['approved', 'paid']),
      ),
    )
    .orderBy(
      desc(sql`case when ${schema.creatorSubmissions.status} = 'paid' then coalesce((
        select max(payment.paid_at) from creator_payments payment
        where payment.submission_id = ${schema.creatorSubmissions.id}
          and payment.status = 'paid'
      ), ${schema.creatorSubmissions.updatedAt}) else ${schema.creatorSubmissions.updatedAt} end`),
      desc(schema.creatorSubmissions.createdAt),
    )
    .limit(100)
  return rows.map((row) => ({
    ...row,
    views: row.views || 0,
    amountCents: row.amountCents || 0,
    createdAt: row.createdAt.toISOString(),
  }))
}
export async function saveCreatorSprint(
  input: z.infer<typeof sprintInputSchema>,
) {
  return db.transaction(async (tx) => {
    let existingStatus = 'draft'
    if (input.id) {
      const [existing] = await tx
        .select()
        .from(schema.creatorSprints)
        .where(eq(schema.creatorSprints.id, input.id))
        .for('update')
      if (!existing) throw new ApiError(404, 'Campaign not found')
      existingStatus = existing.status
      const [used] = await tx
        .select({
          cents: sql<number>`coalesce(sum(${schema.creatorSubmissions.approvedAmountCents}),0)::float8`,
        })
        .from(schema.creatorSubmissions)
        .where(
          and(
            eq(schema.creatorSubmissions.sprintId, input.id),
          ),
        )
      const contentBudget = existing.status === 'draft' && launchCampaign(input.terms) ? LAUNCH_CONTENT_BUDGET_CENTS : input.budgetCents
      if (contentBudget < used.cents)
        throw new ApiError(
          409,
          'Budget cannot be below already committed earnings',
        )
    }
    const newLaunch = existingStatus === 'draft' && launchCampaign(input.terms)
    const values = {
      name: input.name,
      description: input.description,
      status: input.status,
      budgetCents: newLaunch ? LAUNCH_CONTENT_BUDGET_CENTS : input.budgetCents,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      terms: newLaunch ? { ...input.terms, bonusBudgetCents: LAUNCH_BONUS_BUDGET_CENTS } : input.terms,
      updatedAt: new Date(),
    }
    const [sprint] = input.id
      ? await tx
          .update(schema.creatorSprints)
          .set(values)
          .where(eq(schema.creatorSprints.id, input.id))
          .returning()
      : await tx.insert(schema.creatorSprints).values(values).returning()
    return sprint
  })
}
