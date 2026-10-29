import { expect, mock, test } from 'bun:test'

let metadata = { id: '1526698974847963400', type: 1, recipients: [{ id: '1526698974847963300' }] }
const sent: Array<{ route: string; options: { body: Record<string, unknown>; files?: unknown[] } }> = []
mock.module('@discordjs/rest', () => ({ REST: class {
  setToken() { return this }
  async get() { return metadata }
  async post(route: string, options: { body: Record<string, unknown>; files?: unknown[] }) { sent.push({ route, options }); return { id: 'sent' } }
} }))
const { verifyDirectChannel, sendDirectReply } = await import('./direct-reply')
const reply = { payload: { content: 'Private creator information', allowed_mentions: { parse: [] as never[] } } }
test('only a verified DM with the sender can receive private data, with retry-safe delivery', async () => {
  const dm = await verifyDirectChannel(metadata.id, metadata.recipients[0].id)
  expect(dm).not.toBeNull()
  await sendDirectReply(dm!, reply, '1526698974847963500')
  expect(sent[0].route).toBe('/channels/1526698974847963400/messages')
  expect(sent[0].options.body).toMatchObject({ nonce: '1526698974847963500', enforce_nonce: true, allowed_mentions: { parse: [] } })
  await expect(sendDirectReply({ id: dm!.id, recipientId: dm!.recipientId }, reply, 'forged')).rejects.toThrow('verified one-to-one DM')
  expect(sent).toHaveLength(1)
})
test('guild channels, group DMs, and another recipient are rejected', async () => {
  metadata = { ...metadata, type: 0 }; expect(await verifyDirectChannel(metadata.id, '1526698974847963300')).toBeNull()
  metadata = { ...metadata, type: 3 }; expect(await verifyDirectChannel(metadata.id, '1526698974847963300')).toBeNull()
  metadata = { ...metadata, type: 1 }; expect(await verifyDirectChannel(metadata.id, '1526698974847963399')).toBeNull()
  expect(sent).toHaveLength(1)
})
