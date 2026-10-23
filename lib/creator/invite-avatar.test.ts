import { afterEach, expect, mock, test } from 'bun:test'

let stored: Array<{ key: string; data: Buffer; type: string }> = []
mock.module('@/lib/env', () => ({ env: { R2_PUBLIC_BASE_URL: 'https://media.example' } }))
mock.module('@/lib/storage/videos', () => ({
  creatorAssetPublicUrl: (key: string) => `https://media.example/${key}`,
  storeCreatorAsset: async (key: string, data: Buffer, type: string) => { stored.push({ key, data, type }) },
}))
const { parseCreatorAvatar, resolveCreatorAvatar, preserveCreatorAvatar } = await import('./invite-avatar')
const original = globalThis.fetch
const photo = 'https://p16.tiktokcdn.com/photo.jpeg'
afterEach(() => { globalThis.fetch = original; stored = [] })

test('chooses the exact TikTok identity, never a suggested account photo', () => {
  const payload = { users: [{ uniqueId: 'another', avatarLarger: 'https://p16.tiktokcdn.com/other.jpg' }, { uniqueId: 'Alice', avatarLarger: photo }] }
  expect(parseCreatorAvatar(payload, 'tiktok', 'alice')).toBe(photo)
  expect(parseCreatorAvatar(payload, 'tiktok', 'missing')).toBeNull()
})
test('Instagram profile JSON and canonical JSON-LD must match the handle', () => {
  const image = 'https://scontent.cdninstagram.com/alice.jpg'
  expect(parseCreatorAvatar({ data: { user: { username: 'alice', profile_pic_url_hd: image } } }, 'instagram', 'alice')).toBe(image)
  expect(parseCreatorAvatar({ '@type': 'Person', url: 'https://www.instagram.com/alice/', image }, 'instagram', 'alice')).toBe(image)
  expect(parseCreatorAvatar({ '@type': 'Person', url: 'https://www.instagram.com/other/', image }, 'instagram', 'alice')).toBeNull()
})
test('rejects foreign hosts, deceptive suffixes and non-image URLs', () => {
  for (const avatarLarger of ['https://tiktokcdn.com.evil.test/a.jpg', 'http://p16.tiktokcdn.com/a.jpg', 'https://127.0.0.1/a.jpg', 'https://p16.tiktokcdn.com:444/a.jpg']) expect(parseCreatorAvatar({ uniqueId: 'alice', avatarLarger }, 'tiktok', 'alice')).toBeNull()
})
test('fetches canonical provider URL without following redirects', async () => {
  globalThis.fetch = mock(async (url: string | URL | Request, options?: RequestInit) => {
    expect(String(url)).toBe('https://www.tiktok.com/@alice')
    expect(options?.redirect).toBe('error')
    return new Response(`<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ user: { uniqueId: 'alice', avatarLarger: photo } })}</script>`)
  }) as unknown as typeof fetch
  expect(await resolveCreatorAvatar('tiktok', 'alice')).toBe(photo)
})
test('provider challenges and malformed data safely return no photo', async () => {
  globalThis.fetch = mock(async () => new Response('Rate limited', { status: 429 })) as unknown as typeof fetch
  expect(await resolveCreatorAvatar('instagram', 'alice')).toBeNull()
  globalThis.fetch = mock(async () => new Response('<script type="application/json">not json</script>')) as unknown as typeof fetch
  expect(await resolveCreatorAvatar('instagram', 'alice')).toBeNull()
})
test('persists provider bytes under our avatar namespace', async () => {
  globalThis.fetch = mock(async () => new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch
  const url = await preserveCreatorAvatar(photo)
  expect(url).toStartWith('https://media.example/creator/avatars/')
  expect(stored).toHaveLength(1)
  expect(stored[0].type).toBe('image/jpeg')
  expect(stored[0].data.byteLength).toBe(4)
})
test('non-image responses are never stored as a profile photo', async () => {
  globalThis.fetch = mock(async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch
  expect(await preserveCreatorAvatar(photo)).toBe(photo)
  expect(stored).toHaveLength(0)
})
