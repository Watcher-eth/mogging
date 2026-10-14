import { z } from 'zod'
import { env } from '@/lib/env'
import { AnalysisProviderError } from '../errors'
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt, CATEGORY_IDS } from '../prompt'
import {
  analysisProviderResultSchema,
  type AnalysisProvider,
  type AnalysisProviderResult,
  type AnalyzeFaceInput,
} from '../schema'

const KIMI_ANALYSIS_TIMEOUT_MS = 100_000
const KIMI_ANALYSIS_MAX_TOKENS = 6_000
const KIMI_ANALYSIS_MODEL = env.KIMI_ANALYSIS_MODEL === 'kimi-k2.5' ? 'kimi-k2.6' : env.KIMI_ANALYSIS_MODEL

export class KimiAnalysisProvider implements AnalysisProvider {
  model = KIMI_ANALYSIS_MODEL

  async analyzeFace(input: AnalyzeFaceInput): Promise<AnalysisProviderResult> {
    if (!env.MOONSHOT_API_KEY) {
      throw new AnalysisProviderError(
        'provider_auth',
        'Image analysis provider is not configured',
        false
      )
    }

    const started = Date.now()
    const prompt = buildAnalysisPrompt(input.gender, { compact: true, landmarksProvided: input.landmarksProvided })
    let correction = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = KIMI_ANALYSIS_TIMEOUT_MS - (Date.now() - started)
      const attemptStarted = Date.now()
      const outcome = await requestKimiAnalysis({ input, prompt: prompt + correction,
        timeoutMs: remaining })
      console.info('analyze:provider-finish', { model: this.model, attempt: attempt + 1,
        elapsedMs: Date.now() - attemptStarted, success: outcome.ok,
        code: outcome.ok ? null : outcome.error.code })
      if (outcome.ok) return outcome.result
      const error = outcome.error
      // One early connection retry shares the original deadline and scan reservation.
      // Never restart a long generation or retry authentication/rate-limit failures.
      const earlyConnectionFailure = Date.now() - attemptStarted < 10_000 && error.raw?.includes('"stage":"connection"') &&
        /"transportCode":"(?:EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ECONNRESET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET)"/.test(error.raw ?? '')
      if (attempt === 1 || KIMI_ANALYSIS_TIMEOUT_MS - (Date.now() - started) < 15_000 || error.status != null ||
        !(['provider_bad_response', 'provider_invalid_json'].includes(error.code) || earlyConnectionFailure)) throw error
      console.warn('analyze:provider-regenerate', { code: error.code, diagnostic: error.raw })
      if (earlyConnectionFailure) continue
      correction = `\nYour previous output did not match the required contract. Return the entire corrected JSON, not a patch. ${error.raw ?? error.message}. Include report.categories with all 11 unique IDs, omit empty optional measurements, and keep recommendations under 220 characters.`
    }
    throw new AnalysisProviderError('provider_unavailable', 'Image analysis provider timed out', true)
  }
}

async function requestKimiAnalysis({
  input,
  prompt,
  timeoutMs,
}: {
  input: AnalyzeFaceInput
  prompt: string
  timeoutMs: number
}): Promise<
  | { ok: true; result: AnalysisProviderResult }
  | { ok: false; error: AnalysisProviderError }
> {
  const requestStarted = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let response: Response
    try {
      response = await fetch(`${env.MOONSHOT_BASE_URL}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.MOONSHOT_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: KIMI_ANALYSIS_MODEL,
          messages: [
            {
              role: 'system',
              content: ANALYSIS_SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: input.imageDataUrl,
                  },
                },
                {
                  type: 'text',
                  text: prompt,
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          stream: true,
          stream_options: { include_usage: true },
          thinking: { type: 'disabled' },
          temperature: 0.6,
          max_tokens: KIMI_ANALYSIS_MAX_TOKENS,
        }),
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          ok: false,
          error: new AnalysisProviderError(
            'provider_unavailable',
            'Image analysis provider timed out',
            true
          ),
        }
      }

      return { ok: false, error: transportFailure(error) }
    }

    console.info('analyze:provider-headers', { elapsedMs: Date.now() - requestStarted, status: response.status })
    if (!response.ok) {
      const body = await response.text()
      return { ok: false, error: classifyKimiError(response.status, body) }
    }

    let completion: z.infer<typeof kimiChatCompletionSchema>
    try {
      completion = kimiChatCompletionSchema.parse(response.headers?.get('content-type')?.includes('text/event-stream')
        ? await readKimiStream(response, requestStarted) : await response.json())
    } catch (error) {
      if (controller.signal.aborted || error instanceof AnalysisProviderError) throw error
      if (error && typeof error === 'object' && 'name' in error && error.name === 'TypeError') return { ok: false, error: transportFailure(error, 'response_body') }
      return {
        ok: false,
        error: new AnalysisProviderError(
          'provider_bad_response',
          'Image analysis provider returned an unreadable completion',
          true,
          undefined,
          error instanceof Error ? error.message : undefined
        ),
      }
    }

    const choice = completion.choices[0]
    console.info('analyze:provider-completion', { model: KIMI_ANALYSIS_MODEL,
      completionTokens: completion.usage?.completion_tokens ?? null, finishReason: choice?.finish_reason ?? null })
    if (choice?.finish_reason !== 'stop') {
      return { ok: false, error: new AnalysisProviderError('provider_bad_response',
        'Image analysis provider did not finish the report', true, undefined,
        JSON.stringify({ finishReason: choice?.finish_reason ?? null, completionTokens: completion.usage?.completion_tokens ?? null })) }
    }
    const content = choice.message.content
    if (!content) {
      return {
        ok: false,
        error: new AnalysisProviderError(
          'provider_bad_response',
          'Image analysis provider returned no content',
          true
        ),
      }
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(content)
    } catch (error) {
      return {
        ok: false,
        error: new AnalysisProviderError(
          'provider_invalid_json',
          'Image analysis provider returned invalid JSON',
          true,
          undefined,
          JSON.stringify({
            parseError: error instanceof Error ? error.message : String(error),
            contentLength: content.length,
            finishReason: choice.finish_reason,
            completionTokens: completion.usage?.completion_tokens ?? null,
          })
        ),
      }
    }

    const result = completeReportSchema.safeParse(coerceProviderResult(parsedJson))
    if (!result.success) {
      return {
        ok: false,
        error: new AnalysisProviderError(
          'provider_bad_response',
          'Image analysis provider returned report data that failed validation',
          true,
          undefined,
          JSON.stringify({
            contentLength: content.length,
            finishReason: choice.finish_reason,
            completionTokens: completion.usage?.completion_tokens ?? null,
            issues: result.error.issues.slice(0, 12).map(({ code, path, message }) => ({ code, path, message })),
          })
        ),
      }
    }

    return { ok: true, result: result.data }
  } catch (error) {
    if (error instanceof AnalysisProviderError) return { ok: false, error }
    if (controller.signal.aborted) return { ok: false, error: new AnalysisProviderError('provider_unavailable', 'Image analysis provider timed out', true) }
    return { ok: false, error: transportFailure(error, 'response_body') }
  } finally {
    // Cover response-body reads and validation too, not just response headers.
    clearTimeout(timeout)
  }
}

// Keep a single complete, validated report. Partial streamed output never unlocks a report.
async function readKimiStream(response: Response, started: number) {
  if (!response.body) throw transportFailure(null, 'response_body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', content = '', finishReason: string | null = null
  let completionTokens: number | undefined
  let firstOutput = false, done = false, bytes = 0
  try {
    while (!done) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 2_000_000) throw new AnalysisProviderError('provider_bad_response', 'Image analysis provider response exceeded its limit', false)
      buffer += decoder.decode(chunk.value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') { done = true; break }
        const event = JSON.parse(data)
        if (event.error) throw new AnalysisProviderError('provider_unavailable', 'Image analysis stream failed', true)
        const choice = event.choices?.[0]
        const text = choice?.delta?.content
        if (typeof text === 'string' && text) {
          if (!firstOutput) console.info('analyze:provider-first-output', { elapsedMs: Date.now() - started })
          firstOutput = true
          content += text
        }
        if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason
        completionTokens = event.usage?.completion_tokens ?? choice?.usage?.completion_tokens ?? completionTokens
      }
    }
    if (!done || !finishReason) throw transportFailure(null, 'response_body')
    console.info('analyze:provider-stream-complete', { elapsedMs: Date.now() - started, bytes })
    return { choices: [{ finish_reason: finishReason, message: { content } }], usage: { completion_tokens: completionTokens } }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

function transportFailure(error: unknown, stage = 'connection') {
  const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : null
  const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null
  // Retain only transport codes, never URLs, headers or provider response data.
  const transportCode = typeof code === 'string' && /^(?:UND_ERR_[A-Z_]+|ERR_TLS_CERT_ALTNAME_INVALID|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|ERR_SSL_[A-Z_]+|E(?:CONNRESET|CONNREFUSED|TIMEDOUT|HOSTUNREACH|NETUNREACH|AI_AGAIN|NOTFOUND))$/.test(code) ? code : 'unknown_transport'
  return new AnalysisProviderError('provider_unavailable',
    'The image analysis connection was interrupted. Please retry; your scan credit is still available.',
    true, undefined, JSON.stringify({ transportCode, stage }))
}

function coerceProviderResult(value: unknown) {
  if (!value || typeof value !== 'object') return value
  const result = value as Record<string, unknown>
  const report = result.report

  if (report && typeof report === 'object') {
    const reportRecord = report as Record<string, unknown>
    if (typeof reportRecord.summary !== 'string' && reportRecord.summary != null) {
      reportRecord.summary = String(reportRecord.summary)
    }

    if (Array.isArray(reportRecord.categories)) {
      reportRecord.categories = reportRecord.categories.map((category) => {
        if (!category || typeof category !== 'object') return category
        const categoryRecord = category as Record<string, unknown>
        for (const key of ['id', 'title', 'subtitle', 'scoreLabel', 'explanation', 'recommendation']) {
          if (typeof categoryRecord[key] !== 'string' && categoryRecord[key] != null) {
            categoryRecord[key] = String(categoryRecord[key])
          }
        }

        if (Array.isArray(categoryRecord.features)) {
          categoryRecord.features = categoryRecord.features.map((feature) => {
            if (!feature || typeof feature !== 'object') return feature
            const featureRecord = feature as Record<string, unknown>
            if (typeof featureRecord.label !== 'string' && featureRecord.label != null) {
              featureRecord.label = String(featureRecord.label)
            }
            if (typeof featureRecord.value !== 'string' && featureRecord.value != null) {
              featureRecord.value = String(featureRecord.value)
            }
            if (featureRecord.measurement == null || (typeof featureRecord.measurement === 'string' && !featureRecord.measurement.trim())) {
              delete featureRecord.measurement
            }
            return featureRecord
          })
        }

        return categoryRecord
      })
    }
  }

  if (Array.isArray(result.metricScores)) {
    result.metricScores = result.metricScores.map((metric) => {
      if (!metric || typeof metric !== 'object') return metric
      const metricRecord = metric as Record<string, unknown>
      for (const key of ['name', 'category', 'description']) {
        if (typeof metricRecord[key] !== 'string' && metricRecord[key] != null) {
          metricRecord[key] = String(metricRecord[key])
        }
      }
      return metricRecord
    })
  }

  return result
}

const completeReportSchema = analysisProviderResultSchema.superRefine((result, ctx) => {
  if (!result.faceDetected) return
  const categories = result.report?.categories
  if (!categories || new Set(categories.map(category => category.id)).size !== CATEGORY_IDS.length) {
    ctx.addIssue({ code: 'custom', path: ['report', 'categories'], message: 'Include all 11 unique category IDs inside report.categories' })
  }
  for (const [index, category] of (categories ?? []).entries()) {
    if (category.score > 10) ctx.addIssue({ code: 'custom', path: ['report', 'categories', index, 'score'], message: 'Category scores must be 0–10' })
  }
})

const kimiChatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string(),
      message: z.object({
        content: z.string().nullable(),
      }),
    })
  ).min(1),
  usage: z.object({ completion_tokens: z.number().optional() }).optional(),
})

function classifyKimiError(status: number, body: string) {
  const raw = body.slice(0, 1000)

  if (status === 404 && /model|permission denied/i.test(body)) {
    return new AnalysisProviderError(
      'provider_auth',
      'Image analysis model is unavailable',
      false,
      status,
      raw
    )
  }

  if (status === 401 || status === 403) {
    return new AnalysisProviderError(
      'provider_auth',
      'Image analysis provider authentication failed',
      false,
      status,
      raw
    )
  }

  if (status === 429) {
    return new AnalysisProviderError(
      'provider_rate_limited',
      'Image analysis provider rate limit exceeded',
      true,
      status,
      raw
    )
  }

  if (status >= 500) {
    return new AnalysisProviderError(
      'provider_unavailable',
      'Image analysis provider is unavailable',
      true,
      status,
      raw
    )
  }

  return new AnalysisProviderError(
    'provider_bad_response',
    'Image analysis provider rejected the request',
    false,
    status,
    raw
  )
}
