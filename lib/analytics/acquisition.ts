// Shared by browser capture and reporting, including older referrer-only events.
export const excludedAcquisitionHost = '(^|\\.)(mogging\\.com|localhost|127\\.0\\.0\\.1|accounts\\.google\\.com|appleid\\.apple\\.com|checkout\\.stripe\\.com)$'
const excludedHost = new RegExp(excludedAcquisitionHost)

export function acquisitionReferrer(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host && !excludedHost.test(host) ? host : null
  } catch { return null }
}
