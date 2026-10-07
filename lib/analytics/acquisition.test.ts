import { expect, test } from 'bun:test'
import { acquisitionReferrer } from './acquisition'
import { sanitizeProperties } from './contract'

test('external referrers retain only their host', () => {
  expect(acquisitionReferrer('https://www.google.com/search?q=private')).toBe('www.google.com')
  expect(acquisitionReferrer('https://www.tiktok.com/@creator')).toBe('www.tiktok.com')
})
test('internal, login and checkout navigation never becomes acquisition', () => {
  for (const url of ['', 'invalid', 'https://www.mogging.com/analysis', 'https://accounts.google.com/', 'https://appleid.apple.com/', 'https://checkout.stripe.com/pay', 'http://localhost:3000/']) {
    expect(acquisitionReferrer(url)).toBeNull()
  }
  expect(acquisitionReferrer('https://mogging.com.example.com/')).toBe('mogging.com.example.com')
})
test('first referrer survives transport sanitization', () => {
  expect(sanitizeProperties({first_referrer_host:'www.google.com'})).toEqual({first_referrer_host:'www.google.com'})
})
