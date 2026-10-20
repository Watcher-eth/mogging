import type { NextApiRequest, NextApiResponse } from 'next'
import { and, desc, eq, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { monitorBackend } from '@/lib/reliability/monitor'

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  res.setHeader('Cache-Control', 'no-store')
  try {
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Your session expired. Restore purchases or sign in.')
    const { before } = z.object({ before: z.string().max(180).optional() }).parse(req.query)
    const cursor = before ? z.tuple([z.string().datetime(), z.string().min(1).max(100)]).parse(before.split('|')) : null
    const rows = await db.select({ photo: schema.photos, analysis: schema.analyses }).from(schema.analyses)
      .innerJoin(schema.photos, eq(schema.photos.id, schema.analyses.photoId))
      .where(and(eq(schema.photos.userId, userId), eq(schema.photos.photoType, 'face'), eq(schema.analyses.status, 'complete'),
        cursor ? or(lt(schema.analyses.createdAt, new Date(cursor[0])), and(eq(schema.analyses.createdAt, new Date(cursor[0])), lt(schema.analyses.id, cursor[1]))) : undefined))
      .orderBy(desc(schema.analyses.createdAt), desc(schema.analyses.id)).limit(50)
    return json(res, 200, { reports: rows.map(({ photo, analysis }) => ({
      photo: { id: photo.id, imageUrl: photo.imageUrl, gender: photo.gender }, analysis,
    })), next: rows.length === 50 ? `${rows[rows.length - 1].analysis.createdAt.toISOString()}|${rows[rows.length - 1].analysis.id}` : null })
  } catch (error) { return handleApiError(error, res) }
}
export default monitorBackend('mobile/reports', handler)
