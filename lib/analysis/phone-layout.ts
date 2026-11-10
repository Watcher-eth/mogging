export const phoneViewportQuery = '(width < 768px)'

export function isTabletUserAgent(userAgent: string) {
  return /iPad|Tablet|Silk|PlayBook|Macintosh.*Mobile/i.test(userAgent)
}

export function isPhoneUserAgent(userAgent: string, mobileHint?: string) {
  if (isTabletUserAgent(userAgent)) return false
  return mobileHint === '?1' || /iPhone|iPod|Windows Phone|Android.*\bMobile\b/i.test(userAgent)
}
