import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { discordStore } from '@/lib/creator/discord/store'

export const config = { maxDuration: 600 }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'GET') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  const expected = Buffer.from(`Bearer ${secret || ''}`), received = Buffer.from(req.headers.authorization || '')
  if (!secret || expected.length !== received.length || !timingSafeEqual(expected, received)) return res.status(401).end()
  try {
    const redis = discordStore(), slot = Math.floor(Date.now() / 300_000)
    const key = `creator-discord:dm-gateway:boot:${process.env.VERCEL_DEPLOYMENT_ID || 'local'}:${slot}`
    if (!await redis.set(key, true, { ex: 360, nx: true })) return res.status(200).json({ started: false, reason: 'already_started' })
    const { runDirectMessageGateway } = await import('@/lib/creator/discord/gateway')
    waitUntil(runDirectMessageGateway().catch(async () => {
      await redis.del(key).catch(() => undefined)
      console.error('Discord DM Gateway listener stopped unexpectedly')
    }))
    return res.status(200).json({ started: true })
  } catch { return res.status(503).json({ error: 'Discord DM listener is temporarily unavailable' }) }
}
