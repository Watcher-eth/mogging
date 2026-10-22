import type { NextApiRequest, NextApiResponse } from 'next'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { handleApiError } from '@/lib/api/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireCreatorAdmin(req, res)
    return res.status(410).json({ error: { message: 'Manual attribution entry is retired. Economics is derived from referral evidence and verified billing.' } })
  } catch (error) { return handleApiError(error, res) }
}
