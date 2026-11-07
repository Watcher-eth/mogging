import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError } from '@/lib/api/http'
import { createAnalyzeHandler } from '@/lib/analysis/handler'
import { saveMobileFaceStudy, webAnalyzeSchema } from '@/lib/analysis-v2/production'
import { getFaceStudyRenderOrigin } from '@/lib/creator/face-study-runtime'
import { monitorBackend } from '@/lib/reliability/monitor'

export const config = { maxDuration: 120, api: { bodyParser: { sizeLimit: '12mb' } } }
const createStudy = createAnalyzeHandler(saveMobileFaceStudy, webAnalyzeSchema, 'mobile-face-study:')

export default monitorBackend('mobile-face-study', (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST' && process.env.NODE_ENV === 'production'
    && (!getFaceStudyRenderOrigin() || (!process.env.VERCEL && !process.env.FACE_STUDY_CHROME_PATH?.trim())
      || !process.env.GEMINI_API_KEY?.trim())) {
    return handleApiError(new ApiError(503, 'Portrait study video is temporarily unavailable. Your scan credit is still available.'), res)
  }
  return createStudy(req, res)
})
