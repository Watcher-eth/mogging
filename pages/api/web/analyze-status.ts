import type { NextApiRequest, NextApiResponse } from 'next'
import { eq } from 'drizzle-orm'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { db, schema } from '@/lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const { requestId } = req.query
    if (typeof requestId !== 'string' || !/^[a-z0-9:_-]{1,200}$/i.test(requestId)) throw new ApiError(400, 'Invalid scan request ID')
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Sign in to check your scan')
    const reservation = await db.query.scanReservations.findFirst({
      where: eq(schema.scanReservations.id, `${userId}:web-v2:${requestId}`),
      columns: { status: true },
    })
    return json(res, 200, { status: reservation?.status ?? 'waiting' })
  } catch (error) { return handleApiError(error, res) }
}
