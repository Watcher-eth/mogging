import type { AnalyticsEventName } from '@/lib/analytics/events'

const anonymousStorageKey = 'mogging.analytics.anonymous-id'
const sessionStorageKey = 'mogging.analytics.session-id'

export function trackWebEvent(eventName: AnalyticsEventName, properties: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return

  const event = {
    eventId: crypto.randomUUID(),
    eventName,
    anonymousId: getStorageId(localStorage, anonymousStorageKey),
    sessionId: getStorageId(sessionStorage, sessionStorageKey),
    platform: 'web',
    source: 'mogging.com',
    properties: {
      ...readCampaignProperties(window.location.href),
      ...properties,
    },
    occurredAt: new Date().toISOString(),
  }

  void fetch('/api/analytics/events', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [event] }),
    keepalive: true,
  }).catch(() => undefined)
}

function getStorageId(storage: Storage, key: string) {
  const current = storage.getItem(key)
  if (current) return current
  const created = crypto.randomUUID()
  storage.setItem(key, created)
  return created
}

function readCampaignProperties(href: string) {
  const params = new URL(href).searchParams
  const keys = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'gclid',
    'gbraid',
    'wbraid',
    'fbclid',
    'ttclid',
    'msclkid',
  ]

  return Object.fromEntries(keys.flatMap((key) => {
    const value = params.get(key)
    return value ? [[key, value]] : []
  }))
}
