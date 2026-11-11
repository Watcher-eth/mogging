import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'

let creatorExists = true
let warningExists = true
let inserted: Record<string, unknown> | undefined
let resolved: Record<string, unknown> | undefined
let active: Array<{ category: string; submissionId: string | null }> = []
let submissionExists = true
const reconcile = mock(async () => ({}))
mock.module('./creator-score-service', () => ({ reconcileCreatorScoresInTransaction: reconcile }))
const tx = {
  execute: async () => [],
  select: () => ({ from: () => ({ where: () => ({ for: async () => creatorExists ? [{ id: 'creator' }] : [], then: (resolve: (value: unknown) => void) => resolve(active) }) }) }),
  query: { creatorSubmissions: { findFirst: async () => submissionExists ? { id: 'submission' } : undefined } },
  insert: () => ({ values: (values: Record<string, unknown>[]) => {
    inserted = values[0]
    return { returning: async () => values.map(value => ({ id: 'warning', ...value })) }
  } }),
  update: () => ({ set: (values: Record<string, unknown>) => ({ where: () => ({ returning: async () => {
    resolved = values
    return warningExists ? [{ id: 'warning', category: 'views_mismatch', ...values }] : []
  } }) }) }),
}
mock.module('@/lib/db', () => ({ schema, db: { ...tx, transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } }))
const { addCreatorInternalWarning, addCreatorInternalWarnings, addCreatorWarningsSchema, addCreatorWarningSchema, resolveCreatorInternalWarning } = await import('./creator-warnings')

beforeEach(() => { creatorExists = true; warningExists = true; submissionExists = true; active = []; inserted = undefined; resolved = undefined; reconcile.mockClear() })

test('warning records a trimmed note and the authenticated admin identity', async () => {
  const input = addCreatorWarningSchema.parse({ creatorProfileId: 'creator', note: '  Verify analytics evidence  ' })
  const warning = await addCreatorInternalWarning(input, 'admin@example.com')
  expect(warning).toMatchObject({ creatorProfileId: 'creator', note: 'Verify analytics evidence', createdByEmail: 'admin@example.com' })
  expect(addCreatorWarningSchema.safeParse({ creatorProfileId: 'creator', note: '  ' }).success).toBe(false)
  expect(addCreatorWarningSchema.safeParse({ creatorProfileId: 'creator', note: 'x'.repeat(1001) }).success).toBe(false)
  expect(inserted?.penaltyPoints).toBe(0)
  expect(reconcile).toHaveBeenCalledTimes(2)
})

test('cannot attach a warning to a nonexistent creator', async () => {
  creatorExists = false
  await expect(addCreatorInternalWarning({ creatorProfileId: 'missing', note: 'Verify evidence' }, 'admin@example.com')).rejects.toThrow('Creator not found')
  expect(inserted).toBeUndefined()
})

test('resolution retains the warning and records who resolved it and when', async () => {
  await resolveCreatorInternalWarning({ id: 'warning' }, 'admin@example.com')
  expect(resolved?.resolvedAt).toBeInstanceOf(Date)
  expect(resolved?.resolvedByEmail).toBe('admin@example.com')
  expect(resolved).not.toHaveProperty('note')
  warningExists = false
  await expect(resolveCreatorInternalWarning({ id: 'missing' }, 'admin@example.com')).rejects.toThrow('Active warning not found')
})

test('checklist uses fixed server penalties and rejects duplicate active categories', async () => {
  const input = addCreatorWarningsSchema.parse({ creatorProfileId: 'creator', submissionId: 'submission', categories: ['views_mismatch'], penaltyPoints: 999 })
  await addCreatorInternalWarnings(input, 'admin@example.com')
  expect(inserted).toMatchObject({ category: 'views_mismatch', penaltyPoints: 40, submissionId: 'submission' })
  active = [{ category: 'views_mismatch', submissionId: 'submission' }]
  await expect(addCreatorInternalWarnings(input, 'admin@example.com')).rejects.toThrow('already active')
  expect(addCreatorWarningsSchema.safeParse({ creatorProfileId: 'creator', categories: ['views_mismatch', 'views_mismatch'] }).success).toBe(false)
})

test('cannot attach a scored warning to a submission outside the creator', async () => {
  submissionExists = false
  await expect(addCreatorInternalWarnings({ creatorProfileId: 'creator', submissionId: 'foreign', categories: ['wrong_campaign'], note: '' }, 'admin@example.com')).rejects.toThrow('Submission does not belong')
  expect(inserted).toBeUndefined()
})
