import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, json, methodNotAllowed, handleApiError } from '@/lib/api/http'
import { env } from '@/lib/env'
import { processBillingWebhook } from '@/lib/payments/billing-ledger'
import { maintainCourses } from '@/lib/courses/maintenance'
export const config = { maxDuration: 60 }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST'].includes(req.method || '')) return methodNotAllowed(res, ['GET', 'POST'])
  try {
    if (!env.COURSES_ENABLED) return json(res, 200, { enabled: false })
    if (!env.CRON_SECRET) throw new ApiError(503, 'Course maintenance is not configured')
    const received = createHash('sha256').update(req.headers.authorization || '').digest()
    const expected = createHash('sha256').update(`Bearer ${env.CRON_SECRET}`).digest()
    if (!timingSafeEqual(received, expected)) throw new ApiError(401, 'Invalid scheduler credentials')
    let result: Awaited<ReturnType<typeof maintainCourses>> | null = null
    const processed = await processBillingWebhook('course-maintenance', String(Math.floor(Date.now() / 300_000)), async () => { result = await maintainCourses() })
    return json(res, 200, { processed, result })
  } catch (error) { return handleApiError(error, res) }
}
