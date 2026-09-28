import { beforeEach, expect, mock, test } from 'bun:test'

let session: any
const register = mock(async (_userId: string) => ({ id: 'creator' }))
const dashboard = mock(async () => ({ profile: null, socialAccounts: [] }))
mock.module('@/lib/auth/session', () => ({ getAuthSession: async () => session }))
mock.module('@/lib/creator/service', () => ({
  getOrCreateCreatorProfile: register,
  getCreatorDashboard: dashboard,
  saveCreatorProfile: mock(),
  creatorProfileSchema: {},
}))
const { default: handler } = await import('../../pages/api/creator/index')

async function request(method: string, body = {}) {
  const res: any = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this },
    json(payload: unknown) { this.payload = payload; return this },
    setHeader() {},
  }
  await handler({ method, body } as any, res)
  return res
}

beforeEach(() => {
  session = { user: { id: 'signed-in-user' } }
  register.mockClear()
  dashboard.mockClear()
})

test('registration uses the authenticated user, never a supplied identity', async () => {
  const res = await request('POST', { userId: 'someone-else' })
  expect(res.statusCode).toBe(200)
  expect(register).toHaveBeenCalledWith('signed-in-user')
  expect(res.payload).toEqual({ data: { registered: true } })
})

test('anonymous visits cannot register', async () => {
  session = null
  expect((await request('POST')).statusCode).toBe(401)
  expect(register).not.toHaveBeenCalled()
})

test('dashboard reads do not register users', async () => {
  expect((await request('GET')).statusCode).toBe(200)
  expect(register).not.toHaveBeenCalled()
  expect(dashboard).toHaveBeenCalledTimes(1)
})

test('unsupported methods do not register users', async () => {
  expect((await request('DELETE')).statusCode).toBe(405)
  expect(register).not.toHaveBeenCalled()
})
