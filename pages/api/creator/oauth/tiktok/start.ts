import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { TIKTOK_AUTHORIZATION_URL } from '@/lib/auth/tiktok-api'
import { creatorAnalyticsEvidenceSchema } from '@/lib/creator/service'
import {
  createCreatorTikTokState,
  getCreatorTikTokRedirectUri,
  setCreatorTikTokStateCookie,
} from '@/lib/creator/tiktok-oauth'
import { env } from '@/lib/env'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
      throw new ApiError(503, 'TikTok OAuth is not configured yet')
    }
    const analytics = parseBody(creatorAnalyticsEvidenceSchema, req.body)
    if (!analytics.analyticsStorageKey.startsWith(`creators/${session.user.id}/account-analytics/`)) {
      throw new ApiError(400, 'Invalid analytics recording')
    }

    const { state, cookieValue } = createCreatorTikTokState(session.user.id, analytics)
    setCreatorTikTokStateCookie(res, cookieValue)
    const authorizeUrl = new URL(TIKTOK_AUTHORIZATION_URL)
    authorizeUrl.searchParams.set('client_key', env.TIKTOK_CLIENT_KEY)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('scope', 'user.info.basic,user.info.profile')
    authorizeUrl.searchParams.set('redirect_uri', getCreatorTikTokRedirectUri(req))
    authorizeUrl.searchParams.set('state', state)
    return json(res, 200, { authorizeUrl: authorizeUrl.toString() })
  } catch (error) {
    return handleApiError(error, res)
  }
}
