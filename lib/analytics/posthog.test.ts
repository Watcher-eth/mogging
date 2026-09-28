import { expect, test } from 'bun:test'
import { toPostHogEvent } from './posthog'
import { analyticsEventSchema } from './events'
test('export retries use the same UUID and authenticated alias without private properties', () => {
  const input = { eventId: 'fixed-uuid', eventName: 'identity_linked', accountId: 'account', anonymousId: 'install', occurredAt: new Date(1000), environment: 'production', platform: 'ios', properties: { email: 'secret', screen: 'Paywall' } }
  const event = toPostHogEvent(input)
  expect(event).toEqual(toPostHogEvent(input))
  expect(event.event).toBe('$identify')
  expect(event.properties.distinct_id).toBe('user:account')
  expect(event.properties.$anon_distinct_id).toBe('anonymous:install')
  expect(JSON.stringify(event)).not.toContain('secret')
})
test('event-specific exposure contract requires a screen and nonnegative duration', () => {
  const base = { eventId: crypto.randomUUID(), eventName: 'screen_exited', platform: 'ios', occurredAt: new Date().toISOString() }
  expect(analyticsEventSchema.safeParse({ ...base, properties: { duration_ms: -1 } }).success).toBe(false)
  expect(analyticsEventSchema.safeParse({ ...base, properties: { screen: 'Report', duration_ms: 1200, photo_uri: 'secret' } }).success).toBe(true)
})
