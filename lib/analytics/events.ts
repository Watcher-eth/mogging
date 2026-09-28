import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { analyticsEventNames, sanitizeProperties, type AnalyticsEventName } from './contract'
export { analyticsEventNames, type AnalyticsEventName } from './contract'

export const analyticsEventSchema = z.object({
  eventId: z.string().uuid(),
  eventName: z.enum(analyticsEventNames),
  accountId: z.string().min(1).max(160).optional(),
  mobileInstallId: z.string().min(8).max(160).optional(),
  anonymousId: z.string().min(1).max(160).optional(),
  sessionId: z.string().min(1).max(200).optional(),
  platform: z.enum(['web', 'ios', 'android', 'server']),
  source: z.string().min(1).max(120).optional(),
  schemaVersion: z.literal(1).default(1),
  environment: z.enum(['production', 'development', 'test']).default('production'),
  appVersion: z.string().max(80).optional(),
  properties: z.record(z.string(), z.unknown()).default({}).transform(sanitizeProperties),
  occurredAt: z.string().datetime(),
}).superRefine((event, ctx) => {
  const required = event.eventName.startsWith('onboarding_step_') ? 'step'
    : ['screen_viewed', 'screen_exited'].includes(event.eventName) ? 'screen'
    : event.eventName.startsWith('permission_') ? 'permission' : null
  if (required && (typeof event.properties[required] !== 'string' || !event.properties[required])) {
    ctx.addIssue({ code: 'custom', path: ['properties', required], message: `Missing ${required}` })
  }
  if (event.eventName === 'screen_exited' && (typeof event.properties.duration_ms !== 'number' || event.properties.duration_ms < 0)) {
    ctx.addIssue({ code: 'custom', path: ['properties', 'duration_ms'], message: 'Invalid screen duration' })
  }
})

export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>

export async function recordAnalyticsEvents(events: AnalyticsEventInput[]) {
  if (!events.length) return

  await db
    .insert(schema.analyticsEvents)
    .values(events.map((event) => ({
      eventId: event.eventId,
      eventName: event.eventName,
      accountId: event.accountId,
      mobileInstallId: event.mobileInstallId,
      anonymousId: event.anonymousId,
      sessionId: event.sessionId,
      platform: event.platform,
      source: event.source,
      schemaVersion: event.schemaVersion,
      environment: event.environment,
      appVersion: event.appVersion,
      properties: event.properties,
      occurredAt: new Date(event.occurredAt),
    })))
    .onConflictDoNothing({ target: schema.analyticsEvents.eventId })
}

export async function recordServerEvent({
  eventName,
  accountId,
  sessionId,
  source,
  properties = {},
}: {
  eventName: AnalyticsEventName
  accountId?: string | null
  sessionId?: string | null
  source: string
  properties?: Record<string, unknown>
}) {
  try {
    await recordAnalyticsEvents([analyticsEventSchema.parse({
      eventId: crypto.randomUUID(),
      eventName,
      accountId: accountId || undefined,
      sessionId: sessionId || undefined,
      platform: 'server',
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      source,
      properties,
      occurredAt: new Date().toISOString(),
    })])
  } catch (error) {
    console.error('Analytics event recording failed', eventName, error)
  }
}
