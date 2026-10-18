import { afterEach, expect, test } from 'bun:test'
import { creatorPostIdentity, resolveCreatorPostIdentity, rethrowCreatorPostConflict } from './post-identity'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
test('TikTok identity ignores handle, URL host, tracking and video/photo path variations', () => {
  for (const url of ['https://www.tiktok.com/@old/video/123?utm_source=copy#x', 'https://m.tiktok.com/@new/photo/123/', 'https://tiktok.com/@other/video/123']) expect(creatorPostIdentity(url)).toBe('tiktok:123')
})
test('Instagram identity ignores profile and post type but preserves case-sensitive shortcodes', () => {
  for (const path of ['/reel/AbC_123/', '/p/AbC_123?igsh=test', '/creator/reels/AbC_123/']) expect(creatorPostIdentity(`https://www.instagram.com${path}`)).toBe('instagram:AbC_123')
  expect(creatorPostIdentity('https://instagram.com/reel/abc_123')).not.toBe('instagram:AbC_123')
  expect(creatorPostIdentity('https://instagram.com/share/reel/AbC_123')).toBeNull()
  expect(creatorPostIdentity('https://tiktok.com.evil.test/@a/video/123')).toBeNull()
})
test('direct links do not depend on platform availability', async () => {
  globalThis.fetch = (() => { throw Error('Network should not be used') }) as unknown as typeof fetch
  expect(await resolveCreatorPostIdentity('https://tiktok.com/@a/video/123?x=1')).toBe('tiktok:123')
})
test('shared links resolve to the same identity as the full post URL', async () => {
  globalThis.fetch = (async () => new Response(null, { status: 302, headers: { location: 'https://www.tiktok.com/@a/video/123?x=1' } })) as unknown as typeof fetch
  expect(await resolveCreatorPostIdentity('https://vt.tiktok.com/AbC/')).toBe('tiktok:123')
})
test('redirects to external hosts, credentials, and private addresses are never fetched', async () => {
  for (const location of ['https://127.0.0.1/test', 'https://evil.test/@a/video/123', 'https://user@www.tiktok.com/test', 'https://www.tiktok.com:444/test', 'https://instagram.com/reel/123']) {
    let requests = 0
    globalThis.fetch = (async () => { requests++; return new Response(null, { status: 302, headers: { location } }) }) as unknown as typeof fetch
    await expect(resolveCreatorPostIdentity('https://vt.tiktok.com/AbC/')).rejects.toThrow('full TikTok or Instagram post URL')
    expect(requests).toBe(1)
  }
})
test('blocked shared links and redirect loops fail with an actionable message', async () => {
  globalThis.fetch = (async () => new Response(null, { status: 403 })) as unknown as typeof fetch
  await expect(resolveCreatorPostIdentity('https://instagram.com/share/reel/AbC')).rejects.toThrow('full TikTok or Instagram post URL')
  let requests = 0
  globalThis.fetch = (async () => { requests++; return new Response(null, { status: 302, headers: { location: 'https://vt.tiktok.com/AbC/' } }) }) as unknown as typeof fetch
  await expect(resolveCreatorPostIdentity('https://vt.tiktok.com/AbC/')).rejects.toThrow()
  expect(requests).toBe(6)
})

test('database duplicate conflicts return 409 without exposing query details', () => {
  expect(() => rethrowCreatorPostConflict({ cause: { code: '23505', constraint_name: 'creator_submissions_post_key_unique' } })).toThrow('Request a rereview')
  try { rethrowCreatorPostConflict({ code: '23505', constraint_name: 'creator_submissions_post_key_unique' }) }
  catch (error) { expect(error).toMatchObject({ status: 409 }) }
  const unrelated = new Error('unrelated')
  try { rethrowCreatorPostConflict(unrelated) } catch (error) { expect(error).toBe(unrelated) }
})
