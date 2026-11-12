import type { NextApiRequest, NextApiResponse } from 'next'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { MAX_REACH_VIEW_COUNT } from '@/lib/admin/reach-views'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { db, schema } from '@/lib/db'

const countsSchema = z.object({
  reach: z.number().int().min(0).max(MAX_REACH_VIEW_COUNT),
  views: z.number().int().min(1).max(MAX_REACH_VIEW_COUNT),
  storageKey: z.string().min(1).max(500).nullable(),
}).strict().refine(({ reach, views }) => reach <= views, 'Reach cannot exceed total views')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH'])
    await requireCreatorAdmin(req, res)
    if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') {
      throw new ApiError(403, 'Use the admin review dialog to save reach and views')
    }
    if (typeof req.query.id !== 'string' || !req.query.id) throw new ApiError(400, 'Invalid submission')
    const counts = parseBody(countsSchema, req.body)
    const submission = schema.creatorSubmissions
    const [saved] = await db.update(submission).set({ manualReachViewCounts: counts })
      .where(and(eq(submission.id, req.query.id), eq(submission.isDraft, false),
        sql`${submission.analyticsStorageKey} is not distinct from ${counts.storageKey}`))
      .returning({ id: submission.id })
    if (!saved) throw new ApiError(409, 'The submission or its analytics recording changed. Reopen the review and try again.')
    return json(res, 200, { reach: counts.reach, views: counts.views, source: 'manual' })
  } catch (error) {
    return handleApiError(error, res)
  }
}
