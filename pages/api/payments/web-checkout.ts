import { webRequestContext } from '@/lib/analytics/web-context'
import { validateWebReturnOffer } from '@/lib/payments/web-return-offer'
import { readLandingCookie, serializeLandingAssignment, landingProperties } from '@/lib/analytics/landing'
import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { CREATOR_MONTHLY_COUPON, getCreatorStripeCustomer, getWebCreatorCoupon, hasStripeSubscriptionHistory, isCreatorDiscountEligible, resolveCheckoutCreator } from '@/lib/payments/creator-discount'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { recordServerEvent } from '@/lib/analytics/events'
import { env } from '@/lib/env'
import { recordCreatorCheckout, stripeAttributionMetadata } from '@/lib/creator/attribution'
import { generatePaymentActivationCode, getCheckoutLineItem, getEntitlementSummary, getProductConfig, paymentProductSchemaValues } from '@/lib/payments/entitlements'
import { locales } from '@/lib/i18n/locales'
import { priceAmounts, subscriptionProducts } from '@/lib/payments/subscription-prices'
import { getStripe } from '@/lib/payments/stripe'
import { getWebStarterIntroCoupon, validateCheckoutProduct } from '@/lib/payments/checkout-price'
import { createWebCheckoutGuest, rememberWebCheckoutGuest } from '@/lib/payments/guest-checkout'
import { isWebAnalysisProduct, WEB_ANALYSIS_CREATOR_COUPON, webAnalysisCheckoutLimit, webStarterIntro } from '@/lib/payments/web-analysis-plans'
import { readStarterIntro, requireActiveStarterIntro, starterIntroCookie } from '@/lib/payments/web-starter-intro'

const checkoutSchema = z.object({
  attemptId: z.string().uuid().optional(),
  flowId: z.string().uuid().optional(),
  flowVersion: z.string().max(80).optional(),
  paywallVersion: z.enum(['2', '3']).optional(),
  webPriceVariant: z.literal('mobile').optional(),
  guestCheckout: z.literal(true).optional(),
  imageCount: z.number().int().positive().optional(),
  entryMode: z.enum(['photo_first', 'onboarding_first']).optional(),
  product: z.enum(paymentProductSchemaValues).exclude(['extra_potential_image']),
  mobileInstallId: z.string().trim().min(8).max(120),
  returnLocale: z.enum(locales).optional(),
  currency: z.string().regex(/^[a-z]{3}$/).optional(),
  unitAmount: z.number().int().nonnegative().optional(),
  locale: z.enum(['en', 'de', 'es', 'fr', 'zh']).optional(),
  source: z.string().trim().max(80).optional(),
  returnOfferSessionId: z.string().regex(/^cs_(?:test_|live_)?[A-Za-z0-9]+$/).max(200).optional(),
  starterIntro: z.literal(true).optional(),
  creatorDiscount: z.literal(true).optional(),
  returnTo: z.enum(['analysis', 'scan-app-evaluation', 'scan-app-progress']).optional(),
})

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    if (!env.STRIPE_SECRET_KEY) {
      throw new ApiError(503, 'Payments are not configured')
    }

    const landingAssignment = readLandingCookie(req.headers.cookie ?? '')
    const input = parseBody(checkoutSchema, req.body)
    const { web_surface: webSurface } = webRequestContext(req.headers['user-agent'] || '')
    const channelMetadata: Record<string, string> = webSurface ? { webSurface } : {}
    const signedIn = await getRequestUserId(req, res)
    const productId = input.product
    const webPlan = isWebAnalysisProduct(productId)
    const mobileWeb = input.webPriceVariant === 'mobile'
    const isAnalysisCheckout = input.returnTo === 'analysis' && input.source === 'web_analysis'
    if (webPlan && !isAnalysisCheckout) throw new ApiError(400, 'Select this plan from web analysis')
    if (webPlan && (input.imageCount ?? 1) > webAnalysisCheckoutLimit(productId)) {
      throw new ApiError(400, 'Select a plan with enough scans for these photos')
    }
    if (input.starterIntro && (!isAnalysisCheckout || input.product !== webStarterIntro.product || input.returnOfferSessionId
      || input.currency && input.currency !== webStarterIntro.currency)) {
      throw new ApiError(400, 'This offer is for monthly Starter on web analysis')
    }
    const introDeadline = input.starterIntro ? requireActiveStarterIntro(
      input.flowId ? readStarterIntro(input.flowId, req.cookies[starterIntroCookie(input.flowId)], env.NEXTAUTH_SECRET) : null,
    ) : null
    const webAnalysisGuest = input.guestCheckout && input.returnTo === 'analysis' && input.source === 'web_analysis'
      && !input.returnOfferSessionId && (webPlan || subscriptionProducts.some(plan => plan === input.product))
    if (!signedIn && !webAnalysisGuest) throw new ApiError(401, 'Sign in before starting checkout')
    if (input.returnOfferSessionId && (input.product !== 'mobile_subscription_monthly' || input.returnTo !== 'analysis')) {
      throw new ApiError(400, 'Select monthly Pro to use this offer')
    }
    const origin = getRequestOrigin(req)
    const scanTab = input.returnTo === 'scan-app-progress' ? 'progress' : input.returnTo === 'scan-app-evaluation' ? 'evaluation' : null
    if (scanTab && input.product !== 'evaluation' && input.product !== 'evaluation_pack_3') {
      throw new ApiError(400, 'Select a scan pack for this checkout')
    }
    const scanReturn = scanTab ? `${origin}/app/home?tab=${scanTab}` : null
    const product = getProductConfig(input.product)
    const price = await validateCheckoutProduct(input.product, product, mobileWeb)
    const introCoupon = input.starterIntro && price ? await getWebStarterIntroCoupon(price, mobileWeb).catch(() => null) : null
    if (input.starterIntro && !introCoupon) throw new ApiError(503, 'The first-month offer is temporarily unavailable')
    if (input.currency || input.unitAmount !== undefined) {
      const currency = input.currency ?? price?.currency ?? 'usd'
      const amount = price ? priceAmounts(price)[currency] : currency === 'usd' ? product.unitAmount : undefined
      if (amount === undefined) throw new ApiError(400, 'The selected currency is unavailable')
      if (input.unitAmount !== undefined && input.unitAmount !== amount) throw new ApiError(409, 'The price has changed. Please reload the plans')
    }
    if (webPlan && signedIn) {
      const access = await getEntitlementSummary({ userId: signedIn, mobileInstallId: input.mobileInstallId })
      if (access.subscription.active || access.subscription.tier) throw new ApiError(409, 'Your current membership is still active. Manage it before starting another.')
    }
    const guest = signedIn ? null : await createWebCheckoutGuest(req, res)
    const accountId = guest?.accountId ?? signedIn!
    const source = input.source || 'web2app'
    const activationCode = guest ? undefined : generatePaymentActivationCode()
    const attribution = await resolveCheckoutCreator(req, accountId, guest ? undefined : input.mobileInstallId)
    const attributionMetadata = stripeAttributionMetadata(attribution)
    const couponId = webPlan ? WEB_ANALYSIS_CREATOR_COUPON : CREATOR_MONTHLY_COUPON
    const checkout = await db.transaction(async (tx) => {
      // Serialize this account's eligibility check and session creation, including retries.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`creator-discount:${accountId}`}, 0))`)
      const customer = !guest && product.mode === 'subscription' ? await getCreatorStripeCustomer(accountId) : undefined
      const previousOfferSession = input.returnOfferSessionId
        ? await validateWebReturnOffer(accountId, input.returnOfferSessionId, customer!)
        : null
      let discounted = Boolean(previousOfferSession)
      if (!previousOfferSession && !introCoupon && (input.product === 'mobile_subscription_monthly' || webPlan) && attribution) {
        discounted = guest ? webPlan : await isCreatorDiscountEligible(accountId, attribution)
        if (discounted && customer) discounted = !await hasStripeSubscriptionHistory(customer)
        if (discounted && webPlan) {
          const coupon = await getWebCreatorCoupon().catch(() => null)
          const stripeProduct = typeof price?.product === 'string' ? price.product : price?.product?.id
          if (!coupon || coupon.livemode !== price?.livemode || !stripeProduct || !coupon.applies_to?.products.includes(stripeProduct)) {
            throw new ApiError(503, 'Creator discount is temporarily unavailable')
          }
        }
        if (discounted && customer) {
          const sessions = await getStripe().checkout.sessions.list({ customer, status: 'open', limit: 100 })
          const pending = sessions.data.filter(session => session.metadata?.creatorDiscount && session.url)
          for (const session of pending) {
            const matches =
              session.metadata?.creatorDiscount === couponId &&
              session.metadata?.product === input.product &&
              (!input.currency || session.currency === input.currency) &&
              (input.unitAmount === undefined || session.metadata?.quotedUnitAmount === String(input.unitAmount)) &&
              (!input.locale || session.locale === input.locale) &&
              (!input.returnLocale || session.metadata?.returnLocale === input.returnLocale) &&
              session.metadata?.returnTo === input.returnTo &&
              session.metadata?.creatorClickId === attribution.clickId &&
              session.metadata?.mobileInstallId === input.mobileInstallId &&
              session.metadata?.landingAssignment === (landingAssignment ? serializeLandingAssignment(landingAssignment) : undefined)
            if (matches && session.metadata?.attemptId === input.attemptId) return session
            // Keep creator, installation, and experiment credit with the matching checkout.
            await getStripe().checkout.sessions.expire(session.id)
          }
        }
        if (discounted && !webPlan) {
          const coupon = await getStripe().coupons.retrieve(couponId)
          if (!coupon.valid || coupon.percent_off !== 10 || coupon.duration !== 'once') {
            throw new ApiError(503, 'Creator discount is temporarily unavailable')
          }
        }
      }
      if (input.creatorDiscount && (!webPlan || !discounted || introCoupon)) throw new ApiError(409, 'The creator discount has changed. Reopen the paywall to refresh your offer.')
      if (introDeadline !== null) requireActiveStarterIntro(introDeadline)
      const created = await getStripe().checkout.sessions.create({
        mode: product.mode,
        ...(input.currency || introCoupon ? { currency: input.currency ?? webStarterIntro.currency, adaptive_pricing: { enabled: false } } : {}),
        ...(input.locale ? { locale: input.locale } : {}),
        payment_method_types: ['card'],
        ...(introCoupon || discounted ? { discounts: [{ coupon: introCoupon ?? couponId }] } : { allow_promotion_codes: true }),
        ...(customer ? { customer } : {}),
        client_reference_id: accountId,
        line_items: [webPlan && price ? { price: price.id, quantity: 1 } : getCheckoutLineItem(input.product)],
        ...(product.mode === 'payment' ? { payment_intent_data: { metadata: { ...channelMetadata, product: input.product, accountId, userId: accountId, source } } } : {}),
        metadata: {
          ...channelMetadata,
          product: input.product,
          ...(previousOfferSession ? { returnOffer: '1' } : {}),
          ...(introCoupon ? { starterIntro: introCoupon } : {}),
          ...(input.attemptId ? { attemptId: input.attemptId, paywallVersion: input.paywallVersion ?? '2' } : {}),
          ...(input.flowId ? { flowId: input.flowId } : {}),
          ...(input.flowVersion ? { flowVersion: input.flowVersion } : {}),
          ...(input.entryMode ? { entryMode: input.entryMode } : {}),
          ...(input.returnTo ? { returnTo: input.returnTo } : {}),
          ...(input.returnLocale ? { returnLocale: input.returnLocale } : {}),
          ...(input.unitAmount !== undefined ? { quotedUnitAmount: String(input.unitAmount) } : {}),
          mobileInstallId: input.mobileInstallId,
          source,
          ...(activationCode ? { activationCode } : {}),
          ...(landingAssignment ? { landingAssignment: serializeLandingAssignment(landingAssignment) } : {}),
          accountId,
          userId: accountId,
          ...attributionMetadata,
          ...(discounted ? { creatorDiscount: couponId } : {}),
        },
        ...(product.mode === 'subscription'
          ? {
              subscription_data: {
                metadata: {
                  ...channelMetadata,
                  ...(webPlan && price ? { recurringAmount: String(price.unit_amount), recurringCurrency: price.currency } : {}),
                  product: input.product,
                  mobileInstallId: input.mobileInstallId,
                  source,
                  ...(activationCode ? { activationCode } : {}),
                  accountId,
                  userId: accountId,
                  ...attributionMetadata,
                  ...(introCoupon ? { starterIntro: introCoupon } : {}),
                  ...(discounted ? { creatorDiscount: couponId } : {}),
                },
              },
            }
          : null),
        success_url: scanReturn ? `${scanReturn}&scan_checkout=success&session_id={CHECKOUT_SESSION_ID}` : input.returnTo === 'analysis' ? `${origin}/analysis?checkout=success${guest ? '&guest=1' : ''}&session_id={CHECKOUT_SESSION_ID}` : `${origin}/app/handoff?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: scanReturn ? `${scanReturn}&scan_checkout=cancelled` : input.returnTo === 'analysis' ? `${origin}/analysis?checkout=cancelled` : `${origin}${input.returnLocale && input.returnLocale !== 'en' ? `/${input.returnLocale}` : ''}/?checkout=cancelled&product=${input.product}`,
      }, previousOfferSession ? { idempotencyKey: `web-return:${previousOfferSession.id}:${input.attemptId ?? 'default'}` } : undefined)
      if (previousOfferSession) {
        try { await getStripe().checkout.sessions.expire(previousOfferSession.id) }
        catch (error) {
          await getStripe().checkout.sessions.expire(created.id).catch(() => undefined)
          throw error
        }
      }
      return created
    })

    if (!checkout.url) {
      throw new ApiError(500, 'Failed to create checkout session')
    }

    await recordServerEvent({
      eventName: 'checkout_started',
      accountId,
      sessionId: checkout.id,
      source,
      properties: {
        web_surface: webSurface, creator_tracking_link_id: attribution?.trackingLinkId, creator_discount: checkout.metadata?.creatorDiscount,
        product: input.product, provider: 'stripe', surface: source, offering: introCoupon ? 'starter_intro' : input.returnOfferSessionId ? 'stripe_return' : undefined,
        attempt_id: input.attemptId, flow_id: input.flowId, flow_version: input.flowVersion, entry_mode: input.entryMode, ...(input.attemptId ? { paywall_version: input.paywallVersion ?? '2' } : {}),
        ...landingProperties(landingAssignment),
        mobileInstallId: input.mobileInstallId,
      },
    })

    await recordCreatorCheckout(attribution, checkout).catch(() => {
      // Provider metadata still carries the attribution for payment reconciliation.
      console.warn('creator:checkout-attribution-pending')
    })

    if (guest) rememberWebCheckoutGuest(res, checkout.id, guest.recoveryKey)
    return json(res, 200, {
      url: checkout.url, sessionId: checkout.id,
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
