import type { NextApiRequest, NextApiResponse } from 'next'
import { json, methodNotAllowed, publicCache } from '@/lib/api/http'
import { env } from '@/lib/env'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  publicCache(res, 60, 300)
  return json(res, 200, {
    features: {
      authRequired: env.AUTH_REQUIRED,
      paidAnalysisRequired: env.PAID_ANALYSIS_REQUIRED,
    },
    app: {
      iosAppStoreUrl: env.NEXT_PUBLIC_IOS_APP_STORE_URL || 'https://apps.apple.com/us/app/mogging-face-rating/id6771414050',
      deepLink: env.NEXT_PUBLIC_APP_DEEP_LINK || 'mogging://reports',
    },
  })
}
