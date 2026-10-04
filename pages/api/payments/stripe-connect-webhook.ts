import { monitorBackend } from '@/lib/reliability/monitor'
import { getCourseStripe } from '@/lib/courses/stripe'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, methodNotAllowed, json } from '@/lib/api/http'
import { env } from '@/lib/env'
import { rawBody, connectEvent } from '@/lib/courses/webhooks'
export const config = { api: { bodyParser: false } }
async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    if (!env.COURSES_ENABLED || !env.COURSE_STRIPE_SECRET_KEY || !env.STRIPE_CONNECT_WEBHOOK_SECRET) throw new ApiError(503, 'Course webhook is not configured')
    const signature = req.headers['stripe-signature']
    if (typeof signature !== 'string') throw new ApiError(400, 'Missing signature')
    const body = await rawBody(req)
    let event
    try { event = await getCourseStripe().webhooks.constructEventAsync(body, signature, env.STRIPE_CONNECT_WEBHOOK_SECRET) } catch { throw new ApiError(400, 'Invalid signature') }
    await connectEvent(event)
    return json(res, 200, { received: true })
  } catch (error) { return handleApiError(error, res) }
}

export default monitorBackend('payments/stripe-connect-webhook',handler)
