import { locales } from '@/lib/i18n/locales'

// Coarse categories only; never retain the raw user agent in product events.
export const webJourneyDimensions = ['channel', 'browser', 'device', 'country', 'source', 'campaign', 'creator', 'entry', 'plan', 'experiment', 'analysis_variant'] as const
export const WEB_FLOW_VERSION = 'web_scan_2026_11_07_v4'

export function stripeJourneyProperties(metadata: Record<string, string | undefined> | null | undefined) {
  return { flow_id: metadata?.flowId, attempt_id: metadata?.attemptId, flow_version: metadata?.flowVersion, entry_mode: metadata?.entryMode, web_surface: metadata?.webSurface }
}
export function webRequestContext(userAgent: string) {
  const os = /Android/i.test(userAgent) ? 'android' : /iPhone|iPad|iPod|Macintosh.*Mobile/i.test(userAgent) ? 'ios' : 'desktop'
  const browser = /musical_ly|TikTok|BytedanceWebview/i.test(userAgent) ? 'tiktok'
    : /Instagram/i.test(userAgent) ? 'instagram' : /FBAN|FBAV/i.test(userAgent) ? 'facebook'
    : /CriOS|Chrome|Chromium/i.test(userAgent) ? 'chrome' : /Safari/i.test(userAgent) ? 'safari' : 'other'
  const web_surface = os !== 'desktop' ? 'mobile_web' : /Windows NT|Macintosh|X11|CrOS/i.test(userAgent) ? 'desktop_web' : null
  return { device_platform: web_surface ? os : null, browser_family: browser, web_surface }
}

// Version the experience, not the visit. Keep this stable until the flow changes.
export function webFlowContext(path: string, search: string) {
  const route = path.replace(/\/$/, '')
  if (route !== '/analysis' && !locales.some(locale => route === `/${locale}/analysis`)) return {}
  return { flow_version: WEB_FLOW_VERSION, entry_mode: new URLSearchParams(search).get('start') === '1' ? 'photo_first' : 'onboarding_first' } as const
}
