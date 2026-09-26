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
