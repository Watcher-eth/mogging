import { z } from 'zod'
import { db, schema } from '@/lib/db'

export const analyticsEventNames = [
  'app_opened',
  'account_auth_started',
  'account_authenticated',
  'attribution_link_received',
  'attribution_resolved',
  'paywall_viewed',
  'plan_selected',
  'checkout_started',
  'checkout_completed',
  'handoff_created',
  'handoff_opened',
  'handoff_consumed',
  'purchase_started',
  'purchase_completed',
  'purchase_failed',
  'purchase_restored',
  'activation_code_redeemed',
  'evaluation_started',
  'evaluation_completed',
] as const

export type AnalyticsEventName = (typeof analyticsEventNames)[number]

const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const propertyValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([scalarSchema, z.array(propertyValueSchema), z.record(z.string(), propertyValueSchema)])
)

export const analyticsEventSchema = z.object({
  eventId: z.string().uuid(),
  eventName: z.enum(analyticsEventNames),
  accountId: z.string().min(1).max(160).optional(),
  mobileInstallId: z.string().min(8).max(160).optional(),
  anonymousId: z.string().min(1).max(160).optional(),
  sessionId: z.string().min(1).max(200).optional(),
  platform: z.enum(['web', 'ios', 'android', 'server']),
  source: z.string().min(1).max(120).optional(),
  properties: z.record(z.string(), propertyValueSchema).default({}),
  occurredAt: z.string().datetime(),
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
      source,
      properties,
      occurredAt: new Date().toISOString(),
    })])
  } catch (error) {
    console.error('Analytics event recording failed', eventName, error)
  }
}
