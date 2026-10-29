import { ApiError } from '@/lib/api/http'
import { discordConfig } from './config'
import { discordStore } from './store'
import { handleDiscordTurn, supportHelpReply } from './conversation-handler'
import { sendDirectReply, verifyDirectChannel } from './direct-reply'
import { directMessageCommand, directMessageSchema } from './dm-contract'

/** Only called by our authenticated Gateway connection, never by a public message-ingestion API. */
export async function handleDirectMessage(raw: unknown) {
  const parsed = directMessageSchema.safeParse(raw)
  if (!parsed.success) return
  const message = parsed.data
  if (message.author.id === discordConfig().applicationId) return
  const redis = discordStore()
  const claim = await redis.set(`creator-discord:dm-message:${discordConfig().applicationId}:${message.id}`, true, { nx: true, ex: 172800 })
  if (!claim) return
  const bucket = Math.floor(Date.now() / 60_000)
  const count = Number(await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],120) end return n", [`creator-discord:rate:dm:${message.author.id}:${bucket}`], []))
  if (count > 16) return
  const channel = await verifyDirectChannel(message.channel_id, message.author.id)
  if (!channel) return
  const reply = (text: string) => sendDirectReply(channel, supportHelpReply(text), message.id)
  if (count === 16) return reply('Please wait a minute before trying again. This request hasn’t used a support message.')
  const question = message.content.trim()
  if (!question) return reply('Send your creator question as text. I can help with campaigns, submissions, earnings, referrals, and analytics.')
  if (question.length > 1500) return reply('Please keep your question under 1,500 characters. This message hasn’t used your daily allowance.')
  try {
    await handleDiscordTurn({ userId: message.author.id, messageId: message.id, room: `dm:${message.channel_id}`, command: directMessageCommand(question), question, reply: response => sendDirectReply(channel, response, message.id) })
  } catch (error) {
    const text = error instanceof ApiError && error.status < 500 ? error.message : 'Mogging Support is temporarily unavailable. Please try again or visit Creator Studio support.'
    await reply(text)
  }
}
