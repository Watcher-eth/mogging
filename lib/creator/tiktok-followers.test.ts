import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import {
  fetchTikTokFollowers,
  parseTikTokFollowers,
  resolveTikTokFollowers,
} from './tiktok-followers'
const page = (uniqueId: string, followerCount: unknown) =>
  `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.user-detail': { userInfo: { user: { uniqueId }, statsV2: { followerCount } } } } })}</script>`
afterEach(() => mock.restore())

test('public count belongs to the requested account and handles numeric string stats', () => {
  expect(
    parseTikTokFollowers(page('Example', '13777'), 'example')
  ).toMatchObject({ source: 'public', count: 13777 })
  expect(parseTikTokFollowers(page('other', 10000), 'example')).toBeNull()
  for (const count of [-1, '1.2K', 'unknown', 1.5])
    expect(parseTikTokFollowers(page('example', count), 'example')).toBeNull()
  expect(parseTikTokFollowers('<html>captcha</html>', 'example')).toBeNull()
})
test('a successful fetch takes precedence over a self-reported range', async () => {
  const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(page('example', 13777))
  )
  expect(await resolveTikTokFollowers('example', 'under_1k')).toMatchObject({
    source: 'public',
    count: 13777,
  })
  expect(fetchSpy).toHaveBeenCalledWith(
    'https://www.tiktok.com/@example',
    expect.objectContaining({
      redirect: 'error',
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    })
  )
})
test('a blocked public lookup falls back to the declared range, never an invented count', async () => {
  const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('blocked', { status: 403 })
  )
  expect(await resolveTikTokFollowers('example', '1k_5k')).toMatchObject({
    source: 'self_reported',
    range: '1k_5k',
  })
  expect(await resolveTikTokFollowers('example')).toBeNull()
})
test('arbitrary hosts and invalid handles cannot trigger a public request', async () => {
  const fetchSpy = spyOn(globalThis, 'fetch')
  for (const handle of [
    null,
    '',
    'https://evil.example',
    '../../admin',
    'x?foo=1',
  ])
    expect(await fetchTikTokFollowers(handle)).toBeNull()
  expect(fetchSpy).not.toHaveBeenCalled()
})
