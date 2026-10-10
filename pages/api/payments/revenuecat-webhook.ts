import { monitorBackend } from '@/lib/reliability/monitor'
import { timingSafeEqual } from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { recordRevenueCatCreatorEvent } from '@/lib/creator/attribution'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { syncRevenueCatScans, revokeRevenueCatPurchase } from '@/lib/payments/entitlements'
import { scanProducts } from '@/lib/payments/revenuecat'
import { env } from '@/lib/env'
import { revenueCatEventSchema } from '@/lib/payments/subscription-events'
import { processBillingWebhook, recordRevenueCatLifecycle } from '@/lib/payments/billing-ledger'

const webhookSchema = z.object({
  api_version: z.string(),
  event: revenueCatEventSchema,
})

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    verifyAuthorization(req)
    const parsed = webhookSchema.safeParse(req.body)
    if (!parsed.success) {
      // Field names and issue codes only; never log subscriber attributes or payloads.
      console.warn('billing:invalid-webhook', { issues: parsed.error.issues.slice(0, 12)
        .map(issue => ({ code: issue.code, field: issue.path.slice(0, 2).join('.') })) })
      throw parsed.error
    }
    const payload = parsed.data
    const event = payload.event
    const processed = await processBillingWebhook('revenuecat', event.id, async () => {
      await recordRevenueCatLifecycle(event)
      if (!event.app_user_id || event.type === 'TEST') return
      if (event.environment === 'PRODUCTION') await recordRevenueCatCreatorEvent({
        id: event.id,
        type: event.type,
        appUserId: event.app_user_id,
        originalAppUserId: event.original_app_user_id,
        aliases: event.aliases,
        transactionId: event.transaction_id,
        originalTransactionId: event.original_transaction_id,
        productId: event.product_id,
        price: event.price_in_purchased_currency ?? event.price,
        currency: event.price_in_purchased_currency != null ? event.currency : 'USD',
        environment: event.environment,
        store: event.store,
        cancelReason: event.cancel_reason,
        expirationReason: event.expiration_reason,
        purchasedAtMs: event.purchased_at_ms,
        expirationAtMs: event.expiration_at_ms,
        gracePeriodExpirationAtMs: event.grace_period_expiration_at_ms,
        subscriberAttributes: event.subscriber_attributes,
      })
      if (scanProducts.some((product) => product.productId === event.product_id)
        && ['NON_RENEWING_PURCHASE', 'CANCELLATION'].includes(event.type)) {
        const user = await db.query.users.findFirst({
          where: eq(schema.users.id, event.app_user_id),
          columns: { id: true },
        })
        if (event.type === 'CANCELLATION' && event.cancel_reason === 'CUSTOMER_SUPPORT' && event.transaction_id) await revokeRevenueCatPurchase(event.transaction_id)
        if (user) await syncRevenueCatScans(user.id)
      }
    })
    return json(res, 200, { received: true, duplicate: !processed })
  } catch (error) {
    return handleApiError(error, res)
  }
}

function verifyAuthorization(req: NextApiRequest) {
  const expected = env.REVENUECAT_WEBHOOK_AUTH_TOKEN
  if (!expected) throw new ApiError(503, 'RevenueCat webhook is not configured')
  const header = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization
  const received = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : header
  if (!received) throw new ApiError(401, 'Invalid RevenueCat webhook authorization')
  const left = Buffer.from(received)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new ApiError(401, 'Invalid RevenueCat webhook authorization')
}

export default monitorBackend('payments/revenuecat-webhook',handler)
