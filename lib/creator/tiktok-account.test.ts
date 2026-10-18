import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'

let rows: any[] = []
let providerAccount: any = undefined
let tokenAccount: any = undefined
let writes: any[] = []
const tx = {
  execute: async () => undefined,
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
  delete(table: unknown) {
    writes.push({ table, deleted: true })
    return { where: () => ({ returning: async () => [providerAccount] }) }
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
mock.module('@/lib/creator/attribution', () => ({ creatorReferralHandle: (value: string) => value, ensureCreatorTrackingLink: async () => ({ publicUrl: 'https://www.mogging.com/r/test' }) }))
mock.module('@/lib/storage/videos', () => ({ creatorAssetPublicUrl: (key: string) => `https://media.example/${key}`, verifyCreatorRecordingUpload: async () => undefined }))
const { addCreatorTikTokOAuthAccount, addCreatorSocialAccount, removeCreatorSocialAccount } = await import('./service')
const input = { openId: 'provider-id', accessToken: 'test-token', profile: { display_name: 'Nate' }, scope: 'user.info.basic,user.info.stats' }
beforeEach(() => { rows = []; providerAccount = undefined; tokenAccount = undefined; writes = [] })

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


test('Instagram connects without account audience verification', async () => {
  const account = await addCreatorSocialAccount('user', { platform: 'instagram', handle: 'nate' })
  expect(account.platform).toBe('instagram')
  expect(account.handle).toBe('nate')
  expect(account.analyticsConfirmedAt).toBeUndefined()
})

test('manual TikTok connects without claiming audience analytics verification', async () => {
  const account = await addCreatorSocialAccount('user', { platform: 'tiktok', handle: 'nate', profileUrl: 'https://www.tiktok.com/@nate' })
  expect(account.status).toBe('approved')
  expect(account.analyticsConfirmedAt).toBeUndefined()
  expect(account.analyticsVideoUrl).toBeUndefined()
  expect(account.oauthVerifiedAt).toBeUndefined()
  expect(writes[0].values).not.toHaveProperty('analyticsConfirmedAt')
  expect(writes[0].values).not.toHaveProperty('analyticsVideoUrl')
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


test('retrying your own Instagram connection returns the saved account', async () => {
  providerAccount = { id: 'existing', creatorProfileId: 'creator', platform: 'instagram', handle: 'nate' }
  expect((await addCreatorSocialAccount('user', { platform: 'instagram', handle: 'nate' })).id).toBe('existing')
  expect(writes).toHaveLength(0)
})

test('manual connections cannot claim another creator account', async () => {
  providerAccount = { creatorProfileId: 'another-creator' }
  await expect(addCreatorSocialAccount('user', { platform: 'instagram', handle: 'nate' })).rejects.toThrow('another creator')
  expect(writes).toHaveLength(0)
})


test('removing one platform preserves the shared referral link on the remaining account', async () => {
  providerAccount = { id: 'tiktok-account', creatorProfileId: 'creator', platform: 'tiktok', handle: 'nate', connectionMethod: 'manual' }
  rows = [providerAccount, { id: 'instagram-account', creatorProfileId: 'creator', platform: 'instagram', handle: 'nate' }]
  await removeCreatorSocialAccount('user', providerAccount.id)
  expect(writes.find(write => write.table === schema.creatorTrackingLinks)?.values.socialAccountId).toBe('instagram-account')
  expect(writes.some(write => write.table === schema.creatorTrackingLinks && write.deleted)).toBe(false)
})
