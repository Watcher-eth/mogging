import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '../api/http'

test('code redemption requires authentication and account throttling before granting credits', async () => {
  let userId: string | null = null
  let blocked = false
  let grants = 0
  const limits: any[] = []
  const source = readFileSync(new URL('../../pages/api/payments/redeem-code.ts', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/gm, '').replace(/^export default[^\n]*/gm, '')
  const scope: any = { z, ApiError, handleApiError, json, methodNotAllowed, parseBody,
    getRequestUserId: async () => userId,
    enforceRateLimit: async (_req: unknown, _res: unknown, options: any) => {
      limits.push(options)
      if (blocked && options.identity) throw new ApiError(429, 'Rate limit exceeded')
    },
    redeemPaymentActivationCode: async (input: any) => { grants++; return input },
    redeemInviteCode: async () => { throw new Error('Unexpected invite fallback') },
    recordServerEvent: async () => {},
  }
  runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source + '\nglobalThis.handler = handler'), scope)
  async function call() {
    const result = { status: 0, body: null as any }
    const res = { setHeader() {}, status: (status: number) => { result.status = status; return res }, json: (body: any) => { result.body = body; return res } }
    await scope.handler({ method: 'POST', body: { code: '123456', mobileInstallId: 'spoofed-device', userId: 'attacker' } }, res)
    return result
  }
  expect((await call()).status).toBe(401)
  expect(grants).toBe(0)
  userId = 'verified-account'
  blocked = true
  expect((await call()).status).toBe(429)
  expect(grants).toBe(0)
  expect(limits.at(-1)).toMatchObject({ identity: userId, limit: 10 })
  blocked = false
  const allowed = await call()
  expect(allowed.status).toBe(200)
  expect(allowed.body.data.entitlements.userId).toBe(userId)
  expect(grants).toBe(1)
})
