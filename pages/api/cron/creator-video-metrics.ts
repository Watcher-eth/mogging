import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'node:crypto'
import { syncCreatorVideoMetrics } from '@/lib/creator/video-metrics-sync'
import { monitorBackend } from '@/lib/reliability/monitor'

export const config = { maxDuration: 60 }
async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control','no-store')
  if (req.method !== 'GET') return res.status(405).end()
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`), actual = Buffer.from(req.headers.authorization || '')
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected,actual)) return res.status(401).end()
  try { return res.status(200).json(await syncCreatorVideoMetrics()) }
  catch { return res.status(503).json({ error: 'video_metrics_sync_pending' }) }
}
export default monitorBackend('cron/creator-video-metrics',handler)
