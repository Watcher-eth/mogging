import { analysisProviderResultSchema, type AnalysisProviderResult } from '@/lib/analysis/schema'
import { createFallbackAnalysisReport } from '@/lib/analysis/report'
import { computePslScore } from '@/lib/analysis/scoring'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'
import { requestMoonshotJson } from '@/lib/analysis/providers/moonshot'
import { protocolFaceShapes, protocolHairTextures, protocolVisibleConcerns } from '@/lib/creator/protocol-tasks'
import { evaluateV2 } from './evaluator'
import { measureLandmarks, type LandmarkInput } from './measurements'
import registry from './rubric-registry.json'
import { formatRubricValue } from './web-report'
import { parseWebOverview, webReportSchema, type WebReport } from './report-schema'

export const photoAnalysisModel = () => process.env.KIMI_ANALYSIS_MODEL === 'kimi-k2.5' ? 'kimi-k2.6' : process.env.KIMI_ANALYSIS_MODEL ?? 'kimi-k2.6'

async function overview(imageDataUrl: string, signal: AbortSignal, mobile = false) {
  return requestMoonshotJson({ stage: 'overview', signal, parse: parseWebOverview,
    body: { model: photoAnalysisModel(), thinking: { type: 'disabled' }, temperature: .6, max_tokens: mobile ? 4600 : 3600, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: 'Assess visible facial appearance for an entertainment report. Do not infer identity, ethnicity, health diagnoses, intelligence or worth. No medical treatments or fabricated population percentiles. Cosmetic scores are subjective: 0–2 markedly weak, 3–4 weak, 5–6 ordinary, 7–8 strong, 9–10 exceptional. Write specific, useful observations of this photo; avoid generic category definitions and process/uncertainty disclaimers. Never invent hidden features.' },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: imageDataUrl } }, { type: 'text', text: `Return JSON with faceDetected (boolean), pslScore (1–8), overallScore, harmonyScore, symmetryScore, proportionalityScore, averagenessScore, dimorphismScore, angularityScore (all other scores 0–10); summary (at most 90 words); categories (exactly one {id,score,explanation} per ID: ${registry.categories.map(category => category.id).join(',')}). Each category explanation: 2–3 concrete sentences about this person's visible features. ${mobile ? "Also include recommendation per category: 1–2 specific, realistic grooming, styling or cosmetic-care steps tied to the visible findings. For strong features use a useful maintenance step. Do not prescribe medical treatments, promise structural changes, give capture/retake instructions, or use the score alone as a cause. Keep advice relevant to that category." : ""} eyeColor (blue/gray/green/hazel/amber/brown/dark brown or null), hairColor (black/brown/blond/red/gray/other or null). contours:{hair:[],ears:[]} contains visible boundary paths, each an ordered array of 3–30 {x,y} points in normalized image coordinates 0–1 (image top-left=(0,0), bottom-right=(1,1)). Trace the actual OUTER hair silhouette and actual hairline if visible, maximum 3 paths. Trace visible outer ear contours, maximum 2 paths; no hidden ears, no invented geometry. Do not trace the face outline as hair or ears. Optional potential:{score:PSL1–8,label,summary,focusAreas:1–4 strings} describing realistic grooming/presentation opportunities, no medical advice. Optional protocolContext:{faceShape:${protocolFaceShapes.join("/")},hairTexture:${protocolHairTextures.join("/")},visibleConcerns:[]}. visibleConcerns may contain ONLY these exact strings: ${protocolVisibleConcerns.join(", ")}. Include only clearly visible cosmetic observations; omit uncertain context or use an empty concerns array. Never add new concern labels or diagnoses. If no usable face, faceDetected=false, keep valid numeric defaults and all category IDs with explanation 'No usable face detected.'` }] },
    ] },
  })
}

export async function analyzeExpandedPhoto(input: { imageData: string; mesh?: LandmarkInput | null; landmarks?: FaceLandmarksPayload | null }, signal: AbortSignal, mobile = false) {
  const started = performance.now()
  const geometry = input.mesh ? measureLandmarks(input.mesh) : null
  const [overviewResult, details] = await Promise.all([
    overview(input.imageData, signal, mobile),
    evaluateV2({ imageDataUrl: input.imageData, geometry }, { signal, graded: true }),
  ])
  const assessment = overviewResult.value
  const providerTiming = [overviewResult.timing, ...details.timing.batches]
  const result = analysisProviderResultSchema.parse({ ...assessment,
    metricScores: [{ name: 'Skin quality', score: assessment.categories.find(category => category.id === 'skin')!.score, category: 'skin' }, { name: 'Presentation', score: assessment.categories.find(category => category.id === 'hair')!.score, category: 'presentation' }],
    landmarks: input.landmarks ?? {},
  })
  if (!result.faceDetected) return { result, webReport: null, providerTiming }
  if (details.entries.filter(entry => entry.value !== null).length < 25) throw new Error('Insufficient supported observations to create a useful report')
  const webReport = webReportSchema.parse({ ...assessment, version: 2, entries: details.entries, timingMs: Math.round(performance.now() - started) })
  // Keep the original 11-category contract for mobile and existing share/protocol consumers.
  result.report = createCompatibleReport(result, webReport)
  result.report.potential = assessment.potential
  result.report.protocolContext = assessment.protocolContext
  return { result, webReport, providerTiming }
}

export function createCompatibleReport(result: AnalysisProviderResult, web: WebReport) {
  const report = createFallbackAnalysisReport(result, computePslScore(result))
  const aliases: Record<string, string> = { 'face-shape': 'face', 'sun-damage': 'skin', 'biological-age': 'skin', 'facial-fat': 'cheeks' }
  report.summary = web.summary
  for (const category of report.categories) {
    const id = aliases[category.id] ?? category.id
    const assessment = web.categories.find(item => item.id === id)
    if (!assessment) continue
    if (category.id !== 'biological-age') category.score = assessment.score
    category.explanation = assessment.explanation
    const definitions = registry.categories.find(item => item.id === id)?.rubrics ?? []
    const features = definitions.flatMap(rubric => {
      const entry = web.entries.find(item => item.id === rubric.id)
      return entry?.value != null && rubric.output !== 'D' ? [{ label: rubric.name, value: formatRubricValue(rubric.id, rubric.output, entry.value).slice(0,160) }] : []
    }).slice(0,6)
    if (features.length >= 4) category.features = features
    if (category.id === 'eyes' && web.eyeColor) category.eyeColor = web.eyeColor
  }
  return report
}

