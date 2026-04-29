import { z } from 'zod'
import { env } from '@/lib/env'
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
      throw new Error('MOONSHOT_API_KEY is required for image analysis')
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
        max_tokens: 1800,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Kimi analysis failed (${response.status}): ${body.slice(0, 500)}`)
    }

    const completion = kimiChatCompletionSchema.parse(await response.json())
    const content = completion.choices[0]?.message.content
    if (!content) {
      throw new Error('Kimi analysis returned no content')
    }

    try {
      return analysisProviderResultSchema.parse(JSON.parse(content))
    } catch (error) {
      throw new Error('Kimi analysis returned invalid JSON', { cause: error })
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
