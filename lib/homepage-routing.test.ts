import { expect, test } from 'bun:test'
import { homepageDestinationCookie, shouldRouteHomepageToStore } from './homepage-routing'

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
test('only fresh iPhone homepage visitors are routed to the store', () => {
  expect(shouldRouteHomepageToStore(iphone)).toBe(true)
  for (const agent of ['Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'Mozilla/5.0 (Linux; Android 15)', 'Mozilla/5.0 (iPad; CPU OS 18_0)', `${iphone} Googlebot`, `${iphone} HeadlessChrome`]) expect(shouldRouteHomepageToStore(agent)).toBe(false)
  expect(shouldRouteHomepageToStore(iphone, 'web')).toBe(false)
  expect(shouldRouteHomepageToStore(iphone, 'store')).toBe(false)
  expect(shouldRouteHomepageToStore(iphone, undefined, true)).toBe(false)
})
test('website choice persists; a store attempt only lasts the browser session', () => {
  expect(homepageDestinationCookie('web', true)).toContain('Max-Age=7776000')
  expect(homepageDestinationCookie('store', true)).not.toContain('Max-Age')
  expect(homepageDestinationCookie('store', true)).toContain('; Secure')
  expect(homepageDestinationCookie('web', false)).not.toContain('; Secure')
})
