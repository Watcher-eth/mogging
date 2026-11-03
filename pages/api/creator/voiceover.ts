import { generateCreatorSpeech } from '@/lib/creator/video-speech-server'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { deliverySchema, voiceDirectionSchema } from '@/lib/creator/video-speech'

export const config = { api: { bodyParser: { sizeLimit: '12kb' } }, maxDuration: 180 }
const requestSchema = z.object({ text: z.string().trim().min(1).max(1200), voice: voiceDirectionSchema, delivery: deliverySchema.optional() }).strict()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (!['GET', 'POST'].includes(req.method ?? '')) return methodNotAllowed(res, ['GET', 'POST'])
    const host = req.headers.host ?? '', origin = req.headers.origin
    const local = process.env.NODE_ENV === 'development' && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
    if (req.method === 'POST' && ![`http://${host}`, `https://${host}`].includes(origin ?? '')) throw new ApiError(403, 'Same-origin requests required')
    if (!local) {
      await (await import('@/lib/admin/creator-auth')).requireCreatorAdmin(req, res)
      if (req.method === 'POST') await (await import('@/lib/api/rateLimit')).enforceRateLimit(req, res, { key: 'creator-speech', limit: 40, windowMs: 60000 })
    }
    const apiKey = process.env.GEMINI_API_KEY
    if (req.method === 'GET') return json(res, 200, { configured: Boolean(apiKey), alignmentConfigured: Boolean(process.env.GOOGLE_SPEECH_API_KEY), model: 'gemini-3.8-flash-tts', timing: 'scene-boundaries' })
    if (!apiKey) throw new ApiError(503, 'Set GEMINI_API_KEY on the server to generate speech. Your script and voice direction can still be copied.')
    const { text, voice, delivery } = requestSchema.parse(req.body)
    return json(res,200,await generateCreatorSpeech(text,voice,delivery,AbortSignal.timeout(150000)))
  } catch (error) {
    return handleApiError(error, res)
  }
}
