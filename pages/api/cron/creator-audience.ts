import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'node:crypto'
import { reconcileAudienceChecks } from '@/lib/creator/audience-check-worker'
import { monitorBackend } from '@/lib/reliability/monitor'

export const config = { maxDuration: 300 }

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).end()
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`), actual = Buffer.from(req.headers.authorization || '')
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.status(401).end()
  try { return res.status(200).json(await reconcileAudienceChecks()) }
  catch { return res.status(503).json({ error: 'audience_checks_unavailable' }) }
}
export default monitorBackend('cron/creator-audience', handler)
