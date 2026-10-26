import { beforeEach, expect, mock, test } from 'bun:test'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError } from '@/lib/api/http'

let allowed = false
let writes = 0
const addWarning = mock(async (_input: unknown, email: string) => { writes++; return { id: 'warning', createdByEmail: email } })
const resolveWarning = mock(async (_input: unknown, email: string) => { writes++; return { id: 'warning', resolvedByEmail: email } })
mock.module('@/lib/admin/creator-auth', () => ({ requireCreatorAdmin: async () => {
  if (!allowed) throw new ApiError(403, 'Admin access required')
  return { email: 'admin@example.com' }
} }))
const { z } = await import('zod')
mock.module('@/lib/admin/creator-warnings', () => ({
  addCreatorInternalWarning: addWarning,
  resolveCreatorInternalWarning: resolveWarning,
  addCreatorWarningSchema: z.object({ creatorProfileId: z.string().min(1), note: z.string().trim().min(3).max(1000) }),
  resolveCreatorWarningSchema: z.object({ id: z.string().min(1) }),
}))
const { default: handler } = await import('../../pages/api/admin/creator/warnings')

async function request(method: string, body: unknown) {
  let status = 0
  let payload: any
  const res = { status(value: number) { status = value; return this }, json(value: unknown) { payload = value; return this }, setHeader() {} }
  await handler({ method, body } as NextApiRequest, res as unknown as NextApiResponse)
  return { status, payload }
}
beforeEach(() => { allowed = false; writes = 0 })

test('creator or locked-out requests cannot create, resolve, or read internal warnings', async () => {
  for (const method of ['POST', 'PATCH', 'GET']) {
    expect((await request(method, { creatorProfileId: 'creator', note: 'Verify evidence', id: 'warning' })).status).toBe(403)
  }
  expect(writes).toBe(0)
})

test('authorized mutations use the authenticated admin rather than a supplied identity', async () => {
  allowed = true
  const added = await request('POST', { creatorProfileId: 'creator', note: 'Verify evidence', createdByEmail: 'spoof@example.com' })
  expect(added.status).toBe(201)
  expect(added.payload.data.warning.createdByEmail).toBe('admin@example.com')
  const resolved = await request('PATCH', { id: 'warning', resolvedByEmail: 'spoof@example.com' })
  expect(resolved.status).toBe(200)
  expect(resolved.payload.data.warning.resolvedByEmail).toBe('admin@example.com')
  expect(writes).toBe(2)
})

test('invalid warnings are rejected without a write', async () => {
  allowed = true
  expect((await request('POST', { creatorProfileId: 'creator', note: ' ' })).status).toBe(400)
  expect(writes).toBe(0)
})
