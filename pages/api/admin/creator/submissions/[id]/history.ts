import type { NextApiRequest,NextApiResponse } from 'next'
import { and,asc,eq,like,or } from 'drizzle-orm'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { ApiError,handleApiError,json,methodNotAllowed } from '@/lib/api/http'
import { db,schema } from '@/lib/db'
import { submissionHistory } from '@/lib/admin/submission-history'

export default async function handler(req: NextApiRequest,res: NextApiResponse) {
  try {
    if(req.method!=='GET') return methodNotAllowed(res,['GET'])
    await requireCreatorAdmin(req,res)
    if(typeof req.query.id!=='string') throw new ApiError(400,'Invalid submission')
    const post=await db.query.creatorSubmissions.findFirst({ where: eq(schema.creatorSubmissions.id,req.query.id) })
    if(!post||post.isDraft) throw new ApiError(404,'Submission not found')
    const [updates,messages,payments]=await Promise.all([
      db.query.creatorSubmissionUpdates.findMany({ where: eq(schema.creatorSubmissionUpdates.submissionId,post.id),orderBy: [asc(schema.creatorSubmissionUpdates.createdAt),asc(schema.creatorSubmissionUpdates.id)] }),
      db.query.creatorSubmissionMessages.findMany({ where: and(eq(schema.creatorSubmissionMessages.submissionId,post.id),eq(schema.creatorSubmissionMessages.authorRole,'creator'),like(schema.creatorSubmissionMessages.body,'Submitted fresh analytics for review:%')) }),
      db.query.creatorPayments.findMany({ where: and(eq(schema.creatorPayments.creatorProfileId,post.creatorProfileId),or(eq(schema.creatorPayments.submissionId,post.id),...['audience','exclusivity','conversion'].map(kind => like(schema.creatorPayments.bonusKey,`${kind}:${post.id}:%`)))) }),
    ])
    res.setHeader('Cache-Control','private, no-store')
    return json(res,200,{ entries: submissionHistory(post,updates,messages,payments),hasLegacyEvents: !updates.some(u => u.type==='submitted'&&u.historySnapshot)||updates.some(u => !u.historySnapshot) })
  } catch(error) { return handleApiError(error,res) }
}
