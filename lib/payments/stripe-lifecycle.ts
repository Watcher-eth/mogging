import { allocateCreatorBillingEvent } from '@/lib/creator/billing-attribution'
import { createHash } from 'node:crypto'
import { stripeJourneyProperties } from '@/lib/analytics/web-context'
import { landingProperties, parseLandingAssignment } from '@/lib/analytics/landing'
import type Stripe from 'stripe'
import { and, eq, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const id = (value: unknown): string | null => typeof value === 'string' ? value : typeof object(value).id === 'string' ? object(value).id as string : null

type CheckoutObservation = Pick<Stripe.Event, 'id' | 'created' | 'livemode'> & {
  type: 'checkout.session.observed'
  data: { object: Stripe.Checkout.Session; previous_attributes?: undefined }
}

export function normalizeStripeLifecycle(event: Stripe.Event | CheckoutObservation) {
  const value = object(event.data.object)
  const metadata = { ...object(object(object(value.parent).subscription_details).metadata ?? object(value.subscription_details).metadata), ...object(value.metadata) }
  const previous = object(event.data.previous_attributes)
  const subscription = id(object(object(value.parent).subscription_details).subscription) || id(value.subscription)
  let eventName = 'billing_other'
  let amount: number | null = null
  switch (event.type) {
    case 'invoice.paid':
      eventName = value.billing_reason === 'subscription_cycle' ? 'subscription_renewed' : 'invoice_paid'
      amount = typeof value.amount_paid === 'number' ? value.amount_paid / 100 : null
      break
    case 'invoice.payment_failed': eventName = 'billing_issue_started'; break
    case 'customer.subscription.created': eventName = value.status === 'trialing' ? 'trial_started' : 'subscription_started'; break
    case 'customer.subscription.deleted': eventName = 'subscription_expired'; break
    case 'customer.subscription.updated':
      eventName = value.cancel_at_period_end === true && previous.cancel_at_period_end === false ? 'cancellation_scheduled'
        : value.cancel_at_period_end === false && previous.cancel_at_period_end === true ? 'subscription_reactivated'
        : previous.status === 'trialing' && value.status === 'active' ? 'trial_converted' : 'subscription_updated'
      break
    case 'checkout.session.observed': eventName = 'checkout_status_observed'; break
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      if (value.payment_status !== 'paid') {
        eventName = value.payment_status === 'no_payment_required' ? 'checkout_completed_without_payment' : 'checkout_payment_pending'
      } else if (value.mode === 'payment') {
        eventName = 'one_time_purchase'
        amount = typeof value.amount_total === 'number' ? value.amount_total / 100 : null
      } else eventName = 'checkout_confirmed' // Invoice owns subscription revenue.
      break
    case 'payment_intent.payment_failed':
    case 'checkout.session.async_payment_failed': eventName = 'payment_failed'; break
    case 'checkout.session.expired': eventName = 'checkout_expired'; break
    case 'payment_intent.succeeded':
      eventName = 'payment_received' // Retained for reconciliation; invoices own subscription revenue.
      break
    case 'refund.created':
    case 'refund.updated':
      if (value.status !== 'succeeded') return null
      eventName = 'subscription_refunded'
      amount = typeof value.amount === 'number' ? -value.amount / 100 : null
      break
    case 'charge.dispute.created': eventName = 'payment_disputed'; amount = typeof value.amount === 'number' ? -value.amount / 100 : null; break
    default: return null
  }
  // Stripe uses zero-decimal amounts for these currencies.
  const currency = typeof value.currency === 'string' ? value.currency.toUpperCase() : null
  // ISK and UGX retain two-decimal representation in Stripe despite being zero-decimal currencies.
  if (amount != null && currency && ['BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','VND','VUV','XAF','XOF','XPF'].includes(currency)) amount *= 100
  const refundId = eventName === 'subscription_refunded' ? id(value) : null
  const first = (items: unknown) => object(Array.isArray(items) ? items[0] : null)
  const periodEnd = value.current_period_end ?? first(object(value.items).data).current_period_end ?? object(first(object(value.lines).data).period).end
  return {
    provider: 'stripe', providerEventId: refundId ? `refund:${refundId}` : event.type.startsWith('checkout.session.') && ['one_time_purchase','checkout_confirmed'].includes(eventName) ? `checkout:${id(value)}` : event.id,
    providerType: event.type, eventName, environment: event.livemode ? 'production' : 'sandbox',
    externalUserId: id(value.customer), subscriptionId: event.type.startsWith('customer.subscription.') ? id(value) : subscription,
    transactionId: id(value.payment_intent) || id(value.charge), productId: typeof metadata.product === 'string' ? metadata.product : null,
    amount: amount == null ? null : String(amount), currency, occurredAt: new Date(event.created * 1000),
    properties: {
      web_surface: metadata.webSurface === 'mobile_web' || metadata.webSurface === 'desktop_web' ? metadata.webSurface : undefined,
      recurring_unit_amount: typeof metadata.recurringAmount === 'string' && /^\d{1,8}$/.test(metadata.recurringAmount) ? Number(metadata.recurringAmount) : undefined,
      recurring_currency: metadata.recurringCurrency === 'usd' ? 'USD' : undefined,
      ...(event.type.startsWith('checkout.session.') ? {
        ...stripeJourneyProperties(metadata as Record<string, string | undefined>),
        surface: metadata.source ?? null,
        payment_status: value.payment_status ?? null,
        expires_at_ms: typeof value.expires_at === 'number' ? value.expires_at * 1000 : null,
      } : {}),
      ...(event.type === 'invoice.payment_failed' && value.billing_reason === 'subscription_create'
        ? stripeJourneyProperties(metadata as Record<string, string | undefined>) : {}),
      creator_discount: typeof metadata.creatorDiscount === 'string' ? metadata.creatorDiscount : undefined,
      creator_click_id: typeof metadata.creatorClickId === 'string' ? metadata.creatorClickId : null,
      invoice_id: event.type === 'invoice.paid' ? id(value) : null,
      checkout_session_id: event.type.startsWith('checkout.session.') ? id(value) : null,
      expiration_at_ms: typeof periodEnd === 'number' && Number.isFinite(periodEnd) ? periodEnd * 1000 : null, timestamp_estimated: event.id.startsWith('checkout:'), status: value.status ?? null, cancel_at_period_end: value.cancel_at_period_end ?? null,
      period_type: value.status === 'trialing' ? 'TRIAL' : 'NORMAL',
      cancel_reason: object(value.cancellation_details).reason ?? null, billing_reason: value.billing_reason ?? null,
      failure_code: object(value.last_payment_error).code ?? null, decline_code: object(value.last_payment_error).decline_code ?? null },
    candidateAccountId: typeof metadata.accountId === 'string' ? metadata.accountId : typeof metadata.userId === 'string' ? metadata.userId : null,
  }
}
export async function recordStripeLifecycle(event: Stripe.Event | CheckoutObservation) {
  const normalized = normalizeStripeLifecycle(event)
  if (!normalized) return
  const { candidateAccountId, ...fact } = normalized
  const identifiers = [
    fact.externalUserId ? eq(schema.paymentEntitlements.stripeCustomerId, fact.externalUserId) : undefined,
    fact.transactionId ? eq(schema.paymentEntitlements.stripePaymentIntentId, fact.transactionId) : undefined,
    fact.subscriptionId ? eq(schema.paymentEntitlements.stripeSubscriptionId, fact.subscriptionId) : undefined,
  ].filter(value => value !== undefined)
  const entitlement = identifiers.length ? await db.query.paymentEntitlements.findFirst({
    where: fact.subscriptionId ? eq(schema.paymentEntitlements.stripeSubscriptionId, fact.subscriptionId)
      : fact.transactionId ? eq(schema.paymentEntitlements.stripePaymentIntentId, fact.transactionId) : or(...identifiers),
    columns: { userId: true, product: true },
  }) : null
  // Refund objects do not carry customer IDs. Prior invoice facts still link them to the payer.
  const prior = !candidateAccountId && !entitlement?.userId && fact.transactionId
    ? await db.query.subscriptionEvents.findFirst({
      where: and(eq(schema.subscriptionEvents.provider, 'stripe'), eq(schema.subscriptionEvents.transactionId, fact.transactionId)),
      columns: { accountId: true, externalUserId: true },
    }) : null
  if (!fact.productId && (fact.subscriptionId || fact.transactionId)) fact.productId = entitlement?.product ?? null
  const candidate = entitlement?.userId || candidateAccountId || prior?.accountId
  fact.externalUserId ||= prior?.externalUserId ?? null
  const user = candidate ? await db.query.users.findFirst({ where: eq(schema.users.id, candidate), columns: { id: true } }) : null
  await db.insert(schema.subscriptionEvents).values({ ...fact, accountId: user?.id }).onConflictDoUpdate({
    target: [schema.subscriptionEvents.provider, schema.subscriptionEvents.providerEventId],
    // A replay can fill linkage that was unavailable before entitlement creation.
    // Preserve financial amounts, event time and the original provider payload.
    set: { accountId: sql`coalesce(${schema.subscriptionEvents.accountId}, excluded.account_id)`,
      productId: sql`coalesce(${schema.subscriptionEvents.productId}, excluded.product_id)`,
      externalUserId: sql`coalesce(${schema.subscriptionEvents.externalUserId}, excluded.external_user_id)`,
      subscriptionId: sql`coalesce(${schema.subscriptionEvents.subscriptionId}, excluded.subscription_id)`,
      transactionId: sql`coalesce(${schema.subscriptionEvents.transactionId}, excluded.transaction_id)`,
      occurredAt: sql`case when excluded.event_name='checkout_status_observed' then greatest(excluded.occurred_at, ${schema.subscriptionEvents.occurredAt})
        when ${schema.subscriptionEvents.properties}->>'timestamp_estimated'='true'
        and excluded.properties->>'timestamp_estimated'='false' then excluded.occurred_at else ${schema.subscriptionEvents.occurredAt} end`,
      properties: sql`case when excluded.event_name='checkout_status_observed' then excluded.properties
        when ${schema.subscriptionEvents.properties}->>'timestamp_estimated'='true'
        and excluded.properties->>'timestamp_estimated'='false' then ${schema.subscriptionEvents.properties} || excluded.properties
        else ${schema.subscriptionEvents.properties} end` },
  })
  if (fact.eventName === 'checkout_status_observed') return
  const stored = await db.query.subscriptionEvents.findFirst({ where: and(eq(schema.subscriptionEvents.provider, 'stripe'), eq(schema.subscriptionEvents.providerEventId, fact.providerEventId)) })
  if (stored && stored.environment === 'production' && !['allocated', 'not_applicable', 'internal'].includes(stored.creatorAttributionStatus)) await allocateCreatorBillingEvent(stored).catch(() => { console.warn('creator:billing-allocation-pending') })
}


// The checkout ID is the deduplication key across return, webhook and recovery.
export async function recordStripeBillingEvent(event: Stripe.Event) {
  await recordStripeLifecycle(event)
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return
  const session = event.data.object as Stripe.Checkout.Session
  if (session.payment_status !== 'paid') return
  const prior = await db.query.analyticsEvents.findFirst({
    where: and(eq(schema.analyticsEvents.eventName, 'checkout_completed'), eq(schema.analyticsEvents.sessionId, session.id), eq(schema.analyticsEvents.platform, 'server')),
    columns: { id: true },
  })
  if (prior) {
    const journey = stripeJourneyProperties(session.metadata)
    if (journey.flow_id) await db.update(schema.analyticsEvents).set({
      properties: sql`${schema.analyticsEvents.properties} || ${JSON.stringify(journey)}::jsonb`,
    }).where(and(eq(schema.analyticsEvents.id, prior.id), sql`nullif(${schema.analyticsEvents.properties}->>'flow_id','') is null`))
    return
  }
  const fact = normalizeStripeLifecycle(event)!
  const accountId = fact.candidateAccountId ? (await db.query.users.findFirst({ where: eq(schema.users.id, fact.candidateAccountId), columns: { id: true } }))?.id : null
  const hash = createHash('sha256').update(`stripe-checkout:${session.id}`).digest('hex')
  await db.insert(schema.analyticsEvents).values({
    eventId: `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`,
    eventName: 'checkout_completed', sessionId: session.id, accountId,
    platform: 'server', source: 'stripe_verified', environment: session.livemode ? 'production' : 'development',
    occurredAt: new Date(event.created * 1000), properties: {
      ...stripeJourneyProperties(session.metadata), paywall_version: session.metadata?.paywallVersion,
      paywall_experiment_id: session.metadata?.paywallExperimentId,
      paywall_experiment_unit: session.metadata?.paywallExperimentUnit,
      paywall_experiment_arm: session.metadata?.paywallExperimentArm,
      creator_tracking_link_id: session.metadata?.creatorTrackingLinkId, creator_discount: session.metadata?.creatorDiscount,
      provider: 'stripe', surface: session.metadata?.source, offering: session.metadata?.returnOffer === '1' ? 'stripe_return' : undefined,
      product: session.metadata?.product || 'unknown', mode: session.mode, status: session.payment_status,
      price: session.amount_total, currency: session.currency,
      ...landingProperties(parseLandingAssignment(session.metadata?.landingAssignment)),
    },
  }).onConflictDoNothing({ target: schema.analyticsEvents.eventId })
}

export async function recordVerifiedStripeCheckout(session: Stripe.Checkout.Session) {
  await recordStripeBillingEvent({
    id: `checkout:${session.id}`, type: 'checkout.session.completed', created: (session.metadata?.paywallExperimentId ? 0 : session.created) || Math.floor(Date.now() / 1000),
    livemode: session.livemode, data: { object: session },
  } as Stripe.Event)
}

export async function recordStripeCheckoutStatus(session: Stripe.Checkout.Session, observedAt: Date) {
  await recordStripeLifecycle({
    id: `checkout-status:${session.id}`, type: 'checkout.session.observed',
    created: Math.floor(+observedAt / 1000), livemode: session.livemode, data: { object: session },
  })
}
