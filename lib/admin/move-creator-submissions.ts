import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { ApiError } from '@/lib/api/http'
import { db, schema } from '@/lib/db'
import { canSeeCampaign } from '@/lib/creator/campaign-access'
import { campaignBudgetPoolId, campaignCommittedCents, campaignPendingCents } from '@/lib/creator/campaign-accounting'
import { creatorRetainerTerms } from '@/lib/creator/retainer'
import { creatorContentBalances } from '@/lib/creator/money'
import { sprintPayoutCents, sprintReviewItems } from '@/lib/creator/sprints'

const { creatorCampaignTransfers, creatorPayments, creatorPayoutRequests, creatorProfiles, creatorSprints, creatorSubmissions } = schema

export async function moveCreatorSubmissions(input: {
  submissionIds: string[]
  sourceId: string
  targetId: string
  formatId: string
  creatorId?: string
  reviewerId?: string
  expectedPriorApproval?: number | null
  expectedApproval?: number | null
}, database: Pick<typeof db, 'transaction'> = db) {
  const { submissionIds, sourceId, targetId, formatId, creatorId } = input
  if (!submissionIds.length || sourceId === targetId) throw new ApiError(400, 'Choose another campaign')

  return database.transaction(async tx => {
    const requested = await tx.select({ creatorId: creatorSubmissions.creatorProfileId }).from(creatorSubmissions)
      .where(inArray(creatorSubmissions.id, submissionIds))
    const creatorIds = [...new Set(requested.map(post => post.creatorId))]
    if (requested.length !== submissionIds.length || (creatorId && creatorIds.some(id => id !== creatorId))) {
      throw new ApiError(409, 'The submissions changed. Refresh before moving them.')
    }
    await tx.select({ id: creatorProfiles.id }).from(creatorProfiles)
      .where(inArray(creatorProfiles.id, creatorIds)).orderBy(asc(creatorProfiles.id)).for('update')
    const bundles = await tx.select().from(creatorPayoutRequests)
      .where(and(inArray(creatorPayoutRequests.creatorProfileId, creatorIds), eq(creatorPayoutRequests.status, 'pending')))
      .orderBy(asc(creatorPayoutRequests.id)).for('update')
    const creatorPosts = await tx.select().from(creatorSubmissions)
      .where(inArray(creatorSubmissions.creatorProfileId, creatorIds)).orderBy(asc(creatorSubmissions.id)).for('update')
    const posts = creatorPosts.filter(post => submissionIds.includes(post.id))
    if (posts.length !== submissionIds.length || posts.some(post => post.sprintId !== sourceId || post.isDraft || !post.sprintTerms)) {
      throw new ApiError(409, 'The submissions changed. Refresh before moving them.')
    }
    const corrections = new Set(posts.filter(post => post.approvedAmountCents != null).map(post => post.creatorProfileId))
    const payments = await tx.select().from(creatorPayments)
      .where(inArray(creatorPayments.creatorProfileId, creatorIds)).orderBy(asc(creatorPayments.id)).for('update')
    if (payments.some(payment => corrections.has(payment.creatorProfileId) && payment.submissionId &&
      (payment.status === 'processing' || (payment.status === 'pending' && (payment.providerReference != null || payment.cryptoBatchId != null))))) {
      throw new ApiError(409, 'Wait for the creator’s payout in progress before correcting campaign earnings')
    }
    if (payments.some(payment => corrections.has(payment.creatorProfileId) && payment.submissionId && payment.currency !== 'USD' &&
      ['paid', 'pending'].includes(payment.status))) {
      throw new ApiError(409, 'This creator has a non-USD content payout. Its accounting needs manual review.')
    }

    const prior = await tx.select().from(creatorCampaignTransfers).where(inArray(creatorCampaignTransfers.submissionId, submissionIds))
    const priorBySubmission = new Map(prior.map(transfer => [transfer.submissionId, transfer]))

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
      const paid = payments.filter(payment => payment.submissionId === post.id && payment.status === 'paid')
        .reduce((sum, payment) => sum + payment.amountCents, 0)
      if (transfer && (transfer.toSprintId !== sourceId || (transfer.fromSprintId !== sourceId && paid > transfer.amountCents))) {
        throw new ApiError(409, 'This submission has settled payouts from multiple campaigns. Its accounting needs manual review.')
      }
      if (post.approvedAmountCents != null && (post.adminViewCountThreshold == null || post.adminUsAudiencePercent == null)) {
        throw new ApiError(409, 'Verified views and audience are required to recalculate this approval')
      }
      const corrected = post.approvedAmountCents != null
      const approvedAmountCents = corrected
        ? sprintPayoutCents(terms, post.adminViewCountThreshold!, post.adminUsAudiencePercent) : null
      if ((input.expectedPriorApproval !== undefined && input.expectedPriorApproval !== post.approvedAmountCents) ||
          (input.expectedApproval !== undefined && input.expectedApproval !== approvedAmountCents)) {
        throw new ApiError(409, 'The payout changed. Refresh the queue and review the updated amount.')
      }
      const audit = `${now.toISOString()} · Admin campaign correction${input.reviewerId ? ` by ${input.reviewerId}` : ''} (${sourceId} to ${targetId}). Approval: ${post.approvedAmountCents ?? 'none'} → ${approvedAmountCents ?? 'none'} cents; settled: ${paid} cents.`
      if (transfer) {
        await tx.update(creatorCampaignTransfers).set({ toSprintId: targetId, amountCents: paid, reason: `${transfer.reason}\n${audit}` })
          .where(eq(creatorCampaignTransfers.submissionId, post.id))
      } else {
        await tx.insert(creatorCampaignTransfers).values({
          submissionId: post.id, fromSprintId: sourceId, toSprintId: targetId, amountCents: paid, reason: audit,
        })
      }
      const oldItems = post.sprintTerms ? sprintReviewItems(post.sprintTerms, post.formatId || '') : []
      const reviewChecklist = post.reviewChecklist && sprintReviewItems(terms, format.id).map(item => {
        const saved = oldItems.some(old => old.id === item.id && old.label === item.label)
          ? post.reviewChecklist?.find(result => result.id === item.id) : undefined
        return { id: item.id, met: saved?.met ?? false, note: saved?.note ?? null }
      })
      const oldTitle = post.sprintTerms?.formats.find(item => item.id === post.formatId)?.name
      const status = post.status === 'paid' && (approvedAmountCents ?? 0) > paid ? 'approved'
        : post.status === 'approved' && paid > 0 && paid >= (approvedAmountCents ?? 0) ? 'paid' : post.status
      const [updated] = await tx.update(creatorSubmissions).set({
        approvedAmountCents, campaignPayoutCorrected: corrected || post.campaignPayoutCorrected, status,
        sprintId: targetId, sprintTerms: terms, formatId: format.id,
        title: post.title === oldTitle ? format.name : post.title,
        requirementsConfirmedAt: null, exclusivityConfirmed: false, bonusPlacement: null, reviewChecklist, updatedAt: now,
      }).where(eq(creatorSubmissions.id, post.id)).returning()
      creatorPosts[creatorPosts.indexOf(post)] = updated
    }
    const [after] = await tx.execute<{ cents: number }>(sql`select (${campaignCommittedCents(targetId)} + ${campaignPendingCents(targetId)}) as cents`)
    if (after.cents > before.cents && after.cents > owner.budget_cents) {
      throw new ApiError(409, 'The destination campaign budget cannot cover these submissions')
    }
    for (const id of corrections) {
      const creatorPayments = payments.filter(payment => payment.creatorProfileId === id)
      const { unpaid } = creatorContentBalances(creatorPosts.filter(post => post.creatorProfileId === id && !post.isDraft), creatorPayments)
      for (const payment of creatorPayments) {
        if (!payment.submissionId || payment.status !== 'pending') continue
        const available = unpaid.get(payment.submissionId) ?? 0
        const amount = Math.min(available, payment.amountCents)
        unpaid.set(payment.submissionId, available - amount)
        if (amount === payment.amountCents) continue
        const change = amount ? { amountCents: amount } : { status: 'cancelled' as const }
        await tx.update(schema.creatorPayments).set({ ...change, updatedAt: now }).where(eq(schema.creatorPayments.id, payment.id))
        if (amount) payment.amountCents = amount
        else payment.status = 'cancelled'
      }
      for (const bundle of bundles.filter(request => request.creatorProfileId === id)) {
        const amountCents = creatorPayments.filter(payment => payment.payoutRequestId === bundle.id && payment.status !== 'cancelled')
          .reduce((sum, payment) => sum + payment.amountCents, 0)
        if (amountCents !== bundle.amountCents) {
          await tx.update(creatorPayoutRequests).set(amountCents ? { amountCents } : { status: 'cancelled' })
            .where(eq(creatorPayoutRequests.id, bundle.id))
        }
      }
    }
    return { submissionIds, campaignId: target.id, campaignName: target.name }
  })
}
