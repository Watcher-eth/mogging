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
  query: { creatorProfiles: { findFirst: async () => ({ id: 'creator' }) }, creatorSocialAccounts: { findMany: async () => rows } },
  insert: tx.insert,
  update: tx.update,
  transaction: async (fn: any) => fn(tx),
} }))
mock.module('@/lib/creator/attribution', () => ({ ensureCreatorTrackingLink: async () => ({ publicUrl: 'https://www.mogging.com/r/test' }) }))
mock.module('@/lib/storage/videos', () => ({ creatorAssetPublicUrl: (key: string) => `https://media.example/${key}`, verifyCreatorRecordingUpload: async () => { if (!uploadExists) throw new Error('Not found') } }))
const evidence = { analyticsVideoUrl: 'https://media.example/recording.mp4', analyticsStorageKey: 'creators/user/account-analytics/00000000-0000-0000-0000-000000000001.mp4', analyticsContentType: 'video/mp4' as const, analyticsSizeBytes: 100, analyticsPast28DaysConfirmed: true as const }
const { addCreatorTikTokOAuthAccount, addCreatorSocialAccount, submitCreatorAccountAnalyticsEvidence } = await import('./service')
const input = { openId: 'provider-id', accessToken: 'test-token', profile: { display_name: 'Nate' }, scope: 'user.info.basic,user.info.stats' }
beforeEach(() => { rows = []; providerAccount = undefined; tokenAccount = undefined; writes = []; uploadExists = true })

test('basic authorization connects before uploading and uses the real display name', async () => {
  const account = await addCreatorTikTokOAuthAccount('user', input)
  expect(account.handle).toBeNull()
  expect(account.displayName).toBe('Nate')
  expect(account.providerAccountId).toBe('provider-id')
  expect(account.connectionMethod).toBe('oauth')
  expect(account.oauthVerifiedAt).toBeInstanceOf(Date)
  expect(account.status).toBe('pending')
  expect(account.trackingLink).toBeDefined()
  expect(account.analyticsConfirmedAt).toBeUndefined()
  expect(account.analyticsVideoUrl).toBeUndefined()
})

test('reconnecting at the account limit preserves the username and existing review status', async () => {
  providerAccount = { id: 'existing', creatorProfileId: 'creator', platform: 'tiktok', providerAccountId: input.openId, handle: 'nate', profileUrl: 'https://www.tiktok.com/@nate', status: 'approved' }
  rows = [providerAccount, ...Array.from({length: 4}, (_, i) => ({ platform: 'tiktok', handle: `other${i}` }))]
  const account = await addCreatorTikTokOAuthAccount('user', input)
  expect(account.id).toBe('existing')
  expect(account.handle).toBe('nate')
  expect(account.status).toBe('approved')
  expect(writes.filter(write => write.table === schema.creatorSocialAccounts)).toHaveLength(1)
})

test('profile permission stores the actual username', async () => {
  const account = await addCreatorTikTokOAuthAccount('user', {...input, profile: {...input.profile, username: '@Nate'}})
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


test('Instagram connects manually before the recording upload', async () => {
  const account = await addCreatorSocialAccount('user', { platform: 'instagram', handle: 'nate' })
  expect(account.platform).toBe('instagram')
  expect(account.handle).toBe('nate')
  expect(account.analyticsConfirmedAt).toBeUndefined()
})

test('evidence updates reject absent uploads before writing', async () => {
  uploadExists = false
  await expect(submitCreatorAccountAnalyticsEvidence('user', { accountId: '00000000-0000-4000-8000-000000000002', ...evidence })).rejects.toThrow('complete audience recording')
  expect(writes).toHaveLength(0)
})

test('rejects foreign recording keys and path traversal before connecting', async () => {
  for (const key of ['creators/other/account-analytics/00000000-0000-0000-0000-000000000001.mp4', 'creators/user/account-analytics/../../../other.mp4']) {
    await expect(submitCreatorAccountAnalyticsEvidence('user', { accountId: '00000000-0000-4000-8000-000000000002', ...evidence, analyticsStorageKey: key })).rejects.toThrow('Invalid analytics recording')
  }
  expect(writes).toHaveLength(0)
})

test('only uploading verified evidence submits the account for review', async () => {
  providerAccount = { id: 'existing', status: 'missing_information' }
  const account = await submitCreatorAccountAnalyticsEvidence('user', { accountId: '00000000-0000-4000-8000-000000000002', ...evidence })
  expect(account.status).toBe('pending')
  expect(account.analyticsConfirmedAt).toBeInstanceOf(Date)
  expect(account.analyticsVideoUrl).toContain(evidence.analyticsStorageKey)
})

test('OAuth persists every returned profile and stats field and uses the returned avatar', async () => {
  const profile = {
    open_id: 'provider-id', union_id: 'union-id', username: 'nate', display_name: 'Nate',
    avatar_url: 'https://cdn.example/avatar.jpg', avatar_url_100: 'https://cdn.example/avatar-100.jpg', avatar_large_url: 'https://cdn.example/avatar-large.jpg',
    profile_deep_link: 'https://www.tiktok.com/@nate', bio_description: 'Creator', is_verified: false,
    follower_count: 0, following_count: 123, likes_count: 987654, video_count: 17,
  }
  const account = await addCreatorTikTokOAuthAccount('user', {...input, profile})
  expect(account.oauthProfile).toEqual(profile)
  expect(account.avatarUrl).toBe(profile.avatar_large_url)
  expect(account.profileUrl).toBe(profile.profile_deep_link)
})

test('reconnecting with partial permissions preserves known stats and avatar', async () => {
  providerAccount = { id: 'existing', creatorProfileId: 'creator', platform: 'tiktok', providerAccountId: input.openId, handle: 'nate', avatarUrl: 'https://cdn.example/known.jpg', oauthProfile: { follower_count: 42 }, status: 'approved' }
  rows = [providerAccount]
  const account = await addCreatorTikTokOAuthAccount('user', input)
  expect(account.oauthProfile).toEqual({ follower_count: 42, display_name: 'Nate' })
  expect(account.avatarUrl).toBe(providerAccount.avatarUrl)
})
