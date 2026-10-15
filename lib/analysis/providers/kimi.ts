import { z } from 'zod'
import { env } from '@/lib/env'
import { AnalysisProviderError } from '../errors'
import { requestMoonshotJson } from './moonshot'
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt, CATEGORY_IDS } from '../prompt'
import { analysisProviderResultSchema, type AnalysisProvider, type AnalysisProviderResult, type AnalyzeFaceInput } from '../schema'

const KIMI_ANALYSIS_MODEL = env.KIMI_ANALYSIS_MODEL === 'kimi-k2.5' ? 'kimi-k2.6' : env.KIMI_ANALYSIS_MODEL
export class KimiAnalysisProvider implements AnalysisProvider {
  model = KIMI_ANALYSIS_MODEL
  async analyzeFace(input: AnalyzeFaceInput): Promise<AnalysisProviderResult> {
    const result = await requestMoonshotJson({
      stage: 'legacy_report', timeoutMs: 100_000, apiKey: env.MOONSHOT_API_KEY, baseUrl: env.MOONSHOT_BASE_URL,
      body: { model: this.model, response_format: { type: 'json_object' }, thinking: { type: 'disabled' }, temperature: .6, max_tokens: 6000,
        messages: [{ role: 'system', content: ANALYSIS_SYSTEM_PROMPT }, { role: 'user', content: [
          { type: 'image_url', image_url: { url: input.imageDataUrl } },
          { type: 'text', text: buildAnalysisPrompt(input.gender, { compact: true, landmarksProvided: input.landmarksProvided }) },
        ] }],
      },
      parse: value => {
        const parsed = completeReportSchema.safeParse(coerceProviderResult(value))
        if (!parsed.success) throw new AnalysisProviderError('provider_bad_response', 'Image analysis provider returned report data that failed validation', true, undefined,
          JSON.stringify({ stage: 'validation', issues: parsed.error.issues.slice(0, 3).map(({ code, path }) => ({ code, path })) }))
        return parsed.data
      },
    })
    return result.value
  }
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

