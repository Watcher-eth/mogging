import { and, asc, desc, eq, gt, inArray, lte } from 'drizzle-orm'
import type { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { ApiError } from '@/lib/api/http'
import { launchCampaign } from './campaign-launch'
import { sprintReviewItems } from './sprints'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Submission = typeof schema.creatorSubmissions.$inferSelect

// Call with the submission locked, and apply the returned assignment in the
// same transaction. The old campaign retains its already-approved commitment.
export async function expiredRereviewAssignment(tx: Transaction, post: Submission, now = new Date()) {
  if (!post.sprintId || !post.sprintTerms || launchCampaign(post.sprintTerms)) return undefined
  const source = await tx.query.creatorSprints.findFirst({ where: eq(schema.creatorSprints.id, post.sprintId) })
  if (!source || (source.status !== 'ended' && source.endsAt.getTime() > now.getTime())) return undefined
  const active = await tx.query.creatorSprints.findMany({
    where: and(eq(schema.creatorSprints.status, 'published'), lte(schema.creatorSprints.startsAt, now), gt(schema.creatorSprints.endsAt, now)),
    orderBy: [desc(schema.creatorSprints.startsAt), asc(schema.creatorSprints.id)],
  })
  const general = active.find(campaign => launchCampaign(campaign.terms)?.key === 'general-looksmaxxing')
  if (!general) throw new ApiError(409, 'No active General Looksmaxxing campaign is available for this rereview')
  const locked = await tx.select().from(schema.creatorSprints).where(inArray(schema.creatorSprints.id, [source.id, general.id])).orderBy(asc(schema.creatorSprints.id)).for('update')
  const destination = locked.find(campaign => campaign.id === general.id)
  if (!destination || destination.status !== 'published' || destination.startsAt > now || destination.endsAt <= now) throw new ApiError(409, 'The rereview campaign changed. Please try again.')
  const format = destination.terms.formats.find(format => format.active)
  if (!format) throw new ApiError(409, 'The rereview campaign has no active content requirements')
  const previous = await tx.query.creatorCampaignTransfers.findFirst({ where: eq(schema.creatorCampaignTransfers.submissionId, post.id) })
  if (previous) throw new ApiError(409, 'This post already has a campaign transfer. Its accounting needs review.')
  await tx.insert(schema.creatorCampaignTransfers).values({
    submissionId: post.id, fromSprintId: source.id, toSprintId: destination.id,
    amountCents: post.approvedAmountCents ?? 0,
    reason: 'Expired campaign rereview moved to General Looksmaxxing; preserve prior approved earnings and payments',
  })
  const oldItems = sprintReviewItems(post.sprintTerms, post.formatId || '')
  const reviewChecklist = post.reviewChecklist ? sprintReviewItems(destination.terms, format.id).map(item => {
    const original = oldItems.find(old => old.id === item.id && old.label === item.label)
    const saved = original && post.reviewChecklist?.find(result => result.id === original.id)
    return { id: item.id, met: saved?.met ?? false, note: saved?.note ?? null }
  }) : null
  return { sprintId: destination.id, sprintTerms: destination.terms, formatId: format.id, reviewChecklist }
}
