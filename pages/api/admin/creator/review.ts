import type { NextApiRequest, NextApiResponse } from 'next'
import { creatorAdminReviewSchema, reviewCreatorResource } from '@/lib/admin/creator-service'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH'])
    await requireCreatorAdmin(req, res)
    const input = parseBody(creatorAdminReviewSchema, req.body)
    return json(res, 200, { record: await reviewCreatorResource(input) })
  } catch (error) {
    return handleApiError(error, res)
  }
}
