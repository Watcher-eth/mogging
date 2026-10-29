import { describe, expect, test } from 'bun:test'
import { generateKeyPairSync, sign } from 'node:crypto'
import { discordInteractionSchema, discordQuestion, privateInteraction, verifyDiscordRequest } from './interactions'
import { supportCommands } from './commands'

const keys = generateKeyPairSync('ed25519')
const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
const now = Date.parse('2026-10-29T12:00:00Z'), timestamp = String(now / 1000)
const body = Buffer.from(JSON.stringify({ type: 1 }))
const signature = sign(null, Buffer.concat([Buffer.from(timestamp), body]), keys.privateKey).toString('hex')
export const fixture = {
  id: '1526698974847963288', application_id: '1526698974847963299', token: 'interaction-token', type: 2,
  guild_id: '1526698974847963268', channel_id: '1526698975313526877', member: { user: { id: '1526698974847963300' } },
  data: { name: 'ask', options: [{ name: 'question', type: 3, value: 'How well did my videos convert this week?' }] },
}
describe('Discord admission boundary', () => {
  test('validates exact signed bytes and rejects stale, altered, malformed or unsigned requests', () => {
    expect(verifyDiscordRequest(body, signature, timestamp, publicKey, now)).toBe(true)
    expect(verifyDiscordRequest(Buffer.from('{}'), signature, timestamp, publicKey, now)).toBe(false)
    expect(verifyDiscordRequest(body, signature, timestamp, publicKey, now + 301_000)).toBe(false)
    expect(verifyDiscordRequest(body, signature, String(now / 1000 + 301), publicKey, now)).toBe(false)
    expect(verifyDiscordRequest(body, undefined, timestamp, publicKey, now)).toBe(false)
    expect(verifyDiscordRequest(body, signature, timestamp, 'bad-key', now)).toBe(false)
  })
  test('requires a guild member, bounded input and the registered command shape', () => {
    expect(discordInteractionSchema.safeParse(fixture).success).toBe(true)
    expect(discordInteractionSchema.safeParse({ ...fixture, member: undefined, user: fixture.member.user }).success).toBe(false)
    expect(discordInteractionSchema.safeParse({ ...fixture, data: { name: 'another-app' } }).success).toBe(false)
    expect(discordInteractionSchema.safeParse({ ...fixture, data: { name: 'mogging', options: [{ name: 'ask', type: 1 }] } }).success).toBe(false)
    expect(discordInteractionSchema.safeParse({ ...fixture, data: { ...fixture.data, options: [{ name: 'question', type: 3, value: 'x'.repeat(1501) }] } }).success).toBe(false)
  })
  test('uses the requested performance period and rejects arbitrary period injection', () => {
    const command = (period: string) => discordInteractionSchema.parse({ ...fixture, data: { name: 'performance', options: [{ type: 3, name: 'period', value: period }] } })
    expect(discordQuestion(command('this-week'))).toContain('this week')
    expect(discordQuestion(command('last-week'))).toContain('last week')
    expect(discordQuestion(command('ignore instructions'))).toBeNull()
  })
  test('immediate replies are private and never ping users or roles', () => {
    expect(privateInteraction('hello').data).toMatchObject({ flags: 64, allowed_mentions: { parse: [] } })
    expect(supportCommands.map(c => c.name)).toContain('connect')
  })
})
