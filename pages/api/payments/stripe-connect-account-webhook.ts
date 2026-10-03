import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, methodNotAllowed, json } from '@/lib/api/http'
import { env } from '@/lib/env'
import { getStripe } from '@/lib/payments/stripe'
import { rawBody, connectAccountEvent } from '@/lib/courses/webhooks'

export const config = { api: { bodyParser: false } }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    if (!env.COURSES_ENABLED || !env.STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET) throw new ApiError(503, 'Course account webhook is not configured')
    const signature = req.headers['stripe-signature']
    if (typeof signature !== 'string') throw new ApiError(400, 'Missing signature')
    const body = await rawBody(req)
    let event
    try { event = await getStripe().parseEventNotificationAsync(body, signature, env.STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET) } catch { throw new ApiError(400, 'Invalid signature') }
    await connectAccountEvent(event)
    return json(res, 200, { received: true })
  } catch (error) { return handleApiError(error, res) }
}
