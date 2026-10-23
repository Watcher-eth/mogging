import { expect, mock, test } from 'bun:test'
import type { NextApiRequest, NextApiResponse } from 'next'

let signedIn = true
let resolutionFails = false
mock.module('@/lib/auth/session', () => ({ getAuthSession: async () => signedIn ? { user: { id: 'test-creator' } } : null }))
mock.module('@/lib/creator/post-identity', () => ({ resolveCreatorPostLink: async () => {
  if (resolutionFails) throw new Error('Platform unavailable')
  return { key: 'tiktok:123', url: 'https://www.tiktok.com/@creator/video/123' }
} }))
const { default: handler } = await import('../../pages/api/creator/post-embed')
async function request(method: string, url: string) {
  let status = 200, body: any
  const headers: Record<string, unknown> = {}
  const res = { setHeader: (key: string, value: unknown) => { headers[key] = value }, status: (value: number) => { status = value; return res }, json: (value: unknown) => { body = value; return res } }
  await handler({ method, query: { url } } as unknown as NextApiRequest, res as unknown as NextApiResponse)
  return { status, body, headers }
}
test('preview resolution requires authentication and a valid platform URL', async () => {
  signedIn = false
  expect((await request('GET', 'https://vm.tiktok.com/abc/')).status).toBe(401)
  signedIn = true
  expect((await request('GET', 'https://example.com/post')).status).toBe(400)
  expect((await request('POST', '')).status).toBe(405)
})
test('returns only the canonical native player and keeps the response private', async () => {
  const result = await request('GET', 'https://vm.tiktok.com/abc/')
  expect(result.status).toBe(200)
  expect(result.body.data.embedUrl).toBe('https://www.tiktok.com/player/v1/123')
  expect(result.headers['Cache-Control']).toBe('private, no-store')
})
test('unavailable shared posts provide a recoverable preview failure', async () => {
  resolutionFails = true
  expect((await request('GET', 'https://vm.tiktok.com/abc/')).status).toBe(400)
  resolutionFails = false
})
