import { WebAnalysisReport } from '@/components/analysis/v2/web-analysis-report'
import { designIllustrations, designValues } from '@/lib/analysis-v2/preview-fixtures'
import registry from '@/lib/analysis-v2/rubric-registry.json'
import type { WebReport } from '@/lib/analysis-v2/report-schema'
import { parseFaceLandmarksPayload } from '@/lib/analysis/landmarks'
import portrait from './primer-portrait.json'

const landmarks = parseFaceLandmarksPayload(portrait)
const example: WebReport = {
  version: 2,
  summary: 'Explore the feature breakdown, measurements, and score cards in an example web evaluation. The scores and measurements are illustrative.',
  overallScore: 7.4,
  categories: registry.categories.map(({ id }) => ({ id, score: 7.4, explanation: '' })),
  entries: Object.entries(designValues).map(([id, value]) => ({
    id, value, evidence: '', source: 'derived',
    grade: designIllustrations[id]?.grade ?? null, positions: designIllustrations[id]?.positions,
  })),
  eyeColor: null,
  hairColor: null,
  contours: { hair: [], ears: [] },
  timingMs: 0,
}

export default function CheckoutReport() {
  return <WebAnalysisReport embedded report={example} imageSrc="/landing/report-city-portrait.webp" landmarks={landmarks} pslScore={5.9} />
}
