import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextApiRequest } from 'next'
import type Stripe from 'stripe'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { processBillingWebhook } from '@/lib/payments/billing-ledger'
import { courseOrders, courseSellers } from './schema'
import { syncOrder, reference } from './commerce'
import { syncSeller } from './sellers'

export async function rawBody(req: NextApiRequest) {
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > 1024 * 1024) throw new ApiError(413, 'Webhook too large')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}
export function verifyBunnySignature(body: Buffer, signature: unknown, version: unknown, algorithm: unknown, key: string) {
  if (version !== 'v1' || algorithm !== 'hmac-sha256' || typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) return false
  return timingSafeEqual(Buffer.from(signature, 'hex'), createHmac('sha256', key).update(body).digest())
}
export async function connectEvent(event: Stripe.Event) {
  const accountId = event.account
  if (!accountId) throw new ApiError(400, 'A connected-account event is required')
  await processBillingWebhook('stripe-course', `${event.livemode}:${accountId}:${event.id}`, async () => {
    const seller = await db.query.courseSellers.findFirst({ where: and(eq(courseSellers.stripeAccountId, accountId), eq(courseSellers.stripeLivemode, event.livemode)) })
    if (!seller) return
    if (event.type === 'account.application.deauthorized') {
      await db.update(courseSellers).set({ stripeConnected: false, chargesEnabled: false, payoutsEnabled: false, stripeSyncedAt: new Date(), updatedAt: new Date() }).where(eq(courseSellers.id, seller.id))
      return
    }
    if (event.type === 'account.updated') { await syncSeller(seller); return }
    const object = event.data.object as unknown as { id: string; object: string; metadata?: Record<string, string>; payment_intent?: string | { id: string } | null; charge?: string | { id: string } | null }
    let orderId = object.metadata?.moggingCourseOrderId
    if (!orderId && object.object === 'dispute' && object.charge) {
      const order = await db.query.courseOrders.findFirst({ where: and(eq(courseOrders.stripeAccountId, accountId), eq(courseOrders.livemode, event.livemode), eq(courseOrders.stripeChargeId, reference(object.charge)!)) }); orderId = order?.id
    }
    if (!orderId && object.payment_intent) {
      const order = await db.query.courseOrders.findFirst({ where: and(eq(courseOrders.stripeAccountId, accountId), eq(courseOrders.livemode, event.livemode), eq(courseOrders.stripePaymentIntentId, reference(object.payment_intent)!)) }); orderId = order?.id
    }
    if (!orderId) return
    const order = await db.query.courseOrders.findFirst({ where: and(eq(courseOrders.id, orderId), eq(courseOrders.stripeAccountId, accountId), eq(courseOrders.livemode, event.livemode)) })
    if (!order) throw new ApiError(503, 'Order has not been persisted yet; retry')
    if (object.object === 'checkout.session' && !order.stripeCheckoutId) {
      await db.update(courseOrders).set({ stripeCheckoutId: object.id }).where(and(eq(courseOrders.id, order.id), sql`${courseOrders.stripeCheckoutId} is null`))
    }
    await syncOrder(order.id)
  })
}

// Accounts v2 thin events belong to the platform's "Your account" destination.
export const courseAccountEventTypes = new Set([
  'v2.core.account.created', 'v2.core.account.updated', 'v2.core.account.closed',
  'v2.core.account[configuration.merchant].capability_status_updated',
  'v2.core.account[configuration.merchant].updated', 'v2.core.account[defaults].updated',
  'v2.core.account[identity].updated', 'v2.core.account[requirements].updated',
])
export async function connectAccountEvent(event: Stripe.V2.Core.EventNotification) {
  if (!courseAccountEventTypes.has(event.type) || !('related_object' in event) || event.related_object.type !== 'v2.core.account') return
  const accountId = event.related_object.id
  await processBillingWebhook('stripe-course-account', `${event.livemode}:${accountId}:${event.id}`, async () => {
    const seller = await db.query.courseSellers.findFirst({ where: and(eq(courseSellers.stripeAccountId, accountId), eq(courseSellers.stripeLivemode, event.livemode)) })
    if (!seller) return
    if (event.type === 'v2.core.account.closed') {
      await db.update(courseSellers).set({ stripeConnected: false, chargesEnabled: false, payoutsEnabled: false, stripeSyncedAt: new Date(), updatedAt: new Date() }).where(eq(courseSellers.id, seller.id))
      return
    }
    // Fetch current included capabilities instead of trusting a stale event payload.
    await syncSeller(seller)
  })
}
