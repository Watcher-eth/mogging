import { and, eq, sql } from 'drizzle-orm'
import type Stripe from 'stripe'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { env } from '@/lib/env'
import { getStripe } from '@/lib/payments/stripe'
import { courseOrders, courses, courseSellers, courseEnrollments, courseEmails, courseRefunds } from './schema'
import { enrollment } from './access'
import { syncSeller } from './sellers'
import { buyerIdentity } from './identity'
import { siteUrl } from './http'

export function reference(value: string | { id: string } | null | undefined) { return typeof value === 'string' ? value : value?.id ?? null }
export async function checkout(user: { id: string; email: string; emailVerified: Date | null }, courseId: string) {
  user = await buyerIdentity(user)
  if (await enrollment(user.id, courseId)) throw new ApiError(409, 'You already have access to this course')
  const course = await db.query.courses.findFirst({ where: eq(courses.id, courseId) })
  if (!course?.published || course.status !== 'published' || course.contentBlocked || !course.salesEnabled) throw new ApiError(404, 'Course is not available for purchase')
  let seller = await db.query.courseSellers.findFirst({ where: eq(courseSellers.id, course.sellerId) })
  if (!seller || seller.status !== 'enabled') throw new ApiError(409, 'Seller is unavailable')
  if (course.published.price.amount === 0) {
    const expiresAt = new Date(Date.now() + course.published.price.accessDays * 86400_000)
    await db.insert(courseEnrollments).values({ courseId, userId: user.id, source: 'free', expiresAt }).onConflictDoUpdate({ target: [courseEnrollments.userId, courseEnrollments.courseId], set: { orderId: null, source: 'free', expiresAt, revokedAt: null, updatedAt: new Date() } })
    return { enrolled: true }
  }
  if (!seller.stripeAccountId || !course.stripePriceId) throw new ApiError(409, 'Seller has not completed payment setup')
  if (!seller.stripeSyncedAt || Date.now() - seller.stripeSyncedAt.getTime() > 60_000) seller = await syncSeller(seller)
  if (!seller.stripeConnected || !seller.chargesEnabled || !seller.payoutsEnabled) throw new ApiError(409, 'Seller payments are unavailable')
  if (seller.stripeLivemode && !env.COURSE_LIVE_PAYMENTS_ENABLED) throw new ApiError(503, 'Live course payments have not been enabled')
  const snapshot = course.published, accountId = seller.stripeAccountId!
  const order = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`course-checkout:${user.id}:${courseId}`}, 0))`)
    const [pending] = await tx.select().from(courseOrders).where(and(eq(courseOrders.buyerId, user.id), eq(courseOrders.courseId, courseId), eq(courseOrders.state, 'pending')))
    if (pending) return pending
    const [created] = await tx.insert(courseOrders).values({ courseId, sellerId: seller.id, buyerId: user.id, buyerEmail: user.email, stripeAccountId: accountId, stripePriceId: course.stripePriceId!, livemode: seller.stripeLivemode!, automaticTax: env.COURSE_STRIPE_TAX_ENABLED, amount: snapshot.price.amount, currency: snapshot.price.currency, accessDays: snapshot.price.accessDays, courseTitle: snapshot.title, refundPolicy: snapshot.refundPolicy, courseVersion: course.publishedVersion!, expiresAt: new Date(Date.now() + 3600_000) }).returning()
    return created
  })
  if (order.stripeCheckoutId) {
    const session = await getStripe().checkout.sessions.retrieve(order.stripeCheckoutId, {}, { stripeAccount: order.stripeAccountId })
    if (session.status !== 'open') { await syncOrder(order.id); throw new ApiError(409, 'Previous checkout finished; refresh your library and try again') }
    return { orderId: order.id, url: session.url, expiresAt: order.expiresAt }
  }
  return ensureCheckout(order)
}
export async function ensureCheckout(order: typeof courseOrders.$inferSelect) {
  if (order.livemode && !env.COURSE_LIVE_PAYMENTS_ENABLED) throw new ApiError(503, 'Live course payments are disabled')
  const metadata = { moggingCourseOrderId: order.id }
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      ui_mode: 'hosted_page',
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: false },
      allow_promotion_codes: false,
      submit_type: 'auto',
      integration_identifier: 'hosted_web_0001',
      origin_context: 'web',
      customer_email: order.buyerEmail,
      client_reference_id: order.id,
      line_items: [{ price: order.stripePriceId, quantity: 1 }],
      success_url: `${siteUrl()}/courses/library?order=${order.id}`,
      cancel_url: `${siteUrl()}/courses?checkout=cancelled&course=${order.courseId}`,
      expires_at: Math.floor(order.expiresAt.getTime() / 1000),
      metadata,
      payment_intent_data: { metadata },
      automatic_tax: { enabled: order.automaticTax },
    }, { stripeAccount: order.stripeAccountId, idempotencyKey: `course-checkout-${order.id}` })
    await db.update(courseOrders).set({ stripeCheckoutId: session.id, updatedAt: new Date() }).where(eq(courseOrders.id, order.id))
    return { orderId: order.id, url: session.url, expiresAt: order.expiresAt }
  } catch (error) {
    // An expired unknown-outcome request can be safely closed only after Stripe rejects its original expiry.
    const stripeError = error as { type?: string; param?: string }
    if (stripeError.type === 'StripeInvalidRequestError' && stripeError.param === 'expires_at' && order.expiresAt.getTime() <= Date.now() + 1800_000) {
      await db.update(courseOrders).set({ state: 'expired', updatedAt: new Date() }).where(and(eq(courseOrders.id, order.id), eq(courseOrders.state, 'pending')))
      throw new ApiError(409, 'Checkout expired; try again to start a new purchase')
    }
    throw new ApiError(502, 'Checkout could not be confirmed; retry to recover the same purchase', 'provider_error')
  }
}
// Serialize provider reads with writes per order; reordered webhooks cannot overwrite a newer refund/dispute state.
export async function syncOrder(id: string) {
  return db.transaction(async tx => {
    const [order] = await tx.select().from(courseOrders).where(eq(courseOrders.id, id)).for('update')
    if (!order?.stripeCheckoutId) return order
    const stripe = getStripe(), options = { stripeAccount: order.stripeAccountId }
    const session = await stripe.checkout.sessions.retrieve(order.stripeCheckoutId, { expand: ['payment_intent.latest_charge.balance_transaction'] }, options)
    if (session.metadata?.moggingCourseOrderId !== order.id || session.client_reference_id !== order.id || session.livemode !== order.livemode || session.currency !== order.currency || session.amount_subtotal !== order.amount) throw new ApiError(502, 'Payment does not match the order')
    const paymentIntentId = reference(session.payment_intent)
    let charge: Stripe.Charge | null = null, disputed = order.disputed, failed = false
    if (paymentIntentId) {
      const intent = typeof session.payment_intent === 'object' && session.payment_intent
        ? session.payment_intent
        : await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.balance_transaction'] }, options)
      if (intent.metadata.moggingCourseOrderId !== order.id) throw new ApiError(502, 'Payment identity mismatch')
      failed = session.status === 'complete' && ['canceled', 'requires_payment_method'].includes(intent.status)
      const chargeId = reference(intent.latest_charge)
      if (chargeId) {
        charge = typeof intent.latest_charge === 'object' && intent.latest_charge
          ? intent.latest_charge
          : await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] }, options)
        if (charge.disputed === false) disputed = false
        else {
          const disputes = await stripe.disputes.list({ charge: charge.id, limit: 100 }, options)
          disputed = disputes.data.some(item => !['won', 'warning_closed'].includes(item.status))
        }
      }
    }
    const paid = session.payment_status === 'paid' && charge?.paid === true && charge.status === 'succeeded'
    const refundedAmount = Math.max(order.refundedAmount, charge?.amount_refunded || 0)
    const totalAmount = session.amount_total ?? order.amount
    if (charge && (charge.amount !== totalAmount || charge.currency !== order.currency || charge.livemode !== order.livemode)) throw new ApiError(502, 'Charge amount mismatch')
    const state = refundedAmount >= totalAmount ? 'refunded' : paid ? 'paid' : session.status === 'expired' ? 'expired' : failed ? 'failed' : order.state
    const paidAt = order.paidAt || (paid && charge ? new Date(charge.created * 1000) : null)
    const balance = charge?.balance_transaction && typeof charge.balance_transaction !== 'string' ? charge.balance_transaction : null
    const [updated] = await tx.update(courseOrders).set({ state, totalAmount, stripePaymentIntentId: paymentIntentId, stripeChargeId: charge?.id || null, refundedAmount, disputed, paidAt, ...(balance ? { processingFee: balance.fee, feeCurrency: balance.currency } : {}), updatedAt: new Date() }).where(eq(courseOrders.id, order.id)).returning()
    if (state === 'paid' && !disputed && paidAt) {
      const expiresAt = new Date(paidAt.getTime() + order.accessDays * 86400_000)
      await tx.insert(courseEnrollments).values({ userId: order.buyerId, courseId: order.courseId, orderId: order.id, source: 'purchase', expiresAt, createdAt: paidAt, updatedAt: paidAt }).onConflictDoUpdate({ target: [courseEnrollments.userId, courseEnrollments.courseId], set: { orderId: order.id, source: 'purchase', expiresAt, revokedAt: null, updatedAt: paidAt }, setWhere: sql`coalesce((select previous.created_at from course_orders previous where previous.id = ${courseEnrollments.orderId}), ${courseEnrollments.updatedAt}) <= (select current_order.created_at from course_orders current_order where current_order.id = ${order.id})` })
      await tx.insert(courseEmails).values({ orderId: order.id, to: order.buyerEmail }).onConflictDoNothing()
    } else if (state === 'refunded' || disputed) {
      await tx.update(courseEnrollments).set({ revokedAt: new Date() }).where(eq(courseEnrollments.orderId, order.id))
    }
    return updated
  })
}
export async function refundOrder(sellerId: string, orderId: string, requestKey: unknown, amount?: number) {
  const key = z.uuid().parse(requestKey)
  const order = await db.query.courseOrders.findFirst({ where: and(eq(courseOrders.id, orderId), eq(courseOrders.sellerId, sellerId)) })
  if (!order?.stripePaymentIntentId || !['paid', 'refunded'].includes(order.state)) throw new ApiError(409, 'Paid order not found')
  const request = await db.transaction(async tx => {
    const [current] = await tx.select().from(courseOrders).where(eq(courseOrders.id, order.id)).for('update')
    const [existing] = await tx.select().from(courseRefunds).where(and(eq(courseRefunds.orderId, order.id), eq(courseRefunds.requestKey, key)))
    if (existing) { if (amount !== undefined && amount !== existing.amount) throw new ApiError(409, 'Refund key already used with a different amount'); return existing }
    const [{ reserved }] = await tx.select({ reserved: sql<number>`coalesce(sum(${courseRefunds.amount}) filter (where ${courseRefunds.state} in ('requested', 'pending')), 0)::int` }).from(courseRefunds).where(eq(courseRefunds.orderId, order.id))
    const available = (current.totalAmount ?? current.amount) - current.refundedAmount - reserved, value = amount ?? available
    if (value <= 0 || value > available) throw new ApiError(409, 'Refund exceeds the remaining amount')
    const [created] = await tx.insert(courseRefunds).values({ orderId: order.id, requestKey: key, amount: value }).returning()
    return created
  })
  const options = { stripeAccount: order.stripeAccountId }
  // Known refunds are retrieved, never recreated after Stripe's idempotency retention expires.
  if (!request.stripeRefundId && Date.now() - request.createdAt.getTime() > 23 * 3600_000) throw new ApiError(409, 'Unknown refund outcome requires Stripe reconciliation before retry')
  const refund = request.stripeRefundId
    ? await getStripe().refunds.retrieve(request.stripeRefundId, {}, options)
    : await getStripe().refunds.create({ payment_intent: order.stripePaymentIntentId, amount: request.amount, metadata: { moggingCourseOrderId: order.id, moggingCourseRefundId: request.id } }, { ...options, idempotencyKey: `course-refund-${request.id}` })
  await db.update(courseRefunds).set({ stripeRefundId: refund.id, state: 'pending', updatedAt: new Date() }).where(eq(courseRefunds.id, request.id))
  await syncOrder(order.id)
  await db.update(courseRefunds).set({ state: refund.status || 'pending', updatedAt: new Date() }).where(eq(courseRefunds.id, request.id))
  return { refundId: refund.id, state: refund.status, amount: refund.amount }
}
