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
    startsAt: schema.creatorSprints.startsAt,
    endsAt: schema.creatorSprints.endsAt,
  }).from(schema.creatorSprints).where(and(
    eq(schema.creatorSprints.id, id),
    inArray(schema.creatorSprints.status, ['published', 'ended']),
  )).limit(1)
  return row ? { ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() } : null
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
    .orderBy(desc(schema.creatorSprints.startsAt))
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
      handle: schema.creatorSocialAccounts.handle,
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
    .orderBy(desc(schema.creatorSubmissions.adminViewCountThreshold))
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
    if (input.id) {
      const [existing] = await tx
        .select()
        .from(schema.creatorSprints)
        .where(eq(schema.creatorSprints.id, input.id))
        .for('update')
      if (!existing) throw new ApiError(404, 'Campaign not found')
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
      if (input.budgetCents < used.cents)
        throw new ApiError(
          409,
          'Budget cannot be below already committed earnings',
        )
    }
    const values = {
      name: input.name,
      description: input.description,
      status: input.status,
      budgetCents: input.budgetCents,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      terms: input.terms,
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
