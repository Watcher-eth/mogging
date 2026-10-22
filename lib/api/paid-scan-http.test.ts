import { expect, test } from 'bun:test'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parseBody as parseNextBody } from 'next/dist/server/api-utils/node/parse-body'
import { z } from 'zod'
import { apiPost } from './client'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from './http'

test('paid scan reproduces the old HTTP 400, fixes JSON headers and recovers already loaded web bundles', async () => {
  let reservations = 0, generated = 0, finished = 0
  let saved: unknown = null
  const scope: any = { Date, Promise, Math, Number, JSON, createHash, randomUUID, ApiError, handleApiError, json, methodNotAllowed, parseBody,
    console: { info() {}, error() {}, warn() {} }, env: { AUTH_REQUIRED: true },
    enforceRateLimit: async () => {}, getRequestUserId: async () => 'paid-buyer',
    db: { query: { users: { findFirst: async () => null } } }, schema: { users: {} }, eq: () => ({}),
    hairColorSchema: { safeParse: () => ({}) }, skinColorSchema: { safeParse: () => ({}) }, normalizeApparentAge: () => null,
    reserveEvaluation: async () => { if (!saved) reservations++; return { id: 'paid-reservation', result: saved, summary: { evaluationCredits: 0 } } },
    finishEvaluation: async (_id: string, result: unknown, success: boolean) => { expect(success).toBe(true); saved = result; finished++ },
    markEvaluationStarted: () => {}, createAnalysisShare: async () => null,
  }
  const source = readFileSync(new URL('../analysis/handler.ts', import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, '')
  runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source + '\nglobalThis.create = createAnalyzeHandler;'), scope)
  const run = async () => { generated++; return { analysis: { id: 'saved-report', status: 'complete' } } }
  const bodySchema = z.object({ imageData: z.string(), photoType: z.literal('front'), gender: z.literal('male') })
  let handler = scope.create(run, bodySchema, 'web:')
  const server = createServer(async (req, response) => {
    const res: any = response
    res.status = (code: number) => { res.statusCode = code; return res }
    res.json = (body: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res }
    const parsed: any = req
    parsed.body = await parseNextBody(parsed, '1mb')
    await handler(parsed, res)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address() as { port: number }
    const url = `http://127.0.0.1:${address.port}/api/web/analyze`
    const body = { imageData: 'test-image-provider-stub', photoType: 'front', gender: 'male' }
    const headers = { 'x-mogging-request-id': 'paid-scan', 'x-mogging-mobile-install-id': 'web-install' }
    // The previous object spread replaced Content-Type with the paid request headers.
    const broken = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    expect(broken.status).toBe(400)
    expect(reservations).toBe(0)
    const route = readFileSync(new URL('../../pages/api/web/analyze.ts', import.meta.url), 'utf8')
      .replace(/^import .*\n/gm, '').replace(/^export const config.*\n/gm, '').replace('export default ', 'globalThis.handler = ')
    const routeScope: any = { z, JSON, webAnalyzeSchema: bodySchema, analyzeAndSaveWeb: run,
      createAnalyzeHandler: scope.create, monitorBackend: (_name: string, fn: unknown) => fn }
    runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(route), routeScope)
    handler = routeScope.handler
    const complete = await apiPost<any>(url, body, { headers })
    expect(complete.analysis).toEqual({ id: 'saved-report', status: 'complete' })
    const legacyRetry = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    expect(legacyRetry.status).toBe(200)
    expect((await legacyRetry.json()).data.analysis.id).toBe('saved-report')
    const invalid = await fetch(url, { method: 'POST', headers, body: 'not JSON' })
    expect(invalid.status).toBe(400)
    expect({ reservations, generated, finished }).toEqual({ reservations: 1, generated: 1, finished: 1 })
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})
