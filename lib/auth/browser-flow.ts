export const oauthProviders = { google: 'Google', facebook: 'Meta', twitter: 'X', tiktok: 'TikTok' } as const
export type OAuthProvider = keyof typeof oauthProviders
export function oauthProvider(value: unknown): OAuthProvider {
  return typeof value === 'string' && Object.hasOwn(oauthProviders,value) ? value as OAuthProvider : 'google'
}
export function isEmbeddedBrowser(agent: string) {
  return /FBAN|FBAV|Instagram|TikTok|musical_ly|Bytedance|\bGSA\//i.test(agent)
}
export function authReturnPath(value: string | undefined, origin: string) {
  try {
    const url=new URL(value??'')
    if(url.origin===new URL(origin).origin&&!url.pathname.startsWith('/auth/')&&!url.pathname.startsWith('//'))return url.pathname+url.search
  }catch{}
  return '/'
}
