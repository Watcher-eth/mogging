export const HOMEPAGE_DESTINATION_COOKIE = 'mogging.homepage.destination'

export function shouldRouteHomepageToStore(userAgent: string, preference?: string, preview = false) {
  return !preview && preference !== 'web' && preference !== 'store' &&
    /iPhone|iPod/i.test(userAgent) &&
    !/bot\b|crawler|spider|preview|headlesschrome|lighthouse/i.test(userAgent)
}

export function homepageDestinationCookie(destination: 'web' | 'store', secure: boolean) {
  return `${HOMEPAGE_DESTINATION_COOKIE}=${destination}; Path=/; SameSite=Lax${destination === 'web' ? '; Max-Age=7776000' : ''}${secure ? '; Secure' : ''}`
}
