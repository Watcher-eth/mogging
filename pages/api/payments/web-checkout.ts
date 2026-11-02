import { readLandingCookie, serializeLandingAssignment, landingProperties } from '@/lib/analytics/landing'
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
import { getAccountCreatorAttribution, getStoredMobileCreatorAttribution, recordCreatorCheckout, resolveCreatorAttribution, stripeAttributionMetadata } from '@/lib/creator/attribution'
import { generatePaymentActivationCode, getCheckoutLineItem, getProductConfig, paymentProductSchemaValues } from '@/lib/payments/entitlements'
import { locales } from '@/lib/i18n/locales'
import { priceAmounts } from '@/lib/payments/subscription-prices'
import { getStripe } from '@/lib/payments/stripe'
import { validateCheckoutProduct } from '@/lib/payments/checkout-price'

const checkoutSchema = z.object({
  attemptId: z.string().uuid().optional(),
  flowId: z.string().uuid().optional(),
  product: z.enum(paymentProductSchemaValues),
  mobileInstallId: z.string().trim().min(8).max(120),
  returnLocale: z.enum(locales).optional(),
  currency: z.string().regex(/^[a-z]{3}$/).optional(),
  unitAmount: z.number().int().nonnegative().optional(),
  locale: z.enum(['en', 'de', 'es', 'fr', 'zh']).optional(),
  source: z.string().trim().max(80).optional(),
  returnTo: z.literal('analysis').optional(),
})

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    if (!env.STRIPE_SECRET_KEY) {
      throw new ApiError(503, 'Payments are not configured')
    }

    const landingAssignment = readLandingCookie(req.headers.cookie ?? '')
    const input = parseBody(checkoutSchema, req.body)
    const accountId = await getRequestUserId(req, res)
    if (!accountId) throw new ApiError(401, 'Sign in before starting checkout')
    const origin = getRequestOrigin(req)
    const product = getProductConfig(input.product)
    const price = await validateCheckoutProduct(input.product, product)
    if (input.currency || input.unitAmount !== undefined) {
      const currency = input.currency ?? price?.currency ?? 'usd'
      const amount = price ? priceAmounts(price)[currency] : currency === 'usd' ? product.unitAmount : undefined
      if (amount === undefined) throw new ApiError(400, 'The selected currency is unavailable')
      if (input.unitAmount !== undefined && input.unitAmount !== amount) throw new ApiError(409, 'The price has changed. Please reload the plans')
    }
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
    }) || await getAccountCreatorAttribution(accountId)
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
              const matches =
                (!input.currency || session.currency === input.currency) &&
                (input.unitAmount === undefined || session.metadata?.quotedUnitAmount === String(input.unitAmount)) &&
                (!input.locale || session.locale === input.locale) &&
                (!input.returnLocale || session.metadata?.returnLocale === input.returnLocale) &&
                session.metadata?.returnTo === input.returnTo &&
                session.metadata?.creatorClickId === attribution.clickId &&
                session.metadata?.mobileInstallId === input.mobileInstallId &&
                session.metadata?.landingAssignment === (landingAssignment ? serializeLandingAssignment(landingAssignment) : undefined)
              if (matches) return session
              // Keep creator, installation, and experiment credit with the matching checkout.
              await getStripe().checkout.sessions.expire(session.id)
            }
            const coupon = await getStripe().coupons.retrieve(CREATOR_MONTHLY_COUPON)
            if (!coupon.valid || coupon.percent_off !== 10 || coupon.duration !== 'once') throw new ApiError(503, 'Creator discount is temporarily unavailable')
          }
        }
      }
      return getStripe().checkout.sessions.create({
        mode: product.mode,
        ...(input.currency ? { currency: input.currency, adaptive_pricing: { enabled: false } } : {}),
        ...(input.locale ? { locale: input.locale } : {}),
        payment_method_types: ['card'],
        ...(discounted ? { discounts: [{ coupon: CREATOR_MONTHLY_COUPON }] } : { allow_promotion_codes: true }),
        ...(customer ? { customer } : {}),
        client_reference_id: accountId,
        line_items: [getCheckoutLineItem(input.product)],
        ...(product.mode === 'payment' ? { payment_intent_data: { metadata: { product: input.product, accountId, userId: accountId, source } } } : {}),
        metadata: {
          product: input.product,
          ...(input.attemptId ? { attemptId: input.attemptId, paywallVersion: '2' } : {}),
          ...(input.flowId ? { flowId: input.flowId } : {}),
          ...(input.returnTo ? { returnTo: input.returnTo } : {}),
          ...(input.returnLocale ? { returnLocale: input.returnLocale } : {}),
          ...(input.unitAmount !== undefined ? { quotedUnitAmount: String(input.unitAmount) } : {}),
          mobileInstallId: input.mobileInstallId,
          source,
          activationCode,
          ...(landingAssignment ? { landingAssignment: serializeLandingAssignment(landingAssignment) } : {}),
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
        success_url: input.returnTo === 'analysis' ? `${origin}/analysis?checkout=success&session_id={CHECKOUT_SESSION_ID}` : `${origin}/app/handoff?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: input.returnTo === 'analysis' ? `${origin}/analysis?checkout=cancelled` : `${origin}${input.returnLocale && input.returnLocale !== 'en' ? `/${input.returnLocale}` : ''}/?checkout=cancelled&product=${input.product}`,
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
        attempt_id: input.attemptId, flow_id: input.flowId, ...(input.attemptId ? { paywall_version: '2' } : {}),
        ...landingProperties(landingAssignment),
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


function getRequestOrigin(req: NextApiRequest) {
  const forwardedProto = req.headers['x-forwarded-proto']
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
  const protocol = proto || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  const host = req.headers.host || 'localhost:3000'

  return `${protocol}://${host}`
}

export default monitorBackend('payments/web-checkout',handler)
