import { beforeAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'

const databaseUrl = process.env.MOBILE_WEB_TEST_DATABASE_URL
const enabled = Boolean(databaseUrl && ['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname))

describe.skipIf(!enabled)('mobile website sign-in on isolated Postgres', () => {
  let db: typeof import('@/lib/db').db
  let schema: typeof import('@/lib/db').schema
  let sessions: typeof import('./mobile-web-session')
  let eq: typeof import('drizzle-orm').eq
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.NEXTAUTH_SECRET = 'isolated-mobile-web-session-test-secret'
    ;({ db, schema } = await import('@/lib/db'))
    ;({ eq } = await import('drizzle-orm'))
    sessions = await import('./mobile-web-session')
  })

  test('a hashed ticket signs into its owner once, including concurrent consumption', async () => {
    const id = randomUUID()
    await db.insert(schema.users).values({ id, email: `${id}@test.invalid` })
    const code = await sessions.createMobileWebSession(id)
    const tickets = await db.query.verificationTokens.findMany({ where: eq(schema.verificationTokens.identifier, `mobile-web-session:${id}`) })
    expect(tickets[0].token).not.toBe(code)
    const attempts = await Promise.allSettled([sessions.consumeMobileWebSession(code), sessions.consumeMobileWebSession(code)])
    expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1)
    const success = attempts.find(attempt => attempt.status === 'fulfilled') as PromiseFulfilledResult<{ token: string }>
    const { decode } = await import('next-auth/jwt')
    expect(await decode({ secret: process.env.NEXTAUTH_SECRET!, token: success.value.token })).toMatchObject({ id, sub: id })
    await expect(sessions.consumeMobileWebSession(code)).rejects.toMatchObject({ status: 401 })
  })

  test('expired links and claimed guest accounts cannot create browser sessions', async () => {
    const id = randomUUID()
    await db.insert(schema.users).values({ id, email: `${id}@test.invalid` })
    const expired = await sessions.createMobileWebSession(id)
    await db.update(schema.verificationTokens).set({ expires: new Date(0) }).where(eq(schema.verificationTokens.identifier, `mobile-web-session:${id}`))
    await expect(sessions.consumeMobileWebSession(expired)).rejects.toMatchObject({ status: 401 })
    const code = await sessions.createMobileWebSession(id)
    await db.insert(schema.mobileGuests).values({ userId: id, claimedByUserId: id })
    await expect(sessions.consumeMobileWebSession(code)).rejects.toMatchObject({ status: 401 })
  })

  test('web and older clients receive saved reports even behind a full page of new 3D scans', async () => {
    const userId = randomUUID(), token = randomUUID()
    await db.insert(schema.users).values({ id: userId, email: `${userId}@test.invalid` })
    await db.insert(schema.sessions).values({ userId, sessionToken: token, expires: new Date(Date.now() + 60_000) })
    const records = Array.from({ length: 52 }, (_, index) => ({ photoId: randomUUID(),
      metrics: index === 51 ? {} : { presentation: index === 50 ? 'face-study' : 'face-model' },
      createdAt: new Date(Date.now() - index * 1000),
    }))
    await db.insert(schema.photos).values(records.map(record => ({
      id: record.photoId, userId, imageUrl: '/test.jpg', imageHash: randomUUID(),
    })))
    await db.insert(schema.analyses).values(records)
    const { handler } = await import('../../pages/api/mobile/reports')
    async function history(query: Record<string, string>) {
      let body: any
      const response: any = { setHeader() {}, status() { return response }, json(value: unknown) { body = value } }
      await handler({ method: 'GET', headers: { authorization: `Bearer ${token}` }, query } as any, response)
      return body.data
    }
    const legacy = await history({})
    expect(legacy.reports.map((report: any) => report.photo.id)).toEqual([records[51].photoId])
    expect(legacy.next).toBeNull()
    const modern = await history({ includeFaceStudies: '1' })
    expect(modern.reports).toHaveLength(50)
    expect(modern.next).toBeString()
  })
})
