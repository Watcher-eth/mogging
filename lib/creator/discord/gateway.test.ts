import { expect, mock, test } from 'bun:test'

const values = new Map<string, unknown>(), received: unknown[] = []
const instances: FakeManager[] = []
type Callback = (value: any) => unknown
class FakeManager {
  handlers = new Map<string, Callback[]>()
  ready: Promise<void>; readyDone!: () => void
  destroyed = false
  constructor(public options: { intents: number }) { instances.push(this); this.ready = new Promise(resolve => { this.readyDone = resolve }) }
  on(event: string, callback: Callback) { this.handlers.set(event, [...this.handlers.get(event) ?? [], callback]); return this }
  async emit(event: string, value: unknown) { await Promise.all((this.handlers.get(event) ?? []).map(callback => callback(value))) }
  async fetchGatewayInformation() { return { session_start_limit: { remaining: 1000 } } }
  async connect() { await this.emit('ready', { data: { user: { id: '1565455254227783811' } } }); this.readyDone() }
  async destroy() { this.destroyed = true }
}
mock.module('@discordjs/ws', () => ({ WebSocketManager: FakeManager, WebSocketShardEvents: { Ready: 'ready', Dispatch: 'dispatch', Error: 'error', Closed: 'closed', Resumed: 'resumed' } }))
mock.module('@discordjs/rest', () => ({ REST: class { setToken() { return this } } }))
mock.module('./config', () => ({ discordConfig: () => ({ applicationId: '1565455254227783811', botToken: 'test-token' }) }))
mock.module('./store', () => ({ discordStore: () => ({
  get: async (key: string) => values.get(key) ?? null,
  set: async (key: string, value: unknown) => { values.set(key, value); return 'OK' },
  eval: async (_script: string, keys: string[], args: unknown[]) => { if (values.get(keys[0]) === args[0]) for (const key of keys) values.delete(key); return 1 },
}) }))
mock.module('./direct-messages', () => ({ handleDirectMessage: async (raw: unknown) => { received.push(raw) } }))
const { runDirectMessageGateway, DIRECT_MESSAGE_INTENT, DM_GATEWAY_OWNER } = await import('./gateway')
const dm = { id: '1526698974847963500', channel_id: '1526698974847963400', type: 0, content: 'Hello', author: { id: '1526698974847963300' } }
test('listens only for DMs and hands over without duplicate processing or releasing the new owner', async () => {
  const first = new AbortController(), second = new AbortController()
  const firstRun = runDirectMessageGateway({ signal: first.signal, durationMs: 10_000 }); await instances[0].ready
  expect(instances[0].options.intents).toBe(1 << 12)
  expect(DIRECT_MESSAGE_INTENT & (1 << 15)).toBe(0)
  const firstOwner = values.get(DM_GATEWAY_OWNER)
  const secondRun = runDirectMessageGateway({ signal: second.signal, durationMs: 10_000 }); await instances[1].ready
  const secondOwner = values.get(DM_GATEWAY_OWNER)
  expect(secondOwner).not.toBe(firstOwner)
  await instances[0].emit('dispatch', { data: { t: 'MESSAGE_CREATE', d: dm } })
  await instances[1].emit('dispatch', { data: { t: 'MESSAGE_CREATE', d: { ...dm, guild_id: '1526698974847963268' } } })
  await instances[1].emit('dispatch', { data: { t: 'MESSAGE_CREATE', d: { ...dm, author: { id: dm.author.id, bot: true } } } })
  await instances[1].emit('dispatch', { data: { t: 'MESSAGE_CREATE', d: dm } })
  expect(received).toEqual([dm])
  first.abort(); await firstRun
  expect(values.get(DM_GATEWAY_OWNER)).toBe(secondOwner)
  second.abort(); await secondRun
  expect(values.get(DM_GATEWAY_OWNER)).toBeUndefined()
  expect(instances.every(instance => instance.destroyed)).toBe(true)
})
