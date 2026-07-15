import type { OAuthConfig, OAuthUserConfig } from 'next-auth/providers/oauth'
import {
  exchangeTikTokAuthorizationCode,
  getTikTokUserInfo,
  TIKTOK_AUTHORIZATION_URL,
  TIKTOK_TOKEN_URL,
  TIKTOK_USER_INFO_URL,
  type TikTokProfile,
} from './tiktok-api'

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
      url: TIKTOK_AUTHORIZATION_URL,
      params: {
        client_key: options.clientId,
        response_type: 'code',
        scope: 'user.info.basic',
      },
    },
    token: {
      url: TIKTOK_TOKEN_URL,
      async request({ params, provider }) {
        const tokens = await exchangeTikTokAuthorizationCode({
          clientKey: provider.clientId ?? '',
          clientSecret: provider.clientSecret ?? '',
          code: String(params.code ?? ''),
          redirectUri: provider.callbackUrl,
        })

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
      url: TIKTOK_USER_INFO_URL,
      async request({ tokens }) {
        return getTikTokUserInfo(String(tokens.access_token || ''), userInfoFields.split(','))
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
