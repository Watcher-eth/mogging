import { createRemoteJWKSet, jwtVerify } from 'jose'
import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { ApiError } from '@/lib/api/http'
import { creditReferralSignup } from '@/lib/referrals/service'
import { createMobileSessionForUser } from './mobile-session'
import { createGoogleMobileState, readGoogleMobileState, verifyGoogleVerifier, type mobileGoogleInput } from './google-mobile-state'
import type { z } from 'zod'

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
const callbackUrl = () => new URL('/api/auth/callback/google', env.NEXTAUTH_URL || 'https://www.mogging.com').toString()
const secret = () => env.NEXTAUTH_SECRET || ''

export function beginGoogleMobile(input: z.input<typeof mobileGoogleInput>) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new ApiError(503, 'Google sign-in is unavailable')
  const state = createGoogleMobileState(input, secret())
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callbackUrl(),
    response_type: 'code', scope: 'openid email profile', state, nonce: input.nonce,
    code_challenge: input.challenge, code_challenge_method: 'S256', prompt: 'select_account' }).toString()
  return { url: url.toString(), state }
}

// Reuse the already-registered Google redirect URI. No cookie or credentials are
// moved between browsers; the code can only be redeemed with the app's verifier.
export function googleMobileCallback(query: Record<string, unknown>) {
  if (typeof query.state !== 'string' || !query.state.startsWith('mob1.')) return null
  readGoogleMobileState(query.state, secret())
  const params = new URLSearchParams({ state: query.state })
  if (query.error) params.set('error', query.error === 'access_denied' ? 'provider_cancelled' : 'oauth_session_expired')
  else if (typeof query.code === 'string' && query.code.length <= 4000) params.set('code', query.code)
  else throw new ApiError(400, 'Google did not return an authorization code')
  return `mogging://auth/google#${params}`
}

export async function finishGoogleMobile(input: { code: string; state: string; verifier: string; referralTicket?: string }) {
  const state = readGoogleMobileState(input.state, secret())
  if (!verifyGoogleVerifier(input.verifier, state.challenge)) throw new ApiError(401, 'Google sign-in verification failed')
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID || '', client_secret: env.GOOGLE_CLIENT_SECRET || '',
      code: input.code, code_verifier: input.verifier, redirect_uri: callbackUrl(), grant_type: 'authorization_code' }) })
  const tokens = await response.json().catch(() => null)
  if (!response.ok || typeof tokens?.id_token !== 'string') throw new ApiError(response.status >= 500 ? 503 : 401, 'Google could not verify this sign-in. Please try again.')
  let identity
  try {
    const { payload } = await jwtVerify(tokens.id_token, keys, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: env.GOOGLE_CLIENT_ID, algorithms: ['RS256'] })
    if (!payload.sub || payload.nonce !== state.nonce || payload.email_verified !== true || typeof payload.email !== 'string') throw new Error('Invalid identity')
    identity = { subject: payload.sub, email: payload.email.toLowerCase(), name: typeof payload.name === 'string' ? payload.name.slice(0, 120) : null }
  } catch { throw new ApiError(401, 'Google identity could not be verified. Please try again.') }
  const userId = await googleMobileUser(identity, state.existingOnly)
  await creditReferralSignup(userId, input.referralTicket)
  return createMobileSessionForUser(userId)
}

export async function googleMobileUser(identity: { subject: string; email: string; name: string | null }, existingOnly: boolean) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`google-signin:${identity.email}`}, 0))`)
    const where = and(eq(schema.accounts.provider, 'google'), eq(schema.accounts.providerAccountId, identity.subject))
    const account = await tx.query.accounts.findFirst({ where, columns: { userId: true } })
    if (account) return account.userId
    const user = await tx.query.users.findFirst({ where: eq(schema.users.email, identity.email), columns: { id: true } })
    if (!user && existingOnly) throw new ApiError(404, 'No existing Mogging account was found. Start onboarding to create one.', 'account_not_found')
    // Preserve NextAuth's account-linking boundary for an existing non-Google identity.
    if (user) throw new ApiError(409, 'This email uses another sign-in method. Use your original sign-in method.')
    const [created] = await tx.insert(schema.users).values({ email: identity.email, emailVerified: new Date(), name: identity.name })
      .onConflictDoNothing({ target: schema.users.email }).returning({ id: schema.users.id })
    // Another sign-in method may have created this email while Google was open.
    if (!created) throw new ApiError(409, 'This email uses another sign-in method. Use your original sign-in method.')
    await tx.insert(schema.accounts).values({ userId: created.id, type: 'oidc', provider: 'google', providerAccountId: identity.subject }).onConflictDoNothing()
    const linked = await tx.query.accounts.findFirst({ where, columns: { userId: true } })
    if (!linked) throw new ApiError(500, 'Unable to save Google sign-in')
    return linked.userId
  })
}
