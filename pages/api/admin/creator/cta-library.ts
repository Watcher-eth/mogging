import type { NextApiRequest, NextApiResponse } from 'next'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { creatorCtaLibraryReviewSchema, getAdminCtaLibrary, reviewCreatorCtaLibraryItem } from '@/lib/creator/cta-library'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const admin = await requireCreatorAdmin(req, res)
    if (req.method === 'GET') return json(res, 200, { items: await getAdminCtaLibrary() })
    if (req.method === 'PATCH') {
      const input = parseBody(creatorCtaLibraryReviewSchema, req.body)
      return json(res, 200, { item: await reviewCreatorCtaLibraryItem(input, admin.email) })
    }
    return methodNotAllowed(res, ['GET', 'PATCH'])
  } catch (error) {
    return handleApiError(error, res)
  }
}
