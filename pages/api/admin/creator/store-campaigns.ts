import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { importStoreCampaignCsv } from '@/lib/creator/store-campaigns'

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    await requireCreatorAdmin(req, res)
    const { csv } = parseBody(z.object({ csv: z.string().min(1).max(900_000) }), req.body)
    return json(res, 200, await importStoreCampaignCsv(csv))
  } catch (error) { return handleApiError(error, res) }
}
