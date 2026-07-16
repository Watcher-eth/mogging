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

const creatorProfileFields = [
  'open_id',
  'union_id',
  'avatar_url',
  'avatar_url_100',
  'avatar_large_url',
  'display_name',
  'username',
  'profile_deep_link',
] as const

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const redirect = (result: string) => {
    clearCreatorTikTokStateCookie(res)
    return res.redirect(302, getCreatorAccountsUrl(req, result))
  }

  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) return redirect('auth_required')
    if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) return redirect('not_configured')
    if (typeof req.query.error === 'string') return redirect('cancelled')

    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const statePayload = readCreatorTikTokState(req.cookies[CREATOR_TIKTOK_STATE_COOKIE], state, session.user.id)
    if (!code || !statePayload) {
      return redirect('invalid_state')
    }

    const tokens = await exchangeTikTokAuthorizationCode({
      clientKey: env.TIKTOK_CLIENT_KEY,
      clientSecret: env.TIKTOK_CLIENT_SECRET,
      code,
      redirectUri: getCreatorTikTokRedirectUri(req),
    })
    const profile = await getTikTokUserInfo(tokens.access_token, creatorProfileFields)
    const user = profile.data?.user
    if (!user?.username) return redirect('profile_scope_required')

    await addCreatorTikTokOAuthAccount(session.user.id, {
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      openId: user.open_id || tokens.open_id,
      refreshToken: tokens.refresh_token,
      scope: tokens.scope,
      tokenType: tokens.token_type,
      username: user.username,
      profileUrl: user.profile_deep_link || `https://www.tiktok.com/@${user.username}`,
      avatarUrl: user.avatar_large_url || user.avatar_url_100 || user.avatar_url,
    })
    return redirect('connected')
  } catch (error) {
    console.error('TikTok creator OAuth failed', error instanceof Error ? error.message : error)
    return redirect('error')
  }
}
