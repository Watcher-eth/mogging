import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { CreatorUpdateType } from './updates'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function recordSubmissionUpdate(tx: Transaction, submissionId: string, type: CreatorUpdateType, note?: string | null, createdAt = new Date()) {
  await tx.insert(schema.creatorSubmissionUpdates).values({ submissionId, type, note: note?.trim() || null, createdAt })
}

export async function recordReviewUpdate(tx: Transaction, previous: { id: string; status: string; reviewNote: string | null; reviewRequestedAt?: Date | null; adminViewCountThreshold?: number | null }, next: { status: CreatorUpdateType; reviewNote?: string | null; adminViewCountThreshold?: number | null }) {
  if (next.status === 'paid') return
  const newApprovedMilestone = next.status === 'approved' && (next.adminViewCountThreshold ?? 0) > (previous.adminViewCountThreshold ?? 0)
  if (previous.status !== next.status || newApprovedMilestone || (previous.reviewRequestedAt && ['approved', 'rejected'].includes(next.status))) {
    await recordSubmissionUpdate(tx, previous.id, next.status, next.reviewNote)
  } else if (next.reviewNote?.trim() && next.reviewNote.trim() !== previous.reviewNote?.trim()) {
    await recordSubmissionUpdate(tx, previous.id, 'feedback', next.reviewNote)
  }
}

export function getCreatorSubmissionUpdates(creatorProfileId: string) {
  const updates = schema.creatorSubmissionUpdates, posts = schema.creatorSubmissions
  return db.select({ id: updates.id, submissionId: updates.submissionId, type: updates.type, note: updates.note, createdAt: updates.createdAt, title: posts.title })
    .from(updates).innerJoin(posts, eq(posts.id, updates.submissionId))
    .where(and(eq(posts.creatorProfileId, creatorProfileId), eq(posts.isDraft, false)))
    .orderBy(desc(updates.createdAt), desc(updates.id)).limit(50)
}
