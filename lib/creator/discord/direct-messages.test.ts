import { beforeEach, expect, mock, test } from 'bun:test'
import { createSupportAllowanceStore } from '../support/allowance-ledger'
import type { SupportMemory } from '../support/conversation'
import type { RenderedReply } from './render'

const userA = '1526698974847963300', userB = '1526698974847963301', channelA = '1526698974847963400'
const stored = new Map<string, unknown>(), owners: string[] = [], generated: Array<{ question: string; memory: SupportMemory }> = [], replies: RenderedReply[] = []
let ledger = createSupportAllowanceStore(null), linked = true, cancel = false, channelValid = true
mock.module('./store', () => ({ discordStore: () => ({
  get: async (key: string) => stored.get(key) ?? null,
  set: async (key: string, value: unknown, options?: { nx?: boolean }) => { if (options?.nx && stored.has(key)) return null; stored.set(key, value); return 'OK' },
  del: async (key: string) => Number(stored.delete(key)),
  eval: async (script: string, keys: string[], args: unknown[]) => {
    if (script.includes("'INCR'")) { const n = Number(stored.get(keys[0]) ?? 0) + 1; stored.set(keys[0], n); return n }
    if (stored.get(keys[0]) === args[0]) stored.delete(keys[0]); return 1
  },
}) }))
mock.module('./linking', () => ({ resolveDiscordCreator: async (id: string) => linked ? { userId: id === userA ? 'creator-a' : 'creator-b', createdAt: new Date('2026-10-29T12:00:00Z') } : null, requireCreator: async () => undefined }))
mock.module('../support/allowance-store', () => ({ readSupportAllowance: (...args: Parameters<typeof ledger.readSupportAllowance>) => ledger.readSupportAllowance(...args), reserveSupportMessage: (...args: Parameters<typeof ledger.reserveSupportMessage>) => ledger.reserveSupportMessage(...args) }))
mock.module('../support/data', () => ({ createSupportDataSource: async (id: string) => { owners.push(id); return {} } }))
mock.module('../support/agent', () => ({ runSupportAgent: async ({ input, memory }: { input: { message: string }; memory: SupportMemory }) => {
  generated.push({ question: input.message, memory }); if (cancel) linked = false
  return { text: 'Your private creator response.', artifacts: [], engine: 'glm', sampleData: false, usage: { inputTokens: 10, outputTokens: 10, modelCalls: 1 } }
} }))
mock.module('./direct-reply', () => ({ verifyDirectChannel: async (id: string, recipientId: string) => channelValid ? { id, recipientId } : null, sendDirectReply: async (_channel: unknown, reply: RenderedReply) => { replies.push(reply) } }))
const { handleDirectMessage } = await import('./direct-messages')
const { handleDiscordTurn } = await import('./conversation-handler')
const { executeCreatorSupport } = await import('../support/service')
let sequence = 1
function message(content: string, userId = userA) { return { id: String(BigInt('1526698974847963500') + BigInt(sequence++)), channel_id: channelA, type: 0, content, author: { id: userId } } }
beforeEach(() => { stored.clear(); owners.length = 0; generated.length = 0; replies.length = 0; ledger = createSupportAllowanceStore(null); linked = true; cancel = false; channelValid = true; process.env.NEXTAUTH_SECRET = 'test-only-dm-conversation-secret' })

test('normal DMs preserve conversational followups without /ask and reject duplicate deliveries', async () => {
  const first = message('How did my videos do this week?')
  await handleDirectMessage(first); await handleDirectMessage(first)
  await handleDirectMessage(message('What about last week?'))
  expect(generated.map(g => g.question)).toEqual(['How did my videos do this week?', 'What about last week?'])
  expect(generated[1].memory[0].content).toBe(first.content)
  expect(owners).toEqual(['creator-a', 'creator-a'])
  expect((await ledger.readSupportAllowance('creator-a')).remaining).toBe(2)
})
test('DMs, server commands, and the website consume one shared four-message quota', async () => {
  await executeCreatorSupport('creator-a', { message: 'Portal question' })
  await handleDiscordTurn({ userId: userA, messageId: 'server-message', room: 'guild:channel', command: 'ask', question: 'Server question', reply: async () => undefined })
  await handleDirectMessage(message('First DM question'))
  await handleDirectMessage(message('Second DM question'))
  await handleDirectMessage(message('Fifth question'))
  expect(generated).toHaveLength(4)
  expect(replies.at(-1)!.payload.content).toContain('4 messages')
  expect((await ledger.readSupportAllowance('creator-a')).remaining).toBe(0)
})
test('separate members and server conversations cannot reuse each other’s private memory', async () => {
  await handleDiscordTurn({ userId: userA, messageId: 'server-message', room: 'guild:channel', command: 'ask', question: 'Server-only question', reply: async () => undefined })
  await handleDirectMessage(message('Private DM'))
  await handleDirectMessage(message('Another creator DM', userB))
  expect(generated[1].memory).toEqual([])
  expect(generated[2].memory).toEqual([])
  expect(owners).toEqual(['creator-a', 'creator-a', 'creator-b'])
})
test('unlinked users get a connect button without data reads or quota consumption', async () => {
  linked = false
  await handleDirectMessage(message('Where is my payment?'))
  expect(generated).toHaveLength(0); expect(owners).toHaveLength(0)
  expect(replies[0].payload.components![0].components[0].label).toBe('Connect Creator Studio')
  expect((await ledger.readSupportAllowance('creator-a')).remaining).toBe(4)
})
test('help, allowance, and reset are free; reset clears only this DM conversation', async () => {
  await handleDirectMessage(message('First question'))
  await handleDirectMessage(message('help')); await handleDirectMessage(message('allowance')); await handleDirectMessage(message('reset'))
  await handleDirectMessage(message('Fresh question'))
  expect(generated).toHaveLength(2)
  expect(generated[1].memory).toEqual([])
  expect((await ledger.readSupportAllowance('creator-a')).remaining).toBe(2)
})
test('public messages, bot loops, webhooks, and unsafe channels never reach the agent', async () => {
  const base = message('A question')
  for (const raw of [{ ...base, guild_id: '1526698974847963268' }, { ...base, author: { id: userA, bot: true } }, { ...base, webhook_id: userA }, { ...base, type: 7 }]) await handleDirectMessage(raw)
  channelValid = false; await handleDirectMessage(message('Wrong recipient or group channel'))
  expect(generated).toHaveLength(0); expect(replies).toHaveLength(0)
})
test('disconnecting during generation prevents data delivery and refunds the reservation', async () => {
  cancel = true
  await handleDirectMessage(message('My private question'))
  expect(replies).toHaveLength(1)
  expect(replies[0].payload.content).toContain('connection changed')
  expect(replies[0].payload.content).not.toContain('Your private creator response')
  expect((await ledger.readSupportAllowance('creator-a')).remaining).toBe(4)
})
test('attachment-only and overlong questions ask for text without spending the allowance', async () => {
  await handleDirectMessage(message('')); await handleDirectMessage(message('x'.repeat(1501)))
  expect(generated).toHaveLength(0)
  expect((await ledger.readSupportAllowance('creator-a')).remaining).toBe(4)
})
