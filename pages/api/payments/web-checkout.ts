import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import { getAuthSession } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { getCheckoutLineItem, getProductConfig, paymentProductSchemaValues } from '@/lib/payments/entitlements'
import { getStripe } from '@/lib/payments/stripe'

const checkoutSchema = z.object({
  product: z.enum(paymentProductSchemaValues),
  mobileInstallId: z.string().trim().min(8).max(120),
  source: z.string().trim().max(80).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    if (!env.STRIPE_SECRET_KEY) {
      throw new ApiError(503, 'Payments are not configured')
    }

    const input = parseBody(checkoutSchema, req.body)
    const session = await getAuthSession(req, res)
    const anonymousActorId = session?.user?.id ? null : getOrSetAnonymousActorId(req, res)
    const origin = getRequestOrigin(req)
    const product = getProductConfig(input.product)
    const source = input.source || 'web2app'
    const checkout = await getStripe().checkout.sessions.create({
      mode: product.mode,
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      client_reference_id: input.mobileInstallId,
      line_items: [getCheckoutLineItem(input.product)],
      metadata: {
        product: input.product,
        mobileInstallId: input.mobileInstallId,
        source,
        userId: session?.user?.id ?? '',
        anonymousActorId: anonymousActorId ?? '',
      },
      ...(product.mode === 'subscription'
        ? {
            subscription_data: {
              metadata: {
                product: input.product,
                mobileInstallId: input.mobileInstallId,
                source,
              },
            },
          }
        : null),
      success_url: `${origin}/app?checkout=success&product=${input.product}&source=${encodeURIComponent(source)}&install_id=${encodeURIComponent(input.mobileInstallId)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app?checkout=cancelled&product=${input.product}&source=${encodeURIComponent(source)}&install_id=${encodeURIComponent(input.mobileInstallId)}`,
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
