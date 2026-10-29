import { expect, test } from 'bun:test'
import { discordConfig } from './config'

test('configuration failures identify missing setting names without exposing configured values', () => {
  const keys = ['DISCORD_APPLICATION_ID', 'DISCORD_PUBLIC_KEY', 'DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID'] as const
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  try {
    for (const key of keys) process.env[key] = 'configured-sensitive-value'
    delete process.env.DISCORD_PUBLIC_KEY
    delete process.env.DISCORD_GUILD_ID
    let message = ''
    try { discordConfig() } catch (error) { message = (error as Error).message }
    expect(message).toContain('DISCORD_PUBLIC_KEY')
    expect(message).toContain('DISCORD_GUILD_ID')
    expect(message).not.toContain('configured-sensitive-value')
    expect(message).not.toContain('DISCORD_BOT_TOKEN')
  } finally {
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] }
  }
})
