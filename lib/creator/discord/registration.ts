import { DISCORD_API } from './config'
import { supportCommands } from './commands'

/** Upsert only our commands, then remove this app's old guild-scoped /mogging entry. */
export async function registerSupportCommands(config: { applicationId: string; guildId: string; botToken: string }) {
  const base = `${DISCORD_API}/applications/${config.applicationId}/guilds/${config.guildId}/commands`
  const headers = { Authorization: `Bot ${config.botToken}`, 'Content-Type': 'application/json' }
  async function request(url: string, init?: RequestInit) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(15_000) })
      if (response.ok) return response
      if (response.status === 429 && attempt < 2) {
        const limit = await response.json() as { retry_after?: number }
        if (typeof limit.retry_after === 'number' && limit.retry_after >= 0 && limit.retry_after < 55) {
          await new Promise(resolve => setTimeout(resolve, Math.ceil(limit.retry_after! * 1000) + 100))
          continue
        }
        throw new Error('Discord command registration is rate limited. Retry after the Discord rate-limit window resets.')
      }
      throw new Error(`Discord command setup failed (${response.status}).`)
    }
    throw new Error('Discord command setup could not complete')
  }
  const existing = await (await request(base)).json() as Array<{ id: string; name: string; type: number }>
  for (const command of supportCommands) await request(base, { method: 'POST', body: JSON.stringify(command) })
  for (const command of existing) {
    if (command.name === 'mogging' && command.type === 1 && /^\d{17,22}$/.test(command.id)) await request(`${base}/${command.id}`, { method: 'DELETE' })
  }
  return supportCommands.map(command => `/${command.name}`)
}
