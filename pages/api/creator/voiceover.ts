import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { deliverySchema, geminiSpeechRequest, googleWordTimes, voiceDirectionSchema } from '@/lib/creator/video-speech'

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
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(geminiSpeechRequest(text, voice, delivery)), signal: AbortSignal.timeout(80000) })
    if (!response.ok) throw new ApiError(response.status === 429 ? 429 : 502, response.status === 429 ? 'Gemini speech quota reached. Wait before retrying.' : 'Gemini speech generation failed. Check model access and server configuration.')
    const payload = await response.json()
    const audio = payload.steps?.filter((step: { type: string }) => step.type === 'model_output').flatMap((step: { content?: Array<{ type: string; data?: string }> }) => step.content ?? []).filter((content: { type: string }) => content.type === 'audio').at(-1)
    if (!audio?.data || typeof audio.data !== 'string' || audio.data.length > 4 * 1024 * 1024) throw new ApiError(502, 'Gemini did not return a supported audio segment.')
    if (audio.mime_type && !/^audio\/(l16|pcm)(;|$)/i.test(audio.mime_type)) throw new ApiError(502, 'Gemini returned a different audio format than the requested PCM.')
    const pcm = Buffer.from(audio.data, 'base64')
    if (!pcm.length || pcm.length % 2 || pcm.length > 24000 * 2 * 40) throw new ApiError(502, 'Gemini returned an invalid or oversized PCM segment.')
    let words: Array<{ text: string; startMs: number; endMs: number }> | undefined, alignmentError: string | undefined
    const speechKey = process.env.GOOGLE_SPEECH_API_KEY
    if (speechKey) {
      try {
        const recognized = await fetch('https://speech.googleapis.com/v1/speech:recognize', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': speechKey }, body: JSON.stringify({ config: { encoding: 'LINEAR16', sampleRateHertz: 24000, audioChannelCount: 1, languageCode: 'en-US', enableWordTimeOffsets: true, enableAutomaticPunctuation: true }, audio: { content: audio.data } }), signal: AbortSignal.timeout(35000) })
        if (!recognized.ok) throw new Error('Recognition unavailable. Check Cloud Speech-to-Text access, billing and quota.')
        words = googleWordTimes(await recognized.json(), pcm.length / 48)
      } catch (error) { alignmentError = error instanceof Error ? error.message : 'Word recognition failed; audio is preserved.' }
    }
    return json(res, 200, { audio: audio.data, sampleRate: 24000, durationMs: pcm.length / 48, words, alignmentError })
  } catch (error) {
    return handleApiError(error, res)
  }
}
