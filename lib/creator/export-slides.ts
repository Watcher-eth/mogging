import type { ContentSlide, GeneratorImage } from './content-generator'
import { getOverlayPreset } from './content-generator'
import { resolveOverlayPreset, type ResolvedPrimitive } from '../../../MoggingMobile/src/overlay-engine/resolve'

type RenderArgs = { slide: ContentSlide; images: GeneratorImage[]; width: number; height: number }

export async function renderSlidePng(args: RenderArgs) {
  await document.fonts.ready
  const { canvas, ctx, image, source } = await prepareCanvas(args)
  await drawSlideFrame(ctx, args.slide, image, source, args.width, args.height, 4000)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'))
}

export async function renderSlideMp4(args: RenderArgs, onProgress?: (progress: number) => void) {
  await document.fonts.ready
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') throw new Error('MP4 export requires a browser with WebCodecs support')
  const frameRate = 30
  const durationMs = 4000
  const frameCount = Math.round(durationMs / 1000 * frameRate)
  const configCandidates: VideoEncoderConfig[] = [
    { codec: 'avc1.42001f', width: args.width, height: args.height, bitrate: 8_000_000, framerate: frameRate, avc: { format: 'avc' } },
    { codec: 'avc1.4d002a', width: args.width, height: args.height, bitrate: 8_000_000, framerate: frameRate, avc: { format: 'avc' } },
  ]
  let supportedConfig: VideoEncoderConfig | null = null
  for (const candidate of configCandidates) {
    const result = await VideoEncoder.isConfigSupported(candidate)
    if (result.supported) { supportedConfig = result.config ?? candidate; break }
  }
  if (!supportedConfig) throw new Error('This browser cannot encode H.264 MP4 video')

  const [{ Muxer, ArrayBufferTarget }, prepared] = await Promise.all([import('mp4-muxer'), prepareCanvas(args)])
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({ target, video: { codec: 'avc', width: args.width, height: args.height, frameRate }, fastStart: 'in-memory' })
  let encoderError: Error | null = null
  const encoder = new VideoEncoder({ output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata), error: (error) => { encoderError = error } })
  encoder.configure(supportedConfig)
  const frameDuration = 1_000_000 / frameRate

  for (let index = 0; index < frameCount; index += 1) {
    const timeMs = index / frameRate * 1000
    await drawSlideFrame(prepared.ctx, args.slide, prepared.image, prepared.source, args.width, args.height, timeMs)
    const frame = new VideoFrame(prepared.canvas, { timestamp: Math.round(index * frameDuration), duration: Math.round(frameDuration) })
    encoder.encode(frame, { keyFrame: index % (frameRate * 2) === 0 })
    frame.close()
    if (index % 8 === 0) { onProgress?.(index / frameCount); await new Promise<void>((resolve) => window.setTimeout(resolve, 0)) }
  }
  await encoder.flush()
  encoder.close()
  if (encoderError) throw encoderError
  muxer.finalize()
  onProgress?.(1)
  return new Blob([target.buffer], { type: 'video/mp4' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
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
  const source = images.find((item) => item.id === slide.imageId) ?? images[0]
  const image = source ? await loadImage(source.dataUrl) : null
  return { canvas, ctx, image, source }
}

async function drawSlideFrame(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, source: GeneratorImage | undefined, width: number, height: number, timeMs: number) {
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#09090b'; ctx.fillRect(0, 0, width, height)
  if (slide.templateId === 'cta') {
    const glow = ctx.createRadialGradient(width / 2, height * .26, 0, width / 2, height * .26, width * .58); glow.addColorStop(0, 'rgba(45,212,191,.12)'); glow.addColorStop(1, 'rgba(7,9,9,0)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height)
    if (image && source) drawCircularPortrait(ctx, slide, image, source, width, height, timeMs)
  } else {
    if (image) drawCover(ctx, image, 0, 0, width, height)
    const gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, 'rgba(0,0,0,0.45)'); gradient.addColorStop(0.5, 'rgba(0,0,0,0.05)'); gradient.addColorStop(1, 'rgba(0,0,0,0.95)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
  }
  if (slide.templateId !== 'cta' && source?.landmarks) {
    const overlay = resolveOverlayPreset({ preset: getOverlayPreset(slide), landmarks: source.landmarks as never, viewport: { width, height }, imageSize: { width: source.width, height: source.height }, fit: 'cover' })
    drawOverlay(ctx, overlay.primitives, width, height, timeMs, `${displayScore(scoreForSlide(slide))} / 10`)
    if (overlay.footer) drawTag(ctx, overlay.footer, width * 0.04, height * 0.94, 10, undefined, enter(timeMs, 1450, 520))
  }
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

function drawCircularPortrait(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement, source: GeneratorImage, width: number, height: number, timeMs: number) {
  const size = width * .52, x = (width - size) / 2, y = height * .17, progress = enter(timeMs, 720, 520)
  if (progress <= 0) return
  ctx.save(); ctx.globalAlpha = progress; ctx.translate(0, (1 - progress) * 8); ctx.beginPath(); ctx.arc(width / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip(); drawCover(ctx, image, x, y, size, size)
  const shade = ctx.createLinearGradient(0, y, 0, y + size); shade.addColorStop(0, 'rgba(0,0,0,.05)'); shade.addColorStop(1, 'rgba(0,0,0,.25)'); ctx.fillStyle = shade; ctx.fillRect(x, y, size, size)
  if (source.landmarks) { const overlay = resolveOverlayPreset({ preset: getOverlayPreset(slide), landmarks: source.landmarks as never, viewport: { width: size, height: size }, imageSize: { width: source.width, height: source.height }, fit: 'cover' }); ctx.save(); ctx.translate(x, y); drawOverlay(ctx, overlay.primitives.filter((primitive) => primitive.kind !== 'label'), size, size, timeMs); ctx.restore() }
  ctx.restore(); ctx.save(); ctx.globalAlpha = progress; ctx.strokeStyle = 'rgba(165,243,252,.35)'; ctx.lineWidth = Math.max(1, width * .002); ctx.beginPath(); ctx.arc(width / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
}

function drawOverlay(ctx: CanvasRenderingContext2D, primitives: ResolvedPrimitive[], width: number, height: number, timeMs: number, labelValue?: string) {
  primitives.forEach((primitive) => {
    const curve: EasingCurve = primitive.kind === 'point' ? [0.2, 0.9, 0.22, 1] : primitive.kind === 'label' ? [0.23, 1, 0.32, 1] : [0.16, 1, 0.3, 1]
    const progress = enter(timeMs, primitive.animation?.delay ?? 0, primitive.animation?.duration ?? 760, curve)
    if (progress <= 0) return
    if (primitive.kind === 'label') { drawTag(ctx, primitive.title, Math.max(12, Math.min(width - width * .24, primitive.point.x + (1 - progress) * (primitive.align === 'right' ? 42 : -42))), Math.max(12, Math.min(height - height * .08, primitive.point.y)), Math.max(18, width * .014), labelValue ?? primitive.value, progress); return }
    ctx.save(); ctx.globalAlpha = progress; ctx.strokeStyle = `rgba(255,255,255,${primitive.kind === 'point' ? .72 : primitive.opacity ?? .72})`; ctx.lineWidth = primitive.kind === 'point' ? 1 : primitive.strokeWidth ?? .9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; if (primitive.kind !== 'point' && primitive.dashed) ctx.setLineDash([1.7 * width / 360, 3.8 * width / 360]); ctx.beginPath()
    if (primitive.kind === 'point') { const radius = (primitive.radius ?? 10) * progress; ctx.arc(primitive.point.x, primitive.point.y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.fillStyle = '#fff'; ctx.arc(primitive.point.x, primitive.point.y, 2.2 * progress, 0, Math.PI * 2); ctx.fill() }
    else if (primitive.kind === 'line') { ctx.moveTo(primitive.fromPoint.x, primitive.fromPoint.y); ctx.lineTo(lerp(primitive.fromPoint.x, primitive.toPoint.x, progress), lerp(primitive.fromPoint.y, primitive.toPoint.y, progress)); ctx.stroke() }
    else if (primitive.kind === 'box') { const { x, y, width: boxWidth, height: boxHeight } = primitive.rect; if (primitive.fillOpacity) { ctx.fillStyle = `rgba(255,255,255,${primitive.fillOpacity})`; ctx.fillRect(x, y, boxWidth, boxHeight) } if (primitive.cornerOnly) drawCanvasCorners(ctx, x, y, boxWidth, boxHeight, Math.max(4, Math.min(boxWidth, boxHeight) * (primitive.cornerLength ?? .18))); else ctx.strokeRect(x, y, boxWidth, boxHeight) }
    else { drawPartialPolyline(ctx, primitive.pixelPoints, progress, primitive.kind === 'region' || Boolean(primitive.kind === 'polyline' && primitive.closed)); if (primitive.kind === 'region') { ctx.fillStyle = `rgba(255,255,255,${primitive.fillOpacity ?? .08})`; ctx.fill() } ctx.stroke() }
    ctx.restore()
  })
}

function drawPartialPolyline(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>, progress: number, closed: boolean) { if (!points.length) return; const all = closed ? [...points, points[0]] : points, totalSegments = all.length - 1, exact = progress * totalSegments, full = Math.floor(exact), remainder = exact - full; ctx.moveTo(all[0].x, all[0].y); for (let index = 1; index <= full && index < all.length; index += 1) ctx.lineTo(all[index].x, all[index].y); if (full < totalSegments) { const from = all[full], to = all[full + 1]; ctx.lineTo(lerp(from.x, to.x, remainder), lerp(from.y, to.y, remainder)) } else if (closed) ctx.closePath() }
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
function scoreForSlide(slide: ContentSlide) { return slide.categoryScores.find((score) => score.categoryId === slide.categoryId)?.value || slide.currentScore }
function scoreRatio(value: string) { const score = Number(value); return Number.isFinite(score) ? Math.max(0, Math.min(1, score / 10)) : 0 }
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius) }
function lerp(from: number, to: number, progress: number) { return from + (to - from) * progress }
function drawCanvasCorners(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, length: number) { [[x, y, 1, 1], [x + width, y, -1, 1], [x + width, y + height, -1, -1], [x, y + height, 1, -1]].forEach(([cx, cy, dx, dy]) => { ctx.beginPath(); ctx.moveTo(cx, cy + dy * length); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * length, cy); ctx.stroke() }) }
function concat(parts: Uint8Array[]) { const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; parts.forEach((part) => { result.set(part, offset); offset += part.length }); return result }
function u16(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255]) }
function u32(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]) }
function crc32(data: Uint8Array) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let index = 0; index < 8; index += 1) crc = crc >>> 1 ^ (0xedb88320 & -(crc & 1)) } return (crc ^ 0xffffffff) >>> 0 }
