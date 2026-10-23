import { afterAll, expect, mock, test } from 'bun:test'
import { eq } from 'drizzle-orm'

const target = process.env.CREATOR_TEST_DATABASE_URL
const local = target && new URL(target)
if (local && (!['127.0.0.1', 'localhost'].includes(local.hostname) || local.pathname !== '/creator_continuity_test')) throw new Error('Only the isolated local creator test database is allowed')
if (target) process.env.DATABASE_URL = target
mock.module('@/lib/creator/invite-avatar', () => ({ resolveCreatorAvatar: async (_platform: string, handle: string) => handle === 'blocked' ? null : `https://p16.tiktokcdn.com/${handle}.jpeg`, preserveCreatorAvatar: async (url: string) => `https://media.example/creator/avatars/${url.split('/').at(-1)}` }))
const suite = target ? test : test.skip
const { db, schema } = await import('@/lib/db')
const { refreshCreatorAccountAvatars } = await import('./account-avatars')
const { recordSubmissionUpdate, getCreatorSubmissionUpdates } = await import('./submission-updates')
const ids: string[] = []
async function creator() {
  const [user] = await db.insert(schema.users).values({ email: `updates-${crypto.randomUUID()}@example.invalid` }).returning()
  ids.push(user.id)
  const [profile] = await db.insert(schema.creatorProfiles).values({ userId: user.id, displayName: 'Test creator', authStatus: 'verified' }).returning()
  return { user, profile }
}
afterAll(async () => { for (const id of ids) await db.delete(schema.users).where(eq(schema.users.id, id)); await (globalThis as typeof globalThis & { postgresClient?: import('postgres').Sql }).postgresClient?.end() })

suite('updates are scoped through submission ownership, not caller-controlled IDs', async () => {
  const a = await creator(), b = await creator()
  const [own, foreign] = await db.insert(schema.creatorSubmissions).values([{ creatorProfileId: a.profile.id, title: 'Own post', platform: 'TikTok' }, { creatorProfileId: b.profile.id, title: 'Private post', platform: 'TikTok' }]).returning()
  await db.transaction(async tx => { await recordSubmissionUpdate(tx, own.id, 'approved'); await recordSubmissionUpdate(tx, foreign.id, 'rejected', 'Private feedback') })
  const updates = await getCreatorSubmissionUpdates(a.profile.id)
  expect(updates.map(item => item.submissionId)).toEqual([own.id])
  expect(JSON.stringify(updates)).not.toContain('Private feedback')
  await expect(db.transaction(async tx => { await recordSubmissionUpdate(tx, own.id, 'feedback', 'Must roll back'); throw new Error('rollback') })).rejects.toThrow('rollback')
  expect(await getCreatorSubmissionUpdates(a.profile.id)).toHaveLength(1)
})

suite('photos are saved only to owned accounts; retry claims preserve good images', async () => {
  const a = await creator(), b = await creator()
  const [own, foreign, blocked] = await db.insert(schema.creatorSocialAccounts).values([{ creatorProfileId: a.profile.id, platform: 'tiktok' as const, handle: 'alice' }, { creatorProfileId: b.profile.id, platform: 'tiktok' as const, handle: 'bob' }, { creatorProfileId: a.profile.id, platform: 'instagram' as const, handle: 'blocked', avatarUrl: 'https://media.example/creator/avatars/known.jpeg' }]).returning()
  const results = await Promise.all([refreshCreatorAccountAvatars(a.user.id), refreshCreatorAccountAvatars(a.user.id)])
  expect(results.every(items => items.every(item => item.id !== foreign.id))).toBe(true)
  const saved = await db.query.creatorSocialAccounts.findFirst({ where: eq(schema.creatorSocialAccounts.id, own.id) })
  expect(saved?.avatarUrl).toBe('https://media.example/creator/avatars/alice.jpeg')
  expect(saved?.avatarCheckedAt).toBeInstanceOf(Date)
  expect((await db.query.creatorSocialAccounts.findFirst({ where: eq(schema.creatorSocialAccounts.id, foreign.id) }))?.avatarUrl).toBeNull()
  expect((await db.query.creatorSocialAccounts.findFirst({ where: eq(schema.creatorSocialAccounts.id, blocked.id) }))?.avatarUrl).toBe('https://media.example/creator/avatars/known.jpeg')
})
