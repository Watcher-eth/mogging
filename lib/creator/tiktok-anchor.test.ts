import { expect, test } from 'bun:test'
import {
  accountFollowers,
  followerLabel,
  followerRangeSchema,
  followersFromOAuth,
  publishingTikTokHandle,
  tiktokAnchorEligible,
  type CreatorFollowers,
} from './tiktok-anchor'
import { creatorConnectAccountSchema } from './account-identity'

const checkedAt = '2026-10-20T00:00:00.000Z'
test('manual confirmations preserve a minimum without claiming an exact TikTok count', () => {
  const followers: CreatorFollowers = { source: 'manual', count: 1000, minimum: true, checkedAt }
  expect(tiktokAnchorEligible({ platform: 'tiktok', followers })).toBe(true)
  expect(tiktokAnchorEligible({ platform: 'instagram', followers })).toBe(false)
  expect(followerLabel(followers)).toBe('1,000+ followers · manually confirmed')
  const exact: CreatorFollowers = { source: 'manual', count: 21000, checkedAt }
  expect(followerLabel(exact)).toBe('21,000 followers · manually confirmed')
  expect(accountFollowers({ followers, oauthProfile: { follower_count: 999 } })).toEqual(followers)
})
test('the 1,000-follower boundary is inclusive and scoped to the publishing platform', () => {
  for (const [count, eligible] of [
    [0, false],
    [999, false],
    [1000, true],
    [13777, true],
  ] as const) {
    const followers: CreatorFollowers = { source: 'public', count, checkedAt }
    expect(tiktokAnchorEligible({ platform: 'tiktok', followers })).toBe(
      eligible
    )
    expect(tiktokAnchorEligible({ platform: 'instagram', followers })).toBe(
      false
    )
  }
  expect(tiktokAnchorEligible({ platform: 'tiktok' })).toBeNull()
  expect(tiktokAnchorEligible(null)).toBe(false)
})
test('all follower ranges classify without a gap', () => {
  for (const range of followerRangeSchema.options) {
    expect(
      tiktokAnchorEligible({
        platform: 'tiktok',
        followers: { source: 'self_reported', range, checkedAt },
      })
    ).toBe(range !== 'under_1k')
  }
  expect(followerRangeSchema.safeParse('5k').success).toBe(false)
})
test('OAuth counts must be valid counts, and remain available for legacy connected accounts', () => {
  expect(followersFromOAuth({ follower_count: 1000 }, checkedAt)).toEqual({
    source: 'oauth',
    count: 1000,
    checkedAt,
  })
  for (const follower_count of [undefined, -1, NaN, 1.5, '1000', Infinity])
    expect(followersFromOAuth({ follower_count })).toBeNull()
  expect(
    accountFollowers({
      oauthProfile: { follower_count: 16 },
      oauthVerifiedAt: checkedAt,
    })
  ).toEqual({ source: 'oauth', count: 16, checkedAt })
})
test('a new TikTok connection preserves its range and Instagram does not acquire TikTok metadata', () => {
  const input = {
    identity: 'https://www.tiktok.com/@Example',
    platform: 'tiktok',
    followerRange: '5k_10k',
  }
  expect(creatorConnectAccountSchema.parse(input)).toMatchObject({
    platform: 'tiktok',
    handle: 'example',
    followerRange: '5k_10k',
  })
  expect(
    creatorConnectAccountSchema.parse({
      ...input,
      platform: 'instagram',
      identity: '@example',
    }).followerRange
  ).toBeUndefined()
})
test('publishing handles ignore tracking and support videos and photo posts', () => {
  expect(
    publishingTikTokHandle(
      'https://www.tiktok.com/@Example.Name/video/123?sender_device=pc'
    )
  ).toBe('example.name')
  expect(
    publishingTikTokHandle('https://www.tiktok.com/@example/photo/123')
  ).toBe('example')
  expect(publishingTikTokHandle('https://vm.tiktok.com/ABC/')).toBeNull()
})
