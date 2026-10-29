import { expect, mock, test } from 'bun:test'
import { generateKeyPairSync, sign } from 'node:crypto'
import { Readable } from 'node:stream'
import type { NextApiRequest, NextApiResponse } from 'next'

const keys = generateKeyPairSync('ed25519')
const publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex')
let dispatched = 0
const seen = new Set<string>()
mock.module('@/lib/creator/discord/config', () => ({ discordConfig: () => ({ applicationId: '1526698974847963299', guildId: '1526698974847963268', publicKey }), portalOrigin: () => 'https://www.mogging.com' }))
mock.module('@/lib/creator/discord/store', () => ({ discordStore: () => ({ set: async (key: string) => { if (seen.has(key)) return null; seen.add(key); return 'OK' }, eval: async () => 1 }) }))
mock.module('@/lib/creator/discord/bot', () => ({ getDiscordBot: () => ({ webhooks: { discord: async () => { dispatched++; return Response.json({ type: 5, data: { flags: 64 } }) } } }) }))
const { default: handler } = await import('@/pages/api/discord/interactions')
async function request(payload: unknown, signed = true, timestamp = String(Math.floor(Date.now() / 1000))) {
  const body = Buffer.from(JSON.stringify(payload))
  const signature = sign(null, Buffer.concat([Buffer.from(timestamp), body]), keys.privateKey).toString('hex')
  const req = Object.assign(Readable.from([body]), { method: 'POST', headers: signed ? { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp } : {} }) as unknown as NextApiRequest
  let status = 0, result: unknown
  const res = { setHeader() { return res }, status(code: number) { status = code; return res }, json(value: unknown) { result = value; return res }, end() { return res }, send(value: string) { result = JSON.parse(value); return res } } as unknown as NextApiResponse
  await handler(req, res)
  return { status, result }
}
const interaction = { id: '1526698974847963288', application_id: '1526698974847963299', token: 'token', type: 2, guild_id: '1526698974847963268', channel_id: '1526698975313526877', member: { user: { id: '1526698974847963300' } }, data: { name: 'help' } }
test('unsigned and stale webhook requests cannot reach handlers', async () => {
  expect((await request(interaction, false)).status).toBe(401)
  expect((await request(interaction, true, '1700000000')).status).toBe(401)
  expect(dispatched).toBe(0)
})
test('signed PING responds without a database lookup or model call', async () => {
  expect(await request({ type: 1 })).toEqual({ status: 200, result: { type: 1 } })
})
test('wrong guild, another app, DMs, and bot users cannot dispatch', async () => {
  for (const payload of [{ ...interaction, guild_id: '1526698974847963000' }, { ...interaction, application_id: '1526698974847963000' }, { ...interaction, guild_id: undefined }, { ...interaction, member: { user: { ...interaction.member.user, bot: true } } }]) {
    const result = await request(payload)
    expect(result.status).toBe(200)
    expect(result.result).toMatchObject({ type: 4, data: { flags: 64 } })
  }
  expect(dispatched).toBe(0)
})
test('repeated signed deliveries acknowledge privately but dispatch only once', async () => {
  for (let i = 0; i < 2; i++) expect((await request(interaction)).result).toEqual({ type: 5, data: { flags: 64 } })
  expect(dispatched).toBe(1)
})
