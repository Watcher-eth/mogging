import type { ContentSlide, GeneratorImage } from './content-generator'
import { createReportOverlay, drawReportOverlay, type ReportOverlay } from './report-overlay'

type RenderArgs = { slide: ContentSlide; images: GeneratorImage[]; width: number; height: number }

export async function renderSlidePng(args: RenderArgs) {
  await document.fonts.ready
  const { canvas, ctx, image, overlay } = await prepareCanvas(args)
  await drawSlideFrame(ctx, args.slide, image, overlay, args.width, args.height, 4000)
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
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') throw new Error('Video export is not supported in this browser. Open this page in an up-to-date Safari or Chrome browser and try again.')
  const frameRate = 30
  const frameCount = 120
  let supportedConfig: VideoEncoderConfig | null = null
  // Level 4 supports all three 1080px output formats at 30fps; level 3.1 does not.
  for (const codec of ['avc1.420028', 'avc1.4d002a']) {
    const candidate: VideoEncoderConfig = { codec, width: args.width, height: args.height, bitrate: 8_000_000, framerate: frameRate, avc: { format: 'avc' } }
    const result = await VideoEncoder.isConfigSupported(candidate)
    if (result.supported) { supportedConfig = result.config ?? candidate; break }
  }
  if (!supportedConfig) throw new Error('This browser cannot export MP4. Open this page in an up-to-date Safari or Chrome browser and try again.')

  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({ target, video: { codec: 'avc', width: args.width, height: args.height, frameRate }, fastStart: 'in-memory' })
  let encoderError: Error | null = null
  const encoder = new VideoEncoder({ output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata), error: (error) => { encoderError = error } })
  try {
    encoder.configure(supportedConfig)
    const frameDuration = 1_000_000 / frameRate
    for (let index = 0; index < frameCount; index += 1) {
      if (encoderError) throw encoderError
      await drawSlideFrame(prepared.ctx, args.slide, prepared.image, prepared.overlay, args.width, args.height, index / frameRate * 1000)
      const frame = new VideoFrame(prepared.canvas, { timestamp: Math.round(index * frameDuration), duration: Math.round(frameDuration) })
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
  await drawSlideFrame(prepared.ctx, args.slide, prepared.image, prepared.overlay, args.width, args.height, 0)
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
    let elapsed = 0
    while (elapsed < 4000) {
      if (recordingError) throw recordingError
      if (recorder.state === 'inactive') throw new Error('Video recording stopped before it finished. Keep this tab open and try again.')
      await drawSlideFrame(prepared.ctx, args.slide, prepared.image, prepared.overlay, args.width, args.height, elapsed)
      onProgress?.(Math.min(elapsed / 4000, .99))
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

async function prepareCanvas({ slide, images, width, height }: RenderArgs) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false }); if (!ctx) throw new Error('Canvas export is unavailable')
  const source = images.find((item) => item.id === slide.imageId && item.status === 'ready')
  if (!source) throw new Error('This template’s photo is no longer available. Add a clear photo and generate the set again.')
  const image = await loadImage(source.dataUrl)
  const viewport = slide.templateId === 'cta' ? { width: width * .52, height: width * .52 } : { width, height }
  const overlay = createReportOverlay(slide, source, viewport)
  return { canvas, ctx, image, overlay }
}

async function drawSlideFrame(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, overlay: ReportOverlay | null, width: number, height: number, timeMs: number) {
  ctx.textBaseline = 'top'
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#09090b'; ctx.fillRect(0, 0, width, height)
  if (slide.templateId === 'cta') {
    const glow = ctx.createRadialGradient(width / 2, height * .26, 0, width / 2, height * .26, width * .58); glow.addColorStop(0, 'rgba(45,212,191,.12)'); glow.addColorStop(1, 'rgba(7,9,9,0)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height)
    if (image) drawCircularPortrait(ctx, image, overlay, width, height, timeMs)
  } else {
    if (image) drawCover(ctx, image, 0, 0, width, height)
    const gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, 'rgba(0,0,0,0.45)'); gradient.addColorStop(0.5, 'rgba(0,0,0,0.05)'); gradient.addColorStop(1, 'rgba(0,0,0,0.95)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
  }
  if (slide.templateId !== 'cta' && overlay) drawReportOverlay(ctx, overlay, width, timeMs)
  drawTemplate(ctx, slide, width, height, timeMs)
}

function drawTemplate(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, height: number, timeMs: number) {
  const margin = width * 0.07
  if (slide.templateId !== 'cta') drawHeader(ctx, slide.eyebrow, slide.templateId, margin, width, height, enter(timeMs, 580, 520))
  if (slide.templateId === 'editorial') drawEditorial(ctx, slide, width, height, timeMs)
  else if (slide.templateId === 'score-potential') drawScorePotential(ctx, slide, width, height, timeMs)
  else if (slide.templateId === 'psl') drawPsl(ctx, slide, width, height, timeMs)
  else if (slide.templateId === 'score-rows') drawScoreRows(ctx, slide, width, height, timeMs)
  else drawCta(ctx, slide, width, height, timeMs)
}

function drawEditorial(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, height: number, timeMs: number) {
  const margin = width * 0.07, headlineSize = Math.round(Math.min(width * 0.073, height * 0.061)), supportSize = Math.round(Math.min(width * 0.027, height * 0.022)), headlineLines = wrapText(ctx, slide.headline, width * 0.86, `600 ${headlineSize}px Arial`), supportLines = wrapText(ctx, slide.supportingCopy, width * 0.76, `400 ${supportSize}px Arial`)
  let y = height * 0.69
  withEnter(ctx, enter(timeMs, 900, 520), () => { ctx.font = `600 ${Math.round(width * 0.019)}px monospace`; ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.fillText(slide.metricLabel.toUpperCase(), margin, y); ctx.textAlign = 'right'; ctx.fillText(slide.metricValue.toUpperCase(), width - margin, y); ctx.textAlign = 'left' })
  y += height * 0.055
  withEnter(ctx, enter(timeMs, 1050, 520), () => { ctx.font = `600 ${headlineSize}px Arial`; ctx.fillStyle = '#fff'; headlineLines.forEach((line) => { ctx.fillText(line, margin, y); y += headlineSize * .98 }) })
  y += height * .025
  withEnter(ctx, enter(timeMs, 1220, 520), () => { ctx.font = `400 ${supportSize}px Arial`; ctx.fillStyle = 'rgba(255,255,255,.68)'; supportLines.forEach((line) => { ctx.fillText(line, margin, y); y += supportSize * 1.45 }) })
}

function drawScorePotential(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, height: number, timeMs: number) {
  withEnter(ctx, enter(timeMs, 760, 520), () => drawTag(ctx, slide.metricLabel, width * .07, height * .09, width * .025))
  const gap = width * .02, cardWidth = (width * .9 - gap) / 2, y = height * .70, cardHeight = height * .25
  drawScoreCard(ctx, 'Current', slide.currentScore, width * .05, y, cardWidth, cardHeight, '#fff', enter(timeMs, 1050, 520))
  drawScoreCard(ctx, 'Potential', slide.potentialScore, width * .05 + cardWidth + gap, y, cardWidth, cardHeight, '#67e8f9', enter(timeMs, 1200, 520))
}

function drawPsl(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, height: number, timeMs: number) {
  withEnter(ctx, enter(timeMs, 720, 520), () => { ctx.fillStyle = '#fff'; ctx.fillRect(width * .25, height * .07, width * .11, width * .11); ctx.fillStyle = '#000'; ctx.font = `900 ${width * .055}px monospace`; ctx.textAlign = 'center'; ctx.fillText('M', width * .305, height * .087); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `900 ${width * .13}px Arial`; ctx.fillText('PSL', width * .4, height * .06) })
  const x = width * .05, y = height * .72, cardWidth = width * .45, cardHeight = height * .23
  drawScoreCard(ctx, 'PSL', slide.currentScore, x, y, cardWidth, cardHeight, '#a3e635', enter(timeMs, 1020, 520))
  drawScoreCard(ctx, 'Potential', slide.potentialScore, x + cardWidth, y, cardWidth, cardHeight, '#67e8f9', enter(timeMs, 1180, 520))
}

function drawScoreRows(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, height: number, timeMs: number) {
  const x = width * .05, y = height * .54, boxWidth = width * .9, boxHeight = height * .42
  ctx.fillStyle = 'rgba(0,0,0,.78)'; roundedRect(ctx, x, y, boxWidth, boxHeight, width * .025); ctx.fill()
  withEnter(ctx, enter(timeMs, 760, 520), () => { ctx.fillStyle = '#fff'; ctx.font = `600 ${width * .075}px Arial`; ctx.fillText(displayScore(slide.currentScore), x + width * .04, y + height * .055); ctx.textAlign = 'right'; ctx.fillStyle = '#67e8f9'; ctx.fillText(displayScore(slide.potentialScore), x + boxWidth - width * .04, y + height * .055); ctx.textAlign = 'left' })
  const rows = slide.categoryScores.slice(0, 7), rowStart = y + height * .17, rowHeight = Math.min(height * .047, (boxHeight - height * .19) / Math.max(1, rows.length))
  rows.forEach((row, index) => { const delay = 920 + index * 90, barProgress = enter(timeMs, delay + 150, 720, [0.16, 1, 0.3, 1]); withEnter(ctx, enter(timeMs, delay, 480), () => { const rowY = rowStart + rowHeight * index; ctx.fillStyle = '#fff'; ctx.font = `500 ${width * .022}px Arial`; ctx.fillText(row.label, x + width * .04, rowY); const barX = x + width * .34, barWidth = boxWidth * .49; ctx.fillStyle = 'rgba(255,255,255,.18)'; roundedRect(ctx, barX, rowY, barWidth, height * .007, height * .004); ctx.fill(); ctx.fillStyle = '#fff'; roundedRect(ctx, barX, rowY, barWidth * scoreRatio(row.value) * barProgress, height * .007, height * .004); ctx.fill(); ctx.textAlign = 'right'; ctx.font = `600 ${width * .021}px monospace`; ctx.fillText(displayScore(row.value), x + boxWidth - width * .04, rowY - height * .004); ctx.textAlign = 'left' }) })
}

function drawCta(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, height: number, timeMs: number) {
  withEnter(ctx, enter(timeMs, 560, 520), () => { ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(207,250,254,.58)'; ctx.font = `600 ${width * .018}px monospace`; ctx.fillText('FACE ANALYSIS', width / 2, height * .045); ctx.fillStyle = '#fff'; ctx.font = `900 ${width * .085}px Arial`; ctx.fillText('Mogging', width / 2, height * .075); ctx.textAlign = 'left' })
  const gap = width * .02, cardWidth = (width * .9 - gap) / 2, cardHeight = Math.min(height * .25, width * .55), y = height * .60
  drawScoreCard(ctx, 'Current', slide.currentScore, width * .05, y, cardWidth, cardHeight, '#a3e635', enter(timeMs, 1120, 520))
  drawScoreCard(ctx, 'Potential', slide.potentialScore, width * .05 + cardWidth + gap, y, cardWidth, cardHeight, '#67e8f9', enter(timeMs, 1280, 520))
}

function drawHeader(ctx: CanvasRenderingContext2D, eyebrow: string, template: string, margin: number, width: number, height: number, progress: number) { withEnter(ctx, progress, () => { ctx.font = `600 ${Math.round(width * .021)}px monospace`; ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.fillText(eyebrow.toUpperCase(), margin, height * .04); ctx.textAlign = 'right'; ctx.fillText(`[ ${template.toUpperCase()} ]`, width - margin, height * .04); ctx.textAlign = 'left' }) }
function drawScoreCard(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number, width: number, height: number, accent: string, progress: number) { withEnter(ctx, progress, () => { ctx.fillStyle = 'rgba(0,0,0,.72)'; roundedRect(ctx, x, y, width, height, width * .025); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `600 ${width * .055}px monospace`; ctx.fillText(label.toUpperCase(), x + width * .09, y + height * .12); ctx.fillStyle = '#fff'; ctx.font = `600 ${width * .2}px Arial`; ctx.fillText(displayScore(value), x + width * .09, y + height * .34); ctx.fillStyle = 'rgba(255,255,255,.18)'; roundedRect(ctx, x + width * .09, y + height * .76, width * .82, height * .055, height * .03); ctx.fill(); ctx.fillStyle = accent; roundedRect(ctx, x + width * .09, y + height * .76, width * .82 * scoreRatio(value) * progress, height * .055, height * .03); ctx.fill() }) }

function drawCircularPortrait(ctx: CanvasRenderingContext2D, image: HTMLImageElement, overlay: ReportOverlay | null, width: number, height: number, timeMs: number) {
  const size = width * .52, x = (width - size) / 2, y = height * .17, progress = enter(timeMs, 720, 520)
  if (progress <= 0) return
  ctx.save(); ctx.globalAlpha = progress; ctx.translate(0, (1 - progress) * 8); ctx.beginPath(); ctx.arc(width / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip(); drawCover(ctx, image, x, y, size, size)
  const shade = ctx.createLinearGradient(0, y, 0, y + size); shade.addColorStop(0, 'rgba(0,0,0,.05)'); shade.addColorStop(1, 'rgba(0,0,0,.25)'); ctx.fillStyle = shade; ctx.fillRect(x, y, size, size)
  if (overlay) { ctx.save(); ctx.translate(x, y); drawReportOverlay(ctx, overlay, size, timeMs, false); ctx.restore() }
  ctx.restore(); ctx.save(); ctx.globalAlpha = progress; ctx.strokeStyle = 'rgba(165,243,252,.35)'; ctx.lineWidth = Math.max(1, width * .002); ctx.beginPath(); ctx.arc(width / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
}

function drawTag(ctx: CanvasRenderingContext2D, title: string, x: number, y: number, size: number, value?: string, progress = 1) { ctx.save(); ctx.globalAlpha *= progress; ctx.font = `600 ${size}px monospace`; [title.toUpperCase(), ...(value ? [value.toUpperCase()] : [])].forEach((line, index) => { const lineWidth = ctx.measureText(line).width + size * 1.6; ctx.fillStyle = 'rgba(255,255,255,.84)'; ctx.fillRect(x, y + index * size * 1.7, lineWidth, size * 1.45); ctx.fillStyle = index ? '#000' : '#71717a'; ctx.fillText(line, x + size * .55, y + index * size * 1.7 + size * .2) }); ctx.restore() }
function withEnter(ctx: CanvasRenderingContext2D, progress: number, draw: () => void) { if (progress <= 0) return; ctx.save(); ctx.globalAlpha = progress; ctx.translate(0, (1 - progress) * 8); draw(); ctx.restore() }
type EasingCurve = [number, number, number, number]
function enter(timeMs: number, delay: number, duration: number, curve: EasingCurve = [0.23, 1, 0.32, 1]) { const value = Math.max(0, Math.min(1, (timeMs - delay) / duration)); return cubicBezierY(value, curve) }
function cubicBezierY(x: number, [x1, y1, x2, y2]: EasingCurve) { let t = x; for (let index = 0; index < 5; index += 1) { const currentX = bezier(t, x1, x2) - x, derivative = bezierDerivative(t, x1, x2); if (Math.abs(derivative) < 1e-6) break; t = Math.max(0, Math.min(1, t - currentX / derivative)) } return bezier(t, y1, y2) }
function bezier(t: number, p1: number, p2: number) { const inverse = 1 - t; return 3 * inverse * inverse * t * p1 + 3 * inverse * t * t * p2 + t * t * t }
function bezierDerivative(t: number, p1: number, p2: number) { const inverse = 1 - t; return 3 * inverse * inverse * p1 + 6 * inverse * t * (p2 - p1) + 3 * t * t * (1 - p2) }
function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) { const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight), renderedWidth = image.naturalWidth * scale, renderedHeight = image.naturalHeight * scale; ctx.drawImage(image, x + (width - renderedWidth) / 2, y + (height - renderedHeight) / 2, renderedWidth, renderedHeight) }
function loadImage(src: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Image export failed')); image.src = src }) }
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string) { ctx.font = font; const words = text.split(/\s+/), lines: string[] = []; let line = ''; words.forEach((word) => { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word } else line = test }); if (line) lines.push(line); return lines.slice(0, 5) }
function displayScore(value: string) { return value.trim() || '—' }
function scoreRatio(value: string) { const score = Number(value); return Number.isFinite(score) ? Math.max(0, Math.min(1, score / 10)) : 0 }
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius) }
function concat(parts: Uint8Array[]) { const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; parts.forEach((part) => { result.set(part, offset); offset += part.length }); return result }
function u16(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255]) }
function u32(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]) }
function crc32(data: Uint8Array) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let index = 0; index < 8; index += 1) crc = crc >>> 1 ^ (0xedb88320 & -(crc & 1)) } return (crc ^ 0xffffffff) >>> 0 }
