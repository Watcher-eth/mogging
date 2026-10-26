import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'

let creatorExists = true
let warningExists = true
let inserted: Record<string, unknown> | undefined
let resolved: Record<string, unknown> | undefined
mock.module('@/lib/db', () => ({ schema, db: {
  query: { creatorProfiles: { findFirst: async () => creatorExists ? { id: 'creator' } : undefined } },
  insert: () => ({ values: (values: Record<string, unknown>) => {
    inserted = values
    return { returning: async () => [{ id: 'warning', ...values }] }
  } }),
  update: () => ({ set: (values: Record<string, unknown>) => ({ where: () => ({ returning: async () => {
    resolved = values
    return warningExists ? [{ id: 'warning', ...values }] : []
  } }) }) }),
} }))
const { addCreatorInternalWarning, addCreatorWarningSchema, resolveCreatorInternalWarning } = await import('./creator-warnings')

beforeEach(() => { creatorExists = true; warningExists = true; inserted = undefined; resolved = undefined })

test('warning records a trimmed note and the authenticated admin identity', async () => {
  const input = addCreatorWarningSchema.parse({ creatorProfileId: 'creator', note: '  Verify analytics evidence  ' })
  const warning = await addCreatorInternalWarning(input, 'admin@example.com')
  expect(warning).toMatchObject({ creatorProfileId: 'creator', note: 'Verify analytics evidence', createdByEmail: 'admin@example.com' })
  expect(addCreatorWarningSchema.safeParse({ creatorProfileId: 'creator', note: '  ' }).success).toBe(false)
  expect(addCreatorWarningSchema.safeParse({ creatorProfileId: 'creator', note: 'x'.repeat(1001) }).success).toBe(false)
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
