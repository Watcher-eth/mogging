import { timingSafeEqual } from 'node:crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { reconcileCreatorScores } from '@/lib/admin/creator-score-service'

export const config = { maxDuration: 60 }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).end()
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`), actual = Buffer.from(req.headers.authorization || '')
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.status(401).end()
  try {
    const report = await reconcileCreatorScores('Scheduled refresh: activity, evidence and warning changes')
    return res.status(200).json({ creators: report.creators.length, generatedAt: report.generatedAt })
  } catch { return res.status(503).json({ error: 'score_refresh_pending' }) }
}
