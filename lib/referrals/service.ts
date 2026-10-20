import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { count, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'

export const REFERRAL_COOKIE = 'mogging_referral'
const TTL = 30 * 24 * 60 * 60 * 1000
const REQUIRED_SIGNUPS = 3
const rewardKey = (userId: string) => `referral_reward:${userId}`

function signature(payload: string) {
  if (!env.NEXTAUTH_SECRET) throw new Error('NEXTAUTH_SECRET is required for referrals')
  return createHmac('sha256', env.NEXTAUTH_SECRET).update(`referral:${payload}`).digest('hex')
}

export async function getReferralLink(userId: string) {
  const aliases = await db.query.mobileGuests.findMany({ where: eq(schema.mobileGuests.claimedByUserId, userId), columns: { userId: true } })
  const ownerIds = [userId, ...aliases.map(alias => alias.userId)]
  let link = await db.query.referralLinks.findFirst({ where: inArray(schema.referralLinks.userId, ownerIds), orderBy: [sql`case when ${schema.referralLinks.userId} = ${userId} then 0 else 1 end`, schema.referralLinks.userId] })
  if (!link) {
    await db.insert(schema.referralLinks).values({ userId, code: randomBytes(9).toString('hex') }).onConflictDoNothing({ target: schema.referralLinks.userId })
    link = (await db.query.referralLinks.findFirst({ where: eq(schema.referralLinks.userId, userId) }))!
  }
  const [[progress], [reward]] = await Promise.all([
    db.select({ completed: count() }).from(schema.referralSignups).where(inArray(schema.referralSignups.inviterUserId, ownerIds)),
    db.select({ balance: schema.paymentEntitlements.creditBalance }).from(schema.paymentEntitlements)
      .where(inArray(schema.paymentEntitlements.stripeCheckoutSessionId, ownerIds.map(rewardKey))),
  ])
  return {
    code: link.code, url: `https://www.mogging.com/${link.code}`,
    reward: {
      completed: reward ? REQUIRED_SIGNUPS : Math.min(progress.completed, REQUIRED_SIGNUPS),
      required: REQUIRED_SIGNUPS,
      granted: Boolean(reward),
      available: Boolean(reward && reward.balance > 0),
    },
  }
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

// One new account can qualify once. Serialize on the inviter so simultaneous
// signups cannot miss the threshold; grant the one-time reward in the same transaction.
export async function creditReferralSignup(userId: string, ticket: unknown) {
  const referral = readReferralTicket(ticket)
  if (!referral) return
  const [link] = await db.select().from(schema.referralLinks).where(eq(schema.referralLinks.code, referral.code))
  if (!link || link.userId === userId) return
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId), columns: { createdAt: true } })
  if (!user || user.createdAt.getTime() < referral.issuedAt) return
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`guest:${link.userId}`}, 0))`)
    const guest = await tx.query.mobileGuests.findFirst({ where: eq(schema.mobileGuests.userId, link.userId), columns: { claimedByUserId: true } })
    const inviterId = guest?.claimedByUserId ?? link.userId
    if (inviterId === userId) return
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`referral:${inviterId}`}, 0))`)
    const aliases = await tx.query.mobileGuests.findMany({ where: eq(schema.mobileGuests.claimedByUserId, inviterId), columns: { userId: true } })
    const ownerIds = [inviterId, ...aliases.map(alias => alias.userId)]
    // Previous per-signup rewards remain valid, but cannot count a second time.
    const [legacy] = await tx.select({ id: schema.paymentEntitlements.id }).from(schema.paymentEntitlements)
      .where(eq(schema.paymentEntitlements.stripeCheckoutSessionId, `referral_signup:${userId}`))
    if (legacy) return
    await tx.insert(schema.referralSignups).values({ referredUserId: userId, inviterUserId: inviterId })
      .onConflictDoNothing({ target: schema.referralSignups.referredUserId })
    const [progress] = await tx.select({ completed: count() }).from(schema.referralSignups)
      .where(inArray(schema.referralSignups.inviterUserId, ownerIds))
    if (progress.completed < REQUIRED_SIGNUPS) return
    const previousReward = await tx.query.paymentEntitlements.findFirst({ where: inArray(schema.paymentEntitlements.stripeCheckoutSessionId, ownerIds.map(rewardKey)), columns: { id: true } })
    if (previousReward) return
    await tx.insert(schema.paymentEntitlements).values({
      userId: inviterId,
      mobileInstallId: `account_${inviterId}`,
      stripeCheckoutSessionId: rewardKey(inviterId),
      product: 'evaluation',
      creditBalance: 1,
      source: 'referral_reward',
      metadata: { requiredSignups: REQUIRED_SIGNUPS },
    }).onConflictDoNothing({ target: schema.paymentEntitlements.stripeCheckoutSessionId })
  })
}

export function referralCookie(ticket: string) {
  return `${REFERRAL_COOKIE}=${ticket}; Path=/; Max-Age=${TTL / 1000}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}
