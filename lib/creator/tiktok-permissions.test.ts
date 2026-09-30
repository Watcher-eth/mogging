import { expect, test } from 'bun:test'
import { creatorTikTokFields, creatorTikTokScopes } from './tiktok-permissions'

test('pending profile scope is opt-in', () => {
  expect(creatorTikTokScopes(false)).toBe('user.info.basic,user.info.stats')
  expect(creatorTikTokScopes(true)).toBe('user.info.basic,user.info.stats,user.info.profile')
})
test('profile fields follow granted permissions, including partial consent', () => {
  for (const scopes of ['', 'user.info.basic', 'user.info.basic,user.info.stats', 'user.info.profile.extra']) {
    expect(creatorTikTokFields(scopes)).not.toContain('username')
    expect(creatorTikTokFields(scopes)).not.toContain('profile_deep_link')
    expect(creatorTikTokFields(scopes)).toContain('open_id')
  }
  expect(creatorTikTokFields('user.info.basic,user.info.profile')).toContain('username')
  expect(creatorTikTokFields('user.info.basic user.info.profile')).toContain('profile_deep_link')
})

test('all profile and statistics fields are requested only when their scopes are granted', () => {
  for (const field of ['bio_description', 'is_verified', 'username', 'profile_deep_link']) {
    expect(creatorTikTokFields('user.info.basic,user.info.profile')).toContain(field)
    expect(creatorTikTokFields('user.info.basic')).not.toContain(field)
  }
  for (const field of ['follower_count', 'following_count', 'likes_count', 'video_count']) {
    expect(creatorTikTokFields('user.info.basic,user.info.stats')).toContain(field)
    expect(creatorTikTokFields('user.info.basic')).not.toContain(field)
    expect(creatorTikTokFields('user.info.stats.extra')).not.toContain(field)
  }
})
