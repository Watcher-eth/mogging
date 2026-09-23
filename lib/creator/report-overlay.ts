import { getOverlayPreset, type ContentSlide, type GeneratorImage } from './content-generator'
import { buildFaceMapPoints } from './mobile-overlay-engine/face-map-points'
import { getImageTransform, projectImagePoint } from './mobile-overlay-engine/layout'
import { enrichFaceLandmarks } from './mobile-overlay-engine/enrich-landmarks'
import { isFaceLandmarksUsable } from './mobile-overlay-engine/landmarks'
import { resolveOverlayPreset, type PixelPoint, type ResolvedPrimitive } from './mobile-overlay-engine/resolve'

type Size = { width: number; height: number }
type Drawing = Exclude<ResolvedPrimitive, { kind: 'label' | 'point' }>

// Mobile report styles use logical points. One reference viewport keeps the
// preview and high-resolution exports identical, including stroke weights.
export function createReportOverlay(slide: ContentSlide, image: GeneratorImage, viewport: Size) {
  const size = { width: 360, height: viewport.height / viewport.width * 360 }
  const landmarks = enrichFaceLandmarks(image.landmarks)
  const usable = isFaceLandmarksUsable(landmarks, 0.58)
  const primitives = usable && slide.overlayStyle !== 'face-map'
    ? resolveOverlayPreset({ preset: getOverlayPreset(slide), landmarks, viewport: size, imageSize: image, fit: 'cover' }).primitives
    : []
  const score = slide.categoryScores.find((item) => item.categoryId === slide.categoryId)?.value || slide.currentScore
  const transform = getImageTransform(image, size, 'cover')
  const samples = usable && slide.overlayStyle === 'face-map' ? buildFaceMapPoints(landmarks) : []
  const top = Math.min(...samples.map((point) => point.y))
  const bottom = Math.max(...samples.map((point) => point.y))
  const dots = samples.map((point) => ({ ...projectImagePoint(point, image, transform), band: Math.min(17, Math.floor((point.y - top) / Math.max(.001, bottom - top) * 18)) }))
  return { size, primitives, dots, value: `${score.trim() || '—'} / 10` }
}

export type ReportOverlay = ReturnType<typeof createReportOverlay>

export function drawReportOverlay(ctx: CanvasRenderingContext2D, overlay: ReportOverlay, width: number, timeMs: number, labels = true) {
  ctx.save()
  ctx.scale(width / overlay.size.width, width / overlay.size.width)
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  // Match the image viewport even when a contour is partly outside its crop.
  ctx.beginPath()
  ctx.rect(0, 0, overlay.size.width, overlay.size.height)
  ctx.clip()
  for (const dot of overlay.dots) {
    ctx.save()
    ctx.globalAlpha *= clamp((timeMs / 2800 - dot.band / 18) * 18, 0, 1) * .9
    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.arc(dot.x, dot.y, 1.15, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  for (const primitive of overlay.primitives) {
    if (primitive.kind === 'label') {
      if (labels) drawLabel(ctx, primitive, overlay, timeMs)
      continue
    }
    const progress = enter(timeMs, primitive.animation?.delay ?? 0, primitive.animation?.duration ?? 760, primitive.kind === 'point' ? [.2, .9, .22, 1] : [.16, 1, .3, 1])
    if (!progress) continue
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (primitive.kind === 'point') {
      ctx.globalAlpha *= progress
      const scale = primitive.animation?.entrance === 'scale' ? progress : 1
      const radius = (primitive.radius ?? 10) * scale
      ctx.translate(primitive.point.x, primitive.point.y)
      ctx.save()
      const transform = ctx.getTransform()
      ctx.filter = `blur(${5 * Math.hypot(transform.a, transform.b)}px)`
      circle(ctx, primitive.radius ?? 10)
      ctx.fillStyle = 'rgba(255,255,255,.16)'
      ctx.fill()
      ctx.restore()
      ctx.setLineDash([2.1, 3.8])
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255,255,255,.72)'
      circle(ctx, radius)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,.96)'
      circle(ctx, 2.2 * scale)
      ctx.fill()
    } else {
      const paths = primitivePaths(primitive)
      if (primitive.kind === 'region' || (primitive.kind === 'box' && primitive.fillOpacity)) {
        ctx.globalAlpha *= progress
        ctx.fillStyle = `rgba(255,255,255,${primitive.fillOpacity ?? .08})`
        ctx.beginPath()
        if (primitive.kind === 'box') {
          const { x, y, width, height } = primitive.rect
          ctx.roundRect(x, y, width, height, primitive.radius ?? Math.min(width, height) * .22)
        } else tracePaths(ctx, paths, 1)
        ctx.fill()
      }
      ctx.lineWidth = primitive.strokeWidth ?? (primitive.kind === 'region' ? .45 : .9)
      ctx.strokeStyle = `rgba(255,255,255,${primitive.opacity ?? (primitive.kind === 'region' ? .42 : .72)})`
      ctx.setLineDash(primitive.dashed ? [1.7, 3.8] : [])
      ctx.beginPath()
      tracePaths(ctx, paths, progress)
      ctx.stroke()
    }
    ctx.restore()
  }
  ctx.restore()
}

function circle(ctx: CanvasRenderingContext2D, radius: number) {
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
}

function primitivePaths(primitive: Drawing): PixelPoint[][] {
  if (primitive.kind === 'line') return [[primitive.fromPoint, primitive.toPoint]]
  if (primitive.kind === 'box') {
    const { x, y, width: w, height: h } = primitive.rect
    if (!primitive.cornerOnly) return [[{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }]]
    const k = Math.max(4, Math.min(w, h) * (primitive.cornerLength ?? .18))
    return [
      [{ x, y: y + k }, { x, y }, { x: x + k, y }],
      [{ x: x + w - k, y }, { x: x + w, y }, { x: x + w, y: y + k }],
      [{ x: x + w, y: y + h - k }, { x: x + w, y: y + h }, { x: x + w - k, y: y + h }],
      [{ x: x + k, y: y + h }, { x, y: y + h }, { x, y: y + h - k }],
    ]
  }
  const points = primitive.pixelPoints
  return [primitive.kind === 'region' || primitive.closed ? [...points, points[0]] : points]
}

// Reveal by physical path length, like Skia's Path.end, rather than vertex count.
function tracePaths(ctx: CanvasRenderingContext2D, paths: PixelPoint[][], progress: number) {
  let remaining = paths.reduce((sum, points) => sum + points.slice(1).reduce((length, point, index) => length + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0), 0) * progress
  for (const points of paths) {
    if (!points.length || remaining <= 0) break
    ctx.moveTo(points[0].x, points[0].y)
    for (let index = 1; index < points.length; index++) {
      const from = points[index - 1], to = points[index]
      const length = Math.hypot(to.x - from.x, to.y - from.y)
      const fraction = length ? Math.min(1, remaining / length) : 1
      ctx.lineTo(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction)
      remaining -= length
      if (remaining <= 0) break
    }
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, label: Extract<ResolvedPrimitive, { kind: 'label' }>, overlay: ReportOverlay, time: number) {
  const variant = label.variant ?? 'tag'
  const width = variant === 'text' ? 154 : variant === 'node' ? 18 : 118
  const height = variant === 'text' ? 66 : variant === 'node' ? 18 : 44
  const right = label.align === 'right' || (!label.align && label.point.x >= overlay.size.width / 2)
  let x = clamp(label.point.x - (variant === 'node' ? width / 2 : 0), 10, Math.max(10, overlay.size.width - width - 10))
  let y = clamp(label.point.y - (variant === 'node' ? height / 2 : 0), 10, Math.max(10, overlay.size.height - height - 10))
  if (variant === 'tag' && label.align) {
    const outside = width * .28
    const edge = right ? overlay.size.width - width + outside : -outside
    const limit = right ? overlay.size.width * .63 : overlay.size.width * .37 - width
    x = clamp(right ? Math.max(edge, limit) : Math.min(edge, limit), -outside, overlay.size.width - width + outside)
    y = clamp(label.point.y - height * .36, 10, Math.max(10, overlay.size.height - height - 10))
  }
  const duration = clamp(label.animation?.duration ?? 720, 680, 980)
  const direction = variant === 'tag' && !label.align ? -1 : right ? 1 : -1
  const rows = [label.title, overlay.value]
  rows.forEach((row, index) => {
    const delay = (label.animation?.delay ?? 0) + index * 150
    const progress = enter(time, delay, duration)
    ctx.save()
    ctx.globalAlpha *= enter(time, delay, duration * .82)
    ctx.translate(x + (1 - progress) * 42 * direction, y + index * (variant === 'tag' ? 24 : 13))
    const fontSize = variant === 'node' ? 8 : index ? 11 : 10
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`
    const text = row.toUpperCase()
    if (variant === 'tag') {
      ctx.fillStyle = 'rgba(255,255,255,.78)'
      ctx.fillRect(0, 0, Math.min(140, ctx.measureText(text).width + 16), index ? 22 : 21)
    } else if (variant === 'node' && !index) {
      ctx.fillStyle = 'rgba(255,255,255,.22)'
      ctx.fillRect(0, 0, 18, 18)
    }
    ctx.fillStyle = variant === 'tag' ? index ? '#0a0a0d' : '#71717a' : 'rgba(255,255,255,.78)'
    ctx.fillText(text, variant === 'tag' ? 8 : 0, variant === 'tag' ? 4 : 0, variant === 'tag' ? 124 : width)
    ctx.restore()
  })
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }
function enter(time: number, delay: number, duration: number, curve = [.23, 1, .32, 1]) {
  const x = clamp((time - delay) / duration, 0, 1)
  const [x1, y1, x2, y2] = curve
  const bezier = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
  let t = x
  for (let i = 0; i < 8; i++) {
    const derivative = 3 * (1 - t) ** 2 * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t ** 2 * (1 - x2)
    if (Math.abs(derivative) < 1e-6) break
    t = clamp(t - (bezier(t, x1, x2) - x) / derivative, 0, 1)
  }
  return bezier(t, y1, y2)
}
