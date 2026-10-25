import { expect, mock, test } from 'bun:test'
const photo = { id: 'photo', userId: 'owner' as string | null, anonymousActorId: null as string | null, isPublic: true, rating: null }
const share = { token: 'old-public-token', photo, analysis: { metrics: {} }, owner: null, includeLeaderboard: true, leaderboardSnapshot: { top: ['legacy'] } }
const schemaModule = await import('../db/schema')
mock.module('@/lib/db', () => ({ schema: schemaModule, db: { query: { analysisShares: { findFirst: async () => share } } } }))
const { getShareByToken, createAnalysisShareSchema } = await import('./service')
test('a token and legacy public flag never authorize a report or export', async () => {
  await expect(getShareByToken(share.token)).rejects.toMatchObject({ status: 404 })
  await expect(getShareByToken(share.token, { userId: 'stranger', anonymousActorId: null })).rejects.toMatchObject({ status: 404 })
  const own = await getShareByToken(share.token, { userId: 'owner', anonymousActorId: null })
  expect(own.photo.id).toBe('photo')
  expect(own.includeLeaderboard).toBe(false)
  expect(own.leaderboardSnapshot).toBeNull()
})
test('anonymous exports require the original actor, never missing ownership', async () => {
  photo.userId = null; photo.anonymousActorId = 'original-actor'
  await expect(getShareByToken(share.token)).rejects.toMatchObject({ status: 404 })
  expect((await getShareByToken(share.token, { userId: null, anonymousActorId: 'original-actor' })).photo.id).toBe('photo')
  photo.anonymousActorId = null
  await expect(getShareByToken(share.token)).rejects.toMatchObject({ status: 404 })
})
test('legacy requests cannot attach rankings to a private export', () => {
  expect(createAnalysisShareSchema.parse({ analysisId: 'report', includeLeaderboard: true }).includeLeaderboard).toBe(false)
})
