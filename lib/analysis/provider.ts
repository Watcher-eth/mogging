import { z } from 'zod'
import { env } from '@/lib/env'

const metricScoreSchema = z.object({
  name: z.string(),
  score: z.number().min(0).max(8),
  category: z.enum(['harmony', 'dimorphism', 'angularity', 'misc']),
  description: z.string().optional(),
})

export const analysisProviderResultSchema = z.object({
  faceDetected: z.boolean(),
  harmonyScore: z.number().min(0).max(8),
  dimorphismScore: z.number().min(0).max(8),
  angularityScore: z.number().min(0).max(8),
  metricScores: z.array(metricScoreSchema).default([]),
  percentile: z.number().min(0).max(100).nullable().optional(),
  tier: z.string().nullable().optional(),
  tierDescription: z.string().nullable().optional(),
  landmarks: z.record(z.string(), z.unknown()).default({}),
})

export type AnalysisProviderResult = z.infer<typeof analysisProviderResultSchema>

export type AnalyzeFaceInput = {
  imageDataUrl: string
  gender: 'male' | 'female' | 'other'
}

export type AnalysisProvider = {
  model: string
  analyzeFace(input: AnalyzeFaceInput): Promise<AnalysisProviderResult>
}

export function computePslScore(result: Pick<AnalysisProviderResult, 'harmonyScore' | 'dimorphismScore' | 'angularityScore' | 'metricScores'>) {
  const miscScores = result.metricScores.filter((metric) => metric.category === 'misc')
  const miscAverage = miscScores.length > 0
    ? miscScores.reduce((sum, metric) => sum + metric.score, 0) / miscScores.length
    : (result.harmonyScore + result.dimorphismScore + result.angularityScore) / 3

  const raw =
    result.harmonyScore * 0.35 +
    result.dimorphismScore * 0.35 +
    result.angularityScore * 0.2 +
    miscAverage * 0.1

  return Math.round(raw * 10) / 10
}

export class MockAnalysisProvider implements AnalysisProvider {
  model = 'mock'

  async analyzeFace(input: AnalyzeFaceInput): Promise<AnalysisProviderResult> {
    const genderAdjustment = input.gender === 'other' ? 0 : 0.2

    return {
      faceDetected: true,
      harmonyScore: 3.8 + genderAdjustment,
      dimorphismScore: 3.7 + genderAdjustment,
      angularityScore: 3.6,
      metricScores: [
        { name: 'Facial harmony', score: 3.8 + genderAdjustment, category: 'harmony' },
        { name: 'Dimorphism', score: 3.7 + genderAdjustment, category: 'dimorphism' },
        { name: 'Angularity', score: 3.6, category: 'angularity' },
      ],
      percentile: 70,
      tier: 'High-tier Normie',
      tierDescription: 'Development placeholder result. Replace provider before production.',
      landmarks: {},
    }
  }
}

export class KimiAnalysisProvider implements AnalysisProvider {
  model = env.KIMI_ANALYSIS_MODEL

  async analyzeFace(input: AnalyzeFaceInput): Promise<AnalysisProviderResult> {
    if (!env.MOONSHOT_API_KEY) {
      throw new Error('MOONSHOT_API_KEY is required for Kimi analysis')
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

const ANALYSIS_SYSTEM_PROMPT = `You analyze face photos for an entertainment app.
Return only a valid JSON object matching the requested schema.
Be conservative and calibrated. Do not flatter. If the image does not contain a real human face, set faceDetected to false.
Scores are on a harsh 0-8 PSL-style scale where average people are usually 2.5-3.8, attractive people are 4-5, model-tier is 5-6, and 6+ is rare.`

function buildAnalysisPrompt(gender: AnalyzeFaceInput['gender']) {
  return `Analyze this image. Gender scoring mode: ${gender}.

Return this JSON object exactly:
{
  "faceDetected": true,
  "harmonyScore": 3.5,
  "dimorphismScore": 3.5,
  "angularityScore": 3.5,
  "metricScores": [
    { "name": "Facial thirds balance", "score": 3.5, "category": "harmony", "description": "short reason" },
    { "name": "Symmetry", "score": 3.5, "category": "harmony", "description": "short reason" },
    { "name": "Dimorphic features", "score": 3.5, "category": "dimorphism", "description": "short reason" },
    { "name": "Jaw and cheekbone definition", "score": 3.5, "category": "angularity", "description": "short reason" }
  ],
  "percentile": 70,
  "tier": "High-tier Normie",
  "tierDescription": "brief calibrated description",
  "landmarks": {}
}

Rules:
- Every score must be between 0 and 8.
- harmonyScore, dimorphismScore, and angularityScore should match the relevant metric averages.
- Use "other" gender mode as neutral dimorphism scoring.
- Do not identify the person.
- Do not include markdown or extra text.`
}

export const analysisProvider: AnalysisProvider = env.MOONSHOT_API_KEY
  ? new KimiAnalysisProvider()
  : new MockAnalysisProvider()
