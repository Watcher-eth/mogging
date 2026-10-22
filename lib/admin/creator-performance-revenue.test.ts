import { beforeEach, expect, mock, test } from 'bun:test'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError } from '@/lib/api/http'

let allowed = true
const calls: string[][] = []
mock.module('@/lib/admin/creator-auth', () => ({ requireCreatorAdmin: async () => { if (!allowed) throw new ApiError(401,'Authentication required') } }))
mock.module('@/lib/admin/creator-performance-revenue', () => ({ getPerformanceRevenue: async (...args: string[]) => { calls.push(args); return { daily: [], otherCurrencies: [] } } }))
const { default: handler } = await import('@/pages/api/admin/creator/performance-revenue')
async function request(query: Record<string, string> = { start: '2026-10-01', end: '2026-10-21', platform: 'all' }) {
  let status = 0, body: unknown
  const response = { setHeader() {}, status(value: number) { status = value; return this }, json(value: unknown) { body = value; return this } } as unknown as NextApiResponse
  await handler({ method: 'GET', query } as NextApiRequest, response)
  return { status, body }
}
beforeEach(() => { allowed = true; calls.length = 0 })
test('revenue is never read without admin authentication', async () => {
  allowed = false
  expect((await request()).status).toBe(401)
  expect(calls).toHaveLength(0)
})
test('date and platform filters are validated before querying billing data', async () => {
  for (const query of [
    { start: '2026-02-30', end: '2026-10-21', platform: 'all' },
    { start: '2026-10-22', end: '2026-10-21', platform: 'all' },
    { start: '2026-10-01', end: '2026-10-21', platform: 'unknown' },
  ]) expect((await request(query)).status).toBe(400)
  expect(calls).toHaveLength(0)
})
test('authenticated requests retain dates and social platform exactly', async () => {
  expect((await request({ start: '2026-10-01', end: '2026-10-21', platform: 'instagram' })).status).toBe(200)
  expect(calls).toEqual([['2026-10-01','2026-10-21','instagram']])
})
