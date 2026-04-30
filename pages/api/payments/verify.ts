import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { env } from '@/lib/env'
import { getStripe } from '@/lib/payments/stripe'

const verifySchema = z.object({
  session_id: z.string().min(1),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    if (!env.STRIPE_SECRET_KEY) {
      throw new ApiError(503, 'Payments are not configured')
    }

    const query = verifySchema.parse(req.query)
    const session = await getStripe().checkout.sessions.retrieve(query.session_id)

    return json(res, 200, {
      paid: session.payment_status === 'paid',
      status: session.status,
      paymentStatus: session.payment_status,
      sessionId: session.id,
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}
