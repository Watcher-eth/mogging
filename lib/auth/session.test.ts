import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

test('creator/admin API sessions disable caching without changing public or page responses', () => {
  const source = readFileSync(new URL('./session.ts', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replace('export function', 'function')
  const calls: unknown[][] = [], options = { fixture: true }, session = { user: { id: 'existing-user' } }
  const context: any = { authOptions: options, getServerSession: (...args: unknown[]) => { calls.push(args); return session } }
  runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source) + '\nglobalThis.run = getAuthSession', context)
  for (const url of ['/api/creator', '/api/creator/submissions/a/messages?limit=1', '/api/admin/creator', '/api/admin/invites/session', '/api/leaderboard/photos', '/api/app-config', '/creator', '/admin', undefined]) {
    const headers: Record<string, unknown> = {}, req = { url }, res = { setHeader: (key: string, value: unknown) => { headers[key] = value } }
    expect(context.run(req, res)).toBe(session)
    expect(headers['Cache-Control']).toBe(url?.startsWith('/api/creator') || url?.startsWith('/api/admin') ? 'private, no-store' : undefined)
    expect(calls.at(-1)).toEqual([req, res, options])
  }
})
