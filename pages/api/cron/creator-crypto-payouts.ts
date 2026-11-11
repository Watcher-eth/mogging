import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'node:crypto'
import { reconcileOpenCryptoPayouts } from '@/lib/admin/crypto-payouts/settlement'
import { publishCreatorCryptoPayouts } from '@/lib/admin/crypto-payouts/discord-announcements'
import { monitorBackend } from '@/lib/reliability/monitor'

export const config = { maxDuration: 60 }

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).end()
  const secret = process.env.CRON_SECRET
  const actual = Buffer.from(req.headers.authorization || '')
  const expected = Buffer.from(`Bearer ${secret || ''}`)
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).end()
  const [result, discord] = await Promise.all([
    reconcileOpenCryptoPayouts(),
    publishCreatorCryptoPayouts().catch(error => {
      console.error('Creator payout announcement check failed', error instanceof Error ? error.message : 'Unknown error')
      return { posted: 0, updated: 0, errors: 1 }
    }),
  ])
  return res.status(result.errors ? 503 : 200).json({ ...result, discord })
}

export default monitorBackend('creator/crypto-payout-reconciliation', handler)
