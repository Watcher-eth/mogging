import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'node:crypto'
import { reconcileStripeBilling } from '@/lib/payments/stripe-reconciliation'
import { monitorBackend } from '@/lib/reliability/monitor'

export const config = { maxDuration: 120 }
async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).end()
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`)
  const actual = Buffer.from(req.headers.authorization || '')
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.status(401).end()
  try { return res.status(200).json(await reconcileStripeBilling()) }
  catch (error) {
    console.error('Stripe billing recovery failed', error instanceof Error ? error.name : 'unknown')
    return res.status(503).json({ error: { code: 'billing_reconciliation_failed', message: 'Stripe billing recovery could not complete' } })
  }
}
export default monitorBackend('payments/stripe-reconciliation', handler)
