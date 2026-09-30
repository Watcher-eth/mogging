import { afterEach, expect, test } from 'bun:test'
import { analyticsVideoContentType, uploadAnalyticsRecording } from './analytics-upload'

test('accepts supported phone videos when the file picker omits MIME metadata', () => {
  expect(analyticsVideoContentType({ name: 'IMG_1234.MOV', type: '' })).toBe('video/quicktime')
  expect(analyticsVideoContentType({ name: 'recording.mp4', type: 'application/octet-stream' })).toBe('video/mp4')
  expect(analyticsVideoContentType({ name: 'recording', type: 'video/webm' })).toBe('video/webm')
  expect(analyticsVideoContentType({ name: 'fake.mp4', type: 'text/html' })).toBeNull()
  expect(analyticsVideoContentType({ name: 'unknown.bin', type: '' })).toBeNull()
})

const OriginalXHR = globalThis.XMLHttpRequest
let request: FakeXHR
class FakeXHR {
  status = 200
  timeout = 0
  upload = { onprogress: null as ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null }
  onload?: () => void
  onerror?: () => void
  ontimeout?: () => void
  onabort?: () => void
  body?: File
  method?: string
  url?: string
  contentType?: string
  constructor() { request = this }
  open(method: string, url: string) { this.method = method; this.url = url }
  setRequestHeader(_name: string, value: string) { this.contentType = value }
  send(body: File) { this.body = body }
}
afterEach(() => { globalThis.XMLHttpRequest = OriginalXHR })
function startUpload() {
  globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest
  const progress: number[] = []
  const file = new File(['recording'], 'recording.mov')
  const pending = uploadAnalyticsRecording({ uploadUrl: 'https://storage.example/upload', method: 'PUT' }, file, 'video/quicktime', (value) => progress.push(value))
  return { pending, progress, file }
}
test('uploads the original bytes with normalized metadata and reports progress', async () => {
  const { pending, progress, file } = startUpload()
  expect(request.method).toBe('PUT')
  expect(request.body).toBe(file)
  expect(request.contentType).toBe('video/quicktime')
  request.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 })
  expect(progress).toEqual([50])
  request.onload?.()
  await pending
})
test('network failures reject instead of leaving verification spinning', async () => {
  const { pending } = startUpload()
  request.onerror?.()
  await expect(pending).rejects.toThrow('Could not reach recording storage')
})
test('storage rejection preserves an actionable error', async () => {
  const { pending } = startUpload()
  request.status = 403
  request.onload?.()
  await expect(pending).rejects.toThrow('Recording upload failed (403)')
})
