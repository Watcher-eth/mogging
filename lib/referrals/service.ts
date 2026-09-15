import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'

export const REFERRAL_COOKIE = 'mogging_referral'
const TTL = 30 * 24 * 60 * 60 * 1000

function signature(payload: string) {
  if (!env.NEXTAUTH_SECRET) throw new Error('NEXTAUTH_SECRET is required for referrals')
  return createHmac('sha256', env.NEXTAUTH_SECRET).update(`referral:${payload}`).digest('hex')
}

export async function getReferralLink(userId: string) {
  await db.insert(schema.referralLinks).values({ userId, code: randomBytes(9).toString('hex') }).onConflictDoNothing({ target: schema.referralLinks.userId })
  const [link] = await db.select().from(schema.referralLinks).where(eq(schema.referralLinks.userId, userId))
  return { code: link.code, url: `https://www.mogging.com/${link.code}` }
}

export async function createReferralTicket(code: string) {
  if (!/^[a-f0-9]{18}$/.test(code)) return null
  const [link] = await db.select().from(schema.referralLinks).where(eq(schema.referralLinks.code, code))
  if (!link) return null
  const payload = `${code}.${Date.now()}`
  return `${payload}.${signature(payload)}`
}

export function readReferralTicket(ticket: unknown, now = Date.now()) {
  if (typeof ticket !== 'string' || !/^[a-f0-9]{18}\.\d{13}\.[a-f0-9]{64}$/.test(ticket)) return null
  const [code, timestamp, mac] = ticket.split('.')
  const issuedAt = Number(timestamp)
  if (issuedAt > now || now - issuedAt > TTL) return null
  if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(signature(`${code}.${timestamp}`), 'hex'))) return null
  return { code, issuedAt }
}

// The unique entitlement key makes retries and concurrent auth callbacks idempotent.
export async function creditReferralSignup(userId: string, ticket: unknown) {
  const referral = readReferralTicket(ticket)
  if (!referral) return
  const [link] = await db.select().from(schema.referralLinks).where(eq(schema.referralLinks.code, referral.code))
  if (!link || link.userId === userId) return
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId), columns: { createdAt: true } })
  if (!user || user.createdAt.getTime() < referral.issuedAt) return
  await db.insert(schema.paymentEntitlements).values({
    userId: link.userId,
    mobileInstallId: `account_${link.userId}`,
    stripeCheckoutSessionId: `referral_signup:${userId}`,
    product: 'evaluation',
    creditBalance: 1,
    source: 'referral_signup',
    metadata: { referredUserId: userId, referralCode: link.code },
  }).onConflictDoNothing({ target: schema.paymentEntitlements.stripeCheckoutSessionId })
}

export function referralCookie(ticket: string) {
  return `${REFERRAL_COOKIE}=${ticket}; Path=/; Max-Age=${TTL / 1000}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}
