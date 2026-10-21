import { beforeEach, expect, mock, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import * as schema from '@/lib/db/schema'

const id = '00000000-0000-4000-8000-000000000001'
let session: any
let profile: any
let account: any
let writes: any[]
let oauthCount: number | null
let token: string | null
const predicates: unknown[][] = []
const dialect = new PgDialect()
mock.module('@/lib/auth/session', () => ({
  getAuthSession: async () => session,
}))
mock.module('@/lib/creator/service', () => ({
  getCreatorTikTokAccessToken: async () => token,
}))
mock.module('@/lib/auth/tiktok-api', () => ({
  getTikTokUserInfo: async () => ({
    data: { user: { follower_count: oauthCount } },
  }),
}))
mock.module('@/lib/creator/tiktok-followers', () => ({
  resolveTikTokFollowers: async (_handle: string, range: string) => ({
    source: 'self_reported',
    range,
    checkedAt: new Date().toISOString(),
  }),
}))
mock.module('@/lib/db', () => ({
  schema,
  db: {
    query: {
      creatorProfiles: { findFirst: async () => profile },
      creatorSocialAccounts: {
        findFirst: async ({ where }: any) => {
          const params = dialect.sqlToQuery(where).params
          predicates.push(params)
          return account &&
            params.includes(account.creatorProfileId) &&
            params.includes(account.platform) &&
            params.includes(account.id)
            ? account
            : null
        },
      },
    },
    update: () => ({
      set: (values: any) => ({
        where: () => ({
          returning: async () => {
            writes.push(values)
            return [{ ...account, ...values }]
          },
        }),
      }),
    }),
  },
}))
const { default: handler } = await import(
  '../../pages/api/creator/accounts/[id]/tiktok-anchor'
)
async function patch(body: unknown, method = 'PATCH') {
  const res: any = {
    statusCode: 200,
    headers: {},
    setHeader(k: string, v: string) {
      this.headers[k] = v
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.payload = payload
      return this
    },
  }
  await handler({ method, query: { id }, body } as any, res)
  return res
}
beforeEach(() => {
  session = { user: { id: 'user' } }
  profile = { id: 'creator', authStatus: 'verified' }
  writes = []
  predicates.length = 0
  token = null
  oauthCount = null
  account = {
    id,
    creatorProfileId: 'creator',
    platform: 'tiktok',
    handle: 'example',
    followers: {
      source: 'public',
      count: 1000,
      checkedAt: new Date().toISOString(),
    },
  }
})
test('creator can confirm joining only their own eligible TikTok account', async () => {
  const result = await patch({ action: 'joined', confirmed: true })
  expect(result.statusCode).toBe(200)
  expect(result.headers['Cache-Control']).toBe('private, no-store')
  expect(writes[0].tiktokAnchorJoinedAt).toBeInstanceOf(Date)
  expect(predicates[0]).toEqual([id, 'creator', 'tiktok'])
})
test('Instagram and another creator’s account cannot be changed', async () => {
  for (const change of [
    { platform: 'instagram' },
    { creatorProfileId: 'other' },
  ]) {
    const original = account
    account = { ...account, ...change }
    expect(
      (await patch({ action: 'joined', confirmed: true })).statusCode
    ).toBe(404)
    account = original
  }
  expect(writes).toHaveLength(0)
})
test('under-1K and unknown accounts cannot confirm this requirement', async () => {
  for (const followers of [
    null,
    { source: 'public', count: 999 },
    { source: 'self_reported', range: 'under_1k' },
  ]) {
    account.followers = followers
    expect(
      (await patch({ action: 'joined', confirmed: true })).statusCode
    ).toBe(400)
  }
  expect(writes).toHaveLength(0)
})
test('unknown counts use a labeled range and available OAuth stats override a range', async () => {
  account.followers = null
  expect(
    (await patch({ action: 'followers', range: '1k_5k' })).statusCode
  ).toBe(200)
  expect(writes[0].followers).toMatchObject({
    source: 'self_reported',
    range: '1k_5k',
  })
  token = 'test-token'
  oauthCount = 13777
  await patch({ action: 'followers', range: 'under_1k' })
  expect(writes[1].followers).toMatchObject({ source: 'oauth', count: 13777 })
})
test('anonymous, suspended and invalid requests cannot write account state', async () => {
  session = null
  expect((await patch({ action: 'joined', confirmed: true })).statusCode).toBe(
    401
  )
  session = { user: { id: 'user' } }
  profile.authStatus = 'suspended'
  expect(
    (await patch({ action: 'followers', range: '10k_plus' })).statusCode
  ).toBe(403)
  profile.authStatus = 'verified'
  for (const body of [
    { action: 'joined', confirmed: false },
    { action: 'followers', range: '5k' },
    { action: 'admin' },
  ])
    expect((await patch(body)).statusCode).toBe(400)
  expect((await patch({}, 'POST')).statusCode).toBe(405)
  expect(writes).toHaveLength(0)
})
