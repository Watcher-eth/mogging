import type { Profile } from 'next-auth'

export const TIKTOK_AUTHORIZATION_URL = 'https://www.tiktok.com/v2/auth/authorize/'
export const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
export const TIKTOK_USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/'
export const TIKTOK_REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/'

export type TikTokTokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
  expires_in?: number
  open_id?: string
  refresh_expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
}

export type TikTokProfile = Profile & {
  data?: {
    user?: {
      avatar_large_url?: string | null
      avatar_url?: string | null
      avatar_url_100?: string | null
      display_name?: string | null
      open_id?: string | null
      union_id?: string | null
      username?: string | null
      profile_deep_link?: string | null
    }
  }
  error?: {
    code?: string
    message?: string
  }
}

export async function exchangeTikTokAuthorizationCode(input: {
  clientKey: string
  clientSecret: string
  code: string
  redirectUri: string
}) {
  const response = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: input.clientKey,
      client_secret: input.clientSecret,
      code: input.code,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
    }),
  })
  const tokens = (await response.json()) as TikTokTokenResponse
  if (!response.ok || tokens.error || !tokens.access_token || !tokens.open_id) {
    throw new Error(tokens.error_description || tokens.error || 'TikTok token request failed')
  }
  return tokens as TikTokTokenResponse & { access_token: string; open_id: string }
}

export async function getTikTokUserInfo(accessToken: string, fields: readonly string[]) {
  const response = await fetch(`${TIKTOK_USER_INFO_URL}?fields=${encodeURIComponent(fields.join(','))}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const profile = (await response.json()) as TikTokProfile
  if (!response.ok || (profile.error?.code && profile.error.code !== 'ok')) {
    throw new Error(profile.error?.message || 'TikTok user info request failed')
  }
  return profile
}

export async function revokeTikTokAccess(clientKey: string, clientSecret: string, accessToken: string) {
  const response = await fetch(TIKTOK_REVOKE_URL, {
    method: 'POST',
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, token: accessToken }),
  })
  if (!response.ok) throw new Error('TikTok token revocation failed')
}
