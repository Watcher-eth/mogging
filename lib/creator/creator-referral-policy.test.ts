import { expect, test } from 'bun:test'
import { creatorReferralCents } from './creator-referral-policy'
import { CREATOR_INVITE_MAX_AGE, readCreatorInviter, signCreatorInviter } from './creator-referral-cookie'

test('referral commission never rounds above five percent', () => {
  expect([0, 1, 19, 20, 99, 100, 1250, 10000].map(creatorReferralCents)).toEqual([0, 0, 0, 1, 4, 5, 62, 500])
})

test('signed first-touch cookie rejects tampering, invalid inputs, future dates and expired invites', () => {
  const before = process.env.NEXTAUTH_SECRET
  process.env.NEXTAUTH_SECRET = 'isolated-referral-test-secret'
  try {
    const now = 1792972800000
    const code = 'a'.repeat(32)
    const signed = signCreatorInviter(code, now)
    expect(readCreatorInviter(signed, now)).toBe(code)
    expect(readCreatorInviter(signed.replace(/^a/, 'b'), now)).toBeNull()
    expect(readCreatorInviter(signed, now + CREATOR_INVITE_MAX_AGE * 1000 + 1)).toBeNull()
    expect(readCreatorInviter(signed, now - 1)).toBeNull()
    expect(readCreatorInviter('untrusted', now)).toBeNull()
    expect(readCreatorInviter(undefined, now)).toBeNull()
  } finally {
    if (before === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = before
  }
})
