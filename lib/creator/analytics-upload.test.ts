import { afterEach, expect, test } from 'bun:test'
import { uploadAnalyticsRecording } from './analytics-upload'
import { creatorVideoContentType } from './video-types'
import { creatorAccountAnalyticsSubmissionSchema } from './validation'

test('accepts supported phone videos when the file picker omits MIME metadata', () => {
  expect(creatorVideoContentType({ name: 'IMG_1234.MOV', type: '' })).toBe('video/quicktime')
  expect(creatorVideoContentType({ name: 'recording.mp4', type: 'application/octet-stream' })).toBe('video/mp4')
  expect(creatorVideoContentType({ name: 'recording', type: 'video/webm' })).toBe('video/webm')
  expect(creatorVideoContentType({ name: 'fake.mp4', type: 'text/html' })).toBeNull()
  expect(creatorVideoContentType({ name: 'unknown.bin', type: '' })).toBeNull()
})

test('normalizes Apple video aliases and codec metadata into server-supported containers', () => {
  const examples = [
    ['export.M4V', '', 'video/mp4'],
    ['export.m4v', 'video/x-m4v', 'video/mp4'],
    ['export.m4v', 'video/m4v', 'video/mp4'],
    ['recording.mp4', 'application/mp4', 'video/mp4'],
    ['recording.mp4', 'video/x-mp4', 'video/mp4'],
    ['recording.MOV', 'video/x-quicktime', 'video/quicktime'],
    ['recording.mov', 'video/mov', 'video/quicktime'],
    ['recording.qt', 'application/octet-stream', 'video/quicktime'],
    ['recording.mov', 'video/hevc', 'video/quicktime'],
    ['recording.mp4', 'video/h264', 'video/mp4'],
    ['recording.mp4', 'Video/MP4; codecs="hvc1"', 'video/mp4'],
  ] as const
  for (const [name, type, expected] of examples) {
    const contentType = creatorVideoContentType({ name, type })
    expect(contentType).toBe(expected)
    expect(creatorAccountAnalyticsSubmissionSchema.safeParse({
      accountId: '00000000-0000-4000-8000-000000000002',
      analyticsVideoUrl: '/recording', analyticsStorageKey: 'creators/user/account-analytics/recording',
      analyticsContentType: contentType, analyticsSizeBytes: 100, analyticsPast28DaysConfirmed: true,
    }).success).toBe(true)
  }
})

test('does not treat unrelated or unrecognizable files as video recordings', () => {
  for (const [name, type] of [
    ['fake.m4v', 'text/html'], ['fake.mov', 'application/pdf'], ['audio.m4a', 'audio/mp4'],
    ['unknown.bin', 'video/hevc'], ['recording.mkv', 'video/x-matroska'], ['constructor', 'constructor'],
  ]) expect(creatorVideoContentType({ name, type })).toBeNull()
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
