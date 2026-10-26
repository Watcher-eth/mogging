import type { ReportOverlay } from './report-overlay'
import type { PixelPoint, ResolvedPrimitive } from './mobile-overlay-engine/resolve'
import { smoothMotion } from './video-layout'

type Contour = { id: string; points: PixelPoint[]; dot: boolean }
export function focusMeasurement(overlay: ReportOverlay, feature: string): ReportOverlay {
  const point = (id: string) => overlay.primitives.find(item => item.id === id && item.kind === 'point')
  const template = overlay.primitives.find(item => item.kind === 'line')
  if (!template || template.kind !== 'line') return overlay
  const line = (id: string, from: string, to: string) => {
    const a = point(from), b = point(to)
    return a?.kind === 'point' && b?.kind === 'point' ? [{ ...template, id, fromPoint: a.point, toPoint: b.point }] : []
  }
  const measurement = /spacing|pupil/.test(feature) ? line('pupil-distance', 'left-pupil', 'right-pupil')
    : /inner.*gap/.test(feature) ? line('inner-eye-distance', 'left-eye-inner', 'right-eye-inner')
    : /tilt/.test(feature) ? [...line('left-eye-angle', 'left-eye-inner', 'left-eye-outer'), ...line('right-eye-angle', 'right-eye-inner', 'right-eye-outer')]
    : []
  if (!measurement.length) return overlay
  const anchors = /spacing|pupil/.test(feature) ? ['left-pupil', 'right-pupil'] : ['left-eye-inner', 'right-eye-inner', 'left-eye-outer', 'right-eye-outer']
  return { ...overlay, dots: [], primitives: [...overlay.primitives.filter(item => anchors.includes(item.id) || item.id.endsWith('eye-contour')), ...measurement] }
}
function contours(overlay: ReportOverlay): Contour[] {
  return overlay.primitives.flatMap(primitive => {
    if (primitive.kind === 'label') return []
    return [{ id: primitive.id, points: resample(path(primitive), 32), dot: primitive.kind === 'point' }]
  }).concat(overlay.dots.map((dot, index) => ({ id: `map:${index}`, points: Array.from({ length: 32 }, () => dot), dot: true })))
}
function path(primitive: Exclude<ResolvedPrimitive, { kind: 'label' }>): PixelPoint[] {
  if (primitive.kind === 'point') return [primitive.point]
  if (primitive.kind === 'line') return [primitive.fromPoint, primitive.toPoint]
  if (primitive.kind === 'box') {
    const { x, y, width, height } = primitive.rect
    return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }, { x, y }]
  }
  return primitive.kind === 'region' ? [...primitive.pixelPoints, primitive.pixelPoints[0]] : primitive.pixelPoints
}
function resample(points: PixelPoint[], count: number): PixelPoint[] {
  if (!points.length) return Array.from({ length: count }, () => ({ x: 0, y: 0 }))
  const lengths = [0]
  for (let index = 1; index < points.length; index++) lengths.push(lengths[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y))
  const total = lengths.at(-1)!
  if (!total) return Array.from({ length: count }, () => ({ ...points[0] }))
  return Array.from({ length: count }, (_, index) => {
    const distance = total * index / (count - 1)
    let end = 1
    while (end < lengths.length - 1 && lengths[end] < distance) end++
    const amount = (distance - lengths[end - 1]) / Math.max(.0001, lengths[end] - lengths[end - 1])
    return mixPoint(points[end - 1], points[end], amount)
  })
}
const mixPoint = (a: PixelPoint, b: PixelPoint, amount: number) => ({ x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount })
const center = (points: PixelPoint[]) => ({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length })

/** Stable IDs match first; other paths travel to the nearest measurement anchor.
 * Unmatched paths contract into that anchor, rather than popping off the face. */
export function morphContours(from: ReportOverlay, to: ReportOverlay, progress: number) {
  const p = smoothMotion(progress), source = contours(from), target = contours(to), unused = new Set(source)
  const result = target.map(next => {
    const c = center(next.points)
    const previous = source.find(item => unused.has(item) && item.id === next.id && item.dot === next.dot) ?? [...unused].filter(item => item.dot === next.dot).sort((a, b) => {
      const ac = center(a.points), bc = center(b.points)
      return Math.hypot(ac.x - c.x, ac.y - c.y) - Math.hypot(bc.x - c.x, bc.y - c.y)
    })[0]
    if (previous) unused.delete(previous)
    const initial = previous?.points ?? next.points.map(() => c)
    return { ...next, points: next.points.map((point, index) => mixPoint(initial[index], point, p)), opacity: previous ? 1 : p }
  })
  for (const previous of unused) {
    const c = center(previous.points)
    result.push({ ...previous, points: previous.points.map(point => mixPoint(point, c, p)), opacity: 1 - p })
  }
  return result
}

export function drawMorphOverlay(ctx: CanvasRenderingContext2D, from: ReportOverlay, to: ReportOverlay, width: number, progress: number, timeMs: number, reduced = false) {
  ctx.save(); ctx.scale(width / to.size.width, width / to.size.width)
  ctx.strokeStyle = 'rgba(255,255,255,.78)'; ctx.fillStyle = '#fff'; ctx.lineWidth = .7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const contour of morphContours(from, to, progress)) {
    if (contour.opacity < .001) continue
    ctx.save(); ctx.globalAlpha *= contour.opacity
    if (contour.dot) {
      const point = contour.points[0]
      ctx.beginPath(); ctx.arc(point.x, point.y, 1.1, 0, Math.PI * 2); ctx.fill()
    } else {
      ctx.beginPath(); contour.points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.stroke()
      // A small measuring light moves along the same geometry during the hold.
      const phase = reduced ? .5 : ((timeMs / 2800) % 1 + 1) % 1
      const position = phase * (contour.points.length - 1), index = Math.floor(position)
      const point = mixPoint(contour.points[index], contour.points[Math.min(index + 1, contour.points.length - 1)], position - index)
      ctx.beginPath(); ctx.arc(point.x, point.y, 1.5, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }
  ctx.restore()
}
