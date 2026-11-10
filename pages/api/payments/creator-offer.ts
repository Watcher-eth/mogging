import type { NextApiRequest, NextApiResponse } from 'next'
import { handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { getWebCreatorOffer } from '@/lib/payments/creator-discount'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const userId = await getRequestUserId(req, res)
    const id = req.query.installId
    const installId = typeof id === 'string' && id.length >= 8 && id.length <= 120 ? id : undefined
    return json(res, 200, { offer: await getWebCreatorOffer(req, userId, installId) })
  } catch (error) {
    return handleApiError(error, res)
  }
}
