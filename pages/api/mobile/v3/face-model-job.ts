import { createHmac } from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { faceModelWorker } from '@/lib/analysis/face-model-runtime'
import { enforceRateLimit } from '@/lib/api/rateLimit'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const owner = await getRequestUserId(req, res)
    if (!owner) throw new ApiError(401, 'Sign in to finish your face model.')
    const { id, capture } = z.object({ id: z.string().min(1).max(100), capture: z.string().uuid() }).parse(req.body)
    const [row] = await db.select({ presentation: schema.analyses.metrics }).from(schema.analyses)
      .innerJoin(schema.photos, eq(schema.photos.id, schema.analyses.photoId))
      .where(and(eq(schema.analyses.id, id), eq(schema.photos.userId, owner), eq(schema.analyses.status, 'complete'))).limit(1)
    if (!row || row.presentation.presentation !== 'face-model') throw new ApiError(404, 'Face model not found.')
    const { origin, secret } = faceModelWorker()
    await enforceRateLimit(req, res, { key: 'face-model-ticket', identity: owner, limit: 30, windowMs: 60 * 60 * 1000 })
    const payload = Buffer.from(JSON.stringify({ model: id, capture, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
    const token = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
    return json(res, 200, { origin, token })
  } catch (error) { return handleApiError(error, res) }
}
