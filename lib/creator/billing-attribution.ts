import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

type BillingEvent = typeof schema.subscriptionEvents.$inferSelect
type Touch = { trackingLinkId: string; clickId: string | null; firstTrackingLinkId: string | null; firstClickId: string | null; mobileInstallId: string | null; userId: string | null; attributionKey: string }
type CreatorEventType = 'payment' | 'refund' | 'dispute' | 'subscription_cancellation' | 'subscription_expiration' | 'subscription_billing_issue' | 'subscription_reactivation'

export function creatorBillingType(name: string): CreatorEventType | null {
  if (['subscription_started', 'trial_started', 'subscription_renewed', 'trial_converted', 'one_time_purchase', 'invoice_paid', 'refund_reversed'].includes(name)) return 'payment'
  if (name === 'subscription_refunded') return 'refund'
  if (name === 'payment_disputed') return 'dispute'
  if (name === 'cancellation_scheduled') return 'subscription_cancellation'
  if (name === 'subscription_expired') return 'subscription_expiration'
  if (name === 'billing_issue_started') return 'subscription_billing_issue'
  if (name === 'subscription_reactivated') return 'subscription_reactivation'
  return null
}

const acquisitionNames = ['subscription_started', 'trial_started', 'invoice_paid', 'one_time_purchase']
const string = (value: unknown) => typeof value === 'string' && value ? value : null

export async function allocateCreatorBillingEvent(event: BillingEvent) {
  if (event.environment !== 'production') return 'sandbox'
  if (['allocated', 'not_applicable', 'internal'].includes(event.creatorAttributionStatus)) return event.creatorAttributionStatus
  const eventType = creatorBillingType(event.eventName)
  if (!eventType) return 'not_applicable'
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`creator-billing:${event.provider}:${event.subscriptionId || event.transactionId || event.id}`}, 0))`)
    const finish = async (status: string) => {
      await tx.update(schema.subscriptionEvents).set({ creatorAttributionStatus: status, creatorAttributionCheckedAt: new Date() }).where(eq(schema.subscriptionEvents.id, event.id))
      return status
    }
    const acquisition = event.subscriptionId
      ? await tx.query.subscriptionEvents.findFirst({
          where: and(eq(schema.subscriptionEvents.provider, event.provider), eq(schema.subscriptionEvents.environment, 'production'),
            eq(schema.subscriptionEvents.subscriptionId, event.subscriptionId), inArray(schema.subscriptionEvents.eventName, acquisitionNames)),
          orderBy: [asc(schema.subscriptionEvents.occurredAt), asc(schema.subscriptionEvents.id)],
        })
      : acquisitionNames.includes(event.eventName) ? event : event.transactionId
        ? await tx.query.subscriptionEvents.findFirst({ where: and(eq(schema.subscriptionEvents.provider, event.provider),
            eq(schema.subscriptionEvents.environment, 'production'), eq(schema.subscriptionEvents.transactionId, event.transactionId),
            inArray(schema.subscriptionEvents.eventName, acquisitionNames)), orderBy: [asc(schema.subscriptionEvents.occurredAt)] }) : null
    if (!acquisition) return finish('initial_purchase_missing')
    const at = typeof acquisition.properties.purchased_at_ms === 'number' ? new Date(acquisition.properties.purchased_at_ms) : acquisition.occurredAt
    const accountId = acquisition.accountId || event.accountId
    if (accountId) {
      const owner = await tx.query.users.findFirst({ where: eq(schema.users.id, accountId), columns: { analyticsInternal: true } })
      if (owner?.analyticsInternal) return finish('internal')
    }
    // Once allocation exists, later touches cannot move renewals or refunds to another creator.
    const frozen = await tx.query.creatorAttributionEvents.findFirst({
      where: sql`${schema.creatorAttributionEvents.metadata}->>'acquisitionBillingEventId' = ${acquisition.id}`,
      orderBy: [asc(schema.creatorAttributionEvents.createdAt)],
    })
    let touch: Touch | null = frozen || null
    if (!touch) {
      const identities = [...new Set([acquisition.externalUserId, event.externalUserId,
        string(acquisition.properties.mobile_install_id), string(event.properties.mobile_install_id),
        ...(Array.isArray(acquisition.properties.aliases) ? acquisition.properties.aliases.filter((v): v is string => typeof v === 'string') : []),
      ].filter((v): v is string => Boolean(v)))]
      const mobile = accountId || identities.length ? await tx.query.mobileCreatorAttributions.findMany({
        where: and(or(accountId ? eq(schema.mobileCreatorAttributions.userId, accountId) : undefined,
          identities.length ? and(inArray(schema.mobileCreatorAttributions.mobileInstallId, identities), accountId ? sql`(${schema.mobileCreatorAttributions.userId} is null or ${schema.mobileCreatorAttributions.userId} = ${accountId})` : undefined) : undefined),
          sql`${schema.mobileCreatorAttributions.createdAt} <= ${at.toISOString()}::timestamp`),
      }) : []
      const claims = accountId ? await tx.query.creatorAttributionEvents.findMany({
        where: and(eq(schema.creatorAttributionEvents.userId, accountId), eq(schema.creatorAttributionEvents.eventType, 'claim'),
          sql`${schema.creatorAttributionEvents.createdAt} <= ${at.toISOString()}::timestamp`),
      }) : []
      // Metadata is from a verified provider webhook, but still must identify our actual click.
      const metadataClickId = string(acquisition.properties.creator_click_id)
      const candidates: Touch[] = [...mobile, ...claims]
      if (metadataClickId && acquisition.provider === 'stripe') {
        const click = await tx.query.creatorAttributionClicks.findFirst({ where: eq(schema.creatorAttributionClicks.id, metadataClickId) })
        if (click) candidates.push({ trackingLinkId: click.trackingLinkId, clickId: click.id,
          firstTrackingLinkId: click.trackingLinkId, firstClickId: click.id, mobileInstallId: null,
          userId: accountId, attributionKey: accountId ? `user:${accountId}` : `click:${click.id}` })
      }
      const clickIds = candidates.flatMap(candidate => candidate.clickId ? [candidate.clickId] : [])
      const clicks = clickIds.length ? await tx.query.creatorAttributionClicks.findMany({
        where: and(inArray(schema.creatorAttributionClicks.id, clickIds), eq(schema.creatorAttributionClicks.isBot, false),
          sql`${schema.creatorAttributionClicks.createdAt} <= ${at.toISOString()}::timestamp`,
          sql`${schema.creatorAttributionClicks.createdAt} >= ${new Date(at.getTime() - 30 * 86400_000).toISOString()}::timestamp`),
        orderBy: [sql`${schema.creatorAttributionClicks.createdAt} desc`, asc(schema.creatorAttributionClicks.id)],
      }) : []
      const chosen = clicks[0]
      touch = chosen ? candidates.find(candidate => candidate.clickId === chosen.id && candidate.trackingLinkId === chosen.trackingLinkId) || null : null
    }
    if (!touch?.clickId) return finish(accountId ? 'no_eligible_touch' : 'missing_identity')
    // Trials may be zero; unknown money remains unknown rather than fabricating zero revenue.
    if (eventType === 'payment' && event.amount == null && event.eventName !== 'trial_started') return finish('missing_amount')
    let dedupeKey = `creator-${eventType}:billing:${event.id}`
    if (event.provider === 'revenuecat') dedupeKey = `creator-${eventType === 'payment' ? 'payment' : eventType === 'refund' ? 'refund' : 'lifecycle'}:revenuecat:${event.providerEventId}`
    if (event.provider === 'stripe' && event.eventName === 'one_time_purchase') dedupeKey = `creator-payment:checkout:${event.providerEventId.replace(/^checkout:/, '')}`
    if (event.provider === 'stripe' && eventType === 'payment' && string(event.properties.invoice_id)) dedupeKey = `creator-payment:invoice:${event.properties.invoice_id}`
    const amount = Number(event.amount || 0)
    await tx.insert(schema.creatorAttributionEvents).values({
      trackingLinkId: touch.trackingLinkId, clickId: touch.clickId,
      firstTrackingLinkId: touch.firstTrackingLinkId, firstClickId: touch.firstClickId,
      eventType, attributionKey: accountId ? `user:${accountId}` : touch.attributionKey,
      userId: accountId || touch.userId, mobileInstallId: touch.mobileInstallId,
      stripeSubscriptionId: event.provider === 'stripe' ? event.subscriptionId : null,
      stripePaymentIntentId: event.provider === 'stripe' ? event.transactionId : null,
      amountCents: Math.round(amount * 100), currency: event.currency || 'USD', dedupeKey,
      metadata: { provider: event.provider, environment: event.environment, billingEventId: event.id,
        acquisitionBillingEventId: acquisition.id, originalTransactionId: event.subscriptionId,
        transactionId: event.transactionId, revenueCatEventType: event.providerType,
        allocationVersion: 1, occurredAt: event.occurredAt.toISOString() },
    }).onConflictDoNothing({ target: schema.creatorAttributionEvents.dedupeKey })
    return finish('allocated')
  })
}

export async function reconcileCreatorBilling(limit = 100, timeBudgetMs = 45_000) {
  const deadline = Date.now() + Math.max(0, timeBudgetMs)
  const rows = await db.select().from(schema.subscriptionEvents).where(and(
    eq(schema.subscriptionEvents.environment, 'production'),
    sql`${schema.subscriptionEvents.occurredAt} >= now() - interval '90 days'`,
    sql`${schema.subscriptionEvents.creatorAttributionStatus} not in ('allocated', 'not_applicable', 'internal')`,
    sql`(${schema.subscriptionEvents.creatorAttributionCheckedAt} is null or ${schema.subscriptionEvents.creatorAttributionCheckedAt} < now() - interval '15 minutes')`,
  )).orderBy(sql`${schema.subscriptionEvents.creatorAttributionCheckedAt} asc nulls first`, asc(schema.subscriptionEvents.occurredAt)).limit(Math.min(200, Math.max(1, limit)))
  const result: Record<string, number> = {}
  for (const [index, row] of rows.entries()) {
    // Leave time for cleanup and response; remaining durable facts resume on the next run.
    if (Date.now() >= deadline) { result.deferred = rows.length - index; break }
    const status = creatorBillingType(row.eventName) ? await allocateCreatorBillingEvent(row) : 'not_applicable'
    if (status === 'not_applicable') await db.update(schema.subscriptionEvents).set({ creatorAttributionStatus: status, creatorAttributionCheckedAt: new Date() }).where(eq(schema.subscriptionEvents.id, row.id))
    result[status] = (result[status] || 0) + 1
  }
  return result
}
