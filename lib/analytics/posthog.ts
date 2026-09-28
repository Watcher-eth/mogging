import { sanitizeProperties } from './contract'

export type ExportEvent = {
  eventId: string; eventName: string; accountId: string | null; anonymousId: string | null;
  occurredAt: Date; properties: Record<string, unknown>; environment: string; platform: string;
  sessionId?: string | null; appVersion?: string | null;
  mobileInstallId?: string | null;
}
export function toPostHogEvent(event: ExportEvent) {
  const distinctId = event.accountId ? `user:${event.accountId}` : `anonymous:${event.anonymousId || event.eventId}`
  const identify = event.eventName === 'identity_linked' && event.accountId && event.anonymousId
  return {
    uuid: event.eventId, event: identify ? '$identify' : event.eventName,
    timestamp: event.occurredAt.toISOString(),
    properties: {
      ...sanitizeProperties(event.properties), distinct_id: distinctId, $insert_id: event.eventId,
      $geoip_disable: true, $lib: 'mogging-server-export',
      $process_person_profile: Boolean(event.accountId), environment: event.environment, platform: event.platform,
      $session_id: event.sessionId, app_version: event.appVersion,
      mobile_install_id: event.mobileInstallId,
      ...(identify ? { $anon_distinct_id: `anonymous:${event.anonymousId}` } : {}),
    },
  }
}
export async function sendPostHogBatch(batch: ReturnType<typeof toPostHogEvent>[]) {
  const key = process.env.POSTHOG_PROJECT_KEY
  if (!key) return false
  const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com'
  const url = new URL('/batch/', host)
  if (url.protocol !== 'https:') throw new Error('POSTHOG_HOST must use HTTPS')
  const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: key, batch }) })
  if (!response.ok) throw new Error(`PostHog export failed (${response.status})`)
  return true
}
