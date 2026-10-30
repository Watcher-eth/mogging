import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { scriptSchema } from '@/lib/creator/video-script'
import { applySemanticModel, semanticModelRequest } from '@/lib/creator/video-semantic-model'

export const config = { api: { bodyParser: { sizeLimit: '200kb' } }, maxDuration: 90 }
const requestSchema = z.object({ script: scriptSchema }).strict()
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (!['GET', 'POST'].includes(req.method ?? '')) return methodNotAllowed(res, ['GET', 'POST'])
    const host = req.headers.host ?? '', origin = req.headers.origin
    if (req.method === 'POST' && ![`http://${host}`, `https://${host}`].includes(origin ?? '')) throw new ApiError(403, 'Same-origin requests required')
    const local = process.env.NODE_ENV === 'development' && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
    if (!local) {
      await (await import('@/lib/admin/creator-auth')).requireCreatorAdmin(req, res)
      if (req.method === 'POST') await (await import('@/lib/api/rateLimit')).enforceRateLimit(req, res, { key: 'creator-visual-plan', limit: 6, windowMs: 60000 })
    }
    const apiKey = process.env.GEMINI_API_KEY
    if (req.method === 'GET') return json(res, 200, { configured: Boolean(apiKey) })
    if (!apiKey) throw new ApiError(503, 'Set GEMINI_API_KEY to decode with the model. The local visual director remains available.')
    const { script } = requestSchema.parse(req.body)
    if (script.cues.reduce((sum, cue) => sum + cue.text.length, 0) > 14000) throw new ApiError(400, 'Keep the production script below 14,000 characters.')
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(semanticModelRequest(script)), signal: AbortSignal.timeout(75000) })
    if (!response.ok) throw new ApiError(response.status === 429 ? 429 : 502, response.status === 429 ? 'Visual planning quota reached. Try again later.' : 'Visual decoding failed. Check model access and server configuration.')
    const payload = await response.json()
    const text = payload.candidates?.[0]?.content?.parts?.filter((part: { text?: string; thought?: boolean }) => part.text && !part.thought).map((part: { text: string }) => part.text).join('')
    if (!text || text.length > 180000) throw new ApiError(502, 'The decoder did not return a supported visual plan.')
    try { return json(res, 200, { script: applySemanticModel(script, JSON.parse(text)) }) }
    catch { throw new ApiError(502, 'The proposed visual plan failed exact-text or edit validation. Your current plan is unchanged; retry or use the local director.') }
  } catch (error) { return handleApiError(error, res) }
}
