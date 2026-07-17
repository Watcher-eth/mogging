import { createHash, randomBytes } from 'crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { NextApiRequest, NextApiResponse } from 'next'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { ApiError } from '@/lib/api/http'
import { db, schema } from '@/lib/db'
import { getAuthSession } from './session'

const APPLE_ISSUER = 'https://appleid.apple.com'
const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys')
const IOS_BUNDLE_ID = 'app.mogging.scan'
const MOBILE_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30

let appleJwks: ReturnType<typeof createRemoteJWKSet> | null = null

type AppleIdentity = {
  subject: string
  email: string | null
}

export async function createMobileSessionFromApple(input: {
  identityToken: string
  nonce: string
  name?: string | null
}) {
  const identity = await verifyAppleIdentity(input.identityToken, input.nonce)
  const userId = await findOrCreateAppleUser(identity, input.name)
  const sessionToken = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + MOBILE_SESSION_MAX_AGE_MS)

  await db.insert(schema.sessions).values({ sessionToken, userId, expires })

  return {
    sessionToken,
    expires,
    userId,
  }
}

export async function getRequestUserId(req: NextApiRequest, res: NextApiResponse) {
  const bearerToken = readBearerToken(req)
  if (bearerToken) {
    const mobileSession = await db.query.sessions.findFirst({
      where: and(eq(schema.sessions.sessionToken, bearerToken), gt(schema.sessions.expires, new Date())),
      columns: { userId: true },
    })
    if (mobileSession) return mobileSession.userId
  }

  const session = await getAuthSession(req, res)
  return session?.user?.id ?? null
}

async function verifyAppleIdentity(identityToken: string, nonce: string): Promise<AppleIdentity> {
  if (!appleJwks) appleJwks = createRemoteJWKSet(APPLE_JWKS_URL)

  let payload: JWTPayload
  try {
    const verified = await jwtVerify(identityToken, appleJwks, {
      issuer: APPLE_ISSUER,
      audience: IOS_BUNDLE_ID,
    })
    payload = verified.payload
  } catch {
    throw new ApiError(401, 'Apple identity token is invalid or expired')
  }

  if (!payload.sub) throw new ApiError(401, 'Apple identity is missing a subject')
  const expectedNonce = createHash('sha256').update(nonce).digest('hex')
  if (payload.nonce !== nonce && payload.nonce !== expectedNonce) {
    throw new ApiError(401, 'Apple sign-in nonce did not match')
  }

  return {
    subject: payload.sub,
    email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null,
  }
}

async function findOrCreateAppleUser(identity: AppleIdentity, name?: string | null) {
  const existingAccount = await db.query.accounts.findFirst({
    where: and(eq(schema.accounts.provider, 'apple'), eq(schema.accounts.providerAccountId, identity.subject)),
    columns: { userId: true },
  })
  if (existingAccount) return existingAccount.userId

  if (!identity.email) {
    throw new ApiError(409, 'Apple did not provide an email for this new account. Revoke Mogging in Apple ID settings and sign in again.')
  }

  let user = await db.query.users.findFirst({
    where: eq(schema.users.email, identity.email),
    columns: { id: true },
  })

  if (!user) {
    await db.insert(schema.users).values({
      email: identity.email,
      emailVerified: new Date(),
      name: normalizeName(name),
    }).onConflictDoNothing({ target: schema.users.email })
    user = await db.query.users.findFirst({
      where: eq(schema.users.email, identity.email),
      columns: { id: true },
    })
  }
  if (!user) throw new ApiError(500, 'Unable to create Apple account')

  await db.insert(schema.accounts).values({
    userId: user.id,
    type: 'oidc',
    provider: 'apple',
    providerAccountId: identity.subject,
  }).onConflictDoNothing()

  const linkedAccount = await db.query.accounts.findFirst({
    where: and(eq(schema.accounts.provider, 'apple'), eq(schema.accounts.providerAccountId, identity.subject)),
    columns: { userId: true },
  })
  if (!linkedAccount) throw new ApiError(500, 'Unable to link Apple account')
  return linkedAccount.userId
}

function readBearerToken(req: NextApiRequest) {
  const authorization = req.headers.authorization
  const value = Array.isArray(authorization) ? authorization[0] : authorization
  if (!value?.startsWith('Bearer ')) return null
  const token = value.slice('Bearer '.length).trim()
  return token.length >= 32 && token.length <= 200 ? token : null
}

function normalizeName(value?: string | null) {
  const name = value?.trim().replace(/\s+/g, ' ')
  return name ? name.slice(0, 120) : null
}
