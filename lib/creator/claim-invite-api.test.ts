import { beforeEach, expect, mock, test } from 'bun:test'
let session: { user: { id: string } } | null
const claim = mock(async (_token: string, _userId: string) => ({ destination: '/creator/setup?step=payout' }))
mock.module('@/lib/auth/session', () => ({ getAuthSession: async () => session }))
mock.module('@/lib/creator/invites', () => ({ claimCreatorInvite: claim }))
mock.module('@/lib/env', () => ({ env: { NEXTAUTH_URL: 'https://www.mogging.com' } }))
const { default: handler } = await import('../../pages/api/creator/claim-invite')
const token = 'a'.repeat(64)

async function request(method = 'POST', body: unknown = { token }, origin = 'https://www.mogging.com') {
  const res: any = { statusCode: 200, setHeader() {}, status(code: number) { this.statusCode = code; return this }, json(payload: unknown) { this.payload = payload; return this } }
  await handler({ method, body, headers: { origin } } as any, res)
  return res
}
beforeEach(() => { session = { user: { id: 'session-user' } }; claim.mockClear() })

test('claims only for the authenticated identity', async () => {
  expect((await request('POST', { token, userId: 'spoofed-user' })).statusCode).toBe(200)
  expect(claim).toHaveBeenCalledWith(token, 'session-user')
})
test('link crawlers and anonymous users cannot claim', async () => {
  expect((await request('GET')).statusCode).toBe(405)
  session = null
  expect((await request()).statusCode).toBe(401)
  expect(claim).not.toHaveBeenCalled()
})
test('rejects foreign origins and malformed tokens', async () => {
  expect((await request('POST', { token }, 'https://evil.test')).statusCode).toBe(403)
  expect((await request('POST', { token: 'short' })).statusCode).toBe(400)
  expect(claim).not.toHaveBeenCalled()
})
