import { expect, mock, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

let viewer: string | null = null
const filters: SQL[] = []
mock.module('@/lib/auth/mobile-session', () => ({ getRequestUserId: async () => viewer }))
mock.module('@/lib/db', async () => {
  const schema = await import('../db/schema')
  return { schema, db: { select: (selection: Record<string, unknown>) => {
    const result = 'total' in selection ? [{ total: 0 }] : []
    const query: any = {
      from: () => query, leftJoin: () => query, orderBy: () => query,
      limit: () => query, offset: () => query,
      where: (filter: SQL) => { filters.push(filter); return query },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }
    return query
  } } }
})
const { default: handler } = await import('../../pages/api/leaderboard/friends')
async function call(method = 'GET', query: Record<string, string> = {}) {
  filters.length = 0
  const result = { status: 0, body: null as any, headers: {} as Record<string, string> }
  const res: any = { setHeader: (key: string, value: string) => { result.headers[key] = value }, status: (code: number) => { result.status = code; return res }, json: (body: unknown) => { result.body = body; return res } }
  await handler({ method, query } as any, res)
  return result
}
test('friends requires authentication and never accepts another viewer from query input', async () => {
  viewer = null
  expect((await call()).status).toBe(401)
  expect(filters.length).toBe(0)
  viewer = 'signed-in-user'
  const response = await call('GET', { userId: 'someone-else', photoType: 'face' })
  expect(response.status).toBe(200)
  expect(response.headers['Cache-Control']).toBe('private, no-store')
  expect(response.body.data.items).toEqual([])
  expect(filters.length).toBe(2)
  for (const filter of filters) {
    const compiled = new PgDialect().sqlToQuery(filter)
    expect(compiled.sql).toContain('"is_public"')
    expect(compiled.params).toContain(true)
    expect(compiled.sql).toContain('referral_signups')
    expect(compiled.params).toContain('signed-in-user')
    expect(compiled.params).not.toContain('someone-else')
  }
})
test('friends rejects writes and invalid pagination', async () => {
  expect((await call('POST')).status).toBe(405)
  expect((await call('GET', { page: '0' })).status).toBe(400)
  expect(filters.length).toBe(0)
})
