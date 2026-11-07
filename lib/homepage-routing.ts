export const HOMEPAGE_DESTINATION_COOKIE = 'mogging.homepage.destination'

export function shouldRouteHomepageToStore(userAgent: string, preference?: string, preview = false) {
  return !preview && preference !== 'web' &&
    /iPhone|iPod/i.test(userAgent) &&
    !/bot\b|crawler|spider|preview|headlesschrome|lighthouse/i.test(userAgent)
}

export function homepageDestinationCookie(destination: 'web' | 'store', secure: boolean) {
  return `${HOMEPAGE_DESTINATION_COOKIE}=${destination === 'web' ? 'web' : ''}; Path=/; SameSite=Lax; Max-Age=${destination === 'web' ? 7776000 : 0}${secure ? '; Secure' : ''}`
}
