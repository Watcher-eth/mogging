import { expect, test } from 'bun:test'
import { publishedVideoEmbedUrl } from './post-embed'

test('builds the native player for supported public TikTok videos', () => {
  expect(publishedVideoEmbedUrl('https://www.tiktok.com/@creator/video/123456789?tracking=x')).toBe('https://www.tiktok.com/player/v1/123456789')
})
test('supports Instagram reels, posts and username-qualified links', () => {
  for (const path of ['reel/abc_123', 'creator/reel/abc_123']) expect(publishedVideoEmbedUrl(`https://www.instagram.com/${path}/?igsh=x`)).toBe('https://www.instagram.com/reel/abc_123/embed/')
  expect(publishedVideoEmbedUrl('https://instagram.com/p/abc-123/')).toBe('https://www.instagram.com/p/abc-123/embed/')
})
test('shared links wait for safe canonical resolution; unsupported posts do not invent a player', () => {
  for (const value of ['https://vm.tiktok.com/abc123/', 'https://www.instagram.com/share/reel/abc123/', 'https://www.tiktok.com/@creator/photo/123']) expect(publishedVideoEmbedUrl(value)).toBeNull()
})
test('rejects arbitrary hosts, credentials and unexpected protocols or ports', () => {
  for (const value of [null, '', 'https://www.tiktok.com.evil.test/@creator/video/123', 'http://www.tiktok.com/@creator/video/123', 'https://user:pass@www.tiktok.com/@creator/video/123', 'https://www.tiktok.com:8080/@creator/video/123']) expect(publishedVideoEmbedUrl(value)).toBeNull()
})
