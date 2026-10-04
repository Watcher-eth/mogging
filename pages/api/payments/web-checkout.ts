import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { CREATOR_MONTHLY_COUPON, getCreatorStripeCustomer, isCreatorDiscountEligible } from '@/lib/payments/creator-discount'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { recordServerEvent } from '@/lib/analytics/events'
import { env } from '@/lib/env'
import { getStoredMobileCreatorAttribution, recordCreatorCheckout, resolveCreatorAttribution, stripeAttributionMetadata } from '@/lib/creator/attribution'
import { generatePaymentActivationCode, getCheckoutLineItem, getProductConfig, paymentProductSchemaValues } from '@/lib/payments/entitlements'
import { getStripe } from '@/lib/payments/stripe'

const checkoutSchema = z.object({
  product: z.enum(paymentProductSchemaValues),
  mobileInstallId: z.string().trim().min(8).max(120),
  source: z.string().trim().max(80).optional(),
})

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    if (!env.STRIPE_SECRET_KEY) {
      throw new ApiError(503, 'Payments are not configured')
    }

    const input = parseBody(checkoutSchema, req.body)
    const accountId = await getRequestUserId(req, res)
    if (!accountId) throw new ApiError(401, 'Sign in before starting checkout')
    const origin = getRequestOrigin(req)
    const product = getProductConfig(input.product)
    await validateCheckoutProduct(input.product, product)
    const source = input.source || 'web2app'
    const activationCode = generatePaymentActivationCode()
    const attribution = await resolveCreatorAttribution({
      req,
      owner: {
        userId: accountId,
        anonymousActorId: null,
        mobileInstallId: input.mobileInstallId,
      },
    }) || await getStoredMobileCreatorAttribution({
      mobileInstallId: input.mobileInstallId,
      userId: accountId,
      anonymousActorId: null,
    })
    const attributionMetadata = stripeAttributionMetadata(attribution)
    const checkout = await db.transaction(async (tx) => {
      // Serialize this account's eligibility check and session creation, including retries.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`creator-discount:${accountId}`}, 0))`)
      const customer = product.mode === 'subscription' ? await getCreatorStripeCustomer(accountId) : undefined
      let discounted = false
      if (input.product === 'mobile_subscription_monthly' && attribution) {
        discounted = await isCreatorDiscountEligible(accountId, attribution)
        if (discounted) {
          const subscriptions = await getStripe().subscriptions.list({ customer: customer!, status: 'all', limit: 1 })
          discounted = subscriptions.data.length === 0
          if (discounted) {
            const sessions = await getStripe().checkout.sessions.list({ customer: customer!, status: 'open', limit: 100 })
            const pending = sessions.data.filter(session => session.metadata?.creatorDiscount === CREATOR_MONTHLY_COUPON && session.url)
            for (const session of pending) {
              if (session.metadata?.creatorClickId === attribution.clickId && session.metadata?.mobileInstallId === input.mobileInstallId) return session
              // A changed creator or installation must not inherit the previous checkout's credit.
              await getStripe().checkout.sessions.expire(session.id)
            }
            const coupon = await getStripe().coupons.retrieve(CREATOR_MONTHLY_COUPON)
            if (!coupon.valid || coupon.percent_off !== 10 || coupon.duration !== 'once') throw new ApiError(503, 'Creator discount is temporarily unavailable')
          }
        }
      }
      return getStripe().checkout.sessions.create({
        mode: product.mode,
        payment_method_types: ['card'],
        ...(discounted ? { discounts: [{ coupon: CREATOR_MONTHLY_COUPON }] } : { allow_promotion_codes: true }),
        ...(customer ? { customer } : {}),
        client_reference_id: accountId,
        line_items: [getCheckoutLineItem(input.product)],
        metadata: {
          product: input.product,
          mobileInstallId: input.mobileInstallId,
          source,
          activationCode,
          accountId,
          userId: accountId,
          ...attributionMetadata,
          ...(discounted ? { creatorDiscount: CREATOR_MONTHLY_COUPON } : {}),
        },
        ...(product.mode === 'subscription'
          ? {
              subscription_data: {
                metadata: {
                  product: input.product,
                  mobileInstallId: input.mobileInstallId,
                  source,
                  activationCode,
                  accountId,
                  userId: accountId,
                  ...attributionMetadata,
                  ...(discounted ? { creatorDiscount: CREATOR_MONTHLY_COUPON } : {}),
                },
              },
            }
          : null),
        success_url: `${origin}/app/handoff?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=cancelled&product=${input.product}`,
      })
    })

    if (!checkout.url) {
      throw new ApiError(500, 'Failed to create checkout session')
    }

    await recordCreatorCheckout(attribution, checkout)
    await recordServerEvent({
      eventName: 'checkout_started',
      accountId,
      sessionId: checkout.id,
      source,
      properties: {
        product: input.product,
        mobileInstallId: input.mobileInstallId,
      },
    })

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

export default monitorBackend('payments/web-checkout',handler)
