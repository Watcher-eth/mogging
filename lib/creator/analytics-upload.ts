export const ANALYTICS_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const
export type AnalyticsVideoType = (typeof ANALYTICS_VIDEO_TYPES)[number]

export function analyticsVideoContentType(file: Pick<File, 'type' | 'name'>): AnalyticsVideoType | null {
  const type = file.type.toLowerCase().split(';')[0].trim()
  if (ANALYTICS_VIDEO_TYPES.includes(type as AnalyticsVideoType)) return type as AnalyticsVideoType
  // Some mobile file pickers omit the MIME type or return a generic binary type.
  if (type && type !== 'application/octet-stream') return null
  const extension = file.name.split('.').pop()?.toLowerCase()
  return extension === 'mp4' ? 'video/mp4' : extension === 'mov' ? 'video/quicktime' : extension === 'webm' ? 'video/webm' : null
}

export function uploadAnalyticsRecording(
  intent: { uploadUrl: string; method: 'PUT' | 'POST' },
  file: File,
  contentType: AnalyticsVideoType,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(intent.method, intent.uploadUrl)
    request.setRequestHeader('Content-Type', contentType)
    request.timeout = 30 * 60 * 1000
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100))
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve()
      else reject(new Error(`Recording upload failed (${request.status}). Please try again.`))
    }
    request.onerror = () => reject(new Error('Could not reach recording storage. Check your connection, disable any upload-blocking extension, and try again.'))
    request.ontimeout = () => reject(new Error('The recording upload timed out. Try a faster connection or a smaller recording.'))
    request.onabort = () => reject(new Error('Recording upload was interrupted. Please try again.'))
    request.send(file)
  })
}
