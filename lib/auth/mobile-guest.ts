import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, count, eq, gt, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import type { JWSTransactionDecodedPayload } from '@apple/app-store-server-library'
import { createMobileSessionForUser } from './mobile-session'

export const guestRecoveryHash = (key: string) => createHash('sha256').update(`mobile-guest:${key}`).digest('hex')

export async function createGuestSession(recoveryKey: string, recoverOnly = false) {
  // The client persists this high-entropy key before calling, so a lost response
  // cannot strand a purchase or create another identity on retry.
  const hash = guestRecoveryHash(recoveryKey)
  const userId = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${hash}, 0))`)
    const key = await tx.query.mobileGuestKeys.findFirst({ where: eq(schema.mobileGuestKeys.keyHash, hash) })
    const guest = key ? await tx.query.mobileGuests.findFirst({ where: eq(schema.mobileGuests.userId, key.userId) }) : undefined
    if (guest?.claimedByUserId) throw new ApiError(409, 'This guest account was saved. Sign in to that account.')
    if (guest) return guest.userId
    if (recoverOnly) throw new ApiError(404, 'This recovery code was not found. Check the code and try again.')
    const id = randomUUID()
    await tx.insert(schema.users).values({ id, email: `${id}@guest.mogging.invalid`, name: 'Guest' })
    await tx.insert(schema.mobileGuests).values({ userId: id })
    await tx.insert(schema.mobileGuestKeys).values({ userId: id, keyHash: hash })
    return id
  })
  return guestSession(userId)
}

export async function guestSession(userId: string) {
  const session = await createMobileSessionForUser(userId)
  return { token: session.sessionToken, userId, expiresAt: session.expires.toISOString(), guest: true }
}

export async function claimGuestAccount(targetId: string, recoveryKey: string) {
  const hash = guestRecoveryHash(recoveryKey)
  return db.transaction(async tx => {
    const targetGuest = await tx.query.mobileGuests.findFirst({ where: eq(schema.mobileGuests.userId, targetId) })
    if (targetGuest) throw new ApiError(403, 'Sign in to save your guest account')
    const key = await tx.query.mobileGuestKeys.findFirst({ where: eq(schema.mobileGuestKeys.keyHash, hash) })
    const guest = key ? await tx.query.mobileGuests.findFirst({ where: eq(schema.mobileGuests.userId, key.userId) }) : undefined
    // A guest bootstrap may have failed before the server saved the key.
    // An unrelated key must neither block a real sign-in nor move any data.
    if (!guest) return false
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`guest:${guest.userId}`}, 0))`)
    const [locked] = await tx.select().from(schema.mobileGuests).where(eq(schema.mobileGuests.userId, guest.userId)).for('update')
    if (locked.claimedByUserId === targetId) return true
    if (locked.claimedByUserId) throw new ApiError(409, 'This guest account was already saved to another account')
    const pending = await tx.query.scanReservations.findFirst({ where: and(eq(schema.scanReservations.userId, guest.userId), eq(schema.scanReservations.status, 'pending')) })
    if (pending) throw new ApiError(409, 'Your evaluation is still finishing. Please try saving again in a moment.')
    // Preserve ledger IDs, balances, billing periods, and completed reservations.
    // No new allowance or purchase is created when claiming an account.
    for (const table of [schema.photos, schema.photoSets, schema.personGroups, schema.paymentEntitlements, schema.scanReservations, schema.paymentHandoffs, schema.pushDevices]) {
      await tx.update(table).set({ userId: targetId }).where(eq(table.userId, guest.userId))
    }
    const deliveries = await tx.select().from(schema.pushDeliveries).where(eq(schema.pushDeliveries.userId, guest.userId))
    if (deliveries.length) await tx.insert(schema.pushDeliveries).values(deliveries.map(delivery => ({ ...delivery, userId: targetId }))).onConflictDoNothing()
    await tx.delete(schema.pushDeliveries).where(eq(schema.pushDeliveries.userId, guest.userId))
    await tx.update(schema.analysisShares).set({ ownerUserId: targetId }).where(eq(schema.analysisShares.ownerUserId, guest.userId))
    for (const table of [schema.subscriptionEvents, schema.analyticsEvents]) {
      await tx.update(table).set({ accountId: targetId }).where(eq(table.accountId, guest.userId))
    }
    for (const table of [schema.mobileCreatorAttributions, schema.creatorAttributionEvents]) {
      await tx.update(table).set({ userId: targetId }).where(eq(table.userId, guest.userId))
    }
    const identities = await tx.select().from(schema.analyticsIdentityLinks).where(eq(schema.analyticsIdentityLinks.accountId, guest.userId))
    if (identities.length) await tx.insert(schema.analyticsIdentityLinks).values(identities.map(identity => ({ ...identity, accountId: targetId }))).onConflictDoNothing()
    await tx.delete(schema.analyticsIdentityLinks).where(eq(schema.analyticsIdentityLinks.accountId, guest.userId))
    const selfSignup = await tx.delete(schema.referralSignups).where(and(eq(schema.referralSignups.inviterUserId, guest.userId), eq(schema.referralSignups.referredUserId, targetId))).returning()
    await tx.update(schema.referralSignups).set({ inviterUserId: targetId }).where(eq(schema.referralSignups.inviterUserId, guest.userId))
    if (selfSignup.length) {
      const [progress] = await tx.select({ count: count() }).from(schema.referralSignups).where(eq(schema.referralSignups.inviterUserId, targetId))
      if (progress.count < 3) await tx.update(schema.paymentEntitlements).set({ creditBalance: 0, stripeCheckoutSessionId: `referral_reward:${guest.userId}:self_signup_revoked`, source: 'referral_self_signup_revoked' }).where(and(
        eq(schema.paymentEntitlements.stripeCheckoutSessionId, `referral_reward:${guest.userId}`), gt(schema.paymentEntitlements.creditBalance, 0),
      ))
    }
    await tx.update(schema.mobileGuests).set({ claimedByUserId: targetId }).where(eq(schema.mobileGuests.userId, guest.userId))
    // A retained guest key must never become a credential for the full account.
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, guest.userId))
    return true
  })
}

// The API calls this only after Apple's signature, bundle, ownership and revocation checks.
export async function recoverGuestPurchase(proof: JWSTransactionDecodedPayload) {
  const sandbox = proof.environment === 'Sandbox'
  const session = await db.transaction(async tx => {
    const payment = await tx.query.paymentEntitlements.findFirst({ where: and(
      or(eq(schema.paymentEntitlements.stripeCheckoutSessionId, `revenuecat-subscription:app_store:${proof.transactionId}`),
        sql`${schema.paymentEntitlements.metadata}->>'transactionId' = ${proof.transactionId}`),
      sql`coalesce((${schema.paymentEntitlements.metadata}->>'sandbox')::boolean, false) = ${sandbox}`,
    ) })
    // A renewal may have a new transaction ID. A verified webhook's original
    // transaction identifies the same subscription without minting new access.
    const event = !payment ? await tx.query.subscriptionEvents.findFirst({ where: and(
      eq(schema.subscriptionEvents.provider, 'revenuecat'), eq(schema.subscriptionEvents.subscriptionId, proof.originalTransactionId!),
      eq(schema.subscriptionEvents.environment, sandbox ? 'sandbox' : 'production'),
    ), orderBy: (events, { desc }) => [desc(events.occurredAt)] }) : null
    const binding = await tx.query.mobileGuestPurchases.findFirst({ where: and(
      eq(schema.mobileGuestPurchases.originalTransactionId, proof.originalTransactionId!),
      eq(schema.mobileGuestPurchases.environment, proof.environment!),
    ) })
    const ownerId = binding?.userId ?? payment?.userId ?? event?.accountId
    if (!ownerId) return { accountRequired: false, session: null }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`guest:${ownerId}`}, 0))`)
    const guest = await tx.query.mobileGuests.findFirst({ where: eq(schema.mobileGuests.userId, ownerId) })
    if (!guest || guest.claimedByUserId) return { accountRequired: true, session: null }
    const recoveryKey = randomBytes(32).toString('hex')
    await tx.insert(schema.mobileGuestKeys).values({ userId: ownerId, keyHash: guestRecoveryHash(recoveryKey) })
    return { accountRequired: false, userId: ownerId, recoveryKey }
  })
  if (!('userId' in session) || !session.userId) return session
  return { accountRequired: false, session: await guestSession(session.userId), recoveryKey: session.recoveryKey }
}

// Called only with an authenticated guest and an Apple-verified transaction.
// The verified billing ledger must already bind this transaction to that guest.
export async function bindGuestPurchase(userId: string, proof: JWSTransactionDecodedPayload) {
  const guest = await db.query.mobileGuests.findFirst({ where: eq(schema.mobileGuests.userId, userId) })
  if (!guest || guest.claimedByUserId) throw new ApiError(403, 'Only an active guest can bind a guest purchase')
  const payment = await db.query.paymentEntitlements.findFirst({ where: and(
    eq(schema.paymentEntitlements.userId, userId),
    eq(schema.paymentEntitlements.stripeCheckoutSessionId, `revenuecat-subscription:app_store:${proof.transactionId}`),
    sql`coalesce((${schema.paymentEntitlements.metadata}->>'sandbox')::boolean, false) = ${proof.environment === 'Sandbox'}`,
  ) })
  if (!payment) return false
  await db.insert(schema.mobileGuestPurchases).values({ originalTransactionId: proof.originalTransactionId!, environment: proof.environment!, userId })
    .onConflictDoNothing()
  return true
}
