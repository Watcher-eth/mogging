import assert from 'node:assert/strict'
import test from 'node:test'
import { isR2Configured } from '@/lib/env'

test('image storage falls back to local when R2 env is not configured', () => {
  assert.equal(isR2Configured(), false)
})
