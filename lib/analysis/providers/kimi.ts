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

    const response = await fetch(`${env.MOONSHOT_BASE_URL}/chat/completions`, {
      method: 'POST',
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
                text: buildAnalysisPrompt(input.gender),
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        max_tokens: 4200,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw classifyKimiError(response.status, body)
    }

    const completion = kimiChatCompletionSchema.parse(await response.json())
    const content = completion.choices[0]?.message.content
    if (!content) {
      throw new AnalysisProviderError(
        'provider_bad_response',
        'Image analysis provider returned no content',
        true
      )
    }

    try {
      return analysisProviderResultSchema.parse(JSON.parse(content))
    } catch (error) {
      throw new AnalysisProviderError(
        'provider_invalid_json',
        'Image analysis provider returned invalid JSON',
        true,
        undefined,
        error instanceof Error ? error.message : undefined
      )
    }
  }
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
