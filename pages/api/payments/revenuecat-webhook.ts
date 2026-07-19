import { timingSafeEqual } from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { recordRevenueCatCreatorEvent } from '@/lib/creator/attribution'
import { env } from '@/lib/env'

const subscriberAttributeSchema = z.object({ value: z.unknown().optional() }).passthrough()
const webhookSchema = z.object({
  api_version: z.string(),
  event: z.object({
    id: z.string().min(1).max(200),
    type: z.string().min(1).max(100),
    app_user_id: z.string().min(1).max(200),
    original_app_user_id: z.string().max(200).nullable().optional(),
    aliases: z.array(z.string().max(200)).optional(),
    transaction_id: z.string().max(300).nullable().optional(),
    original_transaction_id: z.string().max(300).nullable().optional(),
    product_id: z.string().max(300).nullable().optional(),
    price_in_purchased_currency: z.number().finite().nullable().optional(),
    price: z.number().finite().nullable().optional(),
    currency: z.string().max(10).nullable().optional(),
    environment: z.string().max(40).nullable().optional(),
    store: z.string().max(40).nullable().optional(),
    cancel_reason: z.string().max(100).nullable().optional(),
    expiration_reason: z.string().max(100).nullable().optional(),
    purchased_at_ms: z.number().int().nonnegative().nullable().optional(),
    expiration_at_ms: z.number().int().nonnegative().nullable().optional(),
    grace_period_expiration_at_ms: z.number().int().nonnegative().nullable().optional(),
    subscriber_attributes: z.record(z.string(), subscriberAttributeSchema).optional(),
  }).passthrough(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    verifyAuthorization(req)
    const payload = parseBody(webhookSchema, req.body)
    const event = payload.event
    await recordRevenueCatCreatorEvent({
      id: event.id,
      type: event.type,
      appUserId: event.app_user_id,
      originalAppUserId: event.original_app_user_id,
      aliases: event.aliases,
      transactionId: event.transaction_id,
      originalTransactionId: event.original_transaction_id,
      productId: event.product_id,
      price: event.price_in_purchased_currency ?? event.price,
      currency: event.currency,
      environment: event.environment,
      store: event.store,
      cancelReason: event.cancel_reason,
      expirationReason: event.expiration_reason,
      purchasedAtMs: event.purchased_at_ms,
      expirationAtMs: event.expiration_at_ms,
      gracePeriodExpirationAtMs: event.grace_period_expiration_at_ms,
      subscriberAttributes: event.subscriber_attributes,
    })
    return json(res, 200, { received: true })
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
