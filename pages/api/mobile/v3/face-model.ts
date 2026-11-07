import { createHash, randomUUID } from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { handleApiError } from '@/lib/api/http'
import { requireFaceModelWorker } from '@/lib/analysis/face-model-runtime'
import { createAnalyzeHandler } from '@/lib/analysis/handler'
import { analyzeAndSave } from '@/lib/analysis/analyze'
import { webAnalyzeSchema } from '@/lib/analysis-v2/production'
import { waitUntil } from '@vercel/functions'
import { generateFaceModelReport } from '@/lib/analysis/face-model-report'

// A separate endpoint keeps older apps' report and narrated-study contracts intact.
export const config = { maxDuration: 120, api: { bodyParser: { sizeLimit: '12mb' } } }
const analyze = createAnalyzeHandler(async (input, reservationId) => {
  const scan = reservationId ?? randomUUID()
  const result = await analyzeAndSave(input, reservationId, {
    presentation: 'face-model',
    requirePersistence: true,
    promptVersion: 'face-model-1',
    photoHash: hash => createHash('sha256').update(`${hash}:${input.userId ?? 'anonymous'}:${scan}`).digest('hex'),
  })
  waitUntil(generateFaceModelReport(result.analysis.id).catch(() => console.error('face-model:web-report-schedule-failed')))
  return result
}, webAnalyzeSchema, 'mobile-face-model:')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check capacity before the shared handler can reserve a paid scan credit.
  if (req.method === 'POST') {
    try { await requireFaceModelWorker() } catch (error) { return handleApiError(error, res) }
  }
  return analyze(req, res)
}
