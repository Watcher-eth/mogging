import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { createHash } from 'node:crypto'
import { normalizeRevenueCat, type RevenueCatEvent } from './subscription-events'

function identityEventId(anonymousId: string) {
  const hash = createHash('sha256').update(`revenuecat-identity:${anonymousId}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

// Only call with provider-verified aliases, never a client-supplied purchase identity.
// A single durable identify event owns the anonymous identity, including after transfers.
export async function linkRevenueCatIdentity(accountId: string, anonymousId?: string | null) {
  if (!anonymousId?.startsWith('$RCAnonymousID:')) return
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identityEventId(anonymousId)}, 0))`)
    const [inserted] = await tx.insert(schema.analyticsEvents).values({
      eventId: identityEventId(anonymousId), eventName: 'identity_linked', accountId,
      anonymousId: `revenuecat:${anonymousId}`, platform: 'server', source: 'revenuecat_verified_identity',
      environment: 'production', occurredAt: new Date(), properties: {},
    }).onConflictDoNothing({ target: schema.analyticsEvents.eventId }).returning({ id: schema.analyticsEvents.id })
    if (!inserted) return
    await tx.update(schema.subscriptionEvents).set({ accountId }).where(and(
      eq(schema.subscriptionEvents.provider, 'revenuecat'), isNull(schema.subscriptionEvents.accountId),
      eq(schema.subscriptionEvents.externalUserId, anonymousId),
    ))
  })
}

// Lease recovery handles process termination. Busy delivery returns a retryable response.
export async function processBillingWebhook(provider: string, eventId: string, work: () => Promise<void>) {
  const id = `${provider}:${eventId}`
  await db.insert(schema.billingWebhookReceipts).values({ id }).onConflictDoNothing()
  const leaseId = crypto.randomUUID()
  const [claim] = await db.update(schema.billingWebhookReceipts).set({ leaseId, leasedAt: new Date() })
    .where(and(eq(schema.billingWebhookReceipts.id, id), isNull(schema.billingWebhookReceipts.processedAt),
      or(isNull(schema.billingWebhookReceipts.leasedAt), lt(schema.billingWebhookReceipts.leasedAt, new Date(Date.now() - 300_000)))))
    .returning({ id: schema.billingWebhookReceipts.id })
  if (!claim) {
    const receipt = await db.query.billingWebhookReceipts.findFirst({ where: eq(schema.billingWebhookReceipts.id, id) })
    if (receipt?.processedAt) return false
    throw new ApiError(503, 'Billing event processing is in progress')
  }
  const owned = and(eq(schema.billingWebhookReceipts.id, id), eq(schema.billingWebhookReceipts.leaseId, leaseId))
  try {
    await work()
    await db.update(schema.billingWebhookReceipts).set({ processedAt: new Date(), leaseId: null, leasedAt: null }).where(owned)
    return true
  } catch (error) {
    await db.update(schema.billingWebhookReceipts).set({ leaseId: null, leasedAt: null }).where(owned)
    throw error
  }
}

export async function recordRevenueCatLifecycle(event: RevenueCatEvent) {
  const candidates = [event.app_user_id, ...(event.transferred_to ?? []), event.original_app_user_id, ...(event.aliases ?? [])]
    .filter((value): value is string => Boolean(value))
  const knownUsers = candidates.length ? await db.query.users.findMany({
    where: inArray(schema.users.id, candidates), columns: { id: true },
  }) : []
  const knownIds = new Set(knownUsers.map(user => user.id))
  let accountId = candidates.find(candidate => knownIds.has(candidate))
  if (accountId) {
    for (const alias of new Set(candidates)) await linkRevenueCatIdentity(accountId, alias)
  }
  await db.transaction(async tx => {
    if (event.app_user_id?.startsWith('$RCAnonymousID:')) {
      // Serialize with linking so neither ordering can strand a late anonymous fact.
      const eventId = identityEventId(event.app_user_id)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${eventId}, 0))`)
      if (!accountId) {
        const identity = await tx.query.analyticsEvents.findFirst({
          where: eq(schema.analyticsEvents.eventId, eventId), columns: { accountId: true },
        })
        accountId = identity?.accountId ?? undefined
      }
    }
    await tx.insert(schema.subscriptionEvents).values({ ...normalizeRevenueCat(event), accountId })
      .onConflictDoNothing({ target: [schema.subscriptionEvents.provider, schema.subscriptionEvents.providerEventId] })
  })
}
