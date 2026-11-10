// Two recent exports, bounded to 120 MB. Failure/eviction never blocks rendering.
const cacheName = 'mogging-video-exports-studio-v4'
// Bump when the same composition can render different frames or audio.
const rendererRevision = 22
const maximumBytes = 60 * 1024 * 1024
const digest = async (data: BufferSource) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), byte => byte.toString(16).padStart(2, '0')).join('')

export async function videoExportCacheKey(composition: unknown, audio?: AudioBuffer) {
  const channels = audio ? await Promise.all(Array.from({length:audio.numberOfChannels}, (_, channel) => digest(new Float32Array(audio.getChannelData(channel)).buffer))) : []
  const key = await digest(new TextEncoder().encode(JSON.stringify({rendererRevision, composition, sampleRate:audio?.sampleRate, channels})))
  return new Request(new URL(`/__studio-export/${key}`, location.origin))
}

export async function readVideoExport(key: Request): Promise<Blob | undefined> {
  try {
    if (typeof caches === 'undefined') return
    const response = await (await caches.open(cacheName)).match(key)
    if (response?.ok && response.headers.get('Content-Type') === 'video/mp4') return await response.blob()
  } catch { /* Storage is optional, including in private browsing. */ }
}

export async function saveVideoExport(key: Request, video: Blob) {
  if (!video.size || video.size > maximumBytes || typeof caches === 'undefined') return
  try {
    const cache = await caches.open(cacheName)
    await cache.put(key, new Response(video, {headers:{'Content-Type':'video/mp4'}}))
    const keys = await cache.keys()
    await Promise.all(keys.slice(0, -2).map(old => cache.delete(old)))
  } catch { /* Quota pressure must not turn a successful export into a failure. */ }
}
