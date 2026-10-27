import { describe, expect, mock, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import * as schema from '@/lib/db/schema'
const dialect = new PgDialect()
const queries: Array<{ params: unknown[]; sql: string; columns: string[] }> = []
let suspended = false
const profileQueries: unknown[] = []
mock.module('@/lib/db', () => ({ schema, db: {
  query: {
    creatorProfiles: { findFirst: async (options: { where: Parameters<typeof dialect.sqlToQuery>[0] }) => { profileQueries.push(dialect.sqlToQuery(options.where).params); return { id: 'owner-profile', authStatus: suspended ? 'suspended' : 'verified' } } },
    creatorReferralLinks: { findFirst: async (options: { where: Parameters<typeof dialect.sqlToQuery>[0] }) => { queries.push({ ...dialect.sqlToQuery(options.where), columns: ['code'] }); return null } },
  },
  select: (columns: Record<string, unknown>) => {
    const query = {
      from: () => query, innerJoin: () => query,
      where: (where: Parameters<typeof dialect.sqlToQuery>[0]) => { queries.push({ ...dialect.sqlToQuery(where), columns: Object.keys(columns) }); return query },
      orderBy: () => query, limit: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(Object.keys(columns).join() === 'value' ? [{ value: 0 }] : []).then(resolve),
    }; return query
  },
} }))
mock.module('@/lib/creator/conversion-service', () => ({ getCreatorConversionReport: async (userId: string) => { expect(userId).toBe('signed-in-user'); return { daily: [], videos: [], totals:{linkPresses:0,downloads:0,conversions:0,revenueCents:0},unassigned:{linkPresses:0,downloads:0,conversions:0,revenueCents:0},bonusesAvailable:false } } }))
const { createSupportDataSource } = await import('./data')
describe('database ownership boundary', () => {
  test('binds the profile to the session user and every private record to that profile', async () => {
    const source = await createSupportDataSource('signed-in-user')
    expect(profileQueries.at(-1)).toEqual(['signed-in-user'])
    queries.length = 0
    await source.submissions({ id: 'victim-record' })
    expect(queries.length).toBe(2)
    for (const query of queries) { expect(query.params).toContain('owner-profile'); expect(query.params).toContain('victim-record'); expect(query.sql).toContain(' and ') }
    expect(queries[0].columns).not.toContain('videoStorageKey')
    queries.length = 0; await source.bonuses(); await source.payments(); await source.referrals()
    for (const query of queries) expect(query.params).toContain('owner-profile')
    for (const query of queries) { expect(query.columns).not.toContain('providerReference'); expect(query.columns).not.toContain('paypalEmail') }
    await source.analytics(7)
    await source.videoAnalytics({ period:'this-week' })
  })
  test('per-submission payment entries and full aggregates remain owner scoped', async () => {
    const source = await createSupportDataSource('signed-in-user'); queries.length = 0
    await source.payments('victim-record')
    expect(queries.length).toBe(3)
    for (const query of queries) { expect(query.params).toContain('owner-profile'); expect(query.params).toContain('victim-record') }
    expect(queries.at(-1)?.columns).toContain('paidContentCents')
    expect(queries.at(-1)?.sql).toContain('split_part')
  })
  test('review history and latest approval are both joined through the owner', async () => {
    const source = await createSupportDataSource('signed-in-user'); queries.length = 0
    await source.history('victim-record')
    expect(queries).toHaveLength(2)
    for (const query of queries) { expect(query.params).toContain('owner-profile'); expect(query.params).toContain('victim-record'); expect(query.columns).toContain('snapshot') }
  })
  test('overview queries every status instead of summarizing only recent posts', async () => {
    const source = await createSupportDataSource('signed-in-user'); queries.length = 0
    const overview = await source.overview()
    expect(overview.groups).toHaveLength(3)
    for (const status of ['pending', 'in_review', 'approved', 'paid', 'rejected']) expect(queries.some(q => q.params.includes(status) && q.params.includes('owner-profile'))).toBe(true)
  })
  test('campaign access always excludes drafts', async () => {
    const source = await createSupportDataSource('signed-in-user'); queries.length = 0
    await source.campaigns('draft-id')
    expect(queries[0].params).toEqual(['published', 'ended', 'draft-id'])
  })
  test('suspended creators cannot acquire a data source', async () => {
    suspended = true
    await expect(createSupportDataSource('signed-in-user')).rejects.toThrow('Creator access required')
    suspended = false
  })
})
