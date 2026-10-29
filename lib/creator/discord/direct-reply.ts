import { REST } from '@discordjs/rest'
import { discordConfig } from './config'
import type { RenderedReply } from './render'

export type VerifiedDirectChannel = { id: string; recipientId: string }
const verified = new WeakSet<VerifiedDirectChannel>()
let rest: REST | undefined
function discordRest() { return rest ??= new REST({ timeout: 10_000, retries: 1 }).setToken(discordConfig().botToken) }

/** A server/guild channel ID can never become a destination for personal support data. */
export async function verifyDirectChannel(channelId: string, userId: string): Promise<VerifiedDirectChannel | null> {
  const channel = await discordRest().get(`/channels/${channelId}`) as { id: string; type: number; recipients?: Array<{ id: string }> }
  if (channel.id !== channelId || channel.type !== 1 || channel.recipients?.length !== 1 || channel.recipients[0].id !== userId) return null
  const result = { id: channelId, recipientId: userId }
  verified.add(result)
  return result
}

export async function sendDirectReply(channel: VerifiedDirectChannel, response: RenderedReply, incomingMessageId: string) {
  if (!verified.has(channel)) throw new Error('A verified one-to-one DM channel is required')
  await discordRest().post(`/channels/${channel.id}/messages`, {
    body: { ...response.payload, allowed_mentions: { parse: [] }, nonce: incomingMessageId, enforce_nonce: true, ...(response.image ? { attachments: [{ id: 0, filename: 'performance.png' }] } : {}) },
    ...(response.image ? { files: [{ data: response.image, name: 'performance.png', contentType: 'image/png' }] } : {}),
  })
}
