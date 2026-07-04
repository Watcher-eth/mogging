import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, methodNotAllowed } from '@/lib/api/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    throw new ApiError(410, 'Use /api/payments/web-checkout for mobile subscriptions')
  } catch (error) {
    return handleApiError(error, res)
  }
}
