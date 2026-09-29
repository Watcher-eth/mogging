import { expect, test } from 'bun:test'
import { buildCreatorDeepLink, creatorLinkPlatform } from './link-routing'

test('device routing recognizes iPhone, Android and iPad desktop-mode mobile UA', () => {
  expect(creatorLinkPlatform('Mozilla iPhone Safari')).toBe('ios')
  expect(creatorLinkPlatform('Mozilla Macintosh Mobile/15 Safari')).toBe('ios')
  expect(creatorLinkPlatform('Mozilla Android')).toBe('android')
  expect(creatorLinkPlatform('Mozilla Macintosh Safari')).toBe('web')
  expect(creatorLinkPlatform('')).toBe('web')
})
test('creator link has one signed token and requires no provider', () => {
  const url = new URL(buildCreatorDeepLink('tiktok-test-12345678', 'click.signature'))
  expect(url.protocol).toBe('mogging:')
  expect(url.hostname).toBe('r')
  expect(url.pathname).toBe('/tiktok-test-12345678')
  expect(url.searchParams.get('attribution_token')).toBe('click.signature')
})
