import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { claimGuestAccount, getOrCreateGuestAccount, guestRecoveryHash } from '@/lib/auth/mobile-guest'
import { db, schema } from '@/lib/db'
import { confirmCheckoutForAccount } from './entitlements'

export async function createWebCheckoutGuest(req: NextApiRequest, res: NextApiResponse) {
  await enforceRateLimit(req, res, { key: 'web-checkout-guest', limit: 10, windowMs: 15 * 60_000 })
  const recoveryKey = randomBytes(32).toString('hex')
  const accountId = await getOrCreateGuestAccount(recoveryKey)
  return { accountId, recoveryKey }
}

function cookieName(sessionId: string) {
  return `mogging_checkout_${createHash('sha256').update(sessionId).digest('hex').slice(0, 24)}`
}

export function rememberWebCheckoutGuest(res: NextApiResponse, sessionId: string, recoveryKey: string) {
  const cookie = `${cookieName(sessionId)}=${recoveryKey}; HttpOnly; SameSite=Lax; Path=/api/payments/confirm; Max-Age=15552000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
  const previous = res.getHeader('Set-Cookie')
  res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : previous ? [String(previous)] : []), cookie])
}

// A Checkout session ID identifies a receipt. The browser cookie proves the right to claim it.
export async function verifyWebCheckoutGuest(req: NextApiRequest, sessionId: string, userId: string | null) {
  const recoveryKey = req.cookies[cookieName(sessionId)]
  if (!recoveryKey || !/^[a-f0-9]{64}$/.test(recoveryKey)) return false
  const key = await db.query.mobileGuestKeys.findFirst({ where: eq(schema.mobileGuestKeys.keyHash, guestRecoveryHash(recoveryKey)) })
  const guest = key && await db.query.mobileGuests.findFirst({ where: eq(schema.mobileGuests.userId, key.userId) })
  if (!guest) return false
  if (guest.claimedByUserId) {
    if (guest.claimedByUserId !== userId) throw new ApiError(403, 'This purchase was already saved. Sign in to the account that saved it.')
    return true
  }
  await confirmCheckoutForAccount(sessionId, guest.userId)
  if (userId) await claimGuestAccount(userId, recoveryKey)
  return true
}
