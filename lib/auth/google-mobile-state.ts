import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { ApiError } from '@/lib/api/http'

export const mobileGoogleInput = z.object({
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  nonce: z.string().regex(/^[a-f0-9]{64}$/),
  existingOnly: z.boolean().default(false),
})
const stateSchema = mobileGoogleInput.extend({ expires: z.number().int() })

export function createGoogleMobileState(input: z.input<typeof mobileGoogleInput>, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...mobileGoogleInput.parse(input), expires: now + 15 * 60_000 })).toString('base64url')
  return `mob1.${payload}.${signature(payload, secret)}`
}

export function readGoogleMobileState(value: string, secret: string, now = Date.now()) {
  const [prefix, payload, signed, extra] = value.split('.')
  if (value.length > 1200 || prefix !== 'mob1' || !payload || !signed || extra) throw new ApiError(401, 'Google sign-in session is invalid. Please try again.')
  const expected = Buffer.from(signature(payload, secret))
  const received = Buffer.from(signed)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new ApiError(401, 'Google sign-in session is invalid. Please try again.')
  let parsed: ReturnType<typeof stateSchema.parse>
  try { parsed = stateSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString())) }
  catch { throw new ApiError(401, 'Google sign-in session is invalid. Please try again.') }
  if (parsed.expires <= now || parsed.expires > now + 15 * 60_000) throw new ApiError(401, 'Google sign-in session expired. Please try again.')
  return parsed
}

export function verifyGoogleVerifier(verifier: string, challenge: string) {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(verifier) && createHash('sha256').update(verifier).digest('base64url') === challenge
}

function signature(payload: string, secret: string) {
  if (!secret) throw new ApiError(503, 'Google sign-in is unavailable')
  return createHmac('sha256', secret).update(`mogging-google-mobile:${payload}`).digest('base64url')
}
