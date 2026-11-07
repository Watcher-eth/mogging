import { createHash, randomUUID } from 'crypto'
import { createAnalyzeHandler } from '@/lib/analysis/handler'
import { analyzeAndSave } from '@/lib/analysis/analyze'
import { webAnalyzeSchema } from '@/lib/analysis-v2/production'

// A separate endpoint keeps older apps' report and narrated-study contracts intact.
export const config = { maxDuration: 120, api: { bodyParser: { sizeLimit: '12mb' } } }
export default createAnalyzeHandler((input, reservationId) => {
  const scan = reservationId ?? randomUUID()
  return analyzeAndSave(input, reservationId, {
    presentation: 'face-model',
    requirePersistence: true,
    promptVersion: 'face-model-1',
    photoHash: hash => createHash('sha256').update(`${hash}:${input.userId ?? 'anonymous'}:${scan}`).digest('hex'),
  })
}, webAnalyzeSchema, 'mobile-face-model:')
