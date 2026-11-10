import { timingSafeEqual } from 'node:crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { creatorReconciliationJobs } from '@/lib/creator/reconciliation-jobs'
import { monitorBackend } from '@/lib/reliability/monitor'

export const config = { maxDuration: 60 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).end()
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`)
  const actual = Buffer.from(req.headers.authorization || '')
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.status(401).end()
  const job = req.query.job
  if (job !== 'billing' && job !== 'bonuses' && job !== 'referrals') return res.status(404).end()
  return monitorBackend(`cron/creator-attribution/${job}`, async (_req, response) => {
    try { return response.status(200).json({ result: await creatorReconciliationJobs[job]() }) }
    catch { return response.status(503).json({ error: 'creator_reconciliation_pending' }) }
  })(req, res)
}
