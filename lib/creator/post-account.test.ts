import { expect, test } from 'bun:test'
import { detectPostingAccount } from './post-account'
const accounts = [
  { id: 'tiktok-one', platform: 'tiktok' as const, handle: 'one' },
  { id: 'tiktok-two', platform: 'tiktok' as const, handle: 'two' },
  { id: 'instagram', platform: 'instagram' as const, handle: 'one' },
]
test('full TikTok links match their author, overriding stale manual selection', () => {
  expect(detectPostingAccount('https://www.tiktok.com/@ONE/video/123?x=y', accounts, 'tiktok-two').account?.id).toBe('tiktok-one')
  expect(detectPostingAccount('https://www.tiktok.com/@unknown/photo/123', accounts, 'tiktok-one').account).toBeUndefined()
})
test('ambiguous shares require a choice, scoped to the detected platform', () => {
  const link = 'https://vm.tiktok.com/abc123/'
  expect(detectPostingAccount(link, accounts).account).toBeUndefined()
  expect(detectPostingAccount(link, accounts, 'tiktok-two').account?.id).toBe('tiktok-two')
  expect(detectPostingAccount(link, accounts, 'instagram').account).toBeUndefined()
})
test('Instagram selects the only connected account or matches an explicit username', () => {
  expect(detectPostingAccount('https://instagram.com/reel/abc/', accounts).account?.id).toBe('instagram')
  expect(detectPostingAccount('https://instagram.com/one/reel/abc/', accounts).handle).toBe('one')
  expect(detectPostingAccount('https://instagram.com/share/reel/abc/', accounts).handle).toBeUndefined()
  expect(detectPostingAccount('https://instagram.com/reel/abc/', [...accounts, { id: 'other', platform: 'instagram', handle: 'two' }]).account).toBeUndefined()
})
test('invalid or deceptive URLs never select a platform or account', () => {
  for (const value of ['', 'https://tiktok.com.evil.example/@one/video/123', 'http://www.tiktok.com/@one/video/123']) {
    expect(detectPostingAccount(value, accounts).platform).toBeNull()
    expect(detectPostingAccount(value, accounts).account).toBeUndefined()
  }
})
