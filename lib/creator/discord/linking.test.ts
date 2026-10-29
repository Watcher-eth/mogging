import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const states = new Map<string, unknown>(), links = new Map<string, { userId: string; discordUserId: string; discordUsername: string }>()
let active = true, discordUserId = '1526698974847963300'
mock.module('./store', () => ({ discordStore: () => ({ set: async (key: string, value: unknown) => { states.set(key, value); return 'OK' }, getdel: async (key: string) => { const value = states.get(key); states.delete(key); return value ?? null } }) }))
mock.module('@/lib/db', () => ({ schema, db: {
  query: { creatorProfiles: { findFirst: async () => active ? { id: 'profile', authStatus: 'verified' } : null } },
  transaction: async (fn: (tx: unknown) => Promise<void>) => fn({
    select: () => ({ from: (table: unknown) => ({ where: (where: SQL) => table === schema.creatorProfiles ? { for: async () => active ? [{ id: 'profile' }] : [] } : Promise.resolve([...links.values()].filter(l => l.userId === new PgDialect().sqlToQuery(where).params[0])) }) }),
    insert: () => ({ values: (value: { userId: string; discordUserId: string; discordUsername: string }) => ({ onConflictDoNothing: () => ({ returning: async () => {
      if (links.has(value.userId) || [...links.values()].some(l => l.discordUserId === value.discordUserId)) return []
      links.set(value.userId, value); return [{ userId: value.userId }]
    } }) }) }),
  }),
} }))
const { beginDiscordLink, consumeDiscordState, finishDiscordLink, requirePortalOrigin, stateKey, verifyLinkState } = await import('./linking')
beforeEach(() => {
  states.clear(); links.clear(); active = true; discordUserId = '1526698974847963300'
  process.env.NEXTAUTH_URL = 'https://www.mogging.com'
  process.env.DISCORD_APPLICATION_ID = '1526698974847963299'
  process.env.DISCORD_GUILD_ID = '1526698974847963268'
  process.env.DISCORD_PUBLIC_KEY = 'a'.repeat(64)
  process.env.DISCORD_CLIENT_SECRET = 'test-client-secret'
  process.env.DISCORD_BOT_TOKEN = 'test-bot-token'
})
test('link initiation asks only for identity and binds a random single-use state to the portal user', async () => {
  const result = await beginDiscordLink('portal-user')
  expect(result.state).toHaveLength(64)
  const url = new URL(result.url)
  expect(url.searchParams.get('scope')).toBe('identify')
  expect(url.searchParams.get('redirect_uri')).toBe('https://www.mogging.com/api/creator/discord/callback')
  expect(url.searchParams.get('state')).toBe(result.state)
  expect(states.has(result.state)).toBe(false)
  expect(states.has(stateKey(result.state))).toBe(true)
  expect(verifyLinkState(result.state, result.state)).toBe(result.state)
  expect(() => verifyLinkState(result.state, 'a'.repeat(64))).toThrow('expired')
  expect(() => requirePortalOrigin('https://attacker.example')).toThrow('origin')
  await expect(consumeDiscordState(result.state, 'another-user')).rejects.toThrow('expired')
  await expect(consumeDiscordState(result.state, 'portal-user')).rejects.toThrow('expired')
})
test('OAuth callbacks cannot be replayed', async () => {
  const { state } = await beginDiscordLink('portal-user')
  await consumeDiscordState(state, 'portal-user')
  await expect(consumeDiscordState(state, 'portal-user')).rejects.toThrow('expired')
})
test('links use the OAuth-verified Discord identity, never names, and never overwrite another creator link', async () => {
  const original = globalThis.fetch, calls: string[] = []
  globalThis.fetch = (async (url, init) => {
    const path = String(url); calls.push(path)
    if (path.endsWith('/oauth2/token')) { expect(init?.body).toBeInstanceOf(URLSearchParams); return Response.json({ access_token: 'ephemeral-oauth-token' }) }
    if (path.endsWith('/users/@me')) { expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer ephemeral-oauth-token'); return Response.json({ id: discordUserId, username: 'same-visible-name' }) }
    return new Response('', { status: 200 })
  }) as typeof fetch
  try {
    await finishDiscordLink('valid-code', 'portal-user')
    expect(links.get('portal-user')?.discordUserId).toBe(discordUserId)
    await expect(finishDiscordLink('another-valid-code', 'another-user')).rejects.toThrow('already connected')
    expect(links.has('another-user')).toBe(false)
    discordUserId = '1526698974847963301'
    await expect(finishDiscordLink('third-code', 'portal-user')).rejects.toThrow('already connected')
    expect(links.get('portal-user')?.discordUserId).toBe('1526698974847963300')
    expect(JSON.stringify([...links.values()])).not.toContain('ephemeral-oauth-token')
    expect(calls.filter(c => c.endsWith('/token/revoke'))).toHaveLength(3)
  } finally { globalThis.fetch = original }
})
test('suspended creators cannot start linking', async () => {
  active = false
  await expect(beginDiscordLink('suspended')).rejects.toThrow('Creator access required')
  expect(states.size).toBe(0)
})
