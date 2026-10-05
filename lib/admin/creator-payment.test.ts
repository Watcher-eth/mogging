import { describe, expect, test } from 'bun:test'
import { creatorAdminPaymentSchema, creatorAttributionMetricsSchema } from './creator-service'

describe('creator admin payment selection', () => {
  test('accepts calculator-supported admin values', () => {
    const result = creatorAdminPaymentSchema.parse({
      submissionId: 'submission-1',
      adminViewCountThreshold: 500_000,
      adminUsAudiencePercent: 30,
      status: 'pending',
    })

    expect(result.adminViewCountThreshold).toBe(500_000)
    expect(result.adminUsAudiencePercent).toBe(30)
  })

  test('supports the combined Tier-1 base rate', () => {
    const result = creatorAdminPaymentSchema.parse({
      submissionId: 'submission-1',
      adminViewCountThreshold: 40_000,
      adminUsAudiencePercent: null,
    })

    expect(result.adminUsAudiencePercent).toBeNull()
  })

  test('accepts exact campaign analytics rather than only historical tiers', () => {
    expect(creatorAdminPaymentSchema.safeParse({
      submissionId: 'submission-1',
      adminViewCountThreshold: 123_456,
      adminUsAudiencePercent: 31,
    }).success).toBe(true)
  })
})

test('video attribution accepts a posting date but rejects future or invalid dates', () => {
  const metrics = { submissionId: 'video', qualifiedViews: 100, linkClicks: 20, installs: 5, firstTimePaidCustomers: 1 }
  expect(creatorAttributionMetricsSchema.safeParse({ ...metrics, postedAt: '2026-01-01T00:00:00Z' }).success).toBe(true)
  expect(creatorAttributionMetricsSchema.safeParse({ ...metrics, postedAt: null }).success).toBe(true)
  expect(creatorAttributionMetricsSchema.safeParse(metrics).success).toBe(true)
  expect(creatorAttributionMetricsSchema.safeParse({ ...metrics, postedAt: 'garbage' }).success).toBe(false)
  expect(creatorAttributionMetricsSchema.safeParse({ ...metrics, postedAt: new Date(Date.now() + 86_400_000).toISOString() }).success).toBe(false)
})
