import { DISCORD_API } from './config'
import type { DiscordInteraction } from './interactions'
import type { RenderedReply } from './render'

/** Edit only this interaction's original ephemeral reply. No channel-message/DM fallback exists. */
export async function sendPrivateReply(interaction: DiscordInteraction, reply: RenderedReply) {
  const url = `${DISCORD_API}/webhooks/${interaction.application_id}/${encodeURIComponent(interaction.token)}/messages/@original`
  let body: string | FormData
  const headers: Record<string, string> = {}
  if (reply.image) {
    const form = new FormData()
    form.set('payload_json', JSON.stringify({ ...reply.payload, attachments: [{ id: 0, filename: 'performance.png' }] }))
    form.set('files[0]', new Blob([new Uint8Array(reply.image)], { type: 'image/png' }), 'performance.png')
    body = form
  } else { headers['Content-Type'] = 'application/json'; body = JSON.stringify({ ...reply.payload, attachments: [] }) }
  const response = await fetch(url, { method: 'PATCH', headers, body, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error('Discord private reply could not be delivered')
}
