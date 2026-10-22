import { expect, test } from 'bun:test'
import { recoveryCallback, recoveryRedemption, recoveryRequest } from './continuity'

test('browser handoff has a fixed callback and carries only opaque proof', () => {
  const callback = new URL(recoveryCallback('a'.repeat(64), { ticket: 'b'.repeat(64) }))
  expect(callback.protocol).toBe('mogging:')
  expect(callback.hostname).toBe('creator-recovery')
  expect([...callback.searchParams.keys()].sort()).toEqual(['state', 'ticket'])
  expect(callback.href).not.toContain('attribution_token')
})

test('recovery requires fixed-size high-entropy state, proof and installation identity', () => {
  expect(recoveryRequest.safeParse({ state: 'a'.repeat(64), challenge: 'b'.repeat(64) }).success).toBe(true)
  for (const state of ['', 'a'.repeat(63), 'a'.repeat(65), 'https://evil.example']) {
    expect(recoveryRequest.safeParse({ state, challenge: 'b'.repeat(64) }).success).toBe(false)
  }
  expect(recoveryRedemption.safeParse({ ticket: 'a'.repeat(64), verifier: 'b'.repeat(64), mobileInstallId: 'mob_fixture' }).success).toBe(true)
  expect(recoveryRedemption.safeParse({ ticket: 'a'.repeat(64), verifier: 'b'.repeat(64), mobileInstallId: 'another-user' }).success).toBe(false)
})
