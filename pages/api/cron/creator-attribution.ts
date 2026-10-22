import { timingSafeEqual } from 'node:crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { monitorBackend } from '@/lib/reliability/monitor'
import { reconcileCreatorBilling } from '@/lib/creator/billing-attribution'
export const config = { maxDuration: 60 }

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).end()
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`), actual = Buffer.from(req.headers.authorization || '')
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.status(401).end()
  try {
    const result = await reconcileCreatorBilling(100)
    await db.delete(schema.creatorReferralHandoffs).where(sql`${schema.creatorReferralHandoffs.expiresAt} < now() - interval '1 day'`)
    return res.status(200).json({ result })
  } catch { return res.status(503).json({ error: 'creator_reconciliation_pending' }) }
}
export default monitorBackend('cron/creator-attribution', handler)
