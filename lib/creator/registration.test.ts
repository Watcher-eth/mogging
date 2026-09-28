import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'

let profiles = new Map<string, any>()
let inserts: any[] = []
let user: any
let conflict = false
mock.module('@/lib/db', () => ({ schema, db: {
  query: {
    creatorProfiles: { findFirst: async () => profiles.get('user') },
    users: { findFirst: async () => user },
  },
  insert: () => ({ values: (values: any) => ({
    onConflictDoNothing: ({ target }: any) => {
      expect(target).toBe(schema.creatorProfiles.userId)
      return { returning: async () => {
        if (conflict) {
          profiles.set('user', { id: 'concurrent', userId: 'user', displayName: 'Preserved' })
          return []
        }
        if (profiles.has(values.userId)) return []
        const profile = { id: 'creator', createdAt: new Date(), ...values }
        profiles.set(values.userId, profile)
        inserts.push(profile)
        return [profile]
      } }
    },
  }) }),
} }))
mock.module('@/lib/creator/attribution', () => ({ ensureCreatorTrackingLink: async () => null }))
const { getOrCreateCreatorProfile } = await import('./service')

beforeEach(() => {
  profiles = new Map()
  inserts = []
  conflict = false
  user = { id: 'user', name: 'Creator', email: 'creator@example.com', instagramUsername: null }
})

test('registers without an account or an assumed payout destination', async () => {
  const profile = await getOrCreateCreatorProfile('user')
  expect(profile.userId).toBe('user')
  expect(profile.createdAt).toBeInstanceOf(Date)
  expect(profile.paypalEmail).toBeUndefined()
  expect(inserts).toHaveLength(1)
})

test('repeat visits preserve the original registration', async () => {
  const first = await getOrCreateCreatorProfile('user')
  expect(await getOrCreateCreatorProfile('user')).toBe(first)
  expect(inserts).toHaveLength(1)
})

test('concurrent visits insert one registration', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => getOrCreateCreatorProfile('user')))
  expect(inserts).toHaveLength(1)
  expect(results.every((profile) => profile.id === 'creator')).toBe(true)
})

test('a concurrent profile insert is preserved, not overwritten', async () => {
  conflict = true
  expect((await getOrCreateCreatorProfile('user')).displayName).toBe('Preserved')
  expect(inserts).toHaveLength(0)
})

test('missing users cannot register', async () => {
  user = undefined
  await expect(getOrCreateCreatorProfile('user')).rejects.toThrow('User not found')
  expect(inserts).toHaveLength(0)
})
