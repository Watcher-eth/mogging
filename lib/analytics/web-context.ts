// Coarse categories only; never retain the raw user agent in product events.
export const webJourneyDimensions = ['browser', 'device', 'country', 'source', 'campaign', 'creator', 'entry', 'plan', 'experiment'] as const
export const WEB_FLOW_VERSION = 'web_scan_2026_11_06_v3'

export function stripeJourneyProperties(metadata: Record<string, string | undefined> | null | undefined) {
  return { flow_id: metadata?.flowId, attempt_id: metadata?.attemptId, flow_version: metadata?.flowVersion, entry_mode: metadata?.entryMode }
}
export function webRequestContext(userAgent: string) {
  const os = /Android/i.test(userAgent) ? 'android' : /iPhone|iPad|iPod|Macintosh.*Mobile/i.test(userAgent) ? 'ios' : 'desktop'
  const browser = /musical_ly|TikTok|BytedanceWebview/i.test(userAgent) ? 'tiktok'
    : /Instagram/i.test(userAgent) ? 'instagram' : /FBAN|FBAV/i.test(userAgent) ? 'facebook'
    : /CriOS|Chrome|Chromium/i.test(userAgent) ? 'chrome' : /Safari/i.test(userAgent) ? 'safari' : 'other'
  return { device_platform: os, browser_family: browser }
}

// Version the experience, not the visit. Keep this stable until the flow changes.
export function webFlowContext(path: string, search: string) {
  if (path !== '/analysis') return {}
  return { flow_version: WEB_FLOW_VERSION, entry_mode: new URLSearchParams(search).get('start') === '1' ? 'photo_first' : 'onboarding_first' }
}
