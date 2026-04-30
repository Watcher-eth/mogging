import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { env } from '@/lib/env'
import { getStripe } from '@/lib/payments/stripe'

const checkoutSchema = z.object({
  imageCount: z.number().int().min(1).max(3),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    if (!env.STRIPE_SECRET_KEY) {
      throw new ApiError(503, 'Payments are not configured')
    }

    const input = parseBody(checkoutSchema, req.body)
    const origin = getRequestOrigin(req)
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Facial Aesthetic Assessment',
              description: `Analysis for ${input.imageCount} uploaded image${input.imageCount === 1 ? '' : 's'}`,
            },
            unit_amount: env.STRIPE_ANALYSIS_PRICE_CENTS,
          },
          quantity: 1,
        },
      ],
      metadata: {
        product: 'analysis',
        imageCount: String(input.imageCount),
      },
      success_url: `${origin}/analysis?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/analysis?checkout=cancelled`,
    })

    if (!session.url) {
      throw new ApiError(500, 'Failed to create checkout session')
    }

    return json(res, 200, {
      url: session.url,
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}

function getRequestOrigin(req: NextApiRequest) {
  const forwardedProto = req.headers['x-forwarded-proto']
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
  const protocol = proto || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  const host = req.headers.host || 'localhost:3000'

  return `${protocol}://${host}`
}
