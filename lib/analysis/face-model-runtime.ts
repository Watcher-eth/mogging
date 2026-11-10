import { createHmac } from 'crypto'
import { ApiError } from '@/lib/api/http'

export function faceModelWorker() {
  const secret = process.env.FACE_MODEL_WORKER_SECRET?.trim()
  let url: URL
  try { url = new URL(process.env.FACE_MODEL_WORKER_ORIGIN || '') } catch { throw unavailable() }
  const local = process.env.NODE_ENV === 'development' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  if (!secret || secret.length < 32 || url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol !== 'https:' && !local)) throw unavailable()
  return { origin: url.origin, secret }
}
export async function requireFaceModelWorker() {
  const { origin } = faceModelWorker()
  try {
    const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(4000), redirect: 'error' })
    if (!response.ok || (await response.json()).ready !== true) throw unavailable()
  } catch { throw unavailable() }
}

export async function deleteFaceModelCaptures(modelIds: string[]) {
  if (!modelIds.length) return
  const { origin, secret } = faceModelWorker()
  for (let offset = 0; offset < modelIds.length; offset += 30) {
    const payload = Buffer.from(JSON.stringify({
      action: 'delete',
      models: modelIds.slice(offset, offset + 30),
      exp: Math.floor(Date.now() / 1000) + 300,
    })).toString('base64url')
    const signature = createHmac('sha256', secret).update(payload).digest('base64url')
    try {
      const response = await fetch(`${origin}/models/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${payload}.${signature}` },
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      })
      if (!response.ok || (await response.json()).accepted !== true) throw unavailable()
    } catch {
      throw new ApiError(503, 'We could not delete your surface reconstruction data. Please try again.')
    }
  }
}

function unavailable() { return new ApiError(503, 'Surface reconstruction is temporarily unavailable. Your scan credit and capture are safe.') }
