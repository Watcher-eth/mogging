import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'node:crypto'
import { refreshAnalyticsReportingFacts } from '@/lib/admin/analytics-reporting-facts'
import { monitorBackend } from '@/lib/reliability/monitor'

export const config = { maxDuration: 60 }

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).end()
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`)
  const actual = Buffer.from(req.headers.authorization || '')
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.status(401).end()
  if (process.env.ANALYTICS_REPORTING_REFRESH !== '1') return res.status(200).json({ enabled: false })
  const refreshed = await refreshAnalyticsReportingFacts()
  return res.status(200).json({ enabled: true, refreshed })
}

export default monitorBackend('cron/analytics-reporting', handler)
