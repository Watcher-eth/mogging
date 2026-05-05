import type { Profile } from 'next-auth'
import type { OAuthConfig, OAuthUserConfig } from 'next-auth/providers/oauth'

type TikTokTokenResponse = {
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

type TikTokProfile = Profile & {
  data?: {
    user?: {
      avatar_large_url?: string | null
      avatar_url?: string | null
      avatar_url_100?: string | null
      display_name?: string | null
      open_id?: string | null
      union_id?: string | null
    }
  }
  error?: {
    code?: string
    message?: string
  }
}

const userInfoFields = [
  'open_id',
  'union_id',
  'avatar_url',
  'avatar_url_100',
  'avatar_large_url',
  'display_name',
].join(',')

export function TikTokProvider(options: OAuthUserConfig<TikTokProfile>): OAuthConfig<TikTokProfile> {
  return {
    id: 'tiktok',
    name: 'TikTok',
    type: 'oauth',
    checks: ['state'],
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    authorization: {
      url: 'https://www.tiktok.com/v2/auth/authorize/',
      params: {
        client_key: options.clientId,
        response_type: 'code',
        scope: 'user.info.basic',
      },
    },
    token: {
      url: 'https://open.tiktokapis.com/v2/oauth/token/',
      async request({ params, provider }) {
        const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: {
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_key: provider.clientId ?? '',
            client_secret: provider.clientSecret ?? '',
            code: String(params.code ?? ''),
            grant_type: 'authorization_code',
            redirect_uri: provider.callbackUrl,
          }),
        })
        const tokens = (await response.json()) as TikTokTokenResponse

        if (!response.ok || tokens.error || !tokens.access_token) {
          throw new Error(tokens.error_description || tokens.error || 'TikTok token request failed')
        }

        return {
          tokens: {
            access_token: tokens.access_token,
            expires_at: tokens.expires_in
              ? Math.floor(Date.now() / 1000) + tokens.expires_in
              : undefined,
            expires_in: tokens.expires_in,
            open_id: tokens.open_id,
            refresh_expires_in: tokens.refresh_expires_in,
            refresh_token: tokens.refresh_token,
            scope: tokens.scope?.replaceAll(',', ' '),
            token_type: tokens.token_type ?? 'Bearer',
          },
        }
      },
    },
    userinfo: {
      url: 'https://open.tiktokapis.com/v2/user/info/',
      async request({ tokens }) {
        const response = await fetch(
          `https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(userInfoFields)}`,
          {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
            },
          }
        )
        const profile = (await response.json()) as TikTokProfile

        if (!response.ok || (profile.error?.code && profile.error.code !== 'ok')) {
          throw new Error(profile.error?.message || 'TikTok user info request failed')
        }

        return profile
      },
    },
    profile(profile) {
      const user = profile.data?.user
      const id = user?.open_id ?? user?.union_id

      if (!id) {
        throw new Error('TikTok profile response is missing an id')
      }

      return {
        id,
        name: user?.display_name ?? null,
        email: `${id}@tiktok.local`,
        image: user?.avatar_large_url ?? user?.avatar_url ?? user?.avatar_url_100 ?? null,
      }
    },
    style: {
      bg: '#000000',
      logo: '',
      text: '#ffffff',
    },
    options,
  }
}
