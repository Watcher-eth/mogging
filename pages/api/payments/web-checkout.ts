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
    await validateCheckoutProduct(input.product, product)
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

async function validateCheckoutProduct(productId: string, product: ReturnType<typeof getProductConfig>) {
  if (!product.priceId && product.unitAmount < 50) {
    throw new ApiError(503, `${product.name} is missing a valid checkout price`)
  }

  if (product.mode === 'subscription' && !product.interval && !product.priceId) {
    throw new ApiError(503, `${product.name} is missing a subscription interval`)
  }

  if (process.env.NODE_ENV === 'production' && product.mode === 'subscription' && !product.priceId) {
    throw new ApiError(503, `${product.name} is missing its Stripe price ID (${productId})`)
  }

  if (!product.priceId) return

  const priceEnvName = getStripePriceEnvName(productId)
  if (!/^price_[A-Za-z0-9]+$/.test(product.priceId)) {
    throw new ApiError(503, `${product.name} has an invalid Stripe price ID in ${priceEnvName}`)
  }

  const price = await getStripe().prices.retrieve(product.priceId).catch((error: unknown) => {
    if (isMissingStripePriceError(error)) {
      throw new ApiError(
        503,
        `${product.name} uses a Stripe price ID that does not exist for the configured STRIPE_SECRET_KEY. Update ${priceEnvName}.`
      )
    }
    throw error
  })
  if (!price.active) {
    throw new ApiError(503, `${product.name} uses an inactive Stripe price in ${priceEnvName}`)
  }

  if (product.mode === 'subscription') {
    if (!price.recurring) {
      throw new ApiError(503, `${product.name} must use a recurring Stripe price`)
    }
    if (product.interval && price.recurring.interval !== product.interval) {
      throw new ApiError(503, `${product.name} Stripe price must recur every ${product.interval}, not ${price.recurring.interval}`)
    }
    return
  }

  if (price.recurring) {
    throw new ApiError(503, `${product.name} must use a one-time Stripe price`)
  }
}

function getStripePriceEnvName(productId: string) {
  if (productId === 'evaluation') return 'STRIPE_EVALUATION_PRICE_ID'
  if (productId === 'evaluation_pack_3') return 'STRIPE_EVALUATION_PACK_3_PRICE_ID'
  if (productId === 'mobile_subscription_weekly') return 'STRIPE_MOBILE_WEEKLY_PRICE_ID'
  if (productId === 'mobile_subscription_monthly') return 'STRIPE_MOBILE_MONTHLY_PRICE_ID'
  if (productId === 'mobile_subscription_yearly') return 'STRIPE_MOBILE_YEARLY_PRICE_ID'
  if (productId === 'mobile_lifetime') return 'STRIPE_MOBILE_LIFETIME_PRICE_ID'
  if (productId === 'extra_potential_image') return 'STRIPE_EXTRA_POTENTIAL_IMAGE_PRICE_ID'
  return 'STRIPE_*_PRICE_ID'
}

function isMissingStripePriceError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const record = error as { type?: unknown; code?: unknown; param?: unknown; statusCode?: unknown }
  return (
    record.type === 'StripeInvalidRequestError' &&
    record.code === 'resource_missing' &&
    record.param === 'price' &&
    record.statusCode === 404
  )
}

function getRequestOrigin(req: NextApiRequest) {
  const forwardedProto = req.headers['x-forwarded-proto']
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
  const protocol = proto || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  const host = req.headers.host || 'localhost:3000'

  return `${protocol}://${host}`
}
