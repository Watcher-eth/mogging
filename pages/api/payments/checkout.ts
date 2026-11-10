import { webRequestContext } from '@/lib/analytics/web-context'
import { recordServerEvent } from '@/lib/analytics/events'
import { landingProperties, readLandingCookie, serializeLandingAssignment } from '@/lib/analytics/landing'
import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { env } from '@/lib/env'
import { getAccountCreatorAttribution, recordCreatorCheckout, resolveCreatorAttribution, stripeAttributionMetadata } from '@/lib/creator/attribution'
import { getCheckoutLineItem, getProductConfig, getEntitlementSummary } from '@/lib/payments/entitlements'
import { getStripe } from '@/lib/payments/stripe'
import { validateCheckoutProduct } from '@/lib/payments/checkout-price'
import { createWebCheckoutGuest, rememberWebCheckoutGuest } from '@/lib/payments/guest-checkout'
import type { PaymentProduct } from '@/lib/db/schema'

const checkoutSchema = z.object({
  attemptId: z.string().uuid().optional(),
  flowId: z.string().uuid().optional(),
  flowVersion: z.string().max(80).optional(),
  paywallVersion: z.enum(['2', '3']).optional(),
  guestCheckout: z.literal(true).optional(),
  entryMode: z.enum(['photo_first', 'onboarding_first']).optional(),
  unitAmount: z.number().int().nonnegative().optional(),
  currency: z.string().regex(/^[a-z]{3}$/).optional(),
  imageCount: z.number().int().min(1).max(3),
  mobileInstallId: z.string().trim().min(8).max(120),
})

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    if (!env.STRIPE_SECRET_KEY) {
      throw new ApiError(503, 'Payments are not configured')
    }

    const input = parseBody(checkoutSchema, req.body)
    const { web_surface: webSurface } = webRequestContext(req.headers['user-agent'] || '')
    const channelMetadata: Record<string, string> = webSurface ? { webSurface } : {}
    const signedIn = await getRequestUserId(req, res)
    if (!signedIn && !input.guestCheckout) throw new ApiError(401, 'Sign in before starting checkout')
    if (signedIn) {
      const access = await getEntitlementSummary({ userId: signedIn, mobileInstallId: input.mobileInstallId })
      if (access.evaluationCredits >= input.imageCount) return json(res, 200, { url: '/analysis?start=1&resumePhoto=1' })
    }
    const origin = getRequestOrigin(req)
    const productId: PaymentProduct = input.imageCount > 1 ? 'evaluation_pack_3' : 'evaluation'
    const product = getProductConfig(productId)
    const price = await validateCheckoutProduct(productId, product)
    const amount = price?.unit_amount ?? product.unitAmount
    const currency = price?.currency ?? 'usd'
    if ((input.unitAmount !== undefined && input.unitAmount !== amount) || (input.currency && input.currency !== currency)) {
      throw new ApiError(409, 'The price has changed. Please reload the plans')
    }
    const guest = signedIn ? null : await createWebCheckoutGuest(req, res)
    const accountId = guest?.accountId ?? signedIn!
    const stripe = getStripe()
    const attribution = await resolveCreatorAttribution({
      req,
      owner: {
        userId: accountId,
        anonymousActorId: null,
        mobileInstallId: input.mobileInstallId,
      },
    })
    const accountAttribution = attribution || await getAccountCreatorAttribution(accountId)
    const landingAssignment = readLandingCookie(req.headers.cookie ?? '')
    const checkout = await stripe.checkout.sessions.create({
      branding_settings: { display_name: 'Mogging' },
      mode: product.mode,
      currency,
      adaptive_pricing: { enabled: false },
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      client_reference_id: accountId,
      line_items: [getCheckoutLineItem(productId)],
      ...(product.mode === 'payment' ? { payment_intent_data: { metadata: { ...channelMetadata, product: productId, accountId, userId: accountId, source: 'web_analysis' } } } : {}),
      metadata: {
        ...channelMetadata,
        product: productId,
        mobileInstallId: input.mobileInstallId,
        source: 'web_analysis',
        ...(landingAssignment ? { landingAssignment: serializeLandingAssignment(landingAssignment) } : {}),
        imageCount: String(input.imageCount),
        ...(input.attemptId ? { attemptId: input.attemptId, paywallVersion: input.paywallVersion ?? '2' } : {}),
        ...(input.flowId ? { flowId: input.flowId } : {}),
          ...(input.flowVersion ? { flowVersion: input.flowVersion } : {}),
          ...(input.entryMode ? { entryMode: input.entryMode } : {}),
        accountId,
        userId: accountId,
        ...stripeAttributionMetadata(accountAttribution),
      },
      success_url: `${origin}/analysis?checkout=success${guest ? '&guest=1' : ''}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/analysis?checkout=cancelled`,
    })

    if (!checkout.url) {
      throw new ApiError(500, 'Failed to create checkout session')
    }

    await recordServerEvent({ eventName: 'checkout_started', accountId, sessionId: checkout.id, source: 'web_analysis', properties: { web_surface: webSurface, creator_tracking_link_id: accountAttribution?.trackingLinkId, product: productId, attempt_id: input.attemptId, flow_id: input.flowId, flow_version: input.flowVersion, entry_mode: input.entryMode, ...(input.attemptId ? { paywall_version: input.paywallVersion ?? '2' } : {}), ...landingProperties(landingAssignment) } })

    await recordCreatorCheckout(accountAttribution, checkout).catch(() => {
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

export default monitorBackend('payments/checkout',handler)
