import { ApiError } from '@/lib/api/http'
import { executeCreatorSupport } from '../support/service'
import { readSupportAllowance } from '../support/allowance-store'
import { supportRequestSchema } from '../support/contracts'
import { LINK_PATH, portalOrigin } from './config'
import { discordStore } from './store'
import { resolveDiscordCreator, requireCreator } from './linking'
import { renderDiscordSupport, type RenderedReply } from './render'

export function supportHelpReply(text: string, link = false): RenderedReply {
  return { payload: { content: text, allowed_mentions: { parse: [] }, ...(link ? { components: [{ type: 1 as const, components: [{ type: 2 as const, style: 5 as const, label: 'Connect Creator Studio', url: `${portalOrigin()}${LINK_PATH}` }] }] } : {}) } }
}
export type DiscordSupportTurn = {
  userId: string; messageId: string; room: string; command: string; question?: string | null
  reply: (response: RenderedReply) => Promise<void>
}
/** Slash commands and normal DMs share identity checks, memory boundaries, locks and the app quota. */
export async function handleDiscordTurn(turn: DiscordSupportTurn) {
  const redis = discordStore(), command = turn.command
  const reply = (text: string, link = false) => turn.reply(supportHelpReply(text, link))
  if (command === 'connect') return reply('Connect your own Creator Studio account to see your submissions, campaign terms, and analytics privately. Only messages you send to this bot are used; your other Discord conversations stay private.', true)
  if (command === 'help') return reply('DM me normally to ask about campaigns, submissions, earnings, referrals, or analytics. Connect your Creator Studio account first. Server commands /ask, /submissions, /performance, and /campaigns also work. Standard accounts share 4 support messages per day across DMs, server commands, and Creator Studio, resetting at midnight UTC. Type “allowance” to check your remaining messages or “reset” for a fresh conversation. Connecting, help, checking your allowance, and resetting are free.', true)
  const link = await resolveDiscordCreator(turn.userId)
  if (!link) return reply('Connect your Creator Studio account first so I can read your own creator information. Then message me here normally—no /ask needed. Your Discord name or server role is never used to match private records.', true)
  await requireCreator(link.userId)
  const context = `${link.userId}:${turn.userId}:${link.createdAt.toISOString()}:${turn.room}`
  const memoryKey = `creator-discord:conversation:${context}`
  if (command === 'allowance') {
    const allowance = await readSupportAllowance(link.userId)
    return reply(allowance.unlimited ? 'You have unlimited support messages across Discord and Creator Studio. Your account has no daily message limit.' : `You have ${allowance.remaining} of 4 support messages left today across Discord and Creator Studio. Your allowance resets at midnight UTC.`)
  }
  const lockKey = `creator-discord:busy:${link.userId}`, lockToken = turn.messageId
  if (!await redis.set(lockKey, lockToken, { nx: true, ex: 120 })) return reply('I’m finishing your previous question. Please try again in a moment; this request hasn’t used a message.')
  try {
    if (command === 'reset') { await redis.del(memoryKey); return await reply('Your Discord support conversation has been reset. Your daily allowance is unchanged.') }
    if (!turn.question) return await reply('Send your creator question here, or add it to /ask in the server.')
    const conversation = await redis.get<string>(memoryKey)
    const result = await executeCreatorSupport(link.userId, supportRequestSchema.parse({ message: turn.question, conversation: conversation ?? undefined }), {
      conversationOwner: `discord:${context}`, signal: AbortSignal.timeout(45_000),
      deliver: async response => {
        const current = await resolveDiscordCreator(turn.userId)
        if (!current || current.userId !== link.userId || current.createdAt.getTime() !== link.createdAt.getTime()) throw new ApiError(403, 'Your account connection changed. Please ask again.')
        await requireCreator(link.userId)
        await turn.reply(await renderDiscordSupport(response, turn.question!))
      },
    })
    if (result.conversation) await redis.set(memoryKey, result.conversation, { ex: 1800 })
  } finally {
    await redis.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", [lockKey], [lockToken])
  }
}
