import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ApiError } from '../api/http'

function load(file: string, context: Record<string, unknown>, expose: string) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from [^\n]+\n/gm, '').replace(/^export default [^\n]+/gm, '').replace(/^export /gm, '')
  const scope: any = { URL, Date, ...context }
  runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source + `\nglobalThis.result = ${expose}`), scope)
  return scope.result
}
const ops = { eq: (...args: unknown[]) => args, and: (...args: unknown[]) => args, notInArray: (...args: unknown[]) => args }

test('Apple returning sign-in rejects new identities without creating an account or session; default signup remains available', async () => {
  let writes = 0
  let stored: { id: string } | null = null
  let linked: { userId: string } | null = null
  const users = { email: 'email' }, accounts = { provider: 'provider', providerAccountId: 'subject' }
  const db = { query: { users: { findFirst: async () => stored }, accounts: { findFirst: async () => linked } },
    insert: (table: unknown) => ({ values: () => ({ onConflictDoNothing: async () => {
      writes++
      if (table === users) stored = { id: 'new-user' }
      else linked = { userId: stored!.id }
    } }) }) }
  const find = load('./mobile-session.ts', { db, schema: { users, accounts }, ...ops, ApiError,
    createHash: () => {}, randomBytes: () => {} }, 'findOrCreateAppleUser')
  await expect(find({ subject: 'apple', email: 'new@example.test' }, null, true)).rejects.toThrow('No existing Mogging account')
  expect(writes).toBe(0)
  expect(await find({ subject: 'apple', email: 'new@example.test' }, null, false)).toBe('new-user')
  expect(writes).toBe(2)
  expect(await find({ subject: 'apple', email: null }, null, true)).toBe('new-user')
  expect(writes).toBe(2)
})

test('Google returning sign-in denies unknown users before adapter signup and leaves ordinary web/mobile signup unchanged', async () => {
  let existing: { id: string } | null = null
  const handler = load('../../pages/api/auth/[...nextauth].ts', {
    ...ops, db: { query: { users: { findFirst: async () => existing } } }, schema: { users: { email: 'email' } },
    authOptions: { callbacks: {} }, NextAuth: (_req: unknown, _res: unknown, options: unknown) => options,
  }, 'handler')
  const req = { cookies: { 'next-auth.callback-url': 'https://www.mogging.com/app/mobile-auth?existingOnly=1' } }
  const callback = handler(req, {}).callbacks.signIn
  expect(await callback({ user: { email: 'new@example.test' }, account: { provider: 'google' } })).toBe('/app/mobile-auth?error=account_not_found')
  existing = { id: 'existing' }
  expect(await callback({ user: { email: 'old@example.test' }, account: { provider: 'google' } })).toBe(true)
  existing = null
  expect(await handler({ cookies: {} }, {}).callbacks.signIn({ user: {}, account: { provider: 'google' } })).toBe(true)
})

test('returning access requires server history, preserves exhausted/expired customers and saved reports, and never trusts client onboarding flags', async () => {
  let purchase: { id: string } | null = null
  let reports: unknown[] = []
  const chain: any = { innerJoin: () => chain, where: () => chain, limit: async () => reports }
  const canResume = load('./mobile-access.ts', { ...ops,
    db: { query: { paymentEntitlements: { findFirst: async () => purchase } }, select: () => ({ from: () => chain }) },
    schema: { paymentEntitlements: {}, analyses: {}, photos: {} } }, 'canResumeMobileAccount')
  expect(await canResume('new')).toBe(false)
  purchase = { id: 'exhausted-or-expired-purchase' }
  expect(await canResume('paid')).toBe(true)
  purchase = null
  reports = [{ id: 'legacy-report' }]
  expect(await canResume('legacy')).toBe(true)
})

test('legacy admin header cannot skip authentication or paid scan reservation on either analysis route', async () => {
  let userId: string | null = null, generations = 0, reservations = 0
  const create = load('../analysis/handler.ts', {
    getRequestUserId: async () => userId, enforceRateLimit: async () => {},
    parseBody: () => ({ imageData: 'fixture', photoType: 'front', gender: 'other' }),
    env: { AUTH_REQUIRED: false }, ApiError, console: { info() {}, error() {} },
    randomUUID: () => 'request', createHash: () => ({ update: () => ({ digest: () => 'hash' }) }),
    analyzeAndSaveSchema: {}, analyzeAndSave: async () => { generations++; },
    getOrSetAnonymousActorId: () => 'anonymous', getAnonymousProfile: async () => null,
    db: { query: { users: { findFirst: async () => null } } }, schema: { users: {} }, ...ops,
    hairColorSchema: { safeParse: () => ({}) }, skinColorSchema: { safeParse: () => ({}) },
    reserveEvaluation: async () => { reservations++; throw new ApiError(402, 'No scans'); },
    handleApiError: (error: ApiError) => error.status,
  }, 'createAnalyzeHandler')
  for (const namespace of ['', 'v2:']) {
    const handler = create(undefined, undefined, namespace)
    const req = { method: 'POST', headers: { 'x-mogging-admin-code': '674523' }, body: {} }
    userId = null
    expect(await handler(req, {})).toBe(401)
    userId = 'unpaid'
    expect(await handler(req, {})).toBe(402)
  }
  expect(reservations).toBe(2)
  expect(generations).toBe(0)
})
