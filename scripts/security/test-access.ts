// Run in its own process: real PostgreSQL queries, synthetic identities, no provider calls.
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { mock } from 'bun:test'
import { eq, sql } from 'drizzle-orm'
import { Glob } from 'bun'

const databaseUrl = process.env.SECURITY_TEST_DATABASE_URL
if (!databaseUrl) throw new Error('Set SECURITY_TEST_DATABASE_URL to the isolated local security database')
const target = new URL(databaseUrl)
if (target.hostname !== '127.0.0.1' || target.port !== '55449' || target.pathname !== '/mogging_security_test') throw new Error('Security tests require the dedicated local database on port 55449')
for (const key of Object.keys(process.env)) if (/^(?:R2_|PRIVATE_|COURSE_|BUNNY_|UPSTASH_|STRIPE_|REVENUECAT_|RESEND_|GOOGLE_|META_|FACEBOOK_|TWITTER_|X_CLIENT|TIKTOK_|MOONSHOT_|OPENAI_)/.test(key)) delete process.env[key]
process.env.DATABASE_URL = databaseUrl
Object.assign(process.env, { NODE_ENV: 'test' })
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.NEXTAUTH_SECRET = 'isolated-security-test-secret-never-use-in-production'
process.env.CREATOR_ADMIN_EMAILS = 'admin@security.invalid'
process.env.CREATOR_ADMIN_PASSWORD = 'isolated-security-admin-password'
process.env.IMAGE_STORAGE_DIR = '/tmp/mogging-security-public-files'

let current: { user: { id: string; email: string } } | null = null
mock.module('@/lib/auth/session', () => ({ getAuthSession: async () => current }))
mock.module('@/lib/reliability/monitor', () => ({ monitorBackend: (_: string, handler: unknown) => handler, recordBackendRequest: async () => {}, setBackendOutcome: () => {}, markEvaluationStarted: () => {} }))
const { db, schema } = await import('@/lib/db')
await db.execute(sql`truncate table users, creator_sprints cascade`)
const { defaultCreatorSprintTerms } = await import('@/lib/creator/sprint-defaults')
const { getCreatorDashboard, getSubmissionForCreator, removeCreatorSocialAccount, requestSubmissionReview } = await import('@/lib/creator/service')
const { listCreatorSprints, sprintApprovedSubmissions } = await import('@/lib/creator/sprint-service')
const library = await import('@/lib/creator/cta-library')
const { getPublicUserProfile, updateUserAvatarIfMissing } = await import('@/lib/users/service')
const { createMobileSessionForUser } = await import('@/lib/auth/mobile-session')
const { getAnonymousActorId, getOrSetAnonymousActorId } = await import('@/lib/auth/anonymous')
const admin = await import('@/lib/admin/creator-auth')
const dashboardHandler = (await import('@/pages/api/creator/index')).default
const messagesHandler = (await import('@/pages/api/creator/submissions/[id]/messages')).default
const analysisHandler = (await import('@/pages/api/analysis/[id]')).default
const privacyHandler = (await import('@/pages/api/photos/privacy')).default
const userHandler = (await import('@/pages/api/user/me')).default

const users = await db.insert(schema.users).values(['creator-a', 'creator-b', 'ordinary', 'admin'].map(name => ({ email: `${name}@security.invalid`, name, emailVerified: name === 'admin' ? new Date() : null }))).returning()
const [a, b, ordinary, administrator] = users
const profiles = await db.insert(schema.creatorProfiles).values([a, b].map(user => ({ userId: user.id, displayName: user.name!, authStatus: 'verified' as const, paypalEmail: `${user.name}-private@security.invalid` }))).returning()
const [pa, pb] = profiles
const [campaign] = await db.insert(schema.creatorSprints).values({ name: 'Security fixture', description: 'Synthetic', status: 'published', budgetCents: 100_000, startsAt: new Date(0), endsAt: new Date('2030-01-01'), terms: defaultCreatorSprintTerms() }).returning()
const submissions = await db.insert(schema.creatorSubmissions).values(profiles.map((profile, i) => ({ creatorProfileId: profile.id, sprintId: campaign.id, sprintTerms: campaign.terms, title: `Private submission ${i}`, platform: 'tiktok', status: 'approved' as const, approvedAmountCents: (i + 1) * 1000 }))).returning()
const accounts = await db.insert(schema.creatorSocialAccounts).values(profiles.map(profile => ({ creatorProfileId: profile.id, platform: 'tiktok' as const, displayName: 'Private account' }))).returning()
await db.insert(schema.creatorPayments).values(profiles.map(profile => ({ creatorProfileId: profile.id, amountCents: 500, paymentOption: 'paypal' as const, status: 'paid' as const })))
const [message] = await db.insert(schema.creatorSubmissionMessages).values({ submissionId: submissions[1].id, authorUserId: b.id, authorRole: 'creator', body: 'Creator B private message' }).returning()
const photoKeys = ['a', 'b'].map(char => `photos/${char.repeat(64)}.png`)
const photos = await db.insert(schema.photos).values(users.slice(0, 2).map((user, i) => ({ userId: user.id, imageHash: String(i).repeat(64), imageStorageKey: photoKeys[i], imageUrl: `https://images.example.invalid/${photoKeys[i]}`, isPublic: false }))).returning()
const analyses = await db.insert(schema.analyses).values(photos.map(photo => ({ photoId: photo.id, status: 'complete' as const, model: 'synthetic', promptVersion: 'synthetic', metrics: { confidential: true } }))).returning()
const evidenceKeys = users.slice(0, 2).map(user => `creators/${user.id}/submission-analytics/${crypto.randomUUID()}.mp4`)
const tokenA = (await createMobileSessionForUser(a.id)).sessionToken
const checks: string[] = []
async function check(name: string, run: () => Promise<void>) { await run(); checks.push(name); console.log(`PASS ${name}`) }
function signIn(user: typeof a | null) { current = user ? { user: { id: user.id, email: user.email! } } : null }
async function call(handler: any, method = 'GET', query: Record<string, unknown> = {}, body: unknown = {}, headers: Record<string, string> = {}, cookies: Record<string, string> = {}) {
  const result: any = { statusCode: 200, headers: {}, body: null,
    setHeader(key: string, value: unknown) { this.headers[key] = value }, getHeader(key: string) { return this.headers[key] },
    status(code: number) { this.statusCode = code; return this }, json(value: unknown) { this.body = value; return this },
    send(value: unknown) { this.body = value; return this }, end() { return this },
    redirect(code: number, url: string) { this.statusCode = code; this.headers.Location = url; return this },
  }
  await handler({ method, query, body, headers, cookies, socket: { remoteAddress: '127.0.0.1' } }, result)
  return result
}
try {
  signIn(a)
  await check('creator dashboard ignores supplied identities and returns only its own records', async () => {
    const response = await call(dashboardHandler, 'GET', { userId: b.id, creatorProfileId: pb.id })
    assert.equal(response.statusCode, 200)
    const data = response.body.data
    assert.equal(data.profile.userId, a.id)
    assert.ok(data.submissions.every((row: any) => row.creatorProfileId === pa.id))
    assert.ok(data.payments.every((row: any) => row.creatorProfileId === pa.id))
    assert.ok(data.socialAccounts.every((row: any) => row.creatorProfileId === pa.id))
    assert.equal('communityMetrics' in data, false)
    assert.equal(JSON.stringify(data).includes(pb.paypalEmail!), false)
  })
  await check('campaign proofs are private while aggregate budget contracts remain compatible', async () => {
    const proofs = await sprintApprovedSubmissions(campaign.id, a.id)
    assert.deepEqual(proofs.map(row => row.id), [submissions[0].id])
    const campaigns = await listCreatorSprints()
    assert.equal(campaigns[0].counts.approved, 2)
    assert.equal(campaigns[0].usedCents, 3000)
    await db.update(schema.creatorSprints).set({ budgetCents: 2500 }).where(eq(schema.creatorSprints.id, campaign.id))
    const [full] = await listCreatorSprints()
    assert.equal(full.usedCents, 3000)
    assert.ok(full.usedCents >= full.budgetCents, 'Existing clients still detect global budget exhaustion')
    await db.update(schema.creatorSprints).set({ budgetCents: 100_000 }).where(eq(schema.creatorSprints.id, campaign.id))
  })
  await check('another creator cannot read, message, mark-read, remove accounts or rereview records', async () => {
    assert.equal(await getSubmissionForCreator(a.id, submissions[1].id), undefined)
    for (const [method, body] of [['GET', {}], ['POST', { id: crypto.randomUUID(), body: 'forged', role: 'team', userId: b.id }], ['PATCH', { messageId: message.id }]] as const) assert.equal((await call(messagesHandler, method, { id: submissions[1].id }, body)).statusCode, 404)
    await assert.rejects(removeCreatorSocialAccount(a.id, accounts[1].id), { status: 404 })
    await assert.rejects(requestSubmissionReview(a.id, submissions[1].id, { analyticsVideoUrl: 'synthetic', analyticsPhysicalRecordingConfirmed: true, analyticsStorageKey: evidenceKeys[0], analyticsContentType: 'video/mp4', analyticsSizeBytes: 1, viewCountThreshold: 20_000, usAudiencePercent: 40 }), { status: 404 })
    assert.equal((await db.query.creatorSubmissionMessages.findMany({ where: eq(schema.creatorSubmissionMessages.submissionId, submissions[1].id) })).length, 1)
  })
  await check('creator cannot read or publish another user private report', async () => {
    const headers = { authorization: `Bearer ${tokenA}` }
    assert.equal((await call(analysisHandler, 'GET', { id: analyses[1].id }, {}, headers)).statusCode, 404)
    assert.equal((await call(privacyHandler, 'POST', {}, { photoId: photos[1].id, isPublic: true, userId: b.id }, headers)).statusCode, 404)
    assert.equal((await db.query.photos.findFirst({ where: eq(schema.photos.id, photos[1].id) }))?.isPublic, false)
    assert.equal((await call(analysisHandler, 'GET', { id: analyses[0].id }, {}, headers)).statusCode, 200)
    const me = await call(userHandler, 'GET', { userId: b.id })
    assert.equal(me.body.data.user.id, a.id)
  })
  await check('every admin route rejects a signed-in creator including forged admin cookies', async () => {
    for (const file of new Glob('pages/api/admin/**/*.ts').scanSync('.')) {
      const handler = (await import(`${process.cwd()}/${file}`)).default
      const method = (await Bun.file(file).text()).match(/req\.method !== '(GET|POST|PATCH)'/)?.[1] || 'GET'
      const response = await call(handler, method, { id: submissions[1].id }, {}, {}, { mogging_invite_admin: 'forged', mogging_creator_admin: 'forged' })
      if (file === 'pages/api/admin/invites/session.ts') {
        assert.equal(response.statusCode, 200)
        assert.deepEqual(response.body.data, { configured: true, unlocked: false })
        continue
      }
      assert.ok([401, 403, 404, 405].includes(response.statusCode), `${file} returned ${response.statusCode}`)
    }
  })
  await check('admin email spoofing is rejected and existing admin login remains compatible', async () => {
    current = { user: { id: a.id, email: administrator.email! } }
    await assert.rejects(admin.requireCreatorAdmin({ cookies: {} } as any, { setHeader() {} } as any), { status: 403 })
    signIn(administrator)
    await db.update(schema.users).set({ emailVerified: null }).where(eq(schema.users.id, administrator.id))
    await assert.rejects(admin.requireCreatorAdmin({ cookies: {} } as any, { setHeader() {} } as any), { status: 401 })
    await db.update(schema.users).set({ emailVerified: new Date() }).where(eq(schema.users.id, administrator.id))
    await assert.rejects(admin.requireCreatorAdmin({ cookies: {} } as any, { setHeader() {} } as any), { status: 401 })
    assert.equal(admin.verifyCreatorAdminPassword('isolated-security-admin-password'), true)
    let cookie = ''
    admin.setCreatorAdminUnlock({ setHeader: (_: string, value: string) => { cookie = value.split(';')[0].split('=').slice(1).join('=') } } as any, administrator.email!)
    const cookies = { mogging_creator_admin: cookie }
    assert.equal((await admin.requireCreatorAdmin({ cookies } as any, { setHeader() {} } as any)).email, administrator.email)
    const encoded = Buffer.from(JSON.stringify({ email: administrator.email, expiresAt: Date.now() + 60_000 })).toString('base64url')
    const legacyCookie = `${encoded}.${createHmac('sha256', process.env.NEXTAUTH_SECRET!).update(encoded).digest('base64url')}`
    assert.equal((await admin.requireCreatorAdmin({ cookies: { mogging_creator_admin: legacyCookie } } as any, { setHeader() {} } as any)).email, administrator.email)
    signIn(a)
  })
  await check('ordinary accounts receive no private creator metrics', async () => {
    assert.equal('communityMetrics' in await getCreatorDashboard(ordinary.id), false)
    const profile = await getPublicUserProfile(b.id)
    assert.equal('email' in profile.user, false)
    assert.equal(typeof profile.stats.analyses, 'number')
    assert.equal(typeof profile.stats.comparisons, 'number')
  })
  await check('approved templates retain reusable assets while owner and admin review data stay intact', async () => {
    const items = await db.insert(schema.creatorCtaLibraryItems).values([
      { creatorProfileId: pa.id, title: 'Owner template', status: 'approved' as const, reviewNote: 'Owner-only review' },
      { creatorProfileId: pb.id, title: 'Shared template', status: 'approved' as const, reviewNote: 'Other creator private review' },
      { creatorProfileId: pb.id, title: 'Pending template', status: 'pending' as const, reviewNote: 'Pending private review' },
    ].map(item => ({ ...item, templateId: 'editorial', formatId: 'vertical', assetUrl: 'https://images.example.invalid/template.mp4', assetStorageKey: `creators/${item.creatorProfileId === pa.id ? a.id : b.id}/cta-library/${crypto.randomUUID()}.mp4`, assetContentType: 'video/mp4', assetSizeBytes: 1 }))).returning()
    const result = await library.getCreatorCtaLibrary(a.id)
    assert.equal(result.approved.length, 2)
    assert.ok(result.approved.every(item => item.assetUrl === 'https://images.example.invalid/template.mp4' && item.creatorName === 'Community template'))
    assert.ok(result.approved.every(item => !('creatorProfileId' in item) && !('reviewNote' in item)))
    assert.equal(result.mine[0].reviewNote, 'Owner-only review')
    assert.equal(result.mine[0].creatorProfileId, pa.id)
    assert.equal((await library.getAdminCtaLibrary()).find(item => item.id === items[1].id)?.reviewNote, 'Other creator private review')
    await library.reviewCreatorCtaLibraryItem({ id: items[1].id, status: 'rejected', reviewNote: 'Updated feedback' }, administrator.email!)
    assert.equal((await library.getCreatorCtaLibrary(a.id)).approved.length, 1)
    assert.equal((await library.getCreatorCtaLibrary(b.id)).mine.find(item => item.id === items[1].id)?.reviewNote, 'Updated feedback')
    await assert.rejects(library.createCreatorCtaLibraryItem(a.id, { title: 'Wrong owner', templateId: 'editorial', formatId: 'vertical', assetStorageKey: `creators/${b.id}/cta-library/${crypto.randomUUID()}.png`, assetContentType: 'image/png', assetSizeBytes: 1 }), { status: 400 })
    for (const assetContentType of ['image/png', 'video/mp4'] as const) {
      const created = await library.createCreatorCtaLibraryItem(a.id, { title: 'New owner template', templateId: 'editorial', formatId: 'vertical', assetStorageKey: `creators/${a.id}/cta-library/${crypto.randomUUID()}.${assetContentType === 'image/png' ? 'png' : 'mp4'}`, assetContentType, assetSizeBytes: 1 })
      assert.equal(created.creatorProfileId, pa.id)
      assert.equal(created.status, 'pending')
      assert.ok(created.assetUrl.startsWith('/uploads/creators/'))
    }
  })
  await check('legacy anonymous sessions and automatic avatars retain their original contracts', async () => {
    const id = crypto.randomUUID()
    assert.equal(getAnonymousActorId({ headers: { cookie: `mogging_anonymous_actor=${id}` } } as any), id)
    assert.equal(getOrSetAnonymousActorId({ headers: { cookie: `mogging_anonymous_actor=${id}` } } as any, { setHeader() { throw new Error('Existing sessions must not be replaced') } } as any), id)
    await updateUserAvatarIfMissing(b.id, '/uploads/original-report.png')
    await updateUserAvatarIfMissing(b.id, '/uploads/later-report.png')
    assert.equal((await db.query.users.findFirst({ where: eq(schema.users.id, b.id) }))?.image, '/uploads/original-report.png')
  })
  await check('health diagnostics retain the existing response contract', async () => {
    const handler = (await import('@/pages/api/health')).default
    const response = await call(handler)
    assert.ok([200, 503].includes(response.statusCode))
    for (const key of ['ok', 'service', 'environment', 'latencyMs', 'database', 'rateLimit', 'config']) assert.ok(key in response.body.data)
    assert.equal(response.body.data.database.ok, true)
  })
  const output = { checkedAt: new Date().toISOString(), scope: 'Real isolated PostgreSQL; authenticated synthetic creator A, creator B, ordinary user and verified admin; no production records or provider calls.', passed: checks.length, checks }
  await Bun.write('docs/qa/creator-access-verification-2026-10-16.json', JSON.stringify(output, null, 2) + '\n')
  console.log(`${checks.length} security groups passed`)
} finally { await db.$client.end() }
