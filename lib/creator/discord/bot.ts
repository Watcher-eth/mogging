import { Chat, ConsoleLogger } from 'chat'
import { createDiscordAdapter, DiscordInteractionResponseFlag } from '@chat-adapter/discord'
import { ApiError } from '@/lib/api/http'
import { discordConfig } from './config'
import { discordStore } from './store'
import { createDiscordState } from './state-adapter'
import { discordInteractionSchema, discordQuestion, type DiscordInteraction } from './interactions'
import { sendPrivateReply } from './private-reply'
import { handleDiscordTurn, supportHelpReply } from './conversation-handler'

export async function handleDiscordSupport(interaction: DiscordInteraction) {
  return handleDiscordTurn({
    userId: interaction.member.user.id, messageId: interaction.id,
    room: `${interaction.guild_id}:${interaction.channel_id}`, command: interaction.data.name,
    question: discordQuestion(interaction), reply: response => sendPrivateReply(interaction, response),
  })
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
      await sendPrivateReply(interaction, supportHelpReply(text)).catch(() => { console.error('Discord support response delivery failed') })
    }
  })
  return bot
}
