import assert from 'node:assert/strict'
import test from 'node:test'
import { formatProfileLocation } from './regions'

test('formats US state locations for nearby Battle context', () => {
  assert.equal(formatProfileLocation('US', 'NY'), 'New York, US')
  assert.equal(formatProfileLocation('US', 'CA'), 'California, US')
})

test('falls back safely for non-US and missing locations', () => {
  assert.equal(formatProfileLocation('CA', null), 'Canada')
  assert.equal(formatProfileLocation('DE', null), 'DE')
  assert.equal(formatProfileLocation(null, null), null)
})
