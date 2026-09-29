import { expect, test } from 'bun:test'
import { createCreatorTikTokState, readCreatorTikTokState } from './tiktok-oauth'

const connection = {
  platform: 'tiktok' as const, handle: 'nate',
  analyticsVideoUrl: '/recording.mp4',
  analyticsStorageKey: 'creators/user/account-analytics/00000000-0000-0000-0000-000000000001.mp4',
  analyticsContentType: 'video/mp4' as const,
  analyticsSizeBytes: 100, analyticsPast28DaysConfirmed: true as const,
}

test('OAuth preserves evidence bound to the initiating user and state', () => {
  const { state, cookieValue } = createCreatorTikTokState('user', connection)
  expect(readCreatorTikTokState(cookieValue, state, 'user')?.connection).toEqual(connection)
  expect(readCreatorTikTokState(cookieValue, state, 'other')).toBeNull()
  expect(readCreatorTikTokState(cookieValue, 'wrong', 'user')).toBeNull()
  expect(readCreatorTikTokState(`x${cookieValue}`, state, 'user')).toBeNull()
})

test('OAuth cannot start without confirmed evidence', () => {
  expect(() => createCreatorTikTokState('user', { ...connection, analyticsPast28DaysConfirmed: false } as never)).toThrow()
  expect(() => createCreatorTikTokState('user', { platform: 'tiktok', handle: 'nate' } as never)).toThrow()
})
