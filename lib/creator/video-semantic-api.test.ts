import { expect, test } from 'bun:test'
import handler from '@/pages/api/creator/visual-plan'
import { createProductionDraft } from './production-drafts'
import { decodeVisualSection } from './video-semantics'
import type { NextApiRequest, NextApiResponse } from 'next'

function response() {
  let code = 200, body: unknown
  const headers = new Map<string, string>()
  const res = { setHeader(name: string, value: string) { headers.set(name, value); return this }, status(value: number) { code = value; return this }, json(value: unknown) { body = value; return this } }
  return { res: res as unknown as NextApiResponse, get code() { return code }, get body() { return body as { data?: { script?: { revision: string }; configured?: boolean }; error?: { message: string } } }, headers }
}
const request = (method: string, body?: unknown, origin = 'http://localhost:3027') => ({ method, body, headers: { host: 'localhost:3027', origin } }) as NextApiRequest

test('visual-plan API guards origin, reports unavailable configuration and applies only validated model output', async () => {
  const environment = { node: process.env.NODE_ENV, key: process.env.GEMINI_API_KEY }, originalFetch = globalThis.fetch
  try {
    Object.assign(process.env, { NODE_ENV: 'development' }); delete process.env.GEMINI_API_KEY
    const absent = response(); await handler(request('GET'), absent.res)
    expect(absent.body.data?.configured).toBe(false)
    expect(absent.headers.get('Cache-Control')).toBe('no-store')
    const forbidden = response(); await handler(request('POST', {}, 'https://unrelated.example'), forbidden.res)
    expect(forbidden.code).toBe(403)
    const missing = response(); await handler(request('POST', {}), missing.res)
    expect(missing.code).toBe(503)
    process.env.GEMINI_API_KEY = 'test-only-key'
    const script = createProductionDraft('Marlon')
    const sections = script.cues.map(cue => ({ sourceId: cue.sourceId, beats: decodeVisualSection(cue.text).beats }))
    let calls = 0
    globalThis.fetch = (async (url, init) => {
      calls++
      expect(String(url)).toEndWith('gemini-3.8-flash:generateContent')
      const body = JSON.parse(String(init?.body))
      expect(body.generationConfig.responseFormat.text.mimeType).toBe('APPLICATION_JSON')
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ sections }) }] } }] })
    }) as typeof fetch
    const valid = response(); await handler(request('POST', { script }), valid.res)
    expect(valid.code).toBe(200)
    expect(valid.body.data?.script?.revision).toBe(script.revision)
    sections[0].beats[0].quote = 'Invented wording.'
    const invalid = response(); await handler(request('POST', { script }), invalid.res)
    expect(invalid.code).toBe(502)
    expect(invalid.body.error?.message).toContain('current plan is unchanged')
    expect(calls).toBe(2)
  } finally {
    globalThis.fetch = originalFetch
    if (environment.node === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: environment.node })
    if (environment.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = environment.key
  }
})
