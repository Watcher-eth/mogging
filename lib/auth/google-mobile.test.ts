import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose'
import { ApiError } from '../api/http'
import { createGoogleMobileState, readGoogleMobileState, verifyGoogleVerifier } from './google-mobile-state'

const verifier = 'v'.repeat(64), nonce = 'a'.repeat(64), secret = 'test-signing-secret'
const challenge = createHash('sha256').update(verifier).digest('base64url')
const pair = await generateKeyPair('RS256')
const jwk = { ...await exportJWK(pair.publicKey), kid: 'fixture', alg: 'RS256' }

async function harness(options: { existing?: boolean; linked?: boolean; race?: boolean; existingOnly?: boolean; claims?: Record<string, unknown> } = {}) {
  const token = await new SignJWT({ nonce, email: 'buyer@example.test', email_verified: true, ...options.claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).setSubject('google-user').setAudience('google-client')
    .setIssuer('https://accounts.google.com').setExpirationTime('5m').sign(pair.privateKey)
  let linked = options.linked, writes = 0, sessions = 0, referrals = 0
  const requests: URLSearchParams[] = []
  const users = { id: 'id', email: 'email' }, accounts = { provider: 'provider', providerAccountId: 'subject' }
  const tx = { execute: async () => {}, query: {
    users: { findFirst: async () => options.existing ? { id: 'buyer' } : null },
    accounts: { findFirst: async () => linked ? { userId: 'buyer' } : null },
  }, insert: (table: unknown) => ({ values: () => ({ onConflictDoNothing: () => {
    if (table === accounts) { writes++; linked = true; return Promise.resolve() }
    return { returning: async () => { if (options.race) return []; writes++; return [{ id: 'buyer' }] } }
  } }) }) }
  const scope: any = { URL, URLSearchParams, Date, AbortSignal, ApiError,
    createGoogleMobileState, readGoogleMobileState, verifyGoogleVerifier, jwtVerify,
    createRemoteJWKSet: () => createLocalJWKSet({ keys: [jwk] }),
    env: { NEXTAUTH_SECRET: secret, NEXTAUTH_URL: 'https://www.mogging.com', GOOGLE_CLIENT_ID: 'google-client', GOOGLE_CLIENT_SECRET: 'server-secret' },
    db: { transaction: (work: (tx: unknown) => unknown) => work(tx) }, schema: { users, accounts },
    and: (...v: unknown[]) => v, eq: (...v: unknown[]) => v, sql: () => ({}),
    fetch: async (_url: string, init: RequestInit) => { requests.push(init.body as URLSearchParams); return Response.json({ id_token: token }) },
    creditReferralSignup: async () => { referrals++ },
    createMobileSessionForUser: async (userId: string) => { sessions++; return { userId, sessionToken: 'opaque-session' } },
  }
  const source = readFileSync(new URL('./google-mobile.ts', import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, '')
  runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source + '\nglobalThis.api = { beginGoogleMobile, googleMobileCallback, finishGoogleMobile };'), scope)
  const start = scope.api.beginGoogleMobile({ challenge, nonce, existingOnly: options.existingOnly })
  return { ...scope.api, start, requests, counts: () => ({ writes, sessions, referrals }),
    finish: (override = {}) => scope.api.finishGoogleMobile({ code: 'one-use-google-code', state: start.state, verifier, ...override }) }
}

test('cookie-free Google handoff verifies PKCE and a real signed identity before creating a session', async () => {
  const h = await harness()
  const authorization = new URL(h.start.url)
  expect(authorization.searchParams.get('code_challenge')).toBe(challenge)
  expect(authorization.searchParams.get('redirect_uri')).toBe('https://www.mogging.com/api/auth/callback/google')
  const callback = new URL(h.googleMobileCallback({ state: h.start.state, code: 'one-use-google-code' }))
  expect(callback.protocol).toBe('mogging:')
  expect(new URLSearchParams(callback.hash.slice(1)).get('code')).toBe('one-use-google-code')
  expect(await h.finish()).toEqual({ userId: 'buyer', sessionToken: 'opaque-session' })
  expect(h.requests[0].get('code_verifier')).toBe(verifier)
  expect(h.counts()).toEqual({ writes: 2, sessions: 1, referrals: 1 })
})

test('bad PKCE or signed state never reaches the token endpoint', async () => {
  const h = await harness()
  await expect(h.finish({ verifier: 'x'.repeat(64) })).rejects.toThrow('verification failed')
  await expect(h.finish({ state: h.start.state + 'tampered' })).rejects.toThrow('session is invalid')
  expect(h.requests).toHaveLength(0)
  expect(h.counts().sessions).toBe(0)
})

test('unverified email and mismatched nonce cannot create accounts or sessions', async () => {
  for (const claims of [{ nonce: 'wrong' }, { email_verified: false }]) {
    const h = await harness({ claims })
    await expect(h.finish()).rejects.toThrow('identity could not be verified')
    expect(h.counts()).toEqual({ writes: 0, sessions: 0, referrals: 0 })
  }
})

test('returning accounts work while unknown, differently linked, and concurrently created accounts stay protected', async () => {
  const returning = await harness({ linked: true, existingOnly: true })
  await returning.finish()
  expect(returning.counts()).toEqual({ writes: 0, sessions: 1, referrals: 1 })
  for (const options of [{ existingOnly: true }, { existing: true }, { race: true }]) {
    const h = await harness(options)
    await expect(h.finish()).rejects.toThrow(options.existingOnly ? 'No existing Mogging account' : 'another sign-in method')
    expect(h.counts()).toEqual({ writes: 0, sessions: 0, referrals: 0 })
  }
})

test('ordinary web state is untouched and cancellation returns only a fixed app callback', async () => {
  const h = await harness()
  expect(h.googleMobileCallback({ state: 'next-auth-web-state' })).toBeNull()
  const callback = new URL(h.googleMobileCallback({ state: h.start.state, error: 'access_denied', redirect_uri: 'https://evil.test' }))
  expect(callback.host).toBe('auth')
  expect(new URLSearchParams(callback.hash.slice(1)).get('error')).toBe('provider_cancelled')
})
