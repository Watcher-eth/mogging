import { Chat, ConsoleLogger } from 'chat'
import { createDiscordAdapter, DiscordInteractionResponseFlag } from '@chat-adapter/discord'
import { ApiError } from '@/lib/api/http'
import { executeCreatorSupport } from '../support/service'
import { readSupportAllowance } from '../support/allowance-store'
import { supportRequestSchema } from '../support/contracts'
import { discordConfig, LINK_PATH, portalOrigin } from './config'
import { discordStore } from './store'
import { createDiscordState } from './state-adapter'
import { discordInteractionSchema, discordQuestion, type DiscordInteraction } from './interactions'
import { resolveDiscordCreator, requireCreator } from './linking'
import { renderDiscordSupport, type RenderedReply } from './render'
import { sendPrivateReply } from './private-reply'

function helpReply(text: string, link = false): RenderedReply {
  return { payload: { content: text, allowed_mentions: { parse: [] }, ...(link ? { components: [{ type: 1 as const, components: [{ type: 2 as const, style: 5 as const, label: 'Connect Creator Studio', url: `${portalOrigin()}${LINK_PATH}` }] }] } : {}) } }
}
export async function handleDiscordSupport(interaction: DiscordInteraction) {
  const redis = discordStore(), command = interaction.data.name
  const reply = (text: string, link = false) => sendPrivateReply(interaction, helpReply(text, link))
  if (command === 'connect') return reply('Connect your own Creator Studio account to see your submissions, campaign terms, and analytics privately. Connecting does not give this app access to your Discord messages.', true)
  if (command === 'help') return reply('Mogging Support helps with campaigns, submissions, earnings, referrals, and analytics. Use /ask, /submissions, /performance, or /campaigns. Answers are private to you. You share 4 support messages per day with Creator Studio, resetting at midnight UTC. Connecting, checking your allowance, and resetting a conversation are free.', true)
  const link = await resolveDiscordCreator(interaction.member.user.id)
  if (!link) return reply('Connect your Creator Studio account first so I can read your own creator information. Your Discord name or server role is never used to match private records.', true)
  await requireCreator(link.userId)
  // Per user, per channel, per link generation. Never reuse channel history or another member's context.
  const context = `${link.userId}:${interaction.member.user.id}:${link.createdAt.toISOString()}:${interaction.guild_id}:${interaction.channel_id}`
  const memoryKey = `creator-discord:conversation:${context}`
  if (command === 'allowance') {
    const allowance = await readSupportAllowance(link.userId)
    return reply(`You have ${allowance.remaining} of 4 support messages left today across Discord and Creator Studio. Your allowance resets at midnight UTC.`)
  }
  const lockKey = `creator-discord:busy:${link.userId}`, lockToken = interaction.id
  const locked = await redis.set(lockKey, lockToken, { nx: true, ex: 120 })
  if (!locked) return reply('I’m finishing your previous question. Please try again in a moment; this request hasn’t used a message.')
  try {
    if (command === 'reset') { await redis.del(memoryKey); return await reply('Your Discord support conversation has been reset. Your daily allowance is unchanged.') }
    const question = discordQuestion(interaction)
    if (!question) return await reply('Add your question to /ask, or choose a reporting period with /performance.')
    const conversation = await redis.get<string>(memoryKey)
    const result = await executeCreatorSupport(link.userId, supportRequestSchema.parse({ message: question, conversation: conversation ?? undefined }), {
      conversationOwner: `discord:${context}`, signal: AbortSignal.timeout(45_000),
      deliver: async response => {
        // A disconnect/relink while GLM is running revokes delivery of the old account's result.
        const current = await resolveDiscordCreator(interaction.member.user.id)
        if (!current || current.userId !== link.userId || current.createdAt.getTime() !== link.createdAt.getTime()) throw new ApiError(403, 'Your account connection changed. Please ask again.')
        await requireCreator(link.userId)
        await sendPrivateReply(interaction, await renderDiscordSupport(response, question))
      },
    })
    if (result.conversation) await redis.set(memoryKey, result.conversation, { ex: 1800 })
  } finally {
    await redis.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", [lockKey], [lockToken])
  }
}

let bot: Chat | undefined
export function getDiscordBot() {
  if (bot) return bot
  const config = discordConfig()
  bot = new Chat({ userName: 'Mogging Support', adapters: { discord: createDiscordAdapter({ applicationId: config.applicationId, botToken: config.botToken, publicKey: config.publicKey, interactionFlags: () => DiscordInteractionResponseFlag.Ephemeral, logger: new ConsoleLogger('error') }) }, state: createDiscordState(discordStore()), logger: 'silent' })
  bot.onSlashCommand(async event => {
    const interaction = discordInteractionSchema.parse(event.raw)
    try { await handleDiscordSupport(interaction) } catch (error) {
      const text = error instanceof ApiError && error.status < 500 ? error.message : 'Mogging Support is temporarily unavailable. Please try again or visit Creator Studio support.'
      await sendPrivateReply(interaction, helpReply(text)).catch(() => { console.error('Discord support response delivery failed') })
    }
  })
  return bot
}
