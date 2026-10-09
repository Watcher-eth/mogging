import { monitorBackend } from '@/lib/reliability/monitor'
import { createAnalyzeHandler } from '@/lib/analysis/handler'
import { analyzeAndSaveMobile, webAnalyzeSchema } from '@/lib/analysis-v2/production'

export const config = { maxDuration: 120, api: { bodyParser: { sizeLimit: '12mb' } } }
export default monitorBackend('mobile-analyze-v2', createAnalyzeHandler(analyzeAndSaveMobile, webAnalyzeSchema, 'mobile-v2:'))
