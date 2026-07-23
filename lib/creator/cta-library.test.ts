import { describe, expect, test } from 'bun:test'
import { creatorCtaLibraryReviewSchema, creatorCtaLibrarySubmissionSchema } from './cta-library'

describe('creator CTA library validation', () => {
  test('accepts generated MP4 and PNG submissions', () => {
    for (const assetContentType of ['video/mp4', 'image/png'] as const) {
      expect(creatorCtaLibrarySubmissionSchema.safeParse({
        title: 'Jaw score reveal',
        templateId: 'score-rows',
        formatId: 'vertical',
        assetStorageKey: 'creators/user-1/cta-library/item.mp4',
        assetContentType,
        assetSizeBytes: 1_024,
      }).success).toBe(true)
    }
  })

  test('rejects unsupported assets and oversized submissions', () => {
    expect(creatorCtaLibrarySubmissionSchema.safeParse({
      title: 'CTA',
      templateId: 'cta',
      formatId: 'vertical',
      assetStorageKey: 'creators/user-1/cta-library/item.webm',
      assetContentType: 'video/webm',
      assetSizeBytes: 101 * 1024 * 1024,
    }).success).toBe(false)
  })

  test('limits moderation to supported states', () => {
    expect(creatorCtaLibraryReviewSchema.safeParse({ id: crypto.randomUUID(), status: 'approved' }).success).toBe(true)
    expect(creatorCtaLibraryReviewSchema.safeParse({ id: crypto.randomUUID(), status: 'paid' }).success).toBe(false)
  })
})
