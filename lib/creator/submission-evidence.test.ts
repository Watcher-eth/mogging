import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'

let uploadExists = true
let inserted: any[] = []
let verified: any[] = []
mock.module('@/lib/db', () => ({ schema, db: {
  query: { creatorProfiles: { findFirst: async () => ({ id: 'creator' }) } },
  insert: () => ({ values: (values: any) => { inserted.push(values); return { returning: async () => [{ id: 'submission', ...values }] } } }),
} }))
mock.module('@/lib/creator/attribution', () => ({ ensureCreatorTrackingLink: async () => null }))
mock.module('@/lib/storage/videos', () => ({
  creatorAssetPublicUrl: (key: string) => `https://media.example/${key}`,
  verifyCreatorRecordingUpload: async (...args: any[]) => { verified.push(args); if (!uploadExists) throw new Error('Incomplete upload') },
}))
const { createCreatorSubmission } = await import('./service')
const input = {
  formatId: 'general-creator-video-v1', requirementsConfirmed: true as const,
  postUrl: 'https://www.tiktok.com/@nate/video/123',
  analyticsVideoUrl: 'https://untrusted.example/recording.mp4',
  analyticsPhysicalRecordingConfirmed: true as const,
  analyticsStorageKey: 'creators/user/submission-analytics/00000000-0000-4000-8000-000000000001.mp4',
  analyticsContentType: 'video/mp4' as const, analyticsSizeBytes: 100, viewCountThreshold: 40000 as const,
}
beforeEach(() => { inserted = []; verified = []; uploadExists = true })
test('completed video evidence is checked and its URL comes from owned storage', async () => {
  const submission = await createCreatorSubmission('user', input)
  expect(verified).toEqual([[input.analyticsStorageKey, 100, 'video/mp4']])
  expect(submission.analyticsScreenshotUrl).toBe(`https://media.example/${input.analyticsStorageKey}`)
  expect(inserted).toHaveLength(1)
})
test('missing or incomplete uploads cannot create submissions', async () => {
  uploadExists = false
  await expect(createCreatorSubmission('user', input)).rejects.toThrow('complete physical analytics recording')
  expect(inserted).toHaveLength(0)
})
test('screenshots and missing physical recording confirmation are rejected', async () => {
  for (const patch of [{ analyticsContentType: 'image/png' }, { analyticsPhysicalRecordingConfirmed: false }]) {
    await expect(createCreatorSubmission('user', { ...input, ...patch } as any)).rejects.toThrow()
  }
  expect(verified).toHaveLength(0)
  expect(inserted).toHaveLength(0)
})
test('another user’s upload, account evidence, images, and malformed paths cannot be submitted', async () => {
  for (const key of [input.analyticsStorageKey.replace('/user/', '/other/'), input.analyticsStorageKey.replace('submission-analytics', 'account-analytics'), input.analyticsStorageKey.replace('.mp4', '.png'), 'creators/user/submission-analytics/../recording.mp4']) {
    await expect(createCreatorSubmission('user', { ...input, analyticsStorageKey: key })).rejects.toThrow('Invalid analytics recording upload')
  }
  expect(verified).toHaveLength(0)
  expect(inserted).toHaveLength(0)
})
