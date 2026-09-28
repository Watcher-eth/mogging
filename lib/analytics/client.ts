import { sanitizeProperties, type AnalyticsEventName } from './contract'
type Event = { eventId: string; occurredAt: string; [key: string]: unknown }
const key = 'mogging.analytics.v2'
let initialized = false
let browserId = ''
let accountId: string | undefined
let sessionId = ''
let lastActive = 0
let queue: Event[] = []
let context: Record<string, unknown> = {}
let timer: ReturnType<typeof setTimeout> | undefined
let flushing = false
let retry = 5000
let path = ''
let viewedAt = 0

function init() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  try {
    browserId = localStorage.getItem('mogging.analytics.anonymous-id') || crypto.randomUUID()
    localStorage.setItem('mogging.analytics.anonymous-id', browserId)
    const stored = JSON.parse(sessionStorage.getItem(key) || '{}')
    queue = Array.isArray(stored.queue) ? stored.queue.slice(-100) : []
    context = JSON.parse(localStorage.getItem(`${key}.acquisition`) || '{}')
    sessionId = stored.sessionId || ''
    lastActive = stored.lastActive || 0
  } catch { browserId ||= crypto.randomUUID() }
  const params = new URLSearchParams(location.search)
  context.locale = navigator.language
  context.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  for (const name of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = params.get(name)?.slice(0, 160)
    if (value) { context[name] = value; context[`first_${name}`] ||= value; context[`last_${name}`] = value }
  }
  try { if (document.referrer) context.referrer_host = new URL(document.referrer).hostname } catch {}
  try { localStorage.setItem(`${key}.acquisition`, JSON.stringify(sanitizeProperties(context))) } catch {}
  window.addEventListener('pagehide', leave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leave()
    else if (path) trackWebPage(path)
  })
}
function persist() {
  try { sessionStorage.setItem(key, JSON.stringify({ queue, context, sessionId, lastActive })) } catch {}
}
function schedule() { if (!timer) timer = setTimeout(() => { timer = undefined; void flushWebAnalytics() }, retry) }
export function identifyWebAnalytics(id?: string) {
  init()
  try {
    const previous = localStorage.getItem(`${key}.account`)
    if (previous && previous !== id) {
      browserId = crypto.randomUUID()
      sessionId = ''
      localStorage.setItem('mogging.analytics.anonymous-id', browserId)
    }
    if (id) localStorage.setItem(`${key}.account`, id)
    else localStorage.removeItem(`${key}.account`)
  } catch {}
  if (accountId === id) return
  accountId = id
  if (id) trackWebEvent('identity_linked')
}
export function trackWebEvent(eventName: AnalyticsEventName, properties: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return
  init()
  const now = Date.now()
  if (!sessionId || now - lastActive > 30 * 60_000) sessionId = crypto.randomUUID()
  lastActive = now
  queue.push({ eventId: crypto.randomUUID(), eventName, anonymousId: browserId, accountId, sessionId,
    platform: 'web', source: 'mogging.com', schemaVersion: 1,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    properties: sanitizeProperties({ ...context, path, ...properties }), occurredAt: new Date(now).toISOString() })
  queue = queue.slice(-100)
  schedule()
}
export function trackWebPage(route: string) {
  init()
  const next = route.split('?')[0].split('#')[0]
  if (path === next && viewedAt) return
  endPage()
  path = next
  viewedAt = Date.now()
  trackWebEvent('page_viewed', { path })
}
function endPage() {
  if (!viewedAt) return
  trackWebEvent('page_exited', { path, duration_ms: Math.min(Date.now() - viewedAt, 1800_000) })
  viewedAt = 0
}
function leave() { endPage(); persist(); void flushWebAnalytics() }
export async function flushWebAnalytics() {
  if (flushing || !queue.length) return
  flushing = true
  if (timer) clearTimeout(timer)
  timer = undefined
  // Keepalive has a 64KB browser quota. Each allowlisted event is small; cap this batch.
  const batch = queue.slice(0, 10)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch('/api/analytics/events', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: batch }),
      keepalive: true, signal: controller.signal })
    if (!response.ok && response.status !== 400 && response.status !== 413) throw new Error('retry')
    const sent = new Set(batch.map(event => event.eventId))
    queue = queue.filter(event => !sent.has(event.eventId))
    retry = 5000
  } catch { retry = Math.min(retry * 2, 300_000) }
  finally { clearTimeout(timeout); flushing = false; persist(); if (queue.length) schedule() }
}
