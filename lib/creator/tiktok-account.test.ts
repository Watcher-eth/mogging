import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'

let rows: any[] = []
let providerAccount: any = undefined
let tokenAccount: any = undefined
let writes: any[] = []
let uploadExists = true
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
mock.module('@/lib/storage/videos', () => ({ creatorAssetPublicUrl: (key: string) => `https://media.example/${key}`, verifyCreatorRecordingUpload: async () => { if (!uploadExists) throw new Error('Not found') } }))
const evidence = { analyticsVideoUrl: 'https://media.example/recording.mp4', analyticsStorageKey: 'creators/user/account-analytics/00000000-0000-0000-0000-000000000001.mp4', analyticsContentType: 'video/mp4' as const, analyticsSizeBytes: 100, analyticsPast28DaysConfirmed: true as const }
const { addCreatorTikTokOAuthAccount, addCreatorSocialAccount, submitCreatorAccountAnalyticsEvidence } = await import('./service')
const input = { openId: 'provider-id', accessToken: 'test-token', displayName: 'Nate', scope: 'user.info.basic,user.info.stats' }
beforeEach(() => { rows = []; providerAccount = undefined; tokenAccount = undefined; writes = []; uploadExists = true })

test('basic authorization creates a visible account with an honest display name and pending analytics review', async () => {
  const account = await addCreatorTikTokOAuthAccount('user', input, evidence)
  expect(account.handle).toBeNull()
  expect(account.displayName).toBe('Nate')
  expect(account.providerAccountId).toBe('provider-id')
  expect(account.connectionMethod).toBe('oauth')
  expect(account.oauthVerifiedAt).toBeInstanceOf(Date)
  expect(account.status).toBe('pending')
  expect(account.trackingLink).toBeDefined()
})

test('reconnecting at the account limit updates identity preserves the username and resubmits new evidence for review', async () => {
  providerAccount = { id: 'existing', creatorProfileId: 'creator', platform: 'tiktok', providerAccountId: input.openId, handle: 'nate', profileUrl: 'https://www.tiktok.com/@nate', status: 'approved' }
  rows = [providerAccount, ...Array.from({length: 4}, (_, i) => ({ platform: 'tiktok', handle: `other${i}` }))]
  const account = await addCreatorTikTokOAuthAccount('user', input, evidence)
  expect(account.id).toBe('existing')
  expect(account.handle).toBe('nate')
  expect(account.status).toBe('pending')
  expect(writes.filter(write => write.table === schema.creatorSocialAccounts)).toHaveLength(1)
})

test('profile permission stores the actual username', async () => {
  const account = await addCreatorTikTokOAuthAccount('user', {...input, username: '@Nate'}, evidence)
  expect(account.handle).toBe('nate')
  expect(account.profileUrl).toBe('https://www.tiktok.com/@nate')
})

test('provider identities belonging to another creator cannot be claimed', async () => {
  providerAccount = { creatorProfileId: 'another-creator' }
  await expect(addCreatorTikTokOAuthAccount('user', input, evidence)).rejects.toThrow('another creator')
  expect(writes).toHaveLength(0)
})

test('token ownership is checked even without a social account', async () => {
  tokenAccount = { userId: 'another-user' }
  await expect(addCreatorTikTokOAuthAccount('user', input, evidence)).rejects.toThrow('another Mogging account')
  expect(writes).toHaveLength(0)
})

test('new basic identities still obey account limits', async () => {
  rows = Array.from({length: 5}, (_, i) => ({ platform: 'tiktok', handle: `other${i}` }))
  await expect(addCreatorTikTokOAuthAccount('user', input, evidence)).rejects.toThrow('up to 5')
  expect(writes).toHaveLength(0)
})


test('connection and evidence updates reject absent uploads before writing', async () => {
  uploadExists = false
  await expect(addCreatorTikTokOAuthAccount('user', input, evidence)).rejects.toThrow('complete audience recording')
  await expect(addCreatorSocialAccount('user', { platform: 'instagram', handle: 'nate', ...evidence })).rejects.toThrow('complete audience recording')
  await expect(submitCreatorAccountAnalyticsEvidence('user', { accountId: '00000000-0000-0000-0000-000000000002', ...evidence })).rejects.toThrow('complete audience recording')
  expect(writes).toHaveLength(0)
})

test('rejects foreign recording keys and path traversal before connecting', async () => {
  for (const key of ['creators/other/account-analytics/00000000-0000-0000-0000-000000000001.mp4', 'creators/user/account-analytics/../../../other.mp4']) {
    await expect(addCreatorTikTokOAuthAccount('user', input, { ...evidence, analyticsStorageKey: key })).rejects.toThrow('Invalid analytics recording')
  }
  expect(writes).toHaveLength(0)
})
