import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

test('missing email credentials are reported as unconfigured without claiming or sending', async () => {
  let claims = 0, sends = 0
  const source = readFileSync(new URL('./alerts.ts', import.meta.url), 'utf8').replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '')
  const context: any = {
    env: { UPSTASH_REDIS_REST_URL: 'https://test.invalid', UPSTASH_REDIS_REST_TOKEN: 'test-only' },
    process: { env: { RELIABILITY_ALERT_EMAIL: 'recipient@example.invalid' } },
    Redis: class { async set() { claims++; return 'OK' } },
    randomUUID: () => 'test-trace', fetch: async () => { sends++; return new Response(null, { status: 200 }) },
  }
  runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source + '\nglobalThis.api = { sendReliabilityAlert, reliabilityAlertStatus }'), context)
  expect(context.api.reliabilityAlertStatus()).toMatchObject({ configured: false })
  expect(await context.api.sendReliabilityAlert('analyze', 'provider_unavailable', 'test-trace')).toBe('unconfigured')
  expect(claims).toBe(0)
  expect(sends).toBe(0)
})
