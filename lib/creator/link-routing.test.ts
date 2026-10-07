import { expect, test } from 'bun:test'
import { buildCreatorDeepLink, buildCreatorInstallLink, creatorLinkPlatform } from './link-routing'

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

test('OneLink handoff preserves the signed click and fails closed when not configured', () => {
  const fallback = 'https://apps.apple.com/app/id6771414050'
  expect(buildCreatorInstallLink(undefined, 'creator', 'signed.token', fallback)).toBe(fallback)
  expect(buildCreatorInstallLink('https://evil.example/rnQm', 'creator', 'signed.token', fallback)).toBe(fallback)
  expect(buildCreatorInstallLink('https://mogging.onelink.me/rnQm/short', 'creator', 'signed.token', fallback)).toBe(fallback)
  const url = new URL(buildCreatorInstallLink('https://mogging.onelink.me/rnQm', 'creator', 'signed.token', fallback))
  expect(url.searchParams.get('deep_link_sub1')).toBe('signed.token')
  expect(url.searchParams.get('deep_link_value')).toBe('creator')
  expect(url.searchParams.get('pid')).toBe('creator')
})
