import { createHmac, timingSafeEqual } from 'node:crypto'

export const CREATOR_INVITER_COOKIE = 'creator_inviter'
export const CREATOR_INVITE_MAX_AGE = 30 * 86400
export const validCreatorReferralCode = (value: string) => /^[A-Za-z0-9_-]{32}$/.test(value)
const secret = () => {
  const key = process.env.NEXTAUTH_SECRET
  if (!key) throw new Error('NEXTAUTH_SECRET is required for creator referral tracking')
  return key
}
export function signCreatorInviter(code: string, now = Date.now()) {
  if (!validCreatorReferralCode(code)) throw new Error('Invalid creator referral code')
  const payload = code + '.' + now
  return payload + '.' + createHmac('sha256', secret()).update(payload).digest('hex')
}
export function readCreatorInviter(cookie: string | undefined, now = Date.now()) {
  if (!cookie) return null
  const [code, timestamp, signature, extra] = cookie.split('.')
  if (extra || !validCreatorReferralCode(code || '') || !/^\d{13}$/.test(timestamp || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return null
  const age = now - Number(timestamp)
  if (age < 0 || age > CREATOR_INVITE_MAX_AGE * 1000) return null
  const expected = Buffer.from(createHmac('sha256', secret()).update(code + '.' + timestamp).digest('hex'))
  return timingSafeEqual(expected, Buffer.from(signature)) ? code : null
}
