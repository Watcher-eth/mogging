import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, like, lt } from 'drizzle-orm'
import { encode } from 'next-auth/jwt'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { authOptions } from './options'

const prefix = 'mobile-web-session:'
const ticketLifetimeMs = 60_000
const hash = (code: string) => createHash('sha256').update(code).digest('hex')

export async function createMobileWebSession(userId: string) {
  if (!authOptions.secret) throw new ApiError(503, 'Website sign-in is unavailable')
  const code = randomBytes(32).toString('base64url')
  await db.delete(schema.verificationTokens).where(and(
    like(schema.verificationTokens.identifier, `${prefix}%`),
    lt(schema.verificationTokens.expires, new Date()),
  ))
  await db.insert(schema.verificationTokens).values({
    identifier: `${prefix}${userId}`,
    token: hash(code),
    expires: new Date(Date.now() + ticketLifetimeMs),
  })
  return code
}

export async function consumeMobileWebSession(code: string) {
  if (!authOptions.secret) throw new ApiError(503, 'Website sign-in is unavailable')
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new ApiError(401, 'Open a fresh account link from the app')
  // Claim atomically so concurrent requests cannot reuse a browser sign-in link.
  const [ticket] = await db.delete(schema.verificationTokens).where(and(
    like(schema.verificationTokens.identifier, `${prefix}%`),
    eq(schema.verificationTokens.token, hash(code)),
    gt(schema.verificationTokens.expires, new Date()),
  )).returning({ identifier: schema.verificationTokens.identifier })
  if (!ticket) throw new ApiError(401, 'Open a fresh account link from the app')
  const userId = ticket.identifier.slice(prefix.length)
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { id: true, name: true, email: true, image: true },
  })
  const guest = await db.query.mobileGuests.findFirst({
    where: eq(schema.mobileGuests.userId, userId), columns: { claimedByUserId: true },
  })
  if (!user || guest?.claimedByUserId) throw new ApiError(401, 'Sign in with your saved account')
  const maxAge = authOptions.session?.maxAge ?? 30 * 24 * 60 * 60
  const token = await encode({
    secret: authOptions.secret, maxAge,
    token: { id: user.id, sub: user.id, name: user.name, email: user.email, picture: user.image },
  })
  return { token, maxAge }
}
