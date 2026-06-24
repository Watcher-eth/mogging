import { z } from 'zod'
import { env } from '@/lib/env'
import { AnalysisProviderError } from '../errors'
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt } from '../prompt'
import {
  analysisProviderResultSchema,
  type AnalysisProvider,
  type AnalysisProviderResult,
  type AnalyzeFaceInput,
} from '../schema'

const KIMI_ANALYSIS_TIMEOUT_MS = 38_000
const KIMI_ANALYSIS_MAX_TOKENS = 6_500

export class KimiAnalysisProvider implements AnalysisProvider {
  model = env.KIMI_ANALYSIS_MODEL

  async analyzeFace(input: AnalyzeFaceInput): Promise<AnalysisProviderResult> {
    if (!env.MOONSHOT_API_KEY) {
      throw new AnalysisProviderError(
        'provider_auth',
        'Image analysis provider is not configured',
        false
      )
    }

    const firstAttempt = await requestKimiAnalysis({
      input,
      prompt: buildAnalysisPrompt(input.gender),
      maxTokens: KIMI_ANALYSIS_MAX_TOKENS,
    })

    if (firstAttempt.ok) {
      return firstAttempt.result
    }

    throw firstAttempt.error
  }
}

async function requestKimiAnalysis({
  input,
  prompt,
  maxTokens,
}: {
  input: AnalyzeFaceInput
  prompt: string
  maxTokens: number
}): Promise<
  | { ok: true; result: AnalysisProviderResult }
  | { ok: false; error: AnalysisProviderError }
> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), KIMI_ANALYSIS_TIMEOUT_MS)

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
        model: env.KIMI_ANALYSIS_MODEL,
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
        thinking: { type: 'disabled' },
        temperature: 0.6,
        max_tokens: maxTokens,
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

    throw error
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await response.text()
    return { ok: false, error: classifyKimiError(response.status, body) }
  }

  let completion: z.infer<typeof kimiChatCompletionSchema>
  try {
    completion = kimiChatCompletionSchema.parse(await response.json())
  } catch (error) {
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

  const content = completion.choices[0]?.message.content
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
          contentPreview: content.slice(0, 500),
          contentTail: content.slice(-500),
        })
      ),
    }
  }

  const result = analysisProviderResultSchema.safeParse(coerceProviderResult(parsedJson))
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
          issues: result.error.issues.slice(0, 12),
        })
      ),
    }
  }

  return { ok: true, result: result.data }
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

const kimiChatCompletionSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable(),
      }),
    })
  ),
})

function classifyKimiError(status: number, body: string) {
  const raw = body.slice(0, 1000)

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
