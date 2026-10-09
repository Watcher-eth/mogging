import { monitorBackend } from '@/lib/reliability/monitor'
import { createAnalyzeHandler } from '@/lib/analysis/handler'
import { analyzeAndSaveWeb, webAnalyzeSchema } from '@/lib/analysis-v2/production'

export const config = { maxDuration: 120, api: { bodyParser: { sizeLimit: '12mb' } } }
export default monitorBackend('web-analyze-v2', createAnalyzeHandler(analyzeAndSaveWeb, webAnalyzeSchema, 'web-v2:'))
