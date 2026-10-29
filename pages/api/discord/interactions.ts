import type { NextApiRequest, NextApiResponse } from 'next'
import { waitUntil } from '@vercel/functions'
import { discordConfig, portalOrigin } from '@/lib/creator/discord/config'
import { discordInteractionSchema, privateInteraction, verifyDiscordRequest } from '@/lib/creator/discord/interactions'
import { getDiscordBot } from '@/lib/creator/discord/bot'
import { discordStore } from '@/lib/creator/discord/store'
import { ApiError, handleApiError, methodNotAllowed } from '@/lib/api/http'

export const config = { api: { bodyParser: false }, maxDuration: 60 }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const configuration = discordConfig()
    const chunks: Buffer[] = []; let size = 0
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.length
      if (size > 65536) return res.status(413).end()
      chunks.push(bytes)
    }
    const body = Buffer.concat(chunks)
    const signature = req.headers['x-signature-ed25519'], timestamp = req.headers['x-signature-timestamp']
    if (typeof signature !== 'string' || typeof timestamp !== 'string' || !verifyDiscordRequest(body, signature, timestamp, configuration.publicKey)) return res.status(401).end()
    let raw: unknown
    try { raw = JSON.parse(body.toString('utf8')) } catch { return res.status(400).end() }
    if (raw && typeof raw === 'object' && 'type' in raw && raw.type === 1) return res.status(200).json({ type: 1 })
    const parsed = discordInteractionSchema.safeParse(raw)
    if (!parsed.success) return res.status(200).json(privateInteraction('Use a Mogging Support slash command to ask a creator question.'))
    const interaction = parsed.data
    if (interaction.application_id !== configuration.applicationId || interaction.guild_id !== configuration.guildId || interaction.member.user.bot) return res.status(200).json(privateInteraction('Mogging Support is available to creators in Mogging Creators.'))
    const redis = discordStore()
    // Before model/data access: duplicates cannot double-charge, and all commands are throttled.
    const first = await redis.set(`creator-discord:interaction:${interaction.id}`, true, { nx: true, ex: 900 })
    if (!first) return res.status(200).json({ type: 5, data: { flags: 64 } })
    const bucket = Math.floor(Date.now() / 60_000)
    const count = Number(await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],120) end return n", [`creator-discord:rate:${interaction.guild_id}:${interaction.member.user.id}:${bucket}`], []))
    if (count > 15) return res.status(200).json(privateInteraction('Please wait a minute before trying again. This request hasn’t used a support message.'))
    // SDK verifies the raw signature again and immediately defers privately; GLM runs in waitUntil.
    const request = new Request(`${portalOrigin()}/api/discord/interactions`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp } })
    const response = await getDiscordBot().webhooks.discord(request, { waitUntil })
    res.status(response.status)
    return res.setHeader('Content-Type', 'application/json').send(await response.text())
  } catch (error) {
    // API errors are safe to expose; provider errors must never log an interaction token/body.
    if (error instanceof ApiError) return handleApiError(error, res)
    console.error('Discord interaction processing failed')
    return res.status(503).json({ error: { message: 'Discord support is temporarily unavailable' } })
  }
}
