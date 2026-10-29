import { expect, test } from 'bun:test'
import { registerSupportCommands } from './registration'
import { supportCommands } from './commands'

const config = { applicationId: '1565455254227783811', guildId: '1526698974847963268', botToken: 'test-token' }
test('registers standalone commands, preserves unrelated commands, and removes only the legacy parent', async () => {
  const original = globalThis.fetch, calls: Array<{ url: string; method: string; body?: string }> = []
  globalThis.fetch = (async (url, init) => {
    const method = init?.method ?? 'GET'
    calls.push({ url: String(url), method, body: init?.body as string | undefined })
    return method === 'GET' ? Response.json([{ id: '1565455254227783800', name: 'mogging', type: 1 }, { id: '1565455254227783801', name: 'moderate', type: 1 }]) : new Response(null, { status: method === 'DELETE' ? 204 : 200 })
  }) as typeof fetch
  try {
    const names = await registerSupportCommands(config)
    expect(names).toContain('/ask')
    expect(names).toContain('/connect')
    const definitions = calls.filter(c => c.method === 'POST').map(c => JSON.parse(c.body!))
    expect(definitions).toHaveLength(supportCommands.length)
    expect(definitions.every(c => c.type === 1 && !c.options?.some((o: { type: number }) => o.type === 1))).toBe(true)
    expect(definitions.find(c => c.name === 'ask').options[0].name).toBe('question')
    const deleted = calls.filter(c => c.method === 'DELETE')
    expect(deleted).toHaveLength(1)
    expect(deleted[0].url).toEndWith('/1565455254227783800')
    expect(calls.some(c => c.method === 'PUT')).toBe(false)
  } finally { globalThis.fetch = original }
})
test('a failed registration never removes the working legacy command', async () => {
  const original = globalThis.fetch, methods: string[] = []
  globalThis.fetch = (async (_url, init) => {
    const method = init?.method ?? 'GET'; methods.push(method)
    return method === 'GET' ? Response.json([{ id: '1565455254227783800', name: 'mogging', type: 1 }]) : new Response(null, { status: 403 })
  }) as typeof fetch
  try {
    await expect(registerSupportCommands(config)).rejects.toThrow('403')
    expect(methods).not.toContain('DELETE')
  } finally { globalThis.fetch = original }
})
test('retries Discord throttling before continuing command registration', async () => {
  const original = globalThis.fetch
  let limited = false, completed = 0
  globalThis.fetch = (async (_url, init) => {
    if (!init?.method) return Response.json([])
    if (!limited) { limited = true; return Response.json({ retry_after: 0 }, { status: 429 }) }
    completed++; return new Response(null, { status: 200 })
  }) as typeof fetch
  try {
    await registerSupportCommands(config)
    expect(limited).toBe(true)
    expect(completed).toBe(supportCommands.length)
  } finally { globalThis.fetch = original }
})
