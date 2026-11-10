import { beforeEach, expect, mock, test } from 'bun:test'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError } from '@/lib/api/http'
let allowed = false
const reconcile = mock(async (_reason: string, _actor: string) => ({ creators: [], version: '1.0' }))
const history = mock(async () => ({ entries: [], nextCursor: null }))
mock.module('@/lib/admin/creator-auth', () => ({ requireCreatorAdmin: async () => { if (!allowed) throw new ApiError(403, 'Admin access required'); return { email: 'admin@example.com' } } }))
mock.module('@/lib/admin/creator-score-service', () => ({ reconcileCreatorScores: reconcile, getCreatorScoreHistory: history }))
const { default: handler } = await import('../../pages/api/admin/creator/scores')
async function request(method = 'GET', query = {}) {
  let status = 0; let payload: any; const headers: Record<string, string> = {}
  const res = { status(value: number) { status = value; return this }, json(value: unknown) { payload = value; return this }, setHeader(key: string, value: string) { headers[key] = value } }
  await handler({ method, query } as NextApiRequest, res as unknown as NextApiResponse)
  return { status, payload, headers }
}
beforeEach(() => { allowed = false; reconcile.mockClear(); history.mockClear() })
test('rankings and history require unlocked admin access before database work', async () => {
  expect((await request()).status).toBe(403)
  expect((await request('GET', { creatorId: 'creator' })).status).toBe(403)
  expect(reconcile).not.toHaveBeenCalled(); expect(history).not.toHaveBeenCalled()
})
test('admin rankings are private and use authenticated refresh identity', async () => {
  allowed = true
  const result = await request()
  expect(result.status).toBe(200)
  expect(result.headers['Cache-Control']).toBe('private, no-store')
  expect(reconcile.mock.calls[0]?.[1]).toBe('admin@example.com')
})
test('validates history cursors and forbids mutations', async () => {
  allowed = true
  expect((await request('GET', { creatorId: ['a', 'b'] })).status).toBe(400)
  expect((await request('GET', { creatorId: 'creator', before: 'invalid' })).status).toBe(400)
  expect((await request('POST')).status).toBe(405)
  expect((await request('GET', { creatorId: 'creator' })).status).toBe(200)
  expect(history).toHaveBeenCalledTimes(1)
})
