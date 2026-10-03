import { courseRequest, creatorCoursePath } from './client'
import { uploadSchema } from './validation'

type Ticket = { assetId: string; headers: Record<string, string> } & (
  { protocol: 'tus'; endpoint: string; metadata: Record<string, string> } | { protocol: 'put'; url: string }
)
function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video'), url = URL.createObjectURL(file)
    const done = (error?: string) => {
      clearTimeout(timer); video.onloadedmetadata = null; video.onerror = null
      const duration = video.duration
      video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url)
      if (error || !Number.isFinite(duration) || duration <= 0) reject(new Error(error || 'Cannot read video duration. Try an MP4.'))
      else resolve(Math.ceil(duration))
    }
    const timer = setTimeout(() => done('Cannot read video duration. Try an MP4.'), 10_000)
    video.preload = 'metadata'; video.onloadedmetadata = () => done(); video.onerror = () => done('Cannot read this video format. Try an MP4.'); video.src = url
  })
}
export async function uploadCourseFile(courseId: string, file: File, kind: 'video' | 'resource', options: {
  signal: AbortSignal
  resumeAssetId?: string
  reserved: (assetId: string) => Promise<void>
  progress: (percent: number) => void
}) {
  const input = uploadSchema.parse({ kind, title: file.name.slice(0, 160), contentType: file.type, sizeBytes: file.size,
    ...(kind === 'video' ? { durationSeconds: await videoDuration(file) } : {}) })
  options.signal.throwIfAborted()
  const path = options.resumeAssetId ? `${creatorCoursePath(courseId)}/assets/${options.resumeAssetId}/resume` : `${creatorCoursePath(courseId)}/uploads`
  const ticket = await courseRequest<Ticket>(path, 'POST', input, options.signal)
  if (!options.resumeAssetId) await options.reserved(ticket.assetId)
  options.signal.throwIfAborted()
  if (ticket.protocol === 'tus') {
    const { Upload } = await import('tus-js-client')
    await new Promise<void>((resolve, reject) => {
      const abort = () => { void upload.abort().catch(() => {}); done(new DOMException('Upload cancelled', 'AbortError')) }
      const done = (error?: Error) => { options.signal.removeEventListener('abort', abort); error ? reject(error) : resolve() }
      const upload = new Upload(file, { endpoint: ticket.endpoint, headers: ticket.headers, metadata: ticket.metadata,
        chunkSize: 8 * 1024 ** 2, retryDelays: [0, 1000, 3000, 5000, 10_000], removeFingerprintOnSuccess: true,
        fingerprint: async () => `mogging-course-${courseId}-${ticket.assetId}-${file.size}-${file.lastModified}`,
        onProgress: (sent, total) => options.progress(Math.floor(sent / total * 100)), onSuccess: () => done(), onError: error => done(error),
      })
      options.signal.addEventListener('abort', abort, { once: true })
      void upload.findPreviousUploads().then(previous => {
        if (options.signal.aborted) return abort()
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0])
        upload.start()
      }).catch(error => done(error))
    })
  } else {
    const response = await fetch(ticket.url, { method: 'PUT', headers: ticket.headers, body: file, signal: options.signal })
    if (!response.ok) throw new Error('Attachment upload failed. Check the private R2 bucket and CORS settings.')
    options.progress(100)
  }
  return courseRequest(`${creatorCoursePath(courseId)}/assets/${ticket.assetId}/complete`, 'POST', {}, options.signal)
}
