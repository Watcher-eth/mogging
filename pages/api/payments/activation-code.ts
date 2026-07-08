import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { env } from '@/lib/env'
import { grantEntitlementFromCheckoutSession } from '@/lib/payments/entitlements'
import { getStripe } from '@/lib/payments/stripe'

const querySchema = z.object({
  session_id: z.string().trim().min(8).max(255),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    if (!env.STRIPE_SECRET_KEY) {
      throw new ApiError(503, 'Payments are not configured')
    }

    const input = querySchema.parse(req.query)
    const session = await getStripe().checkout.sessions.retrieve(input.session_id, {
      expand: ['subscription'],
    })

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      throw new ApiError(402, 'Checkout has not completed')
    }

    const activationCode = readActivationCode(session.metadata?.activationCode)
    if (!activationCode) {
      throw new ApiError(404, 'Activation code not found for this checkout')
    }

    await grantEntitlementFromCheckoutSession({ session })

    return json(res, 200, {
      activationCode,
      product: session.metadata?.product ?? null,
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}

function readActivationCode(value: unknown) {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  return /^\d{6}$/.test(digits) ? digits : null
}
