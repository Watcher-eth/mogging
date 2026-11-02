import { beforeEach, expect, mock, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from '@/lib/creator/campaign-launch'

const dialect = new PgDialect()
const rows = new Map<string, Record<string, unknown>>()
let awarded = false
const refreshed: string[] = []
function idFrom(where: SQL) { return String(dialect.sqlToQuery(where).params[0]) }
const transaction = {
  query: { creatorSubmissions: { findFirst: async ({ where }: { where: SQL }) => rows.get(idFrom(where)) } },
  select: () => ({ from: () => ({ where: () => ({ for: async () => [], limit: async () => awarded ? [{ id: 'award' }] : [] }) }) }),
  update: (table: unknown) => {
    expect(table).toBe(schema.creatorSubmissions)
    return { set: (values: Record<string, unknown>) => ({ where: (where: SQL) => ({ returning: async () => {
      const id = idFrom(where)
      const row = { ...rows.get(id), ...values }
      rows.set(id, row)
      return [row]
    } }) }) }
  },
}
mock.module('@/lib/db', () => ({ schema, db: { transaction: async (fn: (tx: typeof transaction) => unknown) => fn(transaction) } }))
mock.module('@/lib/creator/bonus-service', () => ({ refreshCreatorBonuses: async (id: string) => { refreshed.push(id) } }))
const { reviewCreatorResource } = await import('./creator-service')

beforeEach(() => {
  rows.clear(); refreshed.length = 0; awarded = false
  for (const id of ['one', 'two']) rows.set(id, { id, creatorProfileId: 'creator', socialAccountId: 'account', isDraft: false, exclusivityConfirmed: false, sprintId: 'launch', sprintTerms: launchCampaignTerms(LAUNCH_CAMPAIGNS[0]), createdAt: new Date('2026-10-25T12:00:00Z') })
})

test('admin saves and reverses verification on only the selected video', async () => {
  await reviewCreatorResource({ resource: 'exclusivity', id: 'one', confirmed: true }, 'admin')
  expect(rows.get('one')?.exclusivityConfirmed).toBe(true)
  expect(rows.get('two')?.exclusivityConfirmed).toBe(false)
  expect(refreshed).toEqual(['creator'])
  await reviewCreatorResource({ resource: 'exclusivity', id: 'one', confirmed: false }, 'admin')
  expect(rows.get('one')?.exclusivityConfirmed).toBe(false)
  expect(rows.get('two')?.exclusivityConfirmed).toBe(false)
})

test('awarded periods cannot have their evidence silently revoked', async () => {
  rows.get('one')!.exclusivityConfirmed = true
  awarded = true
  await expect(reviewCreatorResource({ resource: 'exclusivity', id: 'one', confirmed: false })).rejects.toThrow('Resolve those payments')
  expect(rows.get('one')?.exclusivityConfirmed).toBe(true)
})

test('draft and legacy videos cannot receive verification', async () => {
  rows.get('one')!.isDraft = true
  await expect(reviewCreatorResource({ resource: 'exclusivity', id: 'one', confirmed: true })).rejects.toThrow('Submitted post not found')
  rows.get('two')!.sprintTerms = null
  await expect(reviewCreatorResource({ resource: 'exclusivity', id: 'two', confirmed: true })).rejects.toThrow('only available for new campaign submissions')
  expect(rows.get('two')?.exclusivityConfirmed).toBe(false)
})
