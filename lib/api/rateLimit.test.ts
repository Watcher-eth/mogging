import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ApiError } from './http'

function limiter(shared: boolean) {
  const source = readFileSync(new URL('./rateLimit.ts', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '')
  const counts = new Map<string, number>()
  const scope: any = { Date, Map, ApiError,
    env: shared ? { UPSTASH_REDIS_REST_URL: 'test', UPSTASH_REDIS_REST_TOKEN: 'test' } : {},
    Redis: class {
      async incr(key: string) { const count = (counts.get(key) ?? 0) + 1; counts.set(key, count); return count }
      async expire() {}
    },
  }
  runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source + '\nglobalThis.result = { enforceRateLimit, getRateLimitBackend }'), scope)
  return scope.result
}

for (const shared of [false, true]) test(`${shared ? 'shared' : 'memory'} limiter protects one account across rotating IPs and isolates other accounts`, async () => {
  const { enforceRateLimit, getRateLimitBackend } = limiter(shared)
  expect(getRateLimitBackend()).toBe(shared ? 'upstash' : 'memory')
  const headers: Record<string, string> = {}
  const res = { setHeader: (key: string, value: string) => { headers[key] = value } }
  const attempt = (identity: string, ip: string) => enforceRateLimit({ headers: { 'x-forwarded-for': ip }, socket: {} }, res,
    { key: 'redeem', identity, limit: 10, windowMs: 900000 })
  for (let i = 0; i < 10; i++) await attempt('account-a', String(i))
  await expect(attempt('account-a', 'new-ip')).rejects.toThrow('Rate limit exceeded')
  expect(headers['RateLimit-Remaining']).toBe('0')
  await attempt('account-b', 'new-ip')
  expect(headers['RateLimit-Remaining']).toBe('9')
})
