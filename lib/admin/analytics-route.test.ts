import { expect, mock, test } from 'bun:test'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError } from '@/lib/api/http'

let authorized = false
let cacheReads = 0
mock.module('@/lib/admin/creator-auth', () => ({
  requireCreatorAdmin: async () => { if (!authorized) throw new ApiError(401, 'Authentication required') },
}))
mock.module('@/lib/api/rateLimit', () => ({ enforceRateLimit: async () => {} }))
mock.module('next/cache', () => ({
  unstable_cache: (_load: unknown, _key: string[], options: { revalidate: number }) => {
    expect(options.revalidate).toBe(60)
    return async (filters: unknown) => { cacheReads++; return { filters } }
  },
}))
const { default: handler } = await import('@/pages/api/admin/analytics')

async function request(query: Record<string, string> = {}, method = 'GET') {
  const result = { status: 0, body: null as any, headers: {} as Record<string, string> }
  const response = {
    setHeader: (key: string, value: string) => { result.headers[key] = value },
    status: (value: number) => { result.status = value; return response },
    json: (value: unknown) => { result.body = value; return response },
  }
  await handler({ method, query } as NextApiRequest, response as unknown as NextApiResponse)
  return result
}

test('cached analytics remain admin-only, private, and validated on every request', async () => {
  expect((await request()).status).toBe(401)
  expect(cacheReads).toBe(0)
  authorized = true
  const result = await request({ section: 'Revenue' })
  expect(result.status).toBe(200)
  expect(result.body.data.filters).toEqual({ days: '7', platform: 'all', section: 'Revenue' })
  expect(result.headers['Cache-Control']).toBe('private, no-store')
  expect((await request({ section: 'unsupported' })).status).toBe(400)
  expect((await request({}, 'POST')).status).toBe(405)
  authorized = false
  expect((await request({ section: 'Revenue' })).status).toBe(401)
  expect(cacheReads).toBe(1)
})
