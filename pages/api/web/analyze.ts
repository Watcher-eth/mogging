import { monitorBackend } from '@/lib/reliability/monitor'
import { createAnalyzeHandler } from '@/lib/analysis/handler'
import { analyzeAndSaveWeb, webAnalyzeSchema } from '@/lib/analysis-v2/production'
import { z } from 'zod'

export const config = { maxDuration: 120, api: { bodyParser: { sizeLimit: '12mb' } } }
// Previously loaded web bundles omitted Content-Type when supplying paid headers.
// Keep those tabs recoverable; the same schema, authentication and credit checks apply.
const compatibleBody = z.preprocess(value => {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}, webAnalyzeSchema)
export default monitorBackend('web-analyze-v2', createAnalyzeHandler(analyzeAndSaveWeb, compatibleBody, 'web-v2:'))
