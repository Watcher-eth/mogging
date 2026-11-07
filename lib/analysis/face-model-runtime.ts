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
function unavailable() { return new ApiError(503, 'Surface reconstruction is temporarily unavailable. Your scan credit and capture are safe.') }
