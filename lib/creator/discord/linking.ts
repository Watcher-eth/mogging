import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { discordConfig, DISCORD_API, portalOrigin } from './config'
import { discordStore } from './store'

export const stateKey = (state: string) => `creator-discord:oauth:${createHash('sha256').update(state).digest('hex')}`
export function verifyLinkState(state: unknown, cookie: unknown) {
  if (typeof state !== 'string' || typeof cookie !== 'string' || !/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(cookie) || !timingSafeEqual(Buffer.from(state), Buffer.from(cookie))) throw new ApiError(400, 'This Discord connection expired. Please try again.')
  return state
}
export function requirePortalOrigin(origin: string | string[] | undefined) {
  if (origin !== portalOrigin()) throw new ApiError(403, 'Invalid request origin')
}
export async function requireCreator(userId: string) {
  const profile = await db.query.creatorProfiles.findFirst({ columns: { id: true, authStatus: true }, where: eq(schema.creatorProfiles.userId, userId) })
  if (!profile || profile.authStatus === 'suspended') throw new ApiError(403, 'Creator access required')
}
export async function beginDiscordLink(userId: string) {
  const config = discordConfig()
  await requireCreator(userId)
  const state = randomBytes(32).toString('hex')
  await discordStore().set(stateKey(state), { userId }, { ex: 600, nx: true })
  const url = new URL('https://discord.com/oauth2/authorize')
  url.search = new URLSearchParams({ client_id: config.applicationId, redirect_uri: config.redirectUri, response_type: 'code', scope: 'identify', state, prompt: 'consent' }).toString()
  return { state, url: url.toString() }
}
export async function consumeDiscordState(state: string, userId: string) {
  // GETDEL makes a callback single use, including simultaneous/replayed requests.
  const saved = await discordStore().getdel<{ userId: string }>(stateKey(state))
  if (!saved || saved.userId !== userId) throw new ApiError(400, 'This Discord connection expired. Please try again.')
}
export async function finishDiscordLink(code: string, userId: string) {
  const config = discordConfig()
  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.applicationId, client_secret: config.clientSecret, grant_type: 'authorization_code', code, redirect_uri: config.redirectUri }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new ApiError(502, 'Discord could not verify your connection. Please try again.')
  const token = await response.json() as { access_token?: string }
  if (!token.access_token) throw new ApiError(502, 'Discord could not verify your connection')
  try {
    const accountResponse = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000) })
    if (!accountResponse.ok) throw new ApiError(502, 'Discord could not verify your account')
    const account = await accountResponse.json() as { id?: string; username?: string; bot?: boolean }
    if (!account.id || !/^\d{17,22}$/.test(account.id) || !account.username || account.bot) throw new ApiError(400, 'Please connect a personal Discord account')
    await db.transaction(async tx => {
      const [profile] = await tx.select({ id: schema.creatorProfiles.id }).from(schema.creatorProfiles).where(and(eq(schema.creatorProfiles.userId, userId), ne(schema.creatorProfiles.authStatus, 'suspended'))).for('share')
      if (!profile) throw new ApiError(403, 'Creator access required')
      // Never overwrite either side of a link. Database uniqueness also covers races.
      const inserted = await tx.insert(schema.creatorDiscordLinks).values({ userId, discordUserId: account.id!, discordUsername: account.username!.slice(0, 100) }).onConflictDoNothing().returning({ userId: schema.creatorDiscordLinks.userId })
      if (!inserted.length) {
        const [existing] = await tx.select().from(schema.creatorDiscordLinks).where(eq(schema.creatorDiscordLinks.userId, userId))
        if (existing?.discordUserId !== account.id) throw new ApiError(409, 'An account is already connected. Disconnect it in Creator Studio before changing accounts.')
      }
    })
  } finally {
    // Only the verified identity is stored; OAuth credentials are never persisted.
    await fetch(`${DISCORD_API}/oauth2/token/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.applicationId, client_secret: config.clientSecret, token: token.access_token }), signal: AbortSignal.timeout(5_000) }).catch(() => undefined)
  }
}

export function findDiscordLink(userId: string) {
  return db.query.creatorDiscordLinks.findFirst({ where: eq(schema.creatorDiscordLinks.userId, userId), columns: { discordUserId: true, discordUsername: true, createdAt: true } })
}
export function resolveDiscordCreator(discordUserId: string) {
  return db.query.creatorDiscordLinks.findFirst({ where: eq(schema.creatorDiscordLinks.discordUserId, discordUserId), columns: { userId: true, createdAt: true } })
}
export async function disconnectDiscord(userId: string) {
  await db.delete(schema.creatorDiscordLinks).where(eq(schema.creatorDiscordLinks.userId, userId))
}
