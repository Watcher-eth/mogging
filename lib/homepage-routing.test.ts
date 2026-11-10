import { expect, test } from 'bun:test'
import { homepageDestinationCookie, phonePwaEntryPath } from './homepage-routing'

test('phone entry starts PWA onboarding and preserves sign-in and checkout returns', () => {
  expect(phonePwaEntryPath({})).toBe('/analysis')
  expect(phonePwaEntryPath({ plan: 'web_basic_monthly' })).toBe('/analysis')
  expect(phonePwaEntryPath({ start: '1', utm_source: 'tiktok', next: 'https://example.com' })).toBe('/analysis?start=1&utm_source=tiktok')
  expect(phonePwaEntryPath({ login: '1', next: '/app/home?tab=progress' })).toBe('/analysis?login=1&next=%2Fapp%2Fhome%3Ftab%3Dprogress')
  expect(phonePwaEntryPath({ checkout: 'success', session_id: 'cs_test_123' })).toBe('/app/handoff?session_id=cs_test_123')
})

test('website choice persists; a store attempt clears the old destination cookie', () => {
  expect(homepageDestinationCookie('web', true)).toContain('Max-Age=7776000')
  expect(homepageDestinationCookie('store', true)).toContain('mogging.homepage.destination=;')
  expect(homepageDestinationCookie('store', true)).toContain('Max-Age=0')
  expect(homepageDestinationCookie('store', true)).toContain('; Secure')
  expect(homepageDestinationCookie('web', false)).not.toContain('; Secure')
})
