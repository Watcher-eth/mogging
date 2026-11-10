import { creatorReconciliationJobs } from '@/lib/creator/reconciliation-jobs'
import { timingSafeEqual } from 'node:crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { monitorBackend } from '@/lib/reliability/monitor'
export const config = { maxDuration: 60 }

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).end()
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`), actual = Buffer.from(req.headers.authorization || '')
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.status(401).end()
  try {
    const result = await creatorReconciliationJobs.billing()
    const bonuses = await creatorReconciliationJobs.bonuses()
    const creatorReferrals = await creatorReconciliationJobs.referrals()
    return res.status(200).json({ result, bonuses, creatorReferrals })
  } catch { return res.status(503).json({ error: 'creator_reconciliation_pending' }) }
}
export default monitorBackend('cron/creator-attribution', handler)
