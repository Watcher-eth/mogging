import { drawLegacyPoster, loadShareFont } from './legacy-posters'
import { resolveShareOverallOverlay } from '@/lib/sharing/overall-overlay'
import { enrichFaceLandmarks } from './mobile-overlay-engine/enrich-landmarks'
import { preparePoster, drawPoster, posterFamily } from './editorial-posters'
import { loadPhoneFrame, drawPhoneReport, loadHandheldPhone, drawHandheldReport } from './phone-report'
import { type ContentSlide, type GeneratorImage } from './content-generator'
import { createReportOverlay, type ReportOverlay } from './report-overlay'
import { drawScoreReveal, loadRevealBrand, REVEAL_DURATION_MS, REVEAL_PORTRAIT_SIZE, type RevealBrand } from './score-reveal'

import { drawMockReport, mockReportSize, mockReportHeroHeight, loadMockReportSymbols } from './mock-report'

type RenderArgs = { slide: ContentSlide; images: GeneratorImage[]; width: number; height: number }

export async function renderSlidePng(args: RenderArgs) {
  await document.fonts.ready
  if (args.slide.templateId === 'mock-report' && args.width < 1170) {
    const scale = 1170 / args.width
    args = { ...args, width: 1170, height: Math.round(args.height * scale) }
  }
  const { canvas, ctx, image, overlay, brand } = await prepareCanvas(args)
  await drawSlideFrame(ctx, args.slide, image, overlay, args.width, args.height, 4000, brand)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'))
}

export async function renderSlideMp4(args: RenderArgs, onProgress?: (progress: number) => void) {
  await document.fonts.ready
  const prepared = await prepareCanvas(args)
  try {
    return await encodeMp4(args, prepared, onProgress)
  } catch (error) {
    const mimeType = typeof MediaRecorder !== 'undefined'
      ? ['video/mp4;codecs=avc1.42E028', 'video/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
      : undefined
    if (!mimeType || typeof prepared.canvas.captureStream !== 'function') throw error
    onProgress?.(0)
    return recordMp4(args, prepared, mimeType, onProgress)
  }
}

type PreparedCanvas = Awaited<ReturnType<typeof prepareCanvas>>

async function encodeMp4(args: RenderArgs, prepared: PreparedCanvas, onProgress?: (progress: number) => void) {
  return encodeCanvasMp4(prepared.canvas, time => drawSlideFrame(prepared.ctx, args.slide, prepared.image, prepared.overlay, args.width, args.height, time, prepared.brand), args.slide.templateId === 'cta' ? REVEAL_DURATION_MS : 4000, onProgress)
}

export async function encodeCanvasMp4(canvas: HTMLCanvasElement, drawFrame: (timeMs: number) => void, durationMs: number, onProgress?: (progress: number) => void) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') throw new Error('Video export is not supported in this browser. Open this page in an up-to-date Safari or Chrome browser and try again.')
  const frameRate = 30
  const frameCount = Math.ceil(durationMs / 1000 * frameRate)
  let supportedConfig: VideoEncoderConfig | null = null
  // 3× iPhone exports exceed Level 4’s frame-size limit.
  const codecs = canvas.width * canvas.height > 2_097_152 ? ['avc1.420033', 'avc1.4d0033'] : ['avc1.420028', 'avc1.4d002a']
  for (const codec of codecs) {
    const candidate: VideoEncoderConfig = { codec, width: canvas.width, height: canvas.height, bitrate: 8_000_000, framerate: frameRate, avc: { format: 'avc' } }
    const result = await VideoEncoder.isConfigSupported(candidate)
    if (result.supported) { supportedConfig = result.config ?? candidate; break }
  }
  if (!supportedConfig) throw new Error('This browser cannot export MP4. Open this page in an up-to-date Safari or Chrome browser and try again.')

  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({ target, video: { codec: 'avc', width: canvas.width, height: canvas.height, frameRate }, fastStart: 'in-memory' })
  let encoderError: Error | null = null
  const encoder = new VideoEncoder({ output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata), error: (error) => { encoderError = error } })
  try {
    encoder.configure(supportedConfig)
    const frameDuration = 1_000_000 / frameRate
    for (let index = 0; index < frameCount; index += 1) {
      if (encoderError) throw encoderError
      drawFrame(index / frameRate * 1000)
      const frame = new VideoFrame(canvas, { timestamp: Math.round(index * frameDuration), duration: Math.round(frameDuration) })
      try { encoder.encode(frame, { keyFrame: index % (frameRate * 2) === 0 }) } finally { frame.close() }
      // Keep queued full-resolution frames bounded on phones and slower encoders.
      if (encoder.encodeQueueSize >= 8) await encoder.flush()
      if (index % 8 === 0) { onProgress?.(index / frameCount); await new Promise<void>((resolve) => window.setTimeout(resolve, 0)) }
    }
    await encoder.flush()
    if (encoderError) throw encoderError
    muxer.finalize()
    onProgress?.(1)
    return new Blob([target.buffer], { type: 'video/mp4' })
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }
}

async function recordMp4(args: RenderArgs, prepared: PreparedCanvas, mimeType: string, onProgress?: (progress: number) => void) {
  await drawSlideFrame(prepared.ctx, args.slide, prepared.image, prepared.overlay, args.width, args.height, 0, prepared.brand)
  const stream = prepared.canvas.captureStream(30)
  let recorder: MediaRecorder | undefined
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    let recordingError: Error | null = null
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
    recorder.onerror = () => { recordingError = new Error('Video recording failed. Try again in Safari or Chrome.') }
    const stopped = new Promise<void>((resolve) => { recorder!.onstop = () => resolve() })
    recorder.start()
    const start = performance.now()
    const duration = args.slide.templateId === 'cta' ? REVEAL_DURATION_MS : 4000
    let elapsed = 0
    while (elapsed < duration) {
      if (recordingError) throw recordingError
      if (recorder.state === 'inactive') throw new Error('Video recording stopped before it finished. Keep this tab open and try again.')
      await drawSlideFrame(prepared.ctx, args.slide, prepared.image, prepared.overlay, args.width, args.height, elapsed, prepared.brand)
      onProgress?.(Math.min(elapsed / duration, .99))
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1000 / 30))
      elapsed = performance.now() - start
    }
    recorder.stop()
    await stopped
    if (recordingError) throw recordingError
    const blob = new Blob(chunks, { type: 'video/mp4' })
    if (!blob.size) throw new Error('The video was empty. Try again in Safari or Chrome.')
    onProgress?.(1)
    return blob
  } finally {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    stream.getTracks().forEach((track) => track.stop())
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function buildZip(files: Array<{ name: string; data: Uint8Array }>) {
  const localParts: Uint8Array[] = [], centralParts: Uint8Array[] = []
  let offset = 0
  files.forEach(({ name, data }) => {
    const encodedName = new TextEncoder().encode(name), crc = crc32(data)
    const local = concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(encodedName.length), u16(0), encodedName, data])
    localParts.push(local)
    centralParts.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(encodedName.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), encodedName]))
    offset += local.length
  })
  const central = concat(centralParts), end = concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(central.length), u32(offset), u16(0)]), bytes = concat([...localParts, central, end]), buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new Blob([buffer], { type: 'application/zip' })
}

export async function prepareCanvas({ slide, images, width, height }: RenderArgs) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) throw new Error('Canvas export is unavailable')
  const source = images.find((item) => item.id === slide.imageId && item.status === 'ready')
  if (!source) throw new Error('This template’s photo is no longer available. Add a clear photo and generate the set again.')
  const isReport = ['mock-report', 'phone-report', 'handheld-report'].includes(slide.templateId)
  const legacy = ['score-potential','editorial','cta'].includes(slide.templateId)
  const [image, brand] = await Promise.all([loadImage(source.dataUrl), loadRevealBrand(), loadShareFont(), isReport ? loadMockReportSymbols() : null, slide.templateId === 'phone-report' ? loadPhoneFrame() : slide.templateId === 'handheld-report' ? loadHandheldPhone() : null])
  const posterOverlay = ['performance','afterimage'].includes(slide.templateId)
  const overlay: ReportOverlay | null = slide.templateId === 'score-potential'
    ? { size: { width, height }, primitives: resolveShareOverallOverlay(enrichFaceLandmarks(source.landmarks),width,height), dots: [], value: '' }
    : legacy ? createReportOverlay(slide, source, slide.templateId === 'cta' ? { width: REVEAL_PORTRAIT_SIZE, height: REVEAL_PORTRAIT_SIZE } : { width, height })
    : isReport
    ? createReportOverlay(slide, source, { width: mockReportSize.width, height: mockReportHeroHeight }, mockReportSize.width)
    : posterOverlay ? createReportOverlay(slide, source, { width: width * (slide.templateId === 'afterimage' ? .95 : 1), height }) : null

  if (overlay && isReport) {
    overlay.labelLayout = 'mobile'
    overlay.value = slide.categoryId === 'overall' ? `${(Number(slide.currentScore) * .8).toFixed(1)} / 8` : `${Number(slide.categoryScores[0]?.value ?? slide.currentScore).toFixed(1)} / 10`
  }
  if (!isReport && !legacy) await preparePoster(image, width, height, posterFamily(slide.templateId), source.landmarks)
  return { canvas, ctx, image, overlay, brand }
}

export function drawSlideFrame(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, overlay: ReportOverlay | null, width: number, height: number, timeMs: number, brand: RevealBrand | null) {
  if (slide.templateId === 'cta') drawScoreReveal(ctx,slide,image,overlay,brand,width,height,timeMs)
  else if (['score-potential','editorial'].includes(slide.templateId)) drawLegacyPoster(ctx,slide,image,overlay,width,height,timeMs,brand)
  else if (slide.templateId === 'phone-report') drawPhoneReport(ctx, slide, image, overlay, width, height, timeMs, brand)
  else if (slide.templateId === 'handheld-report') drawHandheldReport(ctx, slide, image, overlay, width, height, timeMs, brand)
  else if (slide.templateId === 'mock-report') drawMockReport(ctx, slide, image, overlay, width, height, timeMs)
  else drawPoster(ctx, slide, image, width, height, timeMs, overlay)
}

function loadImage(src: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Image export failed')); image.src = src }) }
function concat(parts: Uint8Array[]) { const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; parts.forEach((part) => { result.set(part, offset); offset += part.length }); return result }
function u16(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255]) }
function u32(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]) }
function crc32(data: Uint8Array) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let index = 0; index < 8; index += 1) crc = crc >>> 1 ^ (0xedb88320 & -(crc & 1)) } return (crc ^ 0xffffffff) >>> 0 }
