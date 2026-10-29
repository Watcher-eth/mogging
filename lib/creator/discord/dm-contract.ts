import { z } from 'zod'

const snowflake = z.string().regex(/^\d{17,22}$/)
export const directMessageSchema = z.object({
  id: snowflake, channel_id: snowflake, guild_id: z.undefined().optional(), webhook_id: z.undefined().optional(),
  type: z.union([z.literal(0), z.literal(19)]), content: z.string().max(20_000).default(''),
  author: z.object({ id: snowflake, bot: z.boolean().optional() }).refine(author => !author.bot),
})
export function directMessageCommand(text: string) {
  const command = text.trim().toLowerCase().replace(/^\//, '')
  if (['help', 'connect', 'allowance', 'reset'].includes(command)) return command
  return ['new chat', 'start over', 'reset chat'].includes(command) ? 'reset' : 'message'
}
