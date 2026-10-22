import { afterEach, expect, test } from 'bun:test'
import { apiPost } from './client'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('paid scan headers retain JSON parsing and authentication for every HeadersInit form', async () => {
  const paid = { 'x-mogging-mobile-install-id': 'web-fixture', 'x-mogging-request-id': 'scan-fixture' }
  for (const headers of [paid, Object.entries(paid), new Headers(paid)]) {
    let received: Request | undefined
    globalThis.fetch = (async (path, init) => {
      received = new Request(`https://www.mogging.com${path}`, init)
      return Response.json({ data: { analysis: { status: 'complete' } } })
    }) as typeof fetch
    const result = await apiPost('/api/web/analyze', { imageData: 'fixture', gender: 'male' }, { headers })
    expect(received!.headers.get('content-type')).toBe('application/json')
    expect(received!.headers.get('x-mogging-mobile-install-id')).toBe('web-fixture')
    expect(received!.headers.get('x-mogging-request-id')).toBe('scan-fixture')
    // Next parses text/plain into a string, which reproduced the customer's root Zod error.
    expect(typeof await received!.json()).toBe('object')
    expect(result).toEqual({ analysis: { status: 'complete' } })
  }
})

test('explicit content types and request options are preserved', async () => {
  globalThis.fetch = (async (_path, init) => {
    expect(new Headers(init?.headers).get('content-type')).toBe('application/vnd.mogging+json')
    expect(init?.credentials).toBe('include')
    expect(init?.method).toBe('POST')
    return Response.json({ data: true })
  }) as typeof fetch
  await expect(apiPost('/api/test', {}, { headers: { 'Content-Type': 'application/vnd.mogging+json' }, credentials: 'include' })).resolves.toBe(true)
})
