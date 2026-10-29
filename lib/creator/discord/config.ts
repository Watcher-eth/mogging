import { ApiError } from '@/lib/api/http'

export const DISCORD_API = 'https://discord.com/api/v10'
// Public identifiers for this integration; environment overrides support a future app/server move.
export const MOGGING_DISCORD_APPLICATION_ID = '1565455254227783811'
export const MOGGING_CREATORS_GUILD_ID = '1526698974847963268'
export const LINK_COOKIE = 'mogging_discord_link'
export const LINK_PATH = '/creator/discord'
export const CALLBACK_PATH = '/api/creator/discord/callback'
export function portalOrigin() {
  const url = new URL(process.env.NEXTAUTH_URL || 'https://www.mogging.com')
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new ApiError(503, 'Discord support requires a secure portal URL')
  return url.origin
}
export function discordConfig() {
  const applicationId = process.env.DISCORD_APPLICATION_ID || MOGGING_DISCORD_APPLICATION_ID
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  const botToken = process.env.DISCORD_BOT_TOKEN
  const clientSecret = process.env.DISCORD_CLIENT_SECRET
  const guildId = process.env.DISCORD_GUILD_ID || MOGGING_CREATORS_GUILD_ID
  const missing = Object.entries({ DISCORD_APPLICATION_ID: applicationId, DISCORD_PUBLIC_KEY: publicKey, DISCORD_BOT_TOKEN: botToken, DISCORD_CLIENT_SECRET: clientSecret, DISCORD_GUILD_ID: guildId }).filter(([, value]) => !value).map(([key]) => key)
  if (!applicationId || !publicKey || !botToken || !clientSecret || !guildId) throw new ApiError(503, `Discord support is not configured yet. Missing server settings: ${missing.join(', ')}`)
  return { applicationId, publicKey, botToken, clientSecret, guildId, redirectUri: `${portalOrigin()}${CALLBACK_PATH}` }
}
export function discordConfigured() { try { discordConfig(); return true } catch { return false } }
