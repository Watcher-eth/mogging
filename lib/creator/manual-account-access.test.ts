import { expect, test } from 'bun:test'
import { canManuallyConnectTikTok } from './manual-account-access'

test('manual TikTok connection is restricted to the approved creator email', () => {
  expect(canManuallyConnectTikTok('mohummadtaha12345@gmail.com')).toBe(true)
  expect(canManuallyConnectTikTok(' MOHUMMADTAHA12345@GMAIL.COM ')).toBe(true)
  for (const email of [undefined, null, '', 'other@gmail.com', 'mohummadtaha12345+other@gmail.com', 'mohummadtaha12345@gmail.com.evil']) {
    expect(canManuallyConnectTikTok(email)).toBe(false)
  }
})
