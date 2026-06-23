import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { env } from '@/lib/env'
import { getStripe } from '@/lib/payments/stripe'

const checkoutSchema = z.object({
  tier: z.enum(['monthly', 'yearly']),
  source: z.string().trim().max(80).optional(),
})

type MobileSubscriptionTier = z.infer<typeof checkoutSchema>['tier']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    if (!env.STRIPE_SECRET_KEY) {
      throw new ApiError(503, 'Payments are not configured')
    }

    const input = parseBody(checkoutSchema, req.body)
    const origin = getRequestOrigin(req)
    const source = input.source || 'web2app'
    const stripe = getStripe()
    const lineItem = getSubscriptionLineItem(input.tier)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      line_items: [lineItem],
      metadata: {
        product: 'mobile_subscription',
        tier: input.tier,
        source,
      },
      subscription_data: {
        metadata: {
          product: 'mobile_subscription',
          tier: input.tier,
          source,
        },
      },
      success_url: `${origin}/app?checkout=success&tier=${input.tier}&source=${encodeURIComponent(source)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app?checkout=cancelled&tier=${input.tier}&source=${encodeURIComponent(source)}`,
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

function getSubscriptionLineItem(tier: MobileSubscriptionTier) {
  const configuredPrice = tier === 'monthly'
    ? env.STRIPE_MOBILE_MONTHLY_PRICE_ID
    : env.STRIPE_MOBILE_YEARLY_PRICE_ID

  if (configuredPrice) {
    return {
      price: configuredPrice,
      quantity: 1,
    }
  }

  const yearly = tier === 'yearly'
  const interval: 'month' | 'year' = yearly ? 'year' : 'month'

  return {
    price_data: {
      currency: 'usd',
      product_data: {
        name: yearly ? 'Mogging Pro Yearly' : 'Mogging Pro Monthly',
        description: yearly
          ? 'Annual access to Mogging mobile analysis and progress reports.'
          : 'Monthly access to Mogging mobile analysis and progress reports.',
      },
      unit_amount: yearly ? env.STRIPE_MOBILE_YEARLY_PRICE_CENTS : env.STRIPE_MOBILE_MONTHLY_PRICE_CENTS,
      recurring: {
        interval,
      },
    },
    quantity: 1,
  }
}

function getRequestOrigin(req: NextApiRequest) {
  const forwardedProto = req.headers['x-forwarded-proto']
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
  const protocol = proto || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  const host = req.headers.host || 'localhost:3000'

  return `${protocol}://${host}`
}
