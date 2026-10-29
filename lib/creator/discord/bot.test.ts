import { beforeEach, expect, mock, test } from 'bun:test'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createDemoDataSource } from '../support/demo'
import { createSupportAllowanceStore } from '../support/allowance-ledger'
import { discordInteractionSchema } from './interactions'

const keys = generateKeyPairSync('ed25519')
process.env.DISCORD_PUBLIC_KEY = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
process.env.DISCORD_APPLICATION_ID = '1526698974847963299'
process.env.DISCORD_BOT_TOKEN = 'test-token'
process.env.DISCORD_CLIENT_SECRET = 'test-secret'
process.env.DISCORD_GUILD_ID = '1526698974847963268'
process.env.NEXTAUTH_SECRET = 'test-only-conversation-signing-secret'
const memory = new Map<string, unknown>(), deliveries: Array<{ url: string; payload: Record<string, unknown> }> = [], owners: string[] = []
const ledger = createSupportAllowanceStore(null)
const links = new Map([['1526698974847963300', { userId: 'creator-a', createdAt: new Date('2026-10-29T12:00:00Z') }], ['1526698974847963301', { userId: 'creator-b', createdAt: new Date('2026-10-29T12:00:00Z') }]])
let disconnectWhileReading = false
mock.module('./store', () => ({ discordStore: () => ({
  get: async (key: string) => memory.get(key) ?? null,
  set: async (key: string, value: unknown, options?: { nx?: boolean }) => { if (options?.nx && memory.has(key)) return null; memory.set(key, value); return 'OK' },
  del: async (key: string) => Number(memory.delete(key)),
  eval: async (_script: string, keys: string[], args: unknown[]) => { if (memory.get(keys[0]) === args[0]) memory.delete(keys[0]); return 1 },
}) }))
mock.module('./linking', () => ({ resolveDiscordCreator: async (id: string) => links.get(id) ?? null, requireCreator: async () => undefined }))
mock.module('../support/allowance-store', () => ledger)
mock.module('../support/data', () => ({ createSupportDataSource: async (userId: string) => {
  owners.push(userId)
  const demo = createDemoDataSource()
  return { ...demo, overview: async () => { if (disconnectWhileReading) links.delete('1526698974847963300'); return demo.overview() } }
} }))
const { getDiscordBot, handleDiscordSupport } = await import('./bot')
const { executeCreatorSupport } = await import('../support/service')
const originalFetch = globalThis.fetch
beforeEach(() => { deliveries.length = 0; owners.length = 0; disconnectWhileReading = false })
let sequence = 100
function interaction(userId = '1526698974847963300', command = 'submissions') {
  return discordInteractionSchema.parse({ id: String(BigInt('1526698974847963000') + BigInt(sequence++)), application_id: process.env.DISCORD_APPLICATION_ID, token: `interaction-${sequence}`, type: 2, guild_id: process.env.DISCORD_GUILD_ID, channel_id: '1526698975313526877', member: { user: { id: userId, username: 'same-name' } }, data: { name: command } })
}
async function withDelivery(fn: () => Promise<void>) {
  globalThis.fetch = (async (url, init) => {
    deliveries.push({ url: String(url), payload: JSON.parse(String(init?.body)) })
    return Response.json({ id: 'response' })
  }) as typeof fetch
  try { await fn() } finally { globalThis.fetch = originalFetch }
}
test('actual Chat SDK acknowledges privately, then delivers the creator’s rows only to the interaction', async () => withDelivery(async () => {
  const payload = interaction(), raw = JSON.stringify({ ...payload, member: { user: { id: payload.member.user.id, username: 'creator' } } })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = sign(null, Buffer.concat([Buffer.from(timestamp), Buffer.from(raw)]), keys.privateKey).toString('hex')
  const tasks: Promise<unknown>[] = []
  const response = await getDiscordBot().webhooks.discord(new Request('https://www.mogging.com/api/discord/interactions', { method: 'POST', body: raw, headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp } }), { waitUntil: task => tasks.push(task) })
  expect(await response.json()).toEqual({ type: 5, data: { flags: 64 } })
  await Promise.all(tasks)
  expect(owners).toEqual(['creator-a'])
  expect(deliveries).toHaveLength(1)
  expect(deliveries[0].url).toContain(`/webhooks/${payload.application_id}/${payload.token}/messages/@original`)
  expect(deliveries[0].payload).toMatchObject({ allowed_mentions: { parse: [] } })
  expect(JSON.stringify(deliveries[0].payload)).toContain('Approved & paid')
  expect((await ledger.readSupportAllowance('creator-a')).remaining).toBe(3)
  await executeCreatorSupport('creator-a', { message: 'Show my campaigns' })
  expect((await ledger.readSupportAllowance('creator-a')).remaining).toBe(2)
}))
test('another member in the same channel receives a separate identity and conversation', async () => withDelivery(async () => {
  await handleDiscordSupport(interaction('1526698974847963301'))
  expect(owners).toEqual(['creator-b'])
  expect([...memory.keys()].filter(k => k.startsWith('creator-discord:conversation:'))).toHaveLength(2)
  expect((await ledger.readSupportAllowance('creator-b')).remaining).toBe(3)
}))
test('unlinked members get a connection button without private data access or quota charges', async () => withDelivery(async () => {
  await handleDiscordSupport(interaction('1526698974847963399'))
  expect(owners).toEqual([])
  expect(JSON.stringify(deliveries[0].payload)).toContain('Connect Creator Studio')
  expect(deliveries[0].payload.embeds).toBeUndefined()
}))
test('disconnecting during a response prevents delivery and refunds the message', async () => withDelivery(async () => {
  const before = (await ledger.readSupportAllowance('creator-a')).remaining
  disconnectWhileReading = true
  await expect(handleDiscordSupport(interaction())).rejects.toThrow('connection changed')
  expect(deliveries).toHaveLength(0)
  expect((await ledger.readSupportAllowance('creator-a')).remaining).toBe(before)
}))
