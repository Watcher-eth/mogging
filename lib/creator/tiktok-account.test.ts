import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'

let rows: any[] = []
let providerAccount: any = undefined
let tokenAccount: any = undefined
let writes: any[] = []
const tx = {
  query: {
    creatorSocialAccounts: { findMany: async () => rows, findFirst: async () => providerAccount },
    accounts: { findFirst: async () => tokenAccount },
  },
  insert(table: unknown) {
    return { values(values: any) {
      writes.push({ table, values })
      return {
        onConflictDoUpdate: async () => undefined,
        returning: async () => [{ id: 'new-account', status: 'pending', ...values }],
      }
    } }
  },
  update(table: unknown) {
    return { set(values: any) {
      writes.push({ table, values })
      return { where: () => ({ returning: async () => [{ ...providerAccount, ...values }] }) }
    } }
  },
}
mock.module('@/lib/db', () => ({ schema, db: {
  query: { creatorProfiles: { findFirst: async () => ({ id: 'creator' }) } },
  transaction: async (fn: any) => fn(tx),
} }))
mock.module('@/lib/creator/attribution', () => ({ ensureCreatorTrackingLink: async () => ({ publicUrl: 'https://www.mogging.com/r/test' }) }))
const { addCreatorTikTokOAuthAccount } = await import('./service')
const input = { openId: 'provider-id', accessToken: 'test-token', displayName: 'Nate', scope: 'user.info.basic,user.info.stats' }
beforeEach(() => { rows = []; providerAccount = undefined; tokenAccount = undefined; writes = [] })

test('basic authorization creates a visible account with an honest display name and pending analytics review', async () => {
  const account = await addCreatorTikTokOAuthAccount('user', input)
  expect(account.handle).toBeNull()
  expect(account.displayName).toBe('Nate')
  expect(account.providerAccountId).toBe('provider-id')
  expect(account.connectionMethod).toBe('oauth')
  expect(account.oauthVerifiedAt).toBeInstanceOf(Date)
  expect(account.status).toBe('pending')
  expect(account.trackingLink).toBeDefined()
})

test('reconnecting at the account limit updates identity without losing known username or review status', async () => {
  providerAccount = { id: 'existing', creatorProfileId: 'creator', platform: 'tiktok', providerAccountId: input.openId, handle: 'nate', profileUrl: 'https://www.tiktok.com/@nate', status: 'approved' }
  rows = [providerAccount, ...Array.from({length: 4}, (_, i) => ({ platform: 'tiktok', handle: `other${i}` }))]
  const account = await addCreatorTikTokOAuthAccount('user', input)
  expect(account.id).toBe('existing')
  expect(account.handle).toBe('nate')
  expect(account.status).toBe('approved')
  expect(writes.filter(write => write.table === schema.creatorSocialAccounts)).toHaveLength(1)
})

test('profile permission stores the actual username', async () => {
  const account = await addCreatorTikTokOAuthAccount('user', {...input, username: '@Nate'})
  expect(account.handle).toBe('nate')
  expect(account.profileUrl).toBe('https://www.tiktok.com/@nate')
})

test('provider identities belonging to another creator cannot be claimed', async () => {
  providerAccount = { creatorProfileId: 'another-creator' }
  await expect(addCreatorTikTokOAuthAccount('user', input)).rejects.toThrow('another creator')
  expect(writes).toHaveLength(0)
})

test('token ownership is checked even without a social account', async () => {
  tokenAccount = { userId: 'another-user' }
  await expect(addCreatorTikTokOAuthAccount('user', input)).rejects.toThrow('another Mogging account')
  expect(writes).toHaveLength(0)
})

test('new basic identities still obey account limits', async () => {
  rows = Array.from({length: 5}, (_, i) => ({ platform: 'tiktok', handle: `other${i}` }))
  await expect(addCreatorTikTokOAuthAccount('user', input)).rejects.toThrow('up to 5')
  expect(writes).toHaveLength(0)
})
