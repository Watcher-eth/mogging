import assert from 'node:assert/strict'
import test from 'node:test'
import { getRateLimitBackend } from './rateLimit'

test('rate limiter falls back to memory without Upstash env', () => {
  assert.equal(getRateLimitBackend(), 'memory')
})
