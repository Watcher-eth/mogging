import { createHash, randomUUID } from 'crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { jwtVerify, SignJWT } from 'jose'
import { ApiError } from '@/lib/api/http'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { getEntitlementSummary, isRedeemableEntitlement } from '@/lib/payments/entitlements'
import { recordServerEvent } from '@/lib/analytics/events'

const HANDOFF_ISSUER = 'mogging.com'
const HANDOFF_AUDIENCE = 'mogging-mobile'
const HANDOFF_TTL_MS = 15 * 60 * 1000

type HandoffClaims = {
  accountId: string
  sessionId: string
}

export async function createPaymentHandoff({
  sessionId,
  accountId,
}: {
  sessionId: string
  accountId: string
}) {
  const handoff = await db.transaction(async (tx) => {
    const entitlement = await tx.query.paymentEntitlements.findFirst({
      where: and(
        eq(schema.paymentEntitlements.stripeCheckoutSessionId, sessionId),
        eq(schema.paymentEntitlements.userId, accountId)
      ),
    })

    if (!entitlement) throw new ApiError(409, 'Payment confirmation is still processing')
    if (!isRedeemableEntitlement(entitlement)) throw new ApiError(402, 'This purchase no longer provides active access')

    const existing = await tx.query.paymentHandoffs.findFirst({
      where: and(
        eq(schema.paymentHandoffs.stripeCheckoutSessionId, sessionId),
        eq(schema.paymentHandoffs.userId, accountId)
      ),
    })
    if (existing) return existing

    const createdAt = new Date()
    const expiresAt = new Date(createdAt.getTime() + HANDOFF_TTL_MS)
    const id = randomUUID()
    const token = await signHandoffToken({
      id,
      accountId,
      sessionId,
      createdAt,
      expiresAt,
    })

    const [created] = await tx
      .insert(schema.paymentHandoffs)
      .values({
        id,
        tokenHash: hashToken(token),
        userId: accountId,
        stripeCheckoutSessionId: sessionId,
        createdAt,
        expiresAt,
      })
      .onConflictDoNothing({ target: schema.paymentHandoffs.stripeCheckoutSessionId })
      .returning()

    if (created) return created

    const raced = await tx.query.paymentHandoffs.findFirst({
      where: and(
        eq(schema.paymentHandoffs.stripeCheckoutSessionId, sessionId),
        eq(schema.paymentHandoffs.userId, accountId)
      ),
    })
    if (!raced) throw new ApiError(409, 'Unable to create payment handoff')
    return raced
  })

  if (handoff.consumedAt) throw new ApiError(409, 'This payment handoff has already been used')
  if (handoff.expiresAt.getTime() <= Date.now()) throw new ApiError(410, 'This payment handoff has expired')

  const token = await signHandoffToken({
    id: handoff.id,
    accountId: handoff.userId,
    sessionId: handoff.stripeCheckoutSessionId,
    createdAt: handoff.createdAt,
    expiresAt: handoff.expiresAt,
  })
  if (hashToken(token) !== handoff.tokenHash) throw new ApiError(500, 'Payment handoff integrity check failed')

  await recordServerEvent({
    eventName: 'handoff_created',
    accountId,
    sessionId,
    source: 'payment_handoff',
  })

  return { token, expiresAt: handoff.expiresAt.toISOString() }
}

export async function consumePaymentHandoff({
  token,
  mobileInstallId,
}: {
  token: string
  mobileInstallId: string
}) {
  const verified = await verifyHandoffToken(token)
  const accountId = verified.accountId
  const tokenHash = hashToken(token)

  await db.transaction(async (tx) => {
    const [handoff] = await tx
      .update(schema.paymentHandoffs)
      .set({ consumedAt: new Date(), consumedByInstallId: mobileInstallId })
      .where(and(
        eq(schema.paymentHandoffs.id, verified.id),
        eq(schema.paymentHandoffs.tokenHash, tokenHash),
        eq(schema.paymentHandoffs.userId, accountId),
        eq(schema.paymentHandoffs.stripeCheckoutSessionId, verified.sessionId),
        isNull(schema.paymentHandoffs.consumedAt),
        gt(schema.paymentHandoffs.expiresAt, new Date())
      ))
      .returning({ id: schema.paymentHandoffs.id })

    if (!handoff) {
      const consumed = await tx.query.paymentHandoffs.findFirst({
        where: and(
          eq(schema.paymentHandoffs.id, verified.id),
          eq(schema.paymentHandoffs.tokenHash, tokenHash),
          eq(schema.paymentHandoffs.userId, accountId),
          eq(schema.paymentHandoffs.stripeCheckoutSessionId, verified.sessionId),
          eq(schema.paymentHandoffs.consumedByInstallId, mobileInstallId)
        ),
      })
      if (!consumed?.consumedAt) {
        throw new ApiError(409, 'This payment handoff is invalid, expired, or already used')
      }

      const claimed = await findHandoffEntitlement(tx, {
        accountId,
        sessionId: verified.sessionId,
      })
      if (
        !claimed ||
        !claimed.activationCodeRedeemedAt ||
        claimed.mobileInstallId !== mobileInstallId ||
        !isRedeemableEntitlement(claimed)
      ) {
        throw new ApiError(409, 'This payment handoff has already been used')
      }
      return
    }

    const entitlement = await findHandoffEntitlement(tx, {
      accountId,
      sessionId: verified.sessionId,
    })
    if (!entitlement || !isRedeemableEntitlement(entitlement)) {
      throw new ApiError(402, 'This purchase no longer provides active access')
    }

    const [claimed] = await tx
      .update(schema.paymentEntitlements)
      .set({
        mobileInstallId,
        activationCodeRedeemedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.paymentEntitlements.id, entitlement.id),
        eq(schema.paymentEntitlements.userId, accountId),
        isNull(schema.paymentEntitlements.activationCodeRedeemedAt)
      ))
      .returning({ id: schema.paymentEntitlements.id })
    if (!claimed) throw new ApiError(409, 'This purchase has already been activated')
  })

  const entitlements = await getEntitlementSummary({ userId: accountId, mobileInstallId })
  await recordServerEvent({
    eventName: 'handoff_consumed',
    accountId,
    sessionId: verified.sessionId,
    source: 'payment_handoff',
    properties: { mobileInstallId },
  })
  return { accountId, entitlements }
}

function findHandoffEntitlement(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  { accountId, sessionId }: { accountId: string; sessionId: string }
) {
  return tx.query.paymentEntitlements.findFirst({
    where: and(
      eq(schema.paymentEntitlements.stripeCheckoutSessionId, sessionId),
      eq(schema.paymentEntitlements.userId, accountId)
    ),
  })
}

async function signHandoffToken({
  id,
  accountId,
  sessionId,
  createdAt,
  expiresAt,
}: {
  id: string
  accountId: string
  sessionId: string
  createdAt: Date
  expiresAt: Date
}) {
  return new SignJWT({ accountId, sessionId } satisfies HandoffClaims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(HANDOFF_ISSUER)
    .setAudience(HANDOFF_AUDIENCE)
    .setJti(id)
    .setIssuedAt(Math.floor(createdAt.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getHandoffSecret())
}

async function verifyHandoffToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getHandoffSecret(), {
      issuer: HANDOFF_ISSUER,
      audience: HANDOFF_AUDIENCE,
    })
    if (
      !payload.jti ||
      typeof payload.accountId !== 'string' ||
      typeof payload.sessionId !== 'string'
    ) {
      throw new Error('Missing handoff claims')
    }
    return {
      id: payload.jti,
      accountId: payload.accountId,
      sessionId: payload.sessionId,
    }
  } catch {
    throw new ApiError(400, 'Invalid or expired payment handoff')
  }
}

function getHandoffSecret() {
  const secret = env.PAYMENT_HANDOFF_SECRET || env.NEXTAUTH_SECRET
  if (!secret || secret.length < 32) throw new ApiError(503, 'Payment handoff is not configured')
  return new TextEncoder().encode(secret)
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
