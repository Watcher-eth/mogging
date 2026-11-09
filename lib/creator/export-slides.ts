import { createRenderEstimator } from './export-progress'
import { drawGlamourGuidance, prepareGlamourImage } from './glamour-guidance'
import { drawPortraitCover, loadShareFont, prepareCoverArtwork } from './legacy-posters'
import { preciseFaceOverlay } from './face-treatment'
import { enrichFaceLandmarks } from './mobile-overlay-engine/enrich-landmarks'
import { preparePoster, drawPoster, posterFamily } from './editorial-posters'
import { loadPhoneFrame, drawPhoneReport, loadHandheldPhone, drawHandheldReport } from './phone-report'
import { type ContentSlide, type GeneratorImage } from './content-generator'
import { createReportOverlay, type ReportOverlay } from './report-overlay'
import { drawScoreReveal, loadRevealBrand, REVEAL_DURATION_MS, type RevealBrand } from './score-reveal'

import { drawMockReport, mockReportFormat, mockReportSize, mockReportHeroHeight, loadMockReportSymbols } from './mock-report'

export const CTA_CLIP_DURATION_MS = 2000

export function slideDuration(slide: ContentSlide) {
  return slide.templateId === 'mock-report' ? 4000 : CTA_CLIP_DURATION_MS
}

type RenderArgs = { slide: ContentSlide; images: GeneratorImage[]; width: number; height: number }

export async function renderSlidePng(args: RenderArgs) {
  await document.fonts.ready
  if (args.slide.templateId === 'mock-report' && args.width < mockReportFormat.width) {
    const scale = mockReportFormat.width / args.width
    args = { ...args, width: mockReportFormat.width, height: Math.round(args.height * scale) }
  }
  const { canvas, ctx, image, overlay, brand } = await prepareCanvas(args)
  await drawSlideFrame(ctx, args.slide, image, overlay, args.width, args.height, slideDuration(args.slide), brand)
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
  return encodeCanvasMp4(prepared.canvas, time => drawSlideFrame(prepared.ctx, args.slide, prepared.image, prepared.overlay, args.width, args.height, time, prepared.brand), slideDuration(args.slide), onProgress)
}

export async function encodeCanvasMp4(canvas: HTMLCanvasElement, drawFrame: (timeMs: number) => void | Promise<void>, durationMs: number, onProgress?: (progress: number) => void, signal?: AbortSignal, audio?: AudioBuffer, bitrate = 8_000_000, onRemaining?: (seconds: number | null) => void) {
  signal?.throwIfAborted()
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') throw new Error('Video export is not supported in this browser. Open this page in an up-to-date Safari or Chrome browser and try again.')
  const frameRate = 30
  const frameCount = Math.ceil(durationMs / 1000 * frameRate)
  onRemaining?.(null)
  let supportedConfig: VideoEncoderConfig | null = null
  // Retina iPhone exports exceed Level 4’s frame-size limit.
  const codecs = canvas.width * canvas.height > 2_097_152 ? ['avc1.420033', 'avc1.4d0033'] : ['avc1.420028', 'avc1.4d002a']
  for (const codec of codecs) {
    const candidate: VideoEncoderConfig = { codec, width: canvas.width, height: canvas.height, bitrate, framerate: frameRate, avc: { format: 'avc' } }
    const result = await VideoEncoder.isConfigSupported(candidate)
    if (result.supported) { supportedConfig = result.config ?? candidate; break }
  }
  if (!supportedConfig) throw new Error('This browser cannot export MP4. Open this page in an up-to-date Safari or Chrome browser and try again.')
  const audioConfig: AudioEncoderConfig | undefined = audio ? { codec: 'mp4a.40.2', sampleRate: audio.sampleRate, numberOfChannels: audio.numberOfChannels, bitrate: 128000 } : undefined
  if (audioConfig && (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined' || !(await AudioEncoder.isConfigSupported(audioConfig)).supported)) throw new Error('This browser cannot encode voiceover audio. Use a browser with AAC WebCodecs support.')
  if (audio && Math.abs(audio.duration * 1000 - durationMs) > 1) throw new Error('Align the timeline to this voiceover before exporting')

  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({ target, video: { codec: 'avc', width: canvas.width, height: canvas.height, frameRate }, ...(audio ? { audio: { codec: 'aac' as const, numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate } } : {}), fastStart: 'in-memory', firstTimestampBehavior: 'offset' })
  let encoderError: Error | null = null
  let wakeAudio: (() => void) | null = null
  const fail = (error: unknown) => { encoderError = error instanceof Error ? error : new Error(String(error)); wakeAudio?.() }
  const encoder = new VideoEncoder({ output: (chunk, metadata) => { try { muxer.addVideoChunk(chunk, metadata) } catch (error) { fail(error) } }, error: fail })
  let audioEncoder: AudioEncoder | null = null
  let audioOffset = 0
  try {
    encoder.configure(supportedConfig)
    if (audio) audioEncoder = new AudioEncoder({ output: (chunk, metadata) => { try { muxer.addAudioChunk(chunk, metadata) } catch (error) { fail(error) } }, error: fail })
    audioEncoder?.addEventListener('dequeue', () => wakeAudio?.())
    if (audioEncoder && audioConfig) audioEncoder.configure(audioConfig)
    const frameDuration = 1_000_000 / frameRate
    const estimate = createRenderEstimator(frameCount)
    let lastEstimateAt = 0
    for (let index = 0; index < frameCount; index += 1) {
      signal?.throwIfAborted()
      if (encoderError) throw encoderError
      await drawFrame(index / frameRate * 1000)
      signal?.throwIfAborted()
      // Resolve WebGL/Canvas work before handing the frame to a separate codec.
      // GPU-backed canvas snapshots can deadlock macOS encoders at a full queue.
      const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height)
      const frame = new VideoFrame(pixels.data, {format:'RGBA',codedWidth:canvas.width,codedHeight:canvas.height,timestamp: Math.round(index * frameDuration), duration: Math.round(frameDuration) })
      try { encoder.encode(frame, { keyFrame: index % (frameRate * 2) === 0 }) } finally { frame.close() }
      if (audio && audioEncoder) {
        const end = Math.min(audio.length, Math.ceil((index + 1) / frameRate * audio.sampleRate))
        while (audioOffset < end) {
          signal?.throwIfAborted()
          const count = Math.min(1024, audio.length - audioOffset)
          const data = new Float32Array(count * audio.numberOfChannels)
          for (let channel = 0; channel < audio.numberOfChannels; channel++) data.set(audio.getChannelData(channel).subarray(audioOffset, audioOffset + count), channel * count)
          const packet = new AudioData({ format: 'f32-planar', sampleRate: audio.sampleRate, numberOfFrames: count, numberOfChannels: audio.numberOfChannels, timestamp: Math.round(audioOffset / audio.sampleRate * 1000000), data })
          try { audioEncoder.encode(packet) } finally { packet.close() }
          audioOffset += count
          if (audioEncoder.encodeQueueSize >= 8) { await new Promise<void>(resolve => { wakeAudio = resolve }); wakeAudio = null }
          if (encoderError) throw encoderError
        }
      }
      // Keep queued full-resolution frames bounded on phones and slower encoders.
      if (encoder.encodeQueueSize >= 8) await encoder.flush()
      const remaining = estimate(index + 1), at = performance.now()
      if (index===frameCount-1 || at-lastEstimateAt>=500) { onRemaining?.(remaining); lastEstimateAt=at }
      onProgress?.((index + 1) / frameCount)
      if (index % 8 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
    await encoder.flush()
    await audioEncoder?.flush()
    signal?.throwIfAborted()
    if (encoderError) throw encoderError
    muxer.finalize()
    onProgress?.(1)
    return new Blob([target.buffer], { type: 'video/mp4' })
  } finally {
    if (encoder.state !== 'closed') encoder.close()
    if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close()
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
    const duration = slideDuration(args.slide)
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

const ctaMetricGuides: Record<string, string> = {
  psl: 'face.shape',
  dimorphism: 'detail.dimorphism',
  'facial-fat': 'detail.under-cheekbones',
  cheekbones: 'detail.cheekbones',
}

export function createCtaPhotoOverlay(slide: ContentSlide, source: GeneratorImage) {
  const overlay = createReportOverlay(slide, source, source)
  if (overlay.skinNetwork || slide.overlayStyle === 'face-map') return overlay
  const category = slide.categoryId
  const photo = { ...source, landmarks: enrichFaceLandmarks(source.landmarks) }
  const precise = preciseFaceOverlay(overlay, photo, category, '', false, ctaMetricGuides[category])
  if (precise.primitives.length || precise.measurement) return precise
  if (category === 'cheekbones') {
    const widthGuide = preciseFaceOverlay(overlay, photo, category, '', false, 'cheeks.width')
    if (widthGuide.primitives.length) return widthGuide
  }
  return { ...overlay, useReportPrimitives: true }
}

export async function prepareCanvas({ slide, images, width, height }: RenderArgs) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) throw new Error('Canvas export is unavailable')
  const selectedImage = images.find((item) => item.id === slide.imageId && item.status === 'ready')
  if (!selectedImage) throw new Error('This template’s photo is no longer available. Add a clear photo and generate the set again.')
  const isReport = ['mock-report', 'phone-report', 'handheld-report'].includes(slide.templateId)
  const glamour = slide.templateId === 'glamour-guidance'
  const portraitCover = ['score-potential', 'editorial', 'performance'].includes(slide.templateId)
  const [image, brand] = await Promise.all([loadImage(selectedImage.dataUrl), loadRevealBrand(), loadShareFont(), isReport ? loadMockReportSymbols() : null, slide.templateId === 'phone-report' ? loadPhoneFrame() : slide.templateId === 'handheld-report' ? loadHandheldPhone() : null])
  const source = { ...selectedImage, width: image.naturalWidth, height: image.naturalHeight }
  const imageSpace = portraitCover || slide.templateId === 'cta'
  const overlaySlide = slide.templateId === 'performance' ? { ...slide, overlayStyle: 'category' as const } : slide
  const overlay: ReportOverlay | null = imageSpace
    ? createCtaPhotoOverlay(overlaySlide, source)
    : isReport
      ? createReportOverlay(slide, source, { width: mockReportSize.width, height: mockReportHeroHeight }, mockReportSize.width, true)
      : slide.templateId === 'afterimage'
        ? createReportOverlay(slide, source, { width: width * .95, height })
        : null
  if (overlay && isReport) {
    overlay.labelLayout = 'mobile'
    overlay.value = slide.categoryId === 'overall' ? `${(Number(slide.currentScore) * .8).toFixed(1)} / 8` : `${Number(slide.categoryScores[0]?.value ?? slide.currentScore).toFixed(1)} / 10`
  }
  if (!isReport && !portraitCover && slide.templateId !== 'cta' && !glamour) await preparePoster(image, width, height, posterFamily(slide.templateId), source.landmarks)
  if (portraitCover) await prepareCoverArtwork(slide, image, source)
  if (glamour) await prepareGlamourImage(image)
  return { canvas, ctx, image, overlay, brand }
}

export function drawSlideFrame(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, overlay: ReportOverlay | null, width: number, height: number, timeMs: number, brand: RevealBrand | null) {
  if (slide.templateId === 'glamour-guidance') drawGlamourGuidance(ctx, slide, image, width, height, timeMs)
  else if (slide.templateId === 'cta') drawScoreReveal(ctx,slide,image,overlay,brand,width,height,timeMs * REVEAL_DURATION_MS / CTA_CLIP_DURATION_MS)
  else if (['score-potential', 'editorial', 'performance'].includes(slide.templateId)) drawPortraitCover(ctx,slide,image,overlay,width,height,timeMs,brand)
  else if (slide.templateId === 'phone-report') drawPhoneReport(ctx, slide, image, overlay, width, height, timeMs, brand)
  else if (slide.templateId === 'handheld-report') drawHandheldReport(ctx, slide, image, overlay, width, height, timeMs, brand)
  else if (slide.templateId === 'mock-report') drawMockReport(ctx, slide, image, overlay, width, height, timeMs)
  else drawPoster(ctx, slide, image, width, height, timeMs, overlay, brand)
}

function loadImage(src: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Image export failed')); image.src = src }) }
function concat(parts: Uint8Array[]) { const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; parts.forEach((part) => { result.set(part, offset); offset += part.length }); return result }
function u16(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255]) }
function u32(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]) }
function crc32(data: Uint8Array) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let index = 0; index < 8; index += 1) crc = crc >>> 1 ^ (0xedb88320 & -(crc & 1)) } return (crc ^ 0xffffffff) >>> 0 }
