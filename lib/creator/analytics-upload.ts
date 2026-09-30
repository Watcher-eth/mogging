import type { CreatorVideoType } from './video-types'

export function uploadAnalyticsRecording(
  intent: { uploadUrl: string; method: 'PUT' | 'POST' },
  file: File,
  contentType: CreatorVideoType,
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
