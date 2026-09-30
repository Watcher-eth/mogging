import { beforeEach, expect, mock, test } from 'bun:test'
import { creatorSocialAccountSchema, creatorAccountAnalyticsSubmissionSchema } from './validation'

let session: { user: { id: string; email: string } } | null
const addAccount = mock(async (_userId: string, input: unknown) => ({ id: 'account', ...input as object }))
mock.module('@/lib/auth/session', () => ({ getAuthSession: async () => session }))
mock.module('@/lib/creator/service', () => ({
  addCreatorSocialAccount: addAccount,
  creatorSocialAccountSchema,
  creatorAccountAnalyticsSubmissionSchema,
  getCreatorDashboard: mock(),
  getCreatorTikTokAccessToken: mock(),
  removeCreatorSocialAccount: mock(),
  submitCreatorAccountAnalyticsEvidence: mock(),
}))
const { default: handler } = await import('../../pages/api/creator/accounts')

async function connect(body: Record<string, unknown>) {
  const res: any = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this },
    json(payload: unknown) { this.payload = payload; return this },
    setHeader() {},
  }
  await handler({ method: 'POST', body } as any, res)
  return res
}
const tiktok = { platform: 'tiktok', handle: '@creator', profileUrl: 'https://www.tiktok.com/@creator' }
beforeEach(() => {
  session = { user: { id: 'creator-user', email: 'mohummadtaha12345@gmail.com' } }
  addAccount.mockClear()
})

test('approved creator can manually connect TikTok using the authenticated identity', async () => {
  const res = await connect({ ...tiktok, userId: 'spoofed' })
  expect(res.statusCode).toBe(201)
  expect(addAccount).toHaveBeenCalledWith('creator-user', { ...tiktok, handle: 'creator' })
})

test('other creators cannot gain manual TikTok access through request fields', async () => {
  session!.user.email = 'other@gmail.com'
  const res = await connect({ ...tiktok, email: 'mohummadtaha12345@gmail.com', manualTikTokAllowed: true })
  expect(res.statusCode).toBe(403)
  expect(addAccount).not.toHaveBeenCalled()
})

test('anonymous users cannot connect accounts', async () => {
  session = null
  expect((await connect(tiktok)).statusCode).toBe(401)
  expect(addAccount).not.toHaveBeenCalled()
})

test('manual TikTok requires a matching HTTPS profile URL', async () => {
  for (const profileUrl of ['', null, 'https://www.tiktok.com/@other', 'https://example.com/@creator']) {
    expect((await connect({ ...tiktok, profileUrl })).statusCode).toBe(400)
  }
  expect(addAccount).not.toHaveBeenCalled()
})

test('Instagram manual connection remains available to other creators', async () => {
  session!.user.email = 'other@gmail.com'
  expect((await connect({ platform: 'instagram', handle: 'creator', profileUrl: null })).statusCode).toBe(201)
  expect(addAccount).toHaveBeenCalledTimes(1)
})
