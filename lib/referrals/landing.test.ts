import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

function landing({ session = null, confirmed = false, validLink = true }: { session?: any; confirmed?: boolean; validLink?: boolean } = {}) {
  const credited: Array<[string, string]> = []
  const headers = new Map<string, unknown>()
  const scope: any = {
    createReferralTicket: async () => validLink ? 'fresh-ticket' : null,
    readReferralTicket: (value: string) => value === 'first-ticket' ? { code: '0123456789abcdef01' } : null,
    referralCookie: (value: string) => `mogging_referral=${value}; HttpOnly; SameSite=Lax`,
    REFERRAL_COOKIE: 'mogging_referral', getAuthSession: async () => session,
    creditReferralSignup: async (id: string, ticket: string) => { credited.push([id, ticket]) },
    db: { select: () => ({ from: () => ({ where: async () => confirmed ? [{ id: 'friend' }] : [] }) }) },
    schema: { referralSignups: { referredUserId: 'referred_user_id' } }, eq() {},
    env: { GOOGLE_CLIENT_ID: 'configured', GOOGLE_CLIENT_SECRET: 'configured' },
  }
  const page = readFileSync(new URL('../../pages/[referral].tsx', import.meta.url), 'utf8')
  const selected = page.slice(page.indexOf('export const getServerSideProps'), page.indexOf('export default function'))
  runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(selected.replace('export const', 'const') + '\nglobalThis.render = getServerSideProps;'), scope)
  const render = (cookie?: string) => scope.render({ params: { referral: 'abcdef0123456789ab' }, req: { cookies: { mogging_referral: cookie } }, res: { setHeader: (key: string, value: unknown) => headers.set(key, value) } })
  return { render, credited, headers }
}

test('valid invitation renders before installation and preserves first-touch attribution', async () => {
  const h = landing()
  const result = await h.render('first-ticket')
  expect(result.props.account).toBeNull()
  expect(result.props.googleAvailable).toBe(true)
  expect(result.props.code).toBe('0123456789abcdef01')
  expect(h.headers.has('Set-Cookie')).toBe(false)
  expect(h.headers.get('Cache-Control')).toBe('private, no-store')
  expect(h.credited).toEqual([])
})

test('invalid links are rejected and expired cookies are replaced with signed invitations', async () => {
  expect(await landing({ validLink: false }).render()).toEqual({ notFound: true })
  const h = landing()
  await h.render('expired-ticket')
  expect(h.headers.get('Set-Cookie')).toContain('mogging_referral=fresh-ticket')
})

test('only confirmed account attribution displays saved state after authentication', async () => {
  for (const confirmed of [false, true]) {
    const h = landing({ session: { user: { id: 'friend', email: 'friend@example.invalid' } }, confirmed })
    const result = await h.render('first-ticket')
    expect(h.credited).toEqual([['friend', 'first-ticket']])
    expect(result.props.account).toEqual({ email: 'friend@example.invalid', credited: confirmed })
  }
})

test('copy-and-download hands off only after clipboard write succeeds', async () => {
  const page = readFileSync(new URL('../../pages/[referral].tsx', import.meta.url), 'utf8')
  const source = page.slice(page.indexOf('  async function copyAndDownload()'), page.indexOf('  async function saveInvitation()'))
  for (const fails of [false, true]) {
    const calls: string[] = []
    let error: string | null = null
    const scope: any = {
      url: 'https://www.mogging.com/abcdef0123456789ab', appStoreUrl: 'https://apps.apple.com/app/id6771414050',
      navigator: { clipboard: { writeText: async (text: string) => { calls.push(text); if (fails) throw new Error('Clipboard denied') } } },
      window: { location: { assign: (url: string) => calls.push(url) } },
      setBusy() {}, setError: (value: string | null) => { error = value },
    }
    runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source + '\nglobalThis.copy = copyAndDownload;'), scope)
    await scope.copy()
    expect(calls).toEqual(fails ? [scope.url] : [scope.url, scope.appStoreUrl])
    expect(Boolean(error)).toBe(fails)
  }
})
