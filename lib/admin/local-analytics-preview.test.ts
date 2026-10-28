import { expect, test } from 'bun:test'
import { isLocalAnalyticsPreview } from './local-analytics-preview'

test('real-data preview requires development, loopback peer, and local host', () => {
  expect(isLocalAnalyticsPreview('development', { host: '127.0.0.1:4198' }, '127.0.0.1')).toBe(true)
  expect(isLocalAnalyticsPreview('development', { host: 'localhost:4198' }, '::ffff:127.0.0.1')).toBe(true)
  expect(isLocalAnalyticsPreview('development', { host: '[::1]:4198' }, '::1')).toBe(true)
  for (const mode of ['production', 'test', undefined]) {
    expect(isLocalAnalyticsPreview(mode, { host: 'localhost:4198' }, '127.0.0.1')).toBe(false)
  }
  expect(isLocalAnalyticsPreview('development', { host: 'localhost:4198' }, '192.168.1.10')).toBe(false)
  expect(isLocalAnalyticsPreview('development', { host: 'example.com' }, '127.0.0.1')).toBe(false)
  expect(isLocalAnalyticsPreview('development', { host: 'localhost.example.com' }, '127.0.0.1')).toBe(false)
  expect(isLocalAnalyticsPreview('development', { host: 'localhost', 'sec-fetch-site': 'cross-site' }, '127.0.0.1')).toBe(false)
})
