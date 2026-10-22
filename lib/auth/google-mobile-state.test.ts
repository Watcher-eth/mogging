import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { createGoogleMobileState, readGoogleMobileState, verifyGoogleVerifier } from './google-mobile-state'

const now = Date.parse('2026-10-22T01:00:00Z'), secret = 'test-secret-never-used-for-production'
const verifier = 'v'.repeat(64), challenge = createHash('sha256').update(verifier).digest('base64url')
const input = { challenge, nonce: 'a'.repeat(64), existingOnly: true }

test('signed mobile state and S256 bind Google to the original app verifier', () => {
  const state = createGoogleMobileState(input, secret, now)
  expect(readGoogleMobileState(state, secret, now)).toMatchObject(input)
  expect(verifyGoogleVerifier(verifier, challenge)).toBe(true)
  expect(verifyGoogleVerifier('w'.repeat(64), challenge)).toBe(false)
  expect(verifyGoogleVerifier('', challenge)).toBe(false)
})

test('tampered, expired, malformed and wrongly signed states cannot authenticate', () => {
  const state = createGoogleMobileState(input, secret, now)
  for (const value of [state + '.extra', state.replace('mob1.', 'other.'), state.slice(0, -4) + 'aaaa', 'mob1.bad.signature']) {
    expect(() => readGoogleMobileState(value, secret, now)).toThrow()
  }
  expect(() => readGoogleMobileState(state, 'different-secret', now)).toThrow()
  expect(() => readGoogleMobileState(state, secret, now + 15 * 60_000)).toThrow('expired')
  expect(() => readGoogleMobileState(state, secret, now - 60_000)).toThrow('expired')
})
