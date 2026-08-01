import { describe, expect, test } from 'bun:test'
import { creatorAdminPaymentSchema } from './creator-service'

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

  test('rejects arbitrary view and audience values', () => {
    expect(creatorAdminPaymentSchema.safeParse({
      submissionId: 'submission-1',
      adminViewCountThreshold: 123_456,
      adminUsAudiencePercent: 31,
    }).success).toBe(false)
  })
})
