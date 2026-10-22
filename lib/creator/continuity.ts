import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { resolveCreatorAttribution, signClickId } from './attribution'

export const recoveryRequest = z.object({
  state: z.string().regex(/^[a-f0-9]{64}$/),
  challenge: z.string().regex(/^[a-f0-9]{64}$/),
})
export const recoveryRedemption = z.object({
  ticket: z.string().regex(/^[a-f0-9]{64}$/),
  verifier: z.string().regex(/^[a-f0-9]{64}$/),
  mobileInstallId: z.string().regex(/^mob_[A-Za-z0-9_-]{4,116}$/),
})
export const referralHash = (value: string) => createHash('sha256').update(value).digest('hex')

// The callback is fixed. Neither the browser nor query parameters can redirect tokens elsewhere.
export function recoveryCallback(state: string, result: { ticket: string } | { error: 'not_found' | 'unavailable' }) {
  const url = new URL('mogging://creator-recovery')
  url.searchParams.set('state', state)
  for (const [key, value] of Object.entries(result)) url.searchParams.set(key, value)
  return url.toString()
}

export async function createReferralHandoff(clickId: string, challenge: string) {
  const ticket = randomBytes(32).toString('hex')
  await db.insert(schema.creatorReferralHandoffs).values({
    tokenHash: referralHash(ticket), verifierHash: challenge, clickId,
    expiresAt: new Date(Date.now() + 5 * 60_000),
  })
  return ticket
}

export async function redeemReferralHandoff(input: z.infer<typeof recoveryRedemption>) {
  const now = new Date()
  // A lost HTTP response can be retried with the same proof and installation, never another one.
  const [handoff] = await db.update(schema.creatorReferralHandoffs).set({ consumedAt: now, consumedByInstallId: input.mobileInstallId })
    .where(and(eq(schema.creatorReferralHandoffs.tokenHash, referralHash(input.ticket)),
      eq(schema.creatorReferralHandoffs.verifierHash, referralHash(input.verifier)), gt(schema.creatorReferralHandoffs.expiresAt, now),
      or(isNull(schema.creatorReferralHandoffs.consumedAt), eq(schema.creatorReferralHandoffs.consumedByInstallId, input.mobileInstallId))))
    .returning()
  if (!handoff) throw new ApiError(410, 'This recovery session expired. Please recover your creator link again.')
  const context = await resolveCreatorAttribution({ token: signClickId(handoff.clickId) })
  if (!context) throw new ApiError(410, 'This creator link expired or is no longer active.')
  return context
}
