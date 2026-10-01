import { beforeAll, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

// Run in a separate Bun process against an isolated database with the application schema.
const testUrl = process.env.TEST_CREATOR_INVITE_DATABASE_URL
let database: typeof import('@/lib/db')
let service: typeof import('./invites')
describe.skipIf(!testUrl)('creator invite database integration', () => {
  beforeAll(async () => {
    const url = new URL(testUrl!)
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55439') throw new Error('Use the isolated localhost invite-test database on port 55439')
    process.env.DATABASE_URL = testUrl
    database = await import('@/lib/db')
    service = await import('./invites')
  })

  async function user() {
    const id = crypto.randomUUID()
    await database.db.insert(database.schema.users).values({ id, email: `${id}@invite-test.local` })
    return id
  }
  async function invite() {
    const handle = `test.${crypto.randomUUID().slice(0, 8)}`
    return service.createCreatorInvite({ displayName: 'Invited Creator', handle, profileUrl: `https://www.tiktok.com/@${handle}`, avatarUrl: 'https://p16.tiktokcdn.com/test.jpeg', evidenceUrl: 'https://discord.com/channels/123/456/789', verificationConfirmed: true }, 'admin@invite-test.local')
  }
  const token = (result: { path: string }) => result.path.split('/').pop()!

  test('a claim adds approved manual account and verified analytics without setting payout or OAuth', async () => {
    const id = await user()
    const created = await invite()
    const preview = await service.getCreatorInvitePreview(token(created))
    expect(Object.keys(preview!).sort()).toEqual(['avatarUrl', 'displayName', 'handle', 'state'])
    expect(preview!.state).toBe('ready')
    expect(await service.claimCreatorInvite(token(created), id)).toEqual({ destination: '/creator/setup?step=payout' })
    const profile = await database.db.query.creatorProfiles.findFirst({ where: eq(database.schema.creatorProfiles.userId, id) })
    expect(profile!.authStatus).toBe('verified')
    expect(profile!.paypalEmail).toBeNull()
    const accounts = await database.db.query.creatorSocialAccounts.findMany({ where: eq(database.schema.creatorSocialAccounts.creatorProfileId, profile!.id) })
    expect(accounts).toHaveLength(1)
    expect(accounts[0].status).toBe('approved')
    expect(accounts[0].analyticsConfirmedAt).toBeInstanceOf(Date)
    expect(accounts[0].oauthVerifiedAt).toBeNull()
    expect(accounts[0].connectionMethod).toBe('manual')
    await service.claimCreatorInvite(token(created), id)
    expect(await service.getCreatorInvitePreview(token(created))).toMatchObject({ state: 'claimed' })
    const records = await database.db.query.creatorOnboardingInvites.findFirst({ where: eq(database.schema.creatorOnboardingInvites.id, created.id) })
    expect(records!.tokenHash).not.toBe(token(created))
    expect(records!.claimedByUserId).toBe(id)
  })

  test('two simultaneous users cannot claim the same invite', async () => {
    const created = await invite()
    const outcomes = await Promise.allSettled([service.claimCreatorInvite(token(created), await user()), service.claimCreatorInvite(token(created), await user())])
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const failure = outcomes.find((result) => result.status === 'rejected') as PromiseRejectedResult
    expect(failure.reason.status).toBe(409)
  })

  test('expired and revoked links cannot be claimed and preview reads never consume links', async () => {
    const created = await invite()
    await service.getCreatorInvitePreview(token(created))
    await service.getCreatorInvitePreview(token(created))
    const record = await database.db.query.creatorOnboardingInvites.findFirst({ where: eq(database.schema.creatorOnboardingInvites.id, created.id) })
    expect(record!.claimedAt).toBeNull()
    await service.revokeCreatorInvite(created.id)
    expect(await service.getCreatorInvitePreview(token(created))).toMatchObject({ state: 'unavailable' })
    await expect(service.claimCreatorInvite(token(created), await user())).rejects.toMatchObject({ status: 410 })
    const expired = await invite()
    await database.db.update(database.schema.creatorOnboardingInvites).set({ expiresAt: new Date(0) }).where(eq(database.schema.creatorOnboardingInvites.id, expired.id))
    await expect(service.claimCreatorInvite(token(expired), await user())).rejects.toMatchObject({ status: 410 })
  })

  test('claim preserves an existing payout and blocks suspended creators', async () => {
    const id = await user()
    await database.db.insert(database.schema.creatorProfiles).values({ userId: id, displayName: 'Existing', paypalEmail: 'payout@example.com' })
    await service.claimCreatorInvite(token(await invite()), id)
    const profile = await database.db.query.creatorProfiles.findFirst({ where: eq(database.schema.creatorProfiles.userId, id) })
    expect(profile!.paypalEmail).toBe('payout@example.com')
    await database.db.update(database.schema.creatorProfiles).set({ authStatus: 'suspended' }).where(eq(database.schema.creatorProfiles.id, profile!.id))
    const pending = await invite()
    await expect(service.claimCreatorInvite(token(pending), id)).rejects.toMatchObject({ status: 403 })
    expect(await service.getCreatorInvitePreview(token(pending))).toMatchObject({ state: 'ready' })
  })

  test('account ownership conflicts roll back new profiles and leave the invite unclaimed', async () => {
    const created = await invite()
    const preview = await service.getCreatorInvitePreview(token(created))
    const ownerId = await user()
    const [owner] = await database.db.insert(database.schema.creatorProfiles).values({ userId: ownerId, displayName: 'Owner' }).returning()
    await database.db.insert(database.schema.creatorSocialAccounts).values({ creatorProfileId: owner.id, platform: 'tiktok', handle: preview!.handle })
    const otherId = await user()
    await expect(service.claimCreatorInvite(token(created), otherId)).rejects.toMatchObject({ status: 409 })
    expect(await database.db.query.creatorProfiles.findFirst({ where: eq(database.schema.creatorProfiles.userId, otherId) })).toBeUndefined()
    expect(await service.getCreatorInvitePreview(token(created))).toMatchObject({ state: 'ready' })
  })

  test('simultaneous different invites share one profile for the same user', async () => {
    const id = await user()
    const first = await invite()
    const second = await invite()
    await Promise.all([service.claimCreatorInvite(token(first), id), service.claimCreatorInvite(token(second), id)])
    const profiles = await database.db.query.creatorProfiles.findMany({ where: eq(database.schema.creatorProfiles.userId, id) })
    expect(profiles).toHaveLength(1)
    expect(await database.db.query.creatorSocialAccounts.findMany({ where: eq(database.schema.creatorSocialAccounts.creatorProfileId, profiles[0].id) })).toHaveLength(2)
  })

  test('account limits reject the claim without consuming it', async () => {
    const id = await user()
    const [profile] = await database.db.insert(database.schema.creatorProfiles).values({ userId: id, displayName: 'Full Profile' }).returning()
    await database.db.insert(database.schema.creatorSocialAccounts).values(Array.from({ length: 5 }, (_, index) => ({ creatorProfileId: profile.id, platform: 'tiktok' as const, handle: `full.${index}.${id.slice(0, 8)}` })))
    const created = await invite()
    await expect(service.claimCreatorInvite(token(created), id)).rejects.toMatchObject({ status: 409 })
    expect(await service.getCreatorInvitePreview(token(created))).toMatchObject({ state: 'ready' })
    const unchanged = await database.db.query.creatorProfiles.findFirst({ where: eq(database.schema.creatorProfiles.id, profile.id) })
    expect(unchanged!.authStatus).toBe('pending')
  })
})
