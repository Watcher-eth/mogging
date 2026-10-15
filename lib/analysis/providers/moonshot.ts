import { z } from 'zod'
import { AnalysisProviderError } from '../errors'

type Completion = { choices: { finish_reason: string | null; message: { content: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
export type ProviderTiming = { stage: string; attempts: number; headersMs: number; firstOutputMs: number | null; totalMs: number; usage: Completion['usage'] | null }
const completionSchema = z.object({ choices: z.array(z.object({ finish_reason: z.string().nullable(), message: z.object({ content: z.string().nullable() }) })).min(1), usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() }).optional() })
const earlyTransport = /"transportCode":"(?:EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ECONNRESET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET)"/

// One request owner for every scan pipeline. A retry shares the original deadline;
// only the failed assessment is regenerated, never a completed sibling or a scan credit.
export async function requestMoonshotJson<T>(options: {
  stage: string; body: Record<string, unknown>; parse: (value: unknown) => T;
  signal?: AbortSignal; timeoutMs?: number; apiKey?: string; baseUrl?: string;
  fetcher?: (url: string, options: RequestInit) => Promise<Response>; now?: () => number;
}): Promise<{ value: T; timing: ProviderTiming }> {
  const apiKey = options.apiKey ?? process.env.MOONSHOT_API_KEY
  if (!apiKey) throw new AnalysisProviderError('provider_auth', 'Image analysis provider is not configured', false)
  const now = options.now ?? Date.now
  const started = now(), budget = options.timeoutMs ?? 100_000
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (options.signal?.aborted) abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, budget)
  let correction = '', headersMs = 0, firstOutputMs: number | null = null
  let maxTokens = options.body.max_tokens
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let stage = 'connection', retryAfterMs = 0
      const attemptStarted = now()
      try {
        if (controller.signal.aborted || now() - started >= budget) throw timeoutFailure(stage)
        const body = { ...options.body, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true },
          ...(correction ? { messages: [...options.body.messages as unknown[], { role: 'user', content: correction }] } : {}) }
        const response = await (options.fetcher ?? fetch)(`${options.baseUrl ?? process.env.MOONSHOT_BASE_URL ?? 'https://api.moonshot.ai/v1'}/chat/completions`, {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        })
        headersMs = now() - attemptStarted
        console.info('analyze:provider-headers', { stage: options.stage, attempt, elapsedMs: headersMs, status: response.status })
        stage = 'response_body'
        if (!response.ok) {
          const retryAfter = response.headers?.get('retry-after')
          retryAfterMs = retryAfter ? (/^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - now())) : 1000
          await response.body?.cancel().catch(() => {})
          throw httpFailure(response.status)
        }
        let completion: Completion
        try {
          const raw = response.headers?.get('content-type')?.includes('text/event-stream')
            ? await readStream(response, controller.signal, () => {
              firstOutputMs ??= now() - started
              console.info('analyze:provider-first-output', { stage: options.stage, attempt, elapsedMs: firstOutputMs })
            }) : await response.json()
          completion = completionSchema.parse(raw)
        } catch (error) {
          if (error instanceof TypeError) throw transportFailure(error, stage)
          throw error
        }
        stage = 'completion'
        const choice = completion.choices[0]
        if (choice.finish_reason !== 'stop' || !choice.message.content) {
          throw new AnalysisProviderError('provider_bad_response', 'Image analysis provider did not finish the report', choice.finish_reason === 'length' || choice.finish_reason === 'stop' || choice.finish_reason === null, undefined,
            JSON.stringify({ stage, finishReason: choice.finish_reason, completionTokens: completion.usage?.completion_tokens ?? null }))
        }
        stage = 'json'
        let value: unknown
        try { value = JSON.parse(choice.message.content) }
        catch { throw new AnalysisProviderError('provider_invalid_json', 'Image analysis provider returned invalid JSON', true, undefined, JSON.stringify({ stage, contentLength: choice.message.content.length })) }
        stage = 'validation'
        const parsed = options.parse(value)
        if (controller.signal.aborted || now() - started >= budget) throw timeoutFailure(stage)
        const timing: ProviderTiming = { stage: options.stage, attempts: attempt, headersMs, firstOutputMs, totalMs: now() - started, usage: completion.usage ?? null }
        console.info('analyze:provider-finish', { ...timing, success: true })
        return { value: parsed, timing }
      } catch (error) {
        const failure = controller.signal.aborted ? timeoutFailure(stage) : normalizeFailure(error, stage)
        const elapsed = now() - attemptStarted, remaining = budget - (now() - started)
        const connection = stage === 'connection' && elapsed < 10_000 && earlyTransport.test(failure.raw ?? '')
        const temporaryHttp = elapsed < 10_000 && [429, 500, 502, 503, 504].includes(failure.status ?? 0) && Number.isFinite(retryAfterMs) && retryAfterMs <= 3000
        const invalidOutput = failure.status == null && failure.retryable && ['provider_bad_response', 'provider_invalid_json'].includes(failure.code)
        console.warn('analyze:provider-failure', { stage: options.stage, attempt, elapsedMs: elapsed, code: failure.code, status: failure.status ?? null, diagnostic: failure.raw ?? null })
        if (attempt === 2 || controller.signal.aborted || remaining < 15_000 + (temporaryHttp ? retryAfterMs : 0) || !(connection || temporaryHttp || invalidOutput)) {
          let diagnostic: Record<string, unknown> = {}
          try { diagnostic = JSON.parse(failure.raw ?? '{}') } catch {}
          throw new AnalysisProviderError(failure.code, failure.message, failure.retryable, failure.status,
            JSON.stringify({ ...diagnostic, assessment: options.stage, attempt, elapsedMs: now() - started }))
        }
        if (invalidOutput) {
          correction = `Return the entire corrected JSON, not a patch. Follow every required field, category and requested ID exactly once. Keep text concise, omit uncertain optional enrichment, and never fabricate observations. Validation diagnostic: ${failure.raw ?? failure.code}`
          if (failure.raw?.includes('"finishReason":"length"') && typeof maxTokens === 'number') maxTokens = Math.min(6000, Math.ceil(maxTokens * 1.25))
        }
        if (temporaryHttp && retryAfterMs > 0) await pause(retryAfterMs, controller.signal)
      }
    }
    throw timeoutFailure('completion')
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}

function normalizeFailure(error: unknown, stage: string) {
  if (error instanceof AnalysisProviderError) return error
  if (stage === 'connection' || stage === 'response_body' && error instanceof TypeError) return transportFailure(error, stage)
  if (error instanceof z.ZodError) return new AnalysisProviderError('provider_bad_response', 'The generated report could not be validated. Please retry; your scan credit is still available.', true, undefined,
    JSON.stringify({ stage, issues: error.issues.slice(0, 3).map(({ code, path }) => ({ code, path })) }))
  return new AnalysisProviderError('provider_bad_response', 'Image analysis provider returned an incomplete report. Please retry; your scan credit is still available.', true, undefined, JSON.stringify({ stage }))
}
function timeoutFailure(stage: string) {
  return new AnalysisProviderError('provider_unavailable', 'Image analysis timed out. Please retry; your scan credit is still available.', true, undefined, JSON.stringify({ stage, timeout: true }))
}
function transportFailure(error: unknown, stage: string) {
  let transportCode = 'unknown_transport'
  const causes: unknown[] = [error]
  for (let index = 0; index < Math.min(causes.length, 8); index++) {
    const cause = causes[index]
    if (!cause || typeof cause !== 'object') continue
    const code = 'code' in cause ? cause.code : null
    if (typeof code === 'string' && /^(?:UND_ERR_[A-Z_]+|ERR_TLS_CERT_ALTNAME_INVALID|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|ERR_SSL_[A-Z_]+|E(?:CONNRESET|CONNREFUSED|TIMEDOUT|HOSTUNREACH|NETUNREACH|AI_AGAIN|NOTFOUND))$/.test(code)) { transportCode = code; break }
    if ('cause' in cause) causes.push(cause.cause)
    if ('errors' in cause && Array.isArray(cause.errors)) causes.push(...cause.errors.slice(0, 4))
  }
  return new AnalysisProviderError('provider_unavailable', 'The image analysis connection was interrupted. Please retry; your scan credit is still available.', true, undefined, JSON.stringify({ transportCode, stage }))
}
function httpFailure(status: number) {
  const auth = [401, 403, 404].includes(status)
  return new AnalysisProviderError(auth ? 'provider_auth' : status === 429 ? 'provider_rate_limited' : status >= 500 ? 'provider_unavailable' : 'provider_bad_response',
    auth ? 'Image analysis provider configuration is unavailable' : 'Image analysis provider is temporarily unavailable. Please retry; your scan credit is still available.', !auth && (status === 429 || status >= 500), status, JSON.stringify({ stage: 'http', status }))
}
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(timeoutFailure('backoff')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

// Partial output never counts as a report, even if its current JSON happens to parse.
async function readStream(response: Response, signal: AbortSignal, firstOutput: () => void): Promise<Completion> {
  if (!response.body) throw transportFailure(null, 'response_body')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = '', content = '', finishReason: string | null = null, usage: Completion['usage']
  let outputStarted = false, done = false, bytes = 0
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (!done && !signal.aborted) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 2_000_000) throw new AnalysisProviderError('provider_bad_response', 'Image analysis provider response exceeded its limit', false)
      buffer += decoder.decode(chunk.value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') { done = true; break }
        const event = JSON.parse(data)
        if (event.error) throw new AnalysisProviderError('provider_unavailable', 'Image analysis stream was interrupted', true, undefined, JSON.stringify({ stage: 'response_body' }))
        const choice = event.choices?.[0], text = choice?.delta?.content
        if (typeof text === 'string' && text) { if (!outputStarted) firstOutput(); outputStarted = true; content += text }
        if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason
        usage = event.usage ?? usage
      }
    }
    if (!done || !finishReason) throw transportFailure(null, 'response_body')
    return { choices: [{ finish_reason: finishReason, message: { content } }], usage }
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
