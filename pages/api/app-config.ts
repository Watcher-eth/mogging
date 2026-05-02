import type { NextApiRequest, NextApiResponse } from 'next'
import { json, methodNotAllowed } from '@/lib/api/http'
import { env } from '@/lib/env'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  return json(res, 200, {
    features: {
      authRequired: env.AUTH_REQUIRED,
      paidAnalysisRequired: env.PAID_ANALYSIS_REQUIRED,
    },
  })
}
