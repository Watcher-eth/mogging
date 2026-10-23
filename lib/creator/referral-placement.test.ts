import { expect, test } from 'bun:test'
import { profileHasCreatorLink } from './referral-placement'

test('bio evidence belongs to the exact connected profile and referral destination', () => {
  const own = 'https://www.mogging.com/r/creator'
  expect(profileHasCreatorLink({ user: { uniqueId: 'creator', bioLink: { link: own } } }, 'tiktok', 'creator', own)).toBe(true)
  expect(profileHasCreatorLink({ user: { username: 'creator', external_url: 'https://mogging.com/r/creator' } }, 'instagram', 'creator', own)).toBe(true)
  for (const url of ['https://notmogging.com/r/creator', 'https://mogging.com/r/someone-else', 'https://mogging.com:8443/r/creator', 'https://user@mogging.com/r/creator']) {
    expect(profileHasCreatorLink({ uniqueId: 'creator', signature: url }, 'tiktok', 'creator', own)).toBe(false)
  }
  expect(profileHasCreatorLink({ uniqueId: 'someone-else', signature: own }, 'tiktok', 'creator', own)).toBe(false)
  expect(profileHasCreatorLink({ uniqueId: 'creator' }, 'tiktok', 'creator', own)).toBe(false)
})
