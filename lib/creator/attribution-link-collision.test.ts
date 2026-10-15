import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'

let account: any
let existing: any
let links: any[]
let aliases: any[]
let writes: any[]
let siblings: any[]
let linkQueries = 0
let aliasQueries = 0
const tx = {
  execute: async () => undefined,
  select: () => ({ from: () => ({ where: () => ({ for: async () => [account] }) }) }),
  query: {
    creatorSocialAccounts: { findMany: async () => siblings },
    creatorTrackingLinks: { findFirst: async () => {
      if (linkQueries++ === 0) return existing
      const candidate = candidates[Math.floor((linkQueries - 2) / 2)]
      const slug = (linkQueries - 2) % 2 === 0 ? candidate : `mogging-${candidate}`
      return links.find(link => link.slug === slug)
    } },
    creatorTrackingLinkAliases: { findFirst: async () => {
      const candidate = candidates[Math.floor(aliasQueries / 2)]
      const slug = aliasQueries++ % 2 === 0 ? candidate : `mogging-${candidate}`
      return aliases.find(alias => alias.slug === slug)
    } },
  },
  insert: (table: unknown) => ({ values: (values: any) => {
    writes.push({ table, values })
    return {
      returning: async () => [{ id: 'instagram-link', isActive: true, ...values }],
      onConflictDoNothing: async () => undefined,
    }
  } }),
  update: () => ({ set: (values: any) => ({ where: () => ({ returning: async () => [{ ...existing, ...values }] }) }) }),
}
const candidates = ['creator', 'creator-instagram', 'creator-instagram-account-id']
mock.module('@/lib/db', () => ({ schema, db: { transaction: async (fn: any) => fn(tx) } }))
const { ensureCreatorTrackingLink } = await import('./attribution')
beforeEach(() => {
  account = { id: 'account-id', creatorProfileId: 'owner', platform: 'instagram', handle: 'creator' }
  siblings = []
  existing = undefined
  links = []
  aliases = []
  writes = []
  linkQueries = 0
  aliasQueries = 0
})
test('the same creator and handle share one referral link across platforms', async () => {
  const shared = { id: 'tiktok-link', slug: 'mogging-creator', publicUrl: 'https://www.mogging.com/r/creator', isActive: true }
  siblings = [{ id: 'tiktok-account', trackingLink: shared }]
  expect(await ensureCreatorTrackingLink(account.id)).toMatchObject(shared)
  expect(writes).toHaveLength(0)
})
test('a different publishing handle receives its own referral link', async () => {
  const link = await ensureCreatorTrackingLink(account.id)
  expect(link?.publicUrl).toBe('https://www.mogging.com/r/creator')
  expect(writes.filter(write => write.table === schema.creatorTrackingLinks)).toHaveLength(1)
})
test('an existing platform-specific link stays stable on retry', async () => {
  existing = { id: 'instagram-link', publicUrl: 'https://www.mogging.com/r/creator-instagram', isActive: true, deepLinkBaseUrl: 'mogging://r' }
  aliases = [{ trackingLinkId: 'tiktok-link', slug: 'creator' }, { trackingLinkId: existing.id, slug: 'creator-instagram' }]
  const link = await ensureCreatorTrackingLink(account.id)
  expect(link).toEqual(existing)
  expect(writes.some(write => write.table === schema.creatorTrackingLinks)).toBe(false)
})
test('another creator holding both short aliases does not prevent account linking', async () => {
  aliases = [{ trackingLinkId: 'other-link', slug: 'creator' }, { trackingLinkId: 'other-link', slug: 'creator-instagram' }]
  expect((await ensureCreatorTrackingLink(account.id))?.publicUrl).toBe('https://www.mogging.com/r/creator-instagram-account-id')
})
