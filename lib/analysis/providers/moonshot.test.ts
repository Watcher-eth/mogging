import { expect, test } from 'bun:test'
import { z } from 'zod'
import { requestMoonshotJson } from './moonshot'
const body = { model: 'test-only', max_tokens: 4000, messages: [{ role: 'user', content: 'Required assessment' }] }
const parse = (v: unknown) => z.object({ score: z.number().min(0).max(10) }).parse(v)
const completion = (value: unknown) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] })
const options = { stage: 'test_assessment', apiKey: 'test-only', body, parse }

test('temporary HTTP errors recover once; completed request and validation keep one deadline', async () => {
  for (const status of [429, 500, 502, 503, 504]) {
    let calls = 0
    const result = await requestMoonshotJson({ ...options, fetcher: async () => ++calls === 1 ? new Response('private provider body', { status, headers: { 'retry-after': '0' } }) : completion({ score: 6 }) })
    expect(calls).toBe(2); expect(result.value.score).toBe(6); expect(result.timing.attempts).toBe(2)
  }
})
test('long Retry-After, persistent errors, and auth failures cannot cause retry storms', async () => {
  for (const [status, retryAfter, attempts] of [[429, '60', 1], [503, 'invalid', 1], [401, '0', 1], [400, '0', 1], [503, '0', 2]] as const) {
    let calls = 0
    try { await requestMoonshotJson({ ...options, fetcher: async () => { calls++; return new Response('private image secret', { status, headers: { 'retry-after': retryAfter } }) } }); throw new Error('Unexpected success') }
    catch (error: any) { expect(error.status).toBe(status); expect(error.raw).not.toContain('private'); expect(calls).toBe(attempts) }
  }
})
test('required output is regenerated once with safe diagnostics, never clamped into a valid score', async () => {
  const requests: any[] = []
  const result = await requestMoonshotJson({ ...options, fetcher: async (_url, init) => { requests.push(JSON.parse(String(init.body))); return completion({ score: requests.length === 1 ? 11 : 6 }) } })
  expect(result.value.score).toBe(6)
  expect(requests).toHaveLength(2)
  expect(requests[1].messages.at(-1).content).toContain('entire corrected JSON')
  expect(requests[1].messages.at(-1).content).toContain('score')
  expect(requests[0].stream).toBe(true)
})
test('a missing required field fails after two attempts without publishing partial output', async () => {
  let calls = 0
  await expect(requestMoonshotJson({ ...options, fetcher: async () => { calls++; return completion({}) } })).rejects.toMatchObject({ code: 'provider_bad_response', retryable: true })
  expect(calls).toBe(2)
})
test('pre-aborted requests never call the provider, and abort interrupts a stalled stream', async () => {
  const cancelled = new AbortController(); cancelled.abort()
  let calls = 0
  await expect(requestMoonshotJson({ ...options, signal: cancelled.signal, fetcher: async () => { calls++; return completion({ score: 6 }) } })).rejects.toMatchObject({ code: 'provider_unavailable' })
  expect(calls).toBe(0)
  let streamCancelled = false
  await expect(requestMoonshotJson({ ...options, timeoutMs: 20, fetcher: async () => new Response(new ReadableStream({ cancel() { streamCancelled = true } }), { headers: { 'content-type': 'text/event-stream' } }) })).rejects.toMatchObject({ code: 'provider_unavailable' })
  expect(streamCancelled).toBe(true)
})
test('interrupted streams do not count as success or restart a long generation', async () => {
  let calls = 0
  const event = `data: ${JSON.stringify({ choices: [{ delta: { content: '{"score":6}' }, finish_reason: 'stop' }] })}\n\n`
  await expect(requestMoonshotJson({ ...options, fetcher: async () => { calls++; return new Response(event, { headers: { 'content-type': 'text/event-stream' } }) } })).rejects.toMatchObject({ code: 'provider_unavailable' })
  expect(calls).toBe(1)
})

test('token truncation gets one concise regeneration with a bounded higher output allowance', async () => {
  const limits: number[] = []
  const result = await requestMoonshotJson({ ...options, fetcher: async (_url, init) => {
    limits.push(JSON.parse(String(init.body)).max_tokens)
    return limits.length === 1 ? Response.json({ choices: [{ finish_reason: 'length', message: { content: '{"score":' } }] }) : completion({ score: 6 })
  } })
  expect(limits).toEqual([4000, 5000]); expect(result.value.score).toBe(6)
})

test('nested transport causes retain safe codes and the failed assessment, never private addresses', async () => {
  let calls = 0
  try {
    await requestMoonshotJson({ ...options, fetcher: async () => { calls++; throw new TypeError('private host', { cause: new AggregateError([{ code: 'EAI_AGAIN', address: 'private address' }], 'private sockets') }) } })
    throw new Error('Unexpected success')
  } catch (error: any) {
    expect(calls).toBe(2)
    const diagnostic = JSON.parse(error.raw)
    expect(diagnostic).toMatchObject({ transportCode: 'EAI_AGAIN', stage: 'connection', assessment: 'test_assessment', attempt: 2 })
    expect(error.raw).not.toContain('private')
  }
})

test('empty completions and missing finish reasons regenerate once rather than failing immediately', async () => {
  for (const [finish_reason, content] of [['stop', ''], ['stop', null], [null, '{"score":6}']]) {
    let calls = 0
    const result = await requestMoonshotJson({ ...options, fetcher: async () => ++calls === 1 ? Response.json({ choices: [{ finish_reason, message: { content } }] }) : completion({ score: 6 }) })
    expect(result.value.score).toBe(6); expect(calls).toBe(2)
  }
})
test('filtered or unsupported tool completions do not retry or publish a fabricated result', async () => {
  for (const finish_reason of ['content_filter', 'tool_calls']) {
    let calls = 0
    await expect(requestMoonshotJson({ ...options, fetcher: async () => { calls++; return Response.json({ choices: [{ finish_reason, message: { content: null } }] }) } })).rejects.toMatchObject({ code: 'provider_bad_response', retryable: false })
    expect(calls).toBe(1)
  }
})
