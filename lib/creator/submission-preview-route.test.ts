import { expect, mock, test } from 'bun:test'
let userId: string | null = null
let owned = false
let providerCalls = 0
mock.module('@/lib/auth/session', () => ({ getAuthSession: async () => userId ? { user: { id: userId } } : null }))
mock.module('@/lib/creator/service', () => ({ getSubmissionForCreator: async (user: string, id: string) => owned && user === 'owner' && id === 'post' ? { postUrl: 'https://www.tiktok.com/@creator/video/123' } : null }))
mock.module('@/lib/creator/post-preview', () => ({ emptyPostPreview: {thumbnailUrl:null,caption:null,authorName:null,width:null,height:null,viewCount:null,fetchedAt:null}, getCreatorPostPreview: async () => { providerCalls++; return { thumbnailUrl: 'https://p16.tiktokcdn.com/post.jpg', caption: 'Actual post', viewCount: 42300 } } }))
mock.module('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
const { default: handler } = await import('@/pages/api/creator/submissions/[id]/preview')

async function request(method = 'GET') {
  const result = { status: 0, body: null as any, headers: {} as Record<string, string> }
  const res = { setHeader: (key: string, value: string) => { result.headers[key] = value }, status: (status: number) => { result.status = status; return res }, json: (body: any) => { result.body = body; return res } }
  await handler({ method, query: { id: 'post' } } as any, res as any)
  return result
}

test('post previews require a session and ownership before fetching any metadata', async () => {
  userId = null; owned = false
  expect((await request()).status).toBe(401)
  userId = 'another-creator'
  expect((await request()).status).toBe(404)
  expect(providerCalls).toBe(0)
  userId = 'owner'; owned = true
  const result = await request()
  expect(result.status).toBe(200)
  expect(result.headers['Cache-Control']).toBe('private, no-store')
  expect(providerCalls).toBe(1)
  expect((await request('POST')).status).toBe(405)
})
