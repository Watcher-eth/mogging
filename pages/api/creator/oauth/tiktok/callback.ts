import { monitorBackend } from '@/lib/reliability/monitor'
import { creatorTikTokFields } from '@/lib/creator/tiktok-permissions'
import type { NextApiRequest, NextApiResponse } from 'next'
import { exchangeTikTokAuthorizationCode, getTikTokUserInfo } from '@/lib/auth/tiktok-api'
import { getAuthSession } from '@/lib/auth/session'
import { addCreatorTikTokOAuthAccount } from '@/lib/creator/service'
import {
  clearCreatorTikTokStateCookie,
  CREATOR_TIKTOK_STATE_COOKIE,
  getCreatorAccountsUrl,
  getCreatorTikTokRedirectUri,
  readCreatorTikTokState,
} from '@/lib/creator/tiktok-oauth'
import { env } from '@/lib/env'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  let destination: 'accounts' | 'setup' = 'accounts'
  const redirect = (result: string, accountId?: string) => {
    clearCreatorTikTokStateCookie(res)
    return res.redirect(302, getCreatorAccountsUrl(req, result, accountId, destination))
  }

  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) return redirect('auth_required')
    if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) return redirect('not_configured')

    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const statePayload = readCreatorTikTokState(req.cookies[CREATOR_TIKTOK_STATE_COOKIE], state, session.user.id)
    if (statePayload?.destination === 'setup') destination = 'setup'
    if (typeof req.query.error === 'string' && statePayload) return redirect('cancelled')
    if (!code || !statePayload) {
      return redirect('invalid_state')
    }

    const tokens = await exchangeTikTokAuthorizationCode({
      clientKey: env.TIKTOK_CLIENT_KEY,
      clientSecret: env.TIKTOK_CLIENT_SECRET,
      code,
      redirectUri: getCreatorTikTokRedirectUri(req),
    })
    const profile = await getTikTokUserInfo(tokens.access_token, creatorTikTokFields(tokens.scope))
    const user = profile.data?.user
    if (!user) return redirect('error')

    const account = await addCreatorTikTokOAuthAccount(session.user.id, {
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      openId: user.open_id || tokens.open_id,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope,
      tokenType: tokens.token_type,
      profile: user,
    })
    return redirect('connected', account.id)
  } catch (error) {
    console.error('TikTok creator OAuth failed', error instanceof Error ? error.message : error)
    return redirect('error')
  }
}

export default monitorBackend('creator/oauth/tiktok/callback',handler)
