import { createPublicKey, verify } from 'node:crypto'
import { z } from 'zod'
import { supportCommandNames } from './commands'

const snowflake = z.string().regex(/^\d{17,22}$/)
export const discordInteractionSchema = z.object({
  id: snowflake, application_id: snowflake, token: z.string().min(1).max(2000), type: z.literal(2), guild_id: snowflake, channel_id: snowflake,
  member: z.object({ user: z.object({ id: snowflake, bot: z.boolean().optional() }) }),
  data: z.object({ name: z.enum(supportCommandNames), type: z.literal(1).optional(), options: z.array(z.object({ name: z.enum(['question', 'period']), type: z.literal(3), value: z.string().trim().min(1).max(1500) })).max(1).optional() }),
})
export type DiscordInteraction = z.infer<typeof discordInteractionSchema>

export function verifyDiscordRequest(body: Buffer, signature: string | undefined, timestamp: string | undefined, publicKey: string, now = Date.now()) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature) || !timestamp || !/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/i.test(publicKey)) return false
  try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'hex')]), format: 'der', type: 'spki' })
    return verify(null, Buffer.concat([Buffer.from(timestamp), body]), key, Buffer.from(signature, 'hex'))
  } catch { return false }
}
export const privateInteraction = (content: string) => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } })
export function discordQuestion(interaction: DiscordInteraction) {
  const command = interaction.data
  const option = command.options?.[0]
  if (command.name === 'ask') return option?.name === 'question' ? option.value : null
  if (command.name === 'submissions') return 'What is the status of my submissions?'
  if (command.name === 'campaigns') return 'Show my campaigns'
  if (command.name === 'performance') {
    const period = option?.value ?? 'this-week'
    const labels: Record<string, string> = { 'this-week': 'this week', 'last-week': 'last week', 'last-30-days': 'over the last 30 days' }
    return labels[period] ? `How well did my videos convert ${labels[period]}?` : null
  }
  return null
}
