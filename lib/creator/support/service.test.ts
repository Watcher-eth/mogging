import { beforeEach, expect, mock, test } from 'bun:test'
import { createSupportAllowanceStore } from './allowance-ledger'
import { createDemoDataSource } from './demo'
import { readSupportConversation } from './conversation'

const ledger = createSupportAllowanceStore(null), source = createDemoDataSource()
const owners: string[] = []
mock.module('./allowance-store', () => ledger)
mock.module('./data', () => ({ createSupportDataSource: async (userId: string) => { owners.push(userId); if (userId === 'suspended') throw new Error('Creator access required'); return source } }))
const { executeCreatorSupport } = await import('./service')
beforeEach(() => { process.env.NEXTAUTH_SECRET = 'test-only-discord-support-secret'; owners.length = 0 })
test('portal and Discord calls consume one shared four-message quota', async () => {
  const user = 'shared-creator'
  await executeCreatorSupport(user, { message: 'Show my campaigns' })
  await executeCreatorSupport(user, { message: 'Show my campaigns' }, { conversationOwner: `discord:${user}:channel-a` })
  await executeCreatorSupport(user, { message: 'Show my campaigns' }, { conversationOwner: `discord:${user}:channel-b` })
  const last = await executeCreatorSupport(user, { message: 'Show my campaigns' })
  expect(last.allowance?.remaining).toBe(0)
  await expect(executeCreatorSupport(user, { message: 'Show my campaigns' }, { conversationOwner: `discord:${user}:channel-a` })).rejects.toThrow('4 messages')
  expect(owners.every(owner => owner === user)).toBe(true)
  expect((await ledger.readSupportAllowance('another-creator')).remaining).toBe(4)
})
test('failed delivery refunds once and a new creator has a separate budget', async () => {
  await expect(executeCreatorSupport('delivery-failure', { message: 'Show my campaigns' }, { deliver: async () => { throw new Error('delivery failed') } })).rejects.toThrow('delivery failed')
  expect((await ledger.readSupportAllowance('delivery-failure')).remaining).toBe(4)
})
test('Discord memory is isolated by user/link/channel and cannot be replayed in the portal', async () => {
  const result = await executeCreatorSupport('memory-user', { message: 'Show my campaigns' }, { conversationOwner: 'discord:memory-user:link-a:channel-a' })
  expect(readSupportConversation(result.conversation, 'discord:memory-user:link-a:channel-a', process.env.NEXTAUTH_SECRET!)).toHaveLength(2)
  for (const owner of ['memory-user', 'discord:other-user:link-a:channel-a', 'discord:memory-user:link-b:channel-a', 'discord:memory-user:link-a:channel-b']) expect(() => readSupportConversation(result.conversation, owner, process.env.NEXTAUTH_SECRET!)).toThrow('expired')
})
test('denied creator access cannot consume an allowance', async () => {
  await expect(executeCreatorSupport('suspended', { message: 'Show my campaigns' })).rejects.toThrow('Creator access required')
  expect((await ledger.readSupportAllowance('suspended')).remaining).toBe(4)
})
