import { expect, test } from 'bun:test'
import { isPhoneUserAgent } from './phone-layout'

test('analysis uses desktop for iPads and Android tablets', () => {
  expect(isPhoneUserAgent('Mozilla/5.0 (iPad; CPU OS 18_0) Mobile/15E148 Safari/604.1')).toBe(false)
  expect(isPhoneUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1.15')).toBe(false)
  expect(isPhoneUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel Tablet) Chrome/140.0.0.0 Safari/537.36', '?0')).toBe(false)
})

test('analysis uses mobile for iPhones and Android phones regardless of layout width', () => {
  expect(isPhoneUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile/15E148 Safari/604.1')).toBe(true)
  expect(isPhoneUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro XL) Chrome/140.0.0.0 Mobile Safari/537.36')).toBe(true)
  expect(isPhoneUserAgent('Mozilla/5.0 (Linux; Android 15)', '?1')).toBe(true)
})
