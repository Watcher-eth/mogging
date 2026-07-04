import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import { getAuthSession } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { getCheckoutLineItem, getProductConfig } from '@/lib/payments/entitlements'
import { getStripe } from '@/lib/payments/stripe'
import type { PaymentProduct } from '@/lib/db/schema'

const checkoutSchema = z.object({
  imageCount: z.number().int().min(1).max(3),
  mobileInstallId: z.string().trim().min(8).max(120),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    if (!env.PAID_ANALYSIS_REQUIRED) {
      throw new ApiError(400, 'Payment is not required for analysis')
    }

    if (!env.STRIPE_SECRET_KEY) {
      throw new ApiError(503, 'Payments are not configured')
    }

    const input = parseBody(checkoutSchema, req.body)
    const authSession = await getAuthSession(req, res)
    const anonymousActorId = authSession?.user?.id ? null : getOrSetAnonymousActorId(req, res)
    const origin = getRequestOrigin(req)
    const productId: PaymentProduct = input.imageCount > 1 ? 'evaluation_pack_3' : 'evaluation'
    const product = getProductConfig(productId)
    const stripe = getStripe()
    const checkout = await stripe.checkout.sessions.create({
      mode: product.mode,
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      client_reference_id: input.mobileInstallId,
      line_items: [getCheckoutLineItem(productId)],
      metadata: {
        product: productId,
        mobileInstallId: input.mobileInstallId,
        source: 'web_analysis',
        imageCount: String(input.imageCount),
        userId: authSession?.user?.id ?? '',
        anonymousActorId: anonymousActorId ?? '',
      },
      success_url: `${origin}/analysis?checkout=success&product=${productId}&install_id=${encodeURIComponent(input.mobileInstallId)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/analysis?checkout=cancelled`,
    })

    if (!checkout.url) {
      throw new ApiError(500, 'Failed to create checkout session')
    }

    return json(res, 200, {
      url: checkout.url,
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
