import { Glob } from 'bun'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

// Read-only production checks. Never send real credentials or retain response records.
const base = new URL(process.argv[2] || 'https://www.mogging.com')
if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Expected an HTTP origin')
const output = resolve(process.argv[3] || 'docs/qa/api-exposure-evidence-2026-10-16.json')
const root = resolve(import.meta.dir, '../..')
const files = [...new Glob('pages/api/**/*.{ts,tsx}').scanSync({ cwd: root })].sort()
const inventory = await Promise.all(files.map(async file => {
  const source = await readFile(resolve(root, file), 'utf8')
  return {
    file,
    route: '/' + file.replace(/^pages\//, '').replace(/\.tsx?$/, '').replace(/\/index$/, ''),
    authReferences: [...new Set(source.match(/\b(?:requireCreatorAdmin|requireInviteAdmin|getAuthSession|getRequestUserId|courseUser|courseApi|createAnalyzeHandler|verifyAuthorization|constructEvent|CRON_SECRET)\b/g) || [])],
  }
}))

type Result = { path: string; status: number; cache: string | null; dataKeys: string[]; method: string; total?: number; itemFields?: string[]; errorCode?: string; transportError?: boolean }
async function request(path: string, headers: Record<string, string> = {}, method = 'GET') {
  try {
    const response = await fetch(new URL(path, base.origin), {
      method, headers: method !== 'GET' ? { ...headers, 'Content-Type': 'application/json' } : headers,
      ...(method !== 'GET' ? { body: '{}' } : {}),
      redirect: 'manual', signal: AbortSignal.timeout(20_000),
    })
    const body = response.headers.get('content-type')?.includes('application/json')
      ? await response.json().catch(() => null) : null
    if (!body) await response.body?.cancel()
    const result: Result = {
      path, method, status: response.status, cache: response.headers.get('cache-control'),
      dataKeys: body?.data && typeof body.data === 'object' ? Object.keys(body.data) : [],
      ...(typeof body?.data?.total === 'number' ? { total: body.data.total } : {}),
      ...(Array.isArray(body?.data?.items) && body.data.items[0] ? { itemFields: Object.keys(body.data.items[0]) } : {}),
      ...(typeof body?.error?.code === 'string' ? { errorCode: body.error.code } : {}),
    }
    return { result, body }
  } catch {
    return { result: { path, method, status: 0, cache: null, dataKeys: [], transportError: true } as Result, body: null }
  }
}

const protectedPaths = inventory
  .filter(item => /^\/api\/(?:admin|creator|cron)(?:\/|$)/.test(item.route))
  .filter(item => !item.route.includes('[') && !item.route.includes('/oauth/'))
  .map(item => item.route)
  .concat([
    '/api/admin/courses', '/api/creator/courses', '/api/user/me',
    '/api/creator/sprints/00000000-0000-4000-8000-000000000000',
    '/api/creator/submissions/00000000-0000-4000-8000-000000000000/messages',
    '/api/admin/creator/submissions/00000000-0000-4000-8000-000000000000/messages',
    '/api/admin/creator/payments/00000000-0000-4000-8000-000000000000/receipt',
    '/api/payments/entitlements?mobileInstallId=security-audit-install',
  ])
const protectedResults: Result[] = []
const expectedPublicPaths = new Set<string>()
// Sequential requests keep load low and make the evidence easy to interpret.
for (const path of protectedPaths) {
  const { result, body } = await request(path)
  protectedResults.push(result)
  if (path === '/api/admin/invites/session' && body?.data?.unlocked === false && result.dataKeys.every(key => ['configured', 'unlocked'].includes(key))) expectedPublicPaths.add(path)
  if (path === '/api/cron/courses' && body?.data?.enabled === false && result.dataKeys.length === 1) expectedPublicPaths.add(path)
}
// Empty bodies cannot satisfy the mutation schemas; authentication should reject first.
for (const path of [
  '/api/admin/creator/payments',
  '/api/creator/accounts/analytics-upload-intent', '/api/creator/claim-invite',
  '/api/creator/cta-library/asset', '/api/creator/cta-library/upload-intent',
  '/api/creator/payouts', '/api/creator/submission-analytics-upload-intent',
  '/api/creator/submission-analytics', '/api/creator/upload-intent', '/api/creator/video',
]) protectedResults.push((await request(path, {}, 'POST')).result)
for (const path of ['/api/admin/creator/metrics', '/api/admin/creator/payout-requests', '/api/admin/creator/review', '/api/admin/creator/settings']) {
  protectedResults.push((await request(path, {}, 'PATCH')).result)
}

const publicResults: Result[] = []
let samplePhoto: { id: string; userId?: string | null } | undefined
for (const path of [
  '/api/health', '/api/app-config', '/api/auth/providers',
  '/api/leaderboard/photos?limit=1', '/api/leaderboard/psl?limit=1',
  '/api/leaderboard/users?limit=1', '/api/search/users?q=a&limit=1',
  '/api/courses', '/api/experimental/analysis-v2/landmarks',
  '/api/analysis/00000000-0000-4000-8000-000000000000', '/.env', '/.git/HEAD',
]) {
  const { result, body } = await request(path)
  publicResults.push(result)
  if (path.startsWith('/api/leaderboard/photos')) samplePhoto = body?.data?.items?.[0]
}

const identityChecks: Record<string, unknown> = {}
if (samplePhoto?.id) {
  const { result, body } = await request(`/api/leaderboard/profile?photoId=${encodeURIComponent(samplePhoto.id)}`)
  publicResults.push({ ...result, path: '/api/leaderboard/profile?photoId=<sample>' })
  const photos = body?.data?.photos
  const actor = Array.isArray(photos) ? photos.find(photo => photo.anonymousActorId)?.anonymousActorId : null
  identityChecks.publicProfileExposesAnonymousActor = typeof actor === 'string'
  if (typeof actor === 'string' && /^[a-f0-9-]{36}$/.test(actor)) {
    const { result: read, body: profile } = await request('/api/auth/anonymous-profile', { Cookie: `mogging_anonymous_actor=${actor}` })
    identityChecks.anonymousProfileWithPublishedActor = {
      status: read.status,
      returnedExistingProfile: Boolean(profile?.data?.profile),
      returnedActorMatchesPublishedActor: profile?.data?.profile?.anonymousActorId === actor,
    }
  }
}
for (const [name, headers] of [
  ['forgedAdminCookie', { Cookie: 'mogging_creator_admin=invalid.invalid; mogging_invite_admin=invalid.invalid' }],
  ['forgedNextAuthCookie', { Cookie: '__Secure-next-auth.session-token=invalid; next-auth.session-token=invalid' }],
  ['forgedMobileBearer', { Authorization: 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
] as const) {
  const path = name === 'forgedMobileBearer' ? '/api/payments/entitlements?mobileInstallId=security-audit-install' : '/api/admin/creator'
  identityChecks[name] = (await request(path, headers)).result.status
}

const evidence = {
  checkedAt: new Date().toISOString(), origin: base.origin,
  scope: 'Unauthenticated GET and empty-body POST/PATCH rejection checks; no valid mutation, account creation, payment, upload, bulk collection, or private-network probing.',
  routeModuleCount: inventory.length, inventory, protectedResults, publicResults, identityChecks,
  unexpectedProtectedResponses: protectedResults.filter(result => ![401, 403, 404, 405].includes(result.status) && !(result.status === 200 && result.method === 'GET' && expectedPublicPaths.has(result.path))),
  note: '405 only verifies method rejection. 404 may mean feature disabled. Inventory auth references are navigation hints, not proof of authorization. Invite session GET intentionally returns configuration/unlock booleans; disabled course cron returns enabled:false.',
}
await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify(evidence, null, 2) + '\n')
console.log(JSON.stringify({ output, routes: inventory.length, protectedChecks: protectedResults.length, publicChecks: publicResults.length, identityChecks, unexpectedProtectedResponses: evidence.unexpectedProtectedResponses.length, transportErrors: [...protectedResults, ...publicResults].filter(result => result.transportError).length }, null, 2))
if (evidence.unexpectedProtectedResponses.length || [...protectedResults, ...publicResults].some(result => result.transportError)) process.exitCode = 1
