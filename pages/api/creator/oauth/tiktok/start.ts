import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { creatorTikTokScopes } from '@/lib/creator/tiktok-permissions'
import { createCreatorTikTokState, setCreatorTikTokStateCookie, getCreatorTikTokRedirectUri } from '@/lib/creator/tiktok-oauth'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!['GET', 'POST'].includes(req.method || '')) return methodNotAllowed(res, ['GET', 'POST'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    res.setHeader('Cache-Control', 'no-store')
    // Enable only after approval is confirmed in TikTok's developer portal.
    const available = process.env.TIKTOK_CREATOR_VIDEO_SCOPE_ENABLED === 'true' && Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET)
    if (req.method === 'GET') return json(res, 200, { available })
    if (!available) throw new ApiError(410, 'Automatic TikTok analytics is not available yet. Your connected handle and submissions still work.')
    const state = createCreatorTikTokState(session.user.id)
    setCreatorTikTokStateCookie(res, state.cookieValue)
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
    url.search = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY!, scope: creatorTikTokScopes(),
      response_type: 'code', redirect_uri: getCreatorTikTokRedirectUri(req), state: state.state }).toString()
    return json(res, 200, { url: url.toString() })
  } catch (error) {
    return handleApiError(error, res)
  }
}

export default monitorBackend('creator/oauth/tiktok/start',handler)
