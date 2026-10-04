import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { ApiError } from '@/lib/api/http'
import { getStripe } from '@/lib/payments/stripe'
import { courseSellers, courseContacts } from './schema'
import { sellerForUser, accountEligible, syncSeller } from './sellers'
import { courseStripeOptions } from './stripe'
import { siteUrl } from './http'

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
export async function sendCourseEmail(to: string, subject: string, text: string, key: string) {
  if (!env.RESEND_API_KEY) throw new ApiError(503, 'Email delivery is not configured')
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ from: env.PAYMENTS_EMAIL_FROM, to: [to], subject, text, ...(env.PAYMENTS_EMAIL_REPLY_TO ? { reply_to: env.PAYMENTS_EMAIL_REPLY_TO } : {}) }), signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new ApiError(502, 'Email delivery failed', 'provider_error')
}
export function deliverableEmail(email: string) {
  return z.email().safeParse(email).success && !/\.(local|invalid)$/i.test(email)
}
export async function buyerIdentity(user: { id: string; email: string; emailVerified: Date | null }) {
  const contact = await db.query.courseContacts.findFirst({ where: eq(courseContacts.userId, user.id) })
  if (contact?.email && contact.verifiedAt) return { ...user, email: contact.email, emailVerified: contact.verifiedAt }
  if (!user.emailVerified || !deliverableEmail(user.email)) throw new ApiError(403, 'Verify a deliverable email before enrolling')
  return user
}
export async function sendVerification(user: { id: string; email: string; emailVerified: Date | null }, body: unknown = {}) {
  const input = z.object({ email: z.email().optional() }).strict().parse(body)
  const email = input.email?.trim().toLowerCase() || user.email
  if (!deliverableEmail(email)) throw new ApiError(400, 'Enter a deliverable email address')
  const token = randomBytes(32).toString('base64url'), identifier = `course-email:${user.id}`
  await db.transaction(async tx => {
    await tx.insert(courseContacts).values({ userId: user.id }).onConflictDoNothing()
    await tx.select().from(courseContacts).where(eq(courseContacts.userId, user.id)).for('update')
    await tx.update(courseContacts).set({ pendingEmail: email, updatedAt: new Date() }).where(eq(courseContacts.userId, user.id))
    await tx.delete(schema.verificationTokens).where(eq(schema.verificationTokens.identifier, identifier))
    await tx.insert(schema.verificationTokens).values({ identifier, token: hash(token), expires: new Date(Date.now() + 1800_000) })
  })
  await sendCourseEmail(email, 'Verify your Mogging email', `Your Mogging verification code is:\n\n${token}\n\nEnter this code on Mogging within 30 minutes.`, `course-verification-${hash(token)}`)
  return { sent: true }
}
export async function verifyEmail(user: { id: string; email: string }, body: unknown) {
  const { token } = z.object({ token: z.string().min(40).max(100) }).strict().parse(body)
  return db.transaction(async tx => {
    const [contact] = await tx.select().from(courseContacts).where(eq(courseContacts.userId, user.id)).for('update')
    const [used] = await tx.delete(schema.verificationTokens).where(and(eq(schema.verificationTokens.identifier, `course-email:${user.id}`), eq(schema.verificationTokens.token, hash(token)), gt(schema.verificationTokens.expires, new Date()))).returning()
    if (!used || !contact?.pendingEmail) throw new ApiError(400, 'Verification code is invalid or expired')
    await tx.update(courseContacts).set({ email: contact.pendingEmail, verifiedAt: new Date(), pendingEmail: null, updatedAt: new Date() }).where(eq(courseContacts.userId, user.id))
    return { verified: true }
  })
}
export async function oauthStart(userId: string) {
  const seller = await sellerForUser(userId)
  if ((seller.stripeAccountId && seller.stripeConnected) || seller.status === 'suspended') throw new ApiError(409, 'Seller cannot connect another account')
  if (!env.STRIPE_CONNECT_CLIENT_ID) throw new ApiError(503, 'Stripe account connection is not configured')
  const state = randomBytes(32).toString('base64url')
  await db.transaction(async tx => {
    await tx.delete(schema.verificationTokens).where(eq(schema.verificationTokens.identifier, `course-oauth:${userId}`))
    await tx.insert(schema.verificationTokens).values({ identifier: `course-oauth:${userId}`, token: hash(state), expires: new Date(Date.now() + 600_000) })
  })
  const query = new URLSearchParams({ response_type: 'code', client_id: env.STRIPE_CONNECT_CLIENT_ID, scope: 'read_write', redirect_uri: `${siteUrl()}/api/creator/courses/connect/callback`, state })
  return { url: `https://connect.stripe.com/oauth/authorize?${query}` }
}
export async function oauthComplete(userId: string, query: unknown) {
  const { state, code } = z.object({ state: z.string().min(40).max(100), code: z.string().min(1).max(500) }).parse(query)
  const seller = await sellerForUser(userId)
  const [used] = await db.delete(schema.verificationTokens).where(and(eq(schema.verificationTokens.identifier, `course-oauth:${userId}`), eq(schema.verificationTokens.token, hash(state)), gt(schema.verificationTokens.expires, new Date()))).returning()
  if (!used || (seller.stripeAccountId && seller.stripeConnected) || seller.status === 'suspended') throw new ApiError(400, 'Connection request is invalid or expired')
  const token = await getStripe().oauth.token({ grant_type: 'authorization_code', code }, courseStripeOptions)
  if (!token.stripe_user_id) throw new ApiError(502, 'Stripe did not return an account')
  // Stripe requires Accounts v1 for OAuth. Subsequent status checks use the same ID through v2.
  const account = await getStripe().accounts.retrieve(token.stripe_user_id, {}, courseStripeOptions)
  if ((seller.stripeAccountId && account.id !== seller.stripeAccountId) || !accountEligible(account) || account.country !== seller.country) throw new ApiError(400, 'Connect a full-dashboard Stripe account registered in your selected country')
  const [updated] = await db.update(courseSellers).set({ stripeAccountId: account.id, stripeConnected: true, stripeLivemode: token.livemode, updatedAt: new Date() }).where(and(eq(courseSellers.id, seller.id), eq(courseSellers.status, seller.status), or(isNull(courseSellers.stripeAccountId), and(eq(courseSellers.stripeAccountId, account.id), eq(courseSellers.stripeConnected, false))))).returning()
  if (!updated) throw new ApiError(409, 'Seller connection changed')
  return syncSeller(updated)
}
