import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { addCampaignDisplayAdjustments } from '@/lib/creator/sprint-service'

const inputSchema = z.object({ campaignIds: z.array(z.string().min(1)).length(3) })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    await requireCreatorAdmin(req, res)
    const { campaignIds } = parseBody(inputSchema, req.body)
    await addCampaignDisplayAdjustments(campaignIds)
    return json(res, 200, { saved: true })
  } catch (error) {
    return handleApiError(error, res)
  }
}
