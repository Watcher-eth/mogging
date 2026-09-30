import { categoryScoreMax, type ContentSlide, type GeneratorImage } from './content-generator'
import { createReportOverlay, drawReportOverlay, type ReportOverlay } from './report-overlay'
import { drawScoreReveal, loadRevealBrand, REVEAL_DURATION_MS, REVEAL_PORTRAIT_SIZE, type RevealBrand } from './score-reveal'
import { resolveShareOverallOverlay, drawShareOverallOverlay } from '@/lib/sharing/overall-overlay'
import { estimatedPopulationTopPercent } from '@/lib/sharing/population-percentile'
import { getLooksmaxRank, shareCardLayout } from '@/lib/sharing/share-card'
import { enrichFaceLandmarks } from './mobile-overlay-engine/enrich-landmarks'

import { drawMockReport, mockReportSize, mockReportHeroHeight, loadMockReportSymbols } from './mock-report'

type RenderArgs = { slide: ContentSlide; images: GeneratorImage[]; width: number; height: number }

export async function renderSlidePng(args: RenderArgs) {
  await document.fonts.ready
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
  const [image, brand] = await Promise.all([loadImage(source.dataUrl), ['editorial', 'cta', 'psl'].includes(slide.templateId) ? loadRevealBrand() : null, ['editorial', 'score-potential'].includes(slide.templateId) ? loadShareFont() : null, slide.templateId === 'mock-report' ? loadMockReportSymbols() : null])
  const viewport = slide.templateId === 'mock-report' ? { width: mockReportSize.width, height: mockReportHeroHeight } : slide.templateId === 'cta' ? { width: REVEAL_PORTRAIT_SIZE, height: REVEAL_PORTRAIT_SIZE } : { width, height }
  const overlay: ReportOverlay = slide.templateId === 'score-potential'
    ? { size: { width, height }, primitives: resolveShareOverallOverlay(enrichFaceLandmarks(source.landmarks), width, height), dots: [], value: '' }
    : createReportOverlay(slide, source, viewport, slide.templateId === 'mock-report' ? mockReportSize.width : 360)
  if (slide.templateId === 'mock-report') {
    overlay.labelLayout = 'mobile'
    overlay.value = slide.categoryId === 'overall' ? `${(Number(slide.currentScore) * .8).toFixed(1)} / 8` : `${Number(slide.categoryScores[0]?.value ?? slide.currentScore).toFixed(1)} / 10`
  }
  return { canvas, ctx, image, overlay, brand }
}

export function drawSlideFrame(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, overlay: ReportOverlay | null, width: number, height: number, timeMs: number, brand: RevealBrand | null) {
  if (slide.templateId === 'mock-report') {
    drawMockReport(ctx, slide, image, overlay, width, height, timeMs)
    return
  }
  if (slide.templateId === 'cta') {
    drawScoreReveal(ctx, slide, image, overlay, brand, width, height, timeMs)
    return
  }
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#09090b'; ctx.fillRect(0, 0, width, height)
  if (image) drawCover(ctx, image, 0, 0, width, height)
  if (slide.templateId === 'score-potential') {
    drawMobileShare(ctx, slide, overlay, width, height, timeMs)
    return
  }
  const gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, 'rgba(0,0,0,0.45)'); gradient.addColorStop(0.5, 'rgba(0,0,0,0.05)'); gradient.addColorStop(1, 'rgba(0,0,0,0.95)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
  if (overlay) drawReportOverlay(ctx, overlay, width, timeMs, false)
  drawTemplate(ctx, slide, width, height, timeMs, brand)
}

function drawTemplate(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, height: number, timeMs: number, brand: RevealBrand | null) {
  const margin = width * 0.07
  if (slide.templateId === 'score-rows') drawHeader(ctx, slide.eyebrow, slide.templateId, margin, width, height, enter(timeMs, 580, 520))
  if (slide.templateId === 'editorial') drawEditorial(ctx, slide, width, height, timeMs, brand)
  else if (slide.templateId === 'psl') drawPsl(ctx, slide, width, height, timeMs, brand)
  else if (slide.templateId === 'score-rows') drawScoreRows(ctx, slide, width, height, timeMs)
}

function drawEditorial(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, height: number, timeMs: number, brand: RevealBrand | null) {
  drawBrandPair(ctx, brand, width, height, timeMs)
  const size = width * .085
  const headline = slide.headline.trim() && slide.headline.length <= 48 ? slide.headline : 'Time to ascend.'
  const lines = wrapText(ctx, headline, width * .86, `500 ${size}px Arial`).slice(0, 2)
  withEnter(ctx, enter(timeMs, 850, 520), () => {
    ctx.fillStyle = '#fff'; ctx.font = `500 ${size}px Arial`; ctx.textAlign = 'center'
    lines.forEach((line, index) => ctx.fillText(line, width / 2, height * .81 - lines.length * size * 1.04 + index * size * 1.04))
  })
  withEnter(ctx, enter(timeMs, 1050, 520), () => {
    const scale = width / shareCardLayout.width
    const labelY = height - shareCardLayout.footerBottom * scale
    const valueY = labelY - (shareCardLayout.scoreSize + 12) * scale
    for (const [index, score] of [slide.currentScore, slide.potentialScore].entries()) {
      const x = index === 0 ? shareCardLayout.inset * scale : width - shareCardLayout.inset * scale
      ctx.textAlign = index === 0 ? 'left' : 'right'
      ctx.font = `800 ${shareCardLayout.scoreSize * scale}px "Mogging Share", Arial`; ctx.fillStyle = index === 0 ? '#fff' : 'rgba(255,255,255,.8)'
      ctx.fillText(formatShareScore(score), x, valueY)
      ctx.font = `800 ${shareCardLayout.scoreLabelSize * scale}px "Mogging Share", Arial`; ctx.fillStyle = 'rgba(255,255,255,.86)'
      ctx.fillText(index === 0 ? 'TOTAL SCORE' : 'POTENTIAL', x, labelY)
    }
  })
}

let shareFont: Promise<void> | undefined
function loadShareFont() {
  if (!shareFont) shareFont = new FontFace('Mogging Share', 'url(/fonts/Geist-Regular.ttf)').load().then(font => { document.fonts.add(font) }).catch(error => { shareFont = undefined; throw error })
  return shareFont
}

function drawMobileShare(ctx: CanvasRenderingContext2D, slide: ContentSlide, overlay: ReportOverlay | null, width: number, height: number, timeMs: number) {
  const scale = width / shareCardLayout.width
  for (const css of shareCardLayout.gradients) {
    const angle = Number(css.match(/(\d+)deg/)?.[1] ?? 180) * Math.PI / 180
    const dx = Math.sin(angle), dy = -Math.cos(angle), length = Math.abs(width * dx) + Math.abs(height * dy)
    const gradient = ctx.createLinearGradient(width / 2 - dx * length / 2, height / 2 - dy * length / 2, width / 2 + dx * length / 2, height / 2 + dy * length / 2)
    for (const match of css.matchAll(/(rgba\([^)]+\)) (\d+)%/g)) gradient.addColorStop(Number(match[2]) / 100, match[1])
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
  }
  if (overlay) drawShareOverallOverlay(ctx, overlay.primitives, width, timeMs)
  const top = shareCardLayout.headerTop * scale, inset = shareCardLayout.inset * scale
  const text = (value: string, x: number, y: number, size: number, align: CanvasTextAlign = 'left', alpha = 1) => {
    ctx.textAlign = align; ctx.font = `800 ${size * scale}px "Mogging Share", Arial`; ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fillText(value, x, y)
  }
  withEnter(ctx, enter(timeMs, 300, 480), () => {
    text('MOGGING.COM', inset, top, shareCardLayout.headingSize)
    text('FACIAL AESTHETIC', inset, top + 46 * scale, shareCardLayout.subheadingSize, 'left', .76)
    text('RANK', width - inset, top, shareCardLayout.headingSize, 'right')
    text(getLooksmaxRank(Number(slide.currentScore), 'other').toUpperCase(), width - inset, top + 46 * scale, shareCardLayout.subheadingSize, 'right', .76)
    const percent = slide.currentScore.trim() ? estimatedPopulationTopPercent(Number(slide.currentScore)) : null
    if (percent !== null) {
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = scale
      roundedRect(ctx, 410 * scale, 100 * scale, 260 * scale, 82 * scale, 48 * scale); ctx.fill(); ctx.stroke()
      ctx.textBaseline = 'middle'
      text(`Top ${percent}%`, width / 2, 141 * scale, 28, 'center')
      ctx.textBaseline = 'top'
    }
  })
  const valueTop = height - (shareCardLayout.footerBottom + shareCardLayout.scoreSize * .82) * scale
  withEnter(ctx, enter(timeMs, 1050, 520), () => {
    text('TOTAL SCORE', inset, valueTop - 43 * scale, shareCardLayout.scoreLabelSize)
    text(formatShareScore(slide.currentScore), inset - 8 * scale, valueTop, shareCardLayout.scoreSize)
    text('POTENTIAL', width - inset, valueTop - 43 * scale, shareCardLayout.scoreLabelSize, 'right')
    text(formatShareScore(slide.potentialScore), width - inset + 20 * scale, valueTop, shareCardLayout.scoreSize, 'right', .8)
  })
}

function formatShareScore(value: string) { return value.trim() && Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '--' }

function drawBrandPair(ctx: CanvasRenderingContext2D, brand: RevealBrand | null, width: number, height: number, timeMs: number) {
  withEnter(ctx, enter(timeMs, 420, 520), () => {
    const size = width * .085, gap = width * .025
    const x = (width - size * 2 - gap) / 2, y = height * .055
    if (brand) {
      ctx.drawImage(brand.logo, x, y, size, size)
      ctx.drawImage(brand.appStore, x + size + gap, y, size, size)
    }
  })
}

function drawPsl(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, height: number, timeMs: number, brand: RevealBrand | null) {
  drawBrandPair(ctx, brand, width, height, timeMs)
  withEnter(ctx, enter(timeMs, 580, 520), () => {
    ctx.font = `700 ${width * .042}px Arial`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
    ctx.fillText('Mogging: Face Rating', width / 2, height * .055 + width * .11)
  })
  const x = width * .05, y = height * .76, cardWidth = width * .45, cardHeight = height * .19
  const psl = slide.categoryScores.find(score => score.categoryId === 'psl')?.value || toPsl(slide.currentScore)
  drawScoreCard(ctx, 'PSL', psl, x, y, cardWidth, cardHeight, '#a3e635', enter(timeMs, 1020, 520))
  drawScoreCard(ctx, 'Potential', toPsl(slide.potentialScore), x + cardWidth, y, cardWidth, cardHeight, '#67e8f9', enter(timeMs, 1180, 520))
}

function toPsl(value: string) { return value.trim() ? (Number(value) * .8).toFixed(1) : '' }

function drawHeader(ctx: CanvasRenderingContext2D, eyebrow: string, template: string, margin: number, width: number, height: number, progress: number) { withEnter(ctx, progress, () => { ctx.font = `600 ${Math.round(width * .021)}px monospace`; ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.fillText(eyebrow.toUpperCase(), margin, height * .04); ctx.textAlign = 'right'; ctx.fillText(`[ ${template.toUpperCase()} ]`, width - margin, height * .04); ctx.textAlign = 'left' }) }

function drawScoreRows(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, height: number, timeMs: number) {
  const rows = slide.categoryScores.filter(row => row.categoryId !== 'overall')
    .toSorted((a, b) => Number(b.categoryId === slide.categoryId) - Number(a.categoryId === slide.categoryId)).slice(0, 3)
  const padding = width * .04, rowHeight = width * .065
  const boxHeight = width * .18 + rows.length * rowHeight
  const x = width * .05, y = height * .96 - boxHeight, boxWidth = width * .9
  ctx.fillStyle = 'rgba(0,0,0,.78)'; roundedRect(ctx, x, y, boxWidth, boxHeight, width * .025); ctx.fill()
  withEnter(ctx, enter(timeMs, 760, 520), () => {
    for (const [index, score] of [slide.currentScore, slide.potentialScore].entries()) {
      const scoreX = index === 0 ? x + padding : x + boxWidth - padding
      ctx.textAlign = index === 0 ? 'left' : 'right'
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `600 ${width * .022}px Arial`
      ctx.fillText(index === 0 ? 'SCORE' : 'POTENTIAL', scoreX, y + padding * .7)
      ctx.fillStyle = index === 0 ? '#fff' : '#67e8f9'; ctx.font = `600 ${width * .06}px Arial`
      ctx.fillText(displayScore(score), scoreX, y + padding * 1.4)
    }
  })
  rows.forEach((row, index) => {
    const delay = 920 + index * 60
    withEnter(ctx, enter(timeMs, delay, 480), () => {
      const rowY = y + width * .155 + index * rowHeight
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `500 ${width * .022}px Arial`
      ctx.fillText(row.label, x + padding, rowY, width * .28)
      const barX = x + width * .34, barWidth = boxWidth * .39, barHeight = width * .009
      ctx.fillStyle = 'rgba(255,255,255,.18)'; roundedRect(ctx, barX, rowY + width * .008, barWidth, barHeight, barHeight / 2); ctx.fill()
      ctx.fillStyle = '#fff'; roundedRect(ctx, barX, rowY + width * .008, barWidth * scoreRatio(row.value, categoryScoreMax(row.categoryId)) * enter(timeMs, delay + 150, 720), barHeight, barHeight / 2); ctx.fill()
      ctx.textAlign = 'right'; ctx.font = `600 ${width * .021}px monospace`
      ctx.fillText(`${displayScore(row.value)}/${categoryScoreMax(row.categoryId)}`, x + boxWidth - padding, rowY)
    })
  })
}
function drawScoreCard(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number, width: number, height: number, accent: string, progress: number) { withEnter(ctx, progress, () => { ctx.fillStyle = 'rgba(0,0,0,.72)'; roundedRect(ctx, x, y, width, height, width * .025); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `600 ${width * .055}px monospace`; ctx.fillText(label.toUpperCase(), x + width * .09, y + height * .12); ctx.fillStyle = '#fff'; ctx.font = `600 ${width * .2}px Arial`; ctx.fillText(displayScore(value), x + width * .09, y + height * .34); ctx.fillStyle = 'rgba(255,255,255,.18)'; roundedRect(ctx, x + width * .09, y + height * .76, width * .82, height * .055, height * .03); ctx.fill(); ctx.fillStyle = accent; roundedRect(ctx, x + width * .09, y + height * .76, width * .82 * scoreRatio(value, 8) * progress, height * .055, height * .03); ctx.fill() }) }

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
function scoreRatio(value: string, maximum = 10) { const score = Number(value); return Number.isFinite(score) ? Math.max(0, Math.min(1, score / maximum)) : 0 }
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius) }
function concat(parts: Uint8Array[]) { const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; parts.forEach((part) => { result.set(part, offset); offset += part.length }); return result }
function u16(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255]) }
function u32(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]) }
function crc32(data: Uint8Array) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let index = 0; index < 8; index += 1) crc = crc >>> 1 ^ (0xedb88320 & -(crc & 1)) } return (crc ^ 0xffffffff) >>> 0 }
