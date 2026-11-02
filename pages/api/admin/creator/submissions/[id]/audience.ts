import type { NextApiRequest, NextApiResponse } from 'next'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    await requireCreatorAdmin(req, res)
    if (typeof req.query.id !== 'string') throw new ApiError(400, 'Invalid submission')
    const [submission] = await db.select({ check: schema.creatorSubmissions.audienceCheck, storageKey: schema.creatorSubmissions.analyticsStorageKey,
      isDraft: schema.creatorSubmissions.isDraft }).from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.id, req.query.id))
    if (!submission || submission.isDraft) throw new ApiError(404, 'Submission not found')
    res.setHeader('Cache-Control', 'private, no-store')
    return json(res, 200, { check: submission.check, storageKey: submission.storageKey })
  } catch (error) { return handleApiError(error, res) }
}
