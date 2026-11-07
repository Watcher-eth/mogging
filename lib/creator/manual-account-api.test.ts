import { beforeEach, expect, mock, test } from 'bun:test'
import { creatorSocialAccountSchema } from './validation'

mock.module('@/lib/reliability/monitor', () => ({ monitorBackend: (_name: string, handler: unknown) => handler }))

let session: { user: { id: string; email: string } } | null
const addAccount = mock(async (_userId: string, input: unknown) => ({ id: 'account', ...input as object }))
mock.module('@/lib/auth/session', () => ({ getAuthSession: async () => session }))
mock.module('@/lib/creator/service', () => ({
  addCreatorSocialAccount: addAccount,
  getOrCreateCreatorProfile: mock(),
  creatorSocialAccountSchema,
  getCreatorDashboard: mock(),
  getCreatorTikTokAccessToken: mock(),
  removeCreatorSocialAccount: mock(),
}))
const { default: handler } = await import('../../pages/api/creator/accounts')

async function connect(body: Record<string, unknown>) {
  const res: any = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this },
    json(payload: unknown) { this.payload = payload; return this },
    setHeader() {},
  }
  await handler({ method: 'POST', body, cookies: {}, headers: {} } as any, res)
  return res
}
const tiktok = { platform: 'tiktok', identity: '@creator' }
beforeEach(() => {
  session = { user: { id: 'creator-user', email: 'mohummadtaha12345@gmail.com' } }
  addAccount.mockClear()
})

test('creator can manually connect TikTok using the authenticated identity', async () => {
  const res = await connect({ ...tiktok, userId: 'spoofed' })
  expect(res.statusCode).toBe(201)
  expect(addAccount).toHaveBeenCalledWith('creator-user', { platform: 'tiktok', handle: 'creator' })
})

test('manual TikTok is available to other signed-in creators', async () => {
  session!.user.email = 'other@gmail.com'
  const res = await connect({ ...tiktok, email: 'mohummadtaha12345@gmail.com', manualTikTokAllowed: true })
  expect(res.statusCode).toBe(201)
  expect(addAccount).toHaveBeenCalledWith('creator-user', { platform: 'tiktok', handle: 'creator' })
})

test('anonymous users cannot connect accounts', async () => {
  session = null
  expect((await connect(tiktok)).statusCode).toBe(401)
  expect(addAccount).not.toHaveBeenCalled()
})

test('manual TikTok rejects unsafe and mismatched profile URLs', async () => {
  for (const identity of ['https://instagram.com/creator', 'https://www.tiktok.com/@other/video/123', 'https://example.com/@creator']) {
    expect((await connect({ ...tiktok, identity })).statusCode).toBe(400)
  }
  expect(addAccount).not.toHaveBeenCalled()
})

test('Instagram manual connection remains available to other creators', async () => {
  session!.user.email = 'other@gmail.com'
  expect((await connect({ platform: 'instagram', identity: 'creator' })).statusCode).toBe(201)
  expect(addAccount).toHaveBeenCalledTimes(1)
})

test('pending TikTok approval hides OAuth and blocks consent redirects', async () => {
  const previous = process.env.TIKTOK_CREATOR_VIDEO_SCOPE_ENABLED
  process.env.TIKTOK_CREATOR_VIDEO_SCOPE_ENABLED = 'false'
  try {
    const { default: oauth } = await import('../../pages/api/creator/oauth/tiktok/start')
    for (const method of ['GET','POST']) {
      const headers: Record<string, unknown> = {}
      const res: any = { statusCode: 200,
        status(code: number) { this.statusCode = code; return this },
        json(payload: unknown) { this.payload = payload; return this },
        setHeader(name: string, value: unknown) { headers[name] = value },
      }
      await oauth({ method, body: {}, headers: {}, cookies: {} } as any, res)
      expect(res.statusCode).toBe(method === 'GET' ? 200 : 410)
      if (method === 'GET') expect(res.payload.data.available).toBe(false)
      expect(headers['Set-Cookie']).toBeUndefined()
      expect(headers.Location).toBeUndefined()
    }
  } finally {
    if (previous === undefined) delete process.env.TIKTOK_CREATOR_VIDEO_SCOPE_ENABLED
    else process.env.TIKTOK_CREATOR_VIDEO_SCOPE_ENABLED = previous
  }
})
