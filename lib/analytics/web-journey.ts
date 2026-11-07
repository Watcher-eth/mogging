import { WEB_FLOW_VERSION } from './web-context'

const key = 'mogging.web-journey.v3'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type Journey = { id: string; started: number; entry?: 'photo_first' | 'onboarding_first' }
let current: Journey | undefined

// One journey per tab, surviving authentication, reloads and Stripe redirects.
// Session and account identifiers remain separate from this funnel identifier.
export function webJourneyContext(): { flow_id?: string; flow_version?: string; entry_mode?: 'photo_first' | 'onboarding_first' } {
  if (typeof window === 'undefined') return {}
  if (!current) {
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) || 'null') as Journey | null
      if (stored && uuid.test(stored.id) && Date.now() - stored.started < 86400_000 && stored.started <= Date.now()) current = stored
    } catch { /* Storage is optional. */ }
    current ??= { id: crypto.randomUUID(), started: Date.now() }
  }
  if (location.pathname === '/analysis' && !current.entry) current.entry = new URLSearchParams(location.search).get('start') === '1' ? 'photo_first' : 'onboarding_first'
  save()
  return { flow_id: current.id, flow_version: WEB_FLOW_VERSION, ...(current.entry ? { entry_mode: current.entry } : {}) }
}

export function restoreWebJourney(id: string) {
  if (!uuid.test(id)) return
  webJourneyContext()
  current = { ...current!, id }
  save()
}

export function resetWebJourney() {
  current = undefined
  try { sessionStorage.removeItem(key) } catch { /* Storage is optional. */ }
}

function save() {
  try { sessionStorage.setItem(key, JSON.stringify(current)) } catch { /* Tracking cannot block the flow. */ }
}
