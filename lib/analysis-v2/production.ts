import { createHash, randomUUID } from 'crypto'
import { analyzeAndSave, analyzeAndSaveSchema, type AnalyzeAndSaveInput } from '@/lib/analysis/analyze'
import { z } from 'zod'
import type { ProviderTiming } from '@/lib/analysis/providers/moonshot'
import { AnalysisProviderError } from '@/lib/analysis/errors'
import { landmarkInputSchema } from './measurements'
import type { WebReport } from './report-schema'
import { analyzeExpandedPhoto, photoAnalysisModel } from './photo-analysis'
export { createCompatibleReport } from './photo-analysis'

export const webAnalyzeSchema = analyzeAndSaveSchema.extend({ mesh: landmarkInputSchema.nullable().optional() })

export function webPhotoHash(contentHash: string, owner: string, scan: string) {
  return createHash('sha256').update(`web-v2:${owner}:${scan}:${contentHash}`).digest('hex')
}

async function analyzeAndSaveExpanded(input: AnalyzeAndSaveInput, reservationId?: string, mobile = false) {
  const data = webAnalyzeSchema.parse(input)
  let webReport: WebReport | null = null
  let providerTiming: ProviderTiming[] = []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 100_000)
  const provider = {
    model: photoAnalysisModel(),
    async analyzeFace() {
      try {
        const assessment = await analyzeExpandedPhoto(data, controller.signal, mobile)
        webReport = assessment.webReport
        providerTiming = assessment.providerTiming
        return assessment.result
      } catch (error) {
        controller.abort()
        if (error instanceof z.ZodError) {
          throw new AnalysisProviderError('provider_bad_response',
            'The generated report could not be validated. Please retry; your scan credit is still available.', true, undefined,
            JSON.stringify({ stage: 'expanded_report', issues: error.issues.slice(0, 3).map(({ code, path }) => ({ code, path })) }))
        }
        throw error
      }
    },
  }
  try {
    const scan = reservationId ?? randomUUID()
    return await analyzeAndSave(data, reservationId, {
      provider, promptVersion: mobile ? 'mobile-v2-1' : 'web-v2-1', requirePersistence: true,
      photoHash: hash => webPhotoHash(hash, data.userId ?? data.anonymousActorId ?? 'anonymous', scan),
      metrics: () => webReport ? { webReportV2: webReport, providerTiming } : {},
    })
  } finally {
    clearTimeout(timer)
  }
}

export const analyzeAndSaveWeb = (input: AnalyzeAndSaveInput, reservationId?: string) => analyzeAndSaveExpanded(input, reservationId)
export const analyzeAndSaveMobile = (input: AnalyzeAndSaveInput, reservationId?: string) => analyzeAndSaveExpanded(input, reservationId, true)
