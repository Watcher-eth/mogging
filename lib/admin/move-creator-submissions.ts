import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { ApiError } from '@/lib/api/http'
import { db, schema } from '@/lib/db'
import { canSeeCampaign } from '@/lib/creator/campaign-access'
import { campaignBudgetPoolId, campaignCommittedCents, campaignPendingCents } from '@/lib/creator/campaign-accounting'
import { creatorRetainerTerms } from '@/lib/creator/retainer'
import { sprintReviewItems } from '@/lib/creator/sprints'

const { creatorCampaignTransfers, creatorPayments, creatorSprints, creatorSubmissions } = schema

export async function moveCreatorSubmissions(input: {
  submissionIds: string[]
  sourceId: string
  targetId: string
  formatId: string
  creatorId?: string
}, database: Pick<typeof db, 'transaction'> = db) {
  const { submissionIds, sourceId, targetId, formatId, creatorId } = input
  if (!submissionIds.length || sourceId === targetId) throw new ApiError(400, 'Choose another campaign')

  return database.transaction(async tx => {
    const posts = await tx.select().from(creatorSubmissions)
      .where(inArray(creatorSubmissions.id, submissionIds)).orderBy(asc(creatorSubmissions.id)).for('update')
    if (posts.length !== submissionIds.length || posts.some(post =>
      post.sprintId !== sourceId || post.isDraft || !post.sprintTerms || (creatorId && post.creatorProfileId !== creatorId)
    )) throw new ApiError(409, 'The submissions changed. Refresh the campaign before moving them.')

    const [inFlight] = await tx.select({ id: creatorPayments.id }).from(creatorPayments)
      .where(and(inArray(creatorPayments.submissionId, submissionIds), inArray(creatorPayments.status, ['pending', 'processing']))).limit(1)
    if (inFlight) throw new ApiError(409, 'Wait for the scheduled payment to finish before moving this submission')

    const prior = await tx.select().from(creatorCampaignTransfers).where(inArray(creatorCampaignTransfers.submissionId, submissionIds))
    const priorBySubmission = new Map(prior.map(transfer => [transfer.submissionId, transfer]))
    if (posts.some(post => {
      const transfer = priorBySubmission.get(post.id)
      return transfer && (transfer.toSprintId !== sourceId || transfer.amountCents !== (post.approvedAmountCents ?? 0))
    })) throw new ApiError(409, 'This submission earned more after a previous move. Its campaign accounting needs manual review.')

    // Match the lock order used for campaign review, and order locks within each group.
    const owners = await tx.execute<{ id: string; budget_cents: number }>(sql`
      select id, budget_cents from creator_sprints
      where id in (${campaignBudgetPoolId(sourceId)}, ${campaignBudgetPoolId(targetId)}) order by id for update
    `)
    const campaigns = await tx.select().from(creatorSprints)
      .where(inArray(creatorSprints.id, [sourceId, targetId])).orderBy(asc(creatorSprints.id)).for('update')
    const source = campaigns.find(campaign => campaign.id === sourceId)
    const target = campaigns.find(campaign => campaign.id === targetId)
    const now = new Date()
    const format = target?.terms.formats.find(item => item.id === formatId && item.active)
    if (!source || !target || !format || target.status !== 'published' || target.startsAt > now || target.endsAt <= now) {
      throw new ApiError(409, 'Choose an active campaign and format')
    }
    if (posts.some(post => !canSeeCampaign(target.audience, post.creatorProfileId))) {
      throw new ApiError(409, 'The destination campaign is unavailable to this creator')
    }
    const targetPool = target.budgetPoolId ?? target.id
    const sourcePool = source.budgetPoolId ?? source.id
    const owner = owners.find(row => row.id === targetPool)
    if (!owner || !owners.some(row => row.id === sourcePool)) throw new ApiError(409, 'The campaign budget changed. Try again.')

    const [before] = await tx.execute<{ cents: number }>(sql`select (${campaignCommittedCents(targetId)} + ${campaignPendingCents(targetId)}) as cents`)
    for (const post of posts) {
      const terms = creatorRetainerTerms(target.terms, post.sprintTerms?.retainer, post.createdAt)
      const transfer = priorBySubmission.get(post.id)
      const reason = 'Admin corrected campaign assignment; original approved earnings retained'
      if (transfer) {
        await tx.update(creatorCampaignTransfers).set({ toSprintId: targetId, reason: `${transfer.reason}\n${reason} (${sourceId} to ${targetId})` })
          .where(eq(creatorCampaignTransfers.submissionId, post.id))
      } else {
        await tx.insert(creatorCampaignTransfers).values({
          submissionId: post.id, fromSprintId: sourceId, toSprintId: targetId,
          amountCents: post.approvedAmountCents ?? 0, reason,
        })
      }
      const oldItems = post.sprintTerms ? sprintReviewItems(post.sprintTerms, post.formatId || '') : []
      const reviewChecklist = post.reviewChecklist && sprintReviewItems(terms, format.id).map(item => {
        const saved = oldItems.some(old => old.id === item.id && old.label === item.label)
          ? post.reviewChecklist?.find(result => result.id === item.id) : undefined
        return { id: item.id, met: saved?.met ?? false, note: saved?.note ?? null }
      })
      const oldTitle = post.sprintTerms?.formats.find(item => item.id === post.formatId)?.name
      await tx.update(creatorSubmissions).set({
        sprintId: targetId, sprintTerms: terms, formatId: format.id,
        title: post.title === oldTitle ? format.name : post.title,
        requirementsConfirmedAt: null, exclusivityConfirmed: false, bonusPlacement: null, reviewChecklist, updatedAt: now,
      }).where(eq(creatorSubmissions.id, post.id))
    }
    const [after] = await tx.execute<{ cents: number }>(sql`select (${campaignCommittedCents(targetId)} + ${campaignPendingCents(targetId)}) as cents`)
    if (after.cents > before.cents && after.cents > owner.budget_cents) {
      throw new ApiError(409, 'The destination campaign budget cannot cover these submissions')
    }
    return { submissionIds, campaignId: target.id, campaignName: target.name }
  })
}
