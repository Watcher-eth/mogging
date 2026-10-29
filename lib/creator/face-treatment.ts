import type { FaceMeasurement, ReportOverlay } from './report-overlay'
import type { PixelPoint, ResolvedPrimitive } from './mobile-overlay-engine/resolve'
import type { FaceLandmarksPayload, NormalizedPoint } from './mobile-overlay-engine/landmarks'
import { getImageTransform, projectImagePoint } from './mobile-overlay-engine/layout'
import { smoothMotion } from './report-motion'
import type { FaceAnchorKey, FaceContourKey } from './mobile-overlay-engine/landmarks'
import { defaultGlassOverlay, type GlassOverlay } from './glass-overlay'

export function faceFeatureContours(category: string, narration = ''): FaceContourKey[] {
  const keys: FaceContourKey[] = []
  if (/\b(brows?|eyebrows?)\b/i.test(narration)) keys.push('leftBrow', 'rightBrow')
  if (/\b(eyes?|eyelids?|lids?|periocular)\b/i.test(narration)) keys.push('leftEye', 'rightEye')
  if (/\b(nose|nasal|bridge|nostrils?)\b/i.test(narration)) keys.push(...(/bridge/i.test(narration) ? ['noseBridge'] as const : ['noseBridge', 'noseBase'] as const))
  if (/\b(lips?|mouth|cupid)\b/i.test(narration)) keys.push('mouth')
  if (/\b(jaw|chin|mandible|lower.face)\b/i.test(narration)) keys.push('jawline')
  if (/\b(cheeks?|cheekbones?|zygomatic)\b/i.test(narration)) keys.push('cheekbones')
  if (keys.length) return [...new Set(keys)]
  const defaults: Record<string, FaceContourKey[]> = { eyes: ['leftEye', 'rightEye'], brows: ['leftBrow', 'rightBrow'], nose: ['noseBridge', 'noseBase'], mouth: ['mouth'], jaw: ['jawline'], cheeks: ['cheekbones'], overall: ['leftBrow', 'rightBrow', 'noseBridge', 'jawline'], symmetry: ['leftEye', 'rightEye', 'mouth', 'jawline'], proportions: ['jawline'], 'face-shape': ['jawline', 'cheekbones'], skin: [], hair: [], hairline: [] }
  return defaults[category] ?? []
}

export function faceRegionContours(landmarks: FaceLandmarksPayload, category: string) {
  if (landmarks.confidence < .58) return []
  const anchors = landmarks.anchors, outline = landmarks.contours?.faceOutline ?? []
  const browY = anchors.leftBrow && anchors.rightBrow ? (anchors.leftBrow.y + anchors.rightBrow.y) / 2 : undefined
  const zones: Array<{ id: string; category: string; points: (NormalizedPoint | undefined)[] }> = [
    { id: 'forehead', category: 'brows', points: [...outline.filter(point => browY !== undefined && point.y < browY), anchors.leftBrow, anchors.rightBrow] },
    { id: 'left-cheek', category: 'cheeks', points: [anchors.leftEyeOuter, anchors.noseTip, anchors.mouthLeft, anchors.jawLeft, anchors.leftCheek] },
    { id: 'right-cheek', category: 'cheeks', points: [anchors.rightEyeOuter, anchors.noseTip, anchors.mouthRight, anchors.jawRight, anchors.rightCheek] },
    { id: 'nose', category: 'nose', points: [...(landmarks.contours?.noseBridge ?? []), ...(landmarks.contours?.noseBase ?? [])] },
    { id: 'chin', category: 'jaw', points: [anchors.mouthLeft, anchors.lowerLip, anchors.mouthRight, anchors.jawRight, anchors.chin, anchors.jawLeft] },
  ]
  return zones.filter(zone => category === 'overall' || zone.category === category).flatMap(zone => {
    if (zone.points.some(point => !point) || zone.points.length < 3) return []
    const points = zone.points as NormalizedPoint[]
    const center = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length }
    return [{ id: zone.id, points: [...points].sort((first, second) => Math.atan2(first.y - center.y, first.x - center.x) - Math.atan2(second.y - center.y, second.x - center.x)) }]
  })
}

export function preciseFaceOverlay(overlay: ReportOverlay, source: { width: number; height: number; landmarks?: FaceLandmarksPayload | null }, category: string, narration = '', regions = false): ReportOverlay {
  const landmarks = source.landmarks
  if (!landmarks) return overlay
  if (landmarks.confidence < .58) return { ...overlay, primitives: [], dots: [], measurement: undefined }
  const projection = getImageTransform(source, overlay.size, 'cover')
  const point = (point: PixelPoint) => projectImagePoint(point, source, projection)
  const kind: FaceMeasurement['kind'] | undefined = /symmetr|balance|harmon/i.test(narration) ? 'symmetry' : /thirds?|proportions/i.test(narration) ? 'thirds' : /tilt|canthal/i.test(narration) ? 'tilt' : /inner.eye|intercanthal|gap/i.test(narration) ? 'inner-spacing' : /spacing|pupils?/i.test(narration) ? 'spacing' : /\b(?:facial|face|jaw|cheek(?:bone)?)\s+width\b|\bwidth\s+(?:of|across)\b/i.test(narration) ? 'width' : ['overall', 'symmetry'].includes(category) ? 'symmetry' : category === 'proportions' ? 'thirds' : category === 'face-shape' ? 'width' : undefined
  const measurement = kind && Math.abs(landmarks.quality?.yawRadians ?? 0) < .35 ? { kind, anchors: Object.fromEntries(Object.entries(landmarks.anchors).filter((entry): entry is [string, PixelPoint] => Boolean(entry[1] && Number.isFinite(entry[1].x) && Number.isFinite(entry[1].y))).map(([key, value]) => [key, point(value)])) } : undefined
  const anchors: FaceAnchorKey[] = /inner.eye|inner eye|intercanthal|gap/i.test(narration) ? ['leftEyeInner', 'rightEyeInner'] : /pupils?|spacing/i.test(narration) ? ['leftPupil', 'rightPupil'] : /tilt|canthal|corners?/i.test(narration) && (category === 'eyes' || /\beyes?|eyelids?|canthal\b/i.test(narration)) ? ['leftEyeInner', 'leftEyeOuter', 'rightEyeInner', 'rightEyeOuter'] : /chin height/i.test(narration) ? ['lowerLip', 'chin'] : /thirds?|proportions/i.test(narration) ? ['forehead', 'noseTip', 'chin'] : /skin|texture|complexion/i.test(narration) ? ['forehead', 'leftCheek', 'rightCheek'] : []
  const primitives: ResolvedPrimitive[] = anchors.flatMap(key => landmarks.anchors[key] ? [{ id: `feature-${key}`, kind: 'point' as const, at: { anchor: key }, point: point(landmarks.anchors[key]!), radius: 3 }] : [])
  if (!anchors.length) for (const key of faceFeatureContours(category, narration)) {
    let points = landmarks.contours?.[key]?.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)) ?? []
    if (key === 'cheekbones') {
      const center = landmarks.anchors.noseTip?.x ?? .5
      for (const side of [-1, 1]) {
        const cheek = points.filter(point => (point.x - center) * side > .02)
        if (cheek.length >= 3) primitives.push({ id: `feature-cheek-${side}`, kind: 'polyline', points: [], closed: false, pixelPoints: smoothContour(cheek.map(point)) })
        else {
          const anchor = landmarks.anchors[side < 0 ? 'leftCheek' : 'rightCheek']
          if (anchor) primitives.push({ id: `feature-cheek-${side}`, kind: 'point', at: { point: anchor }, point: point(anchor), radius: 4 })
        }
      }
      continue
    }
    const pairedSections = key === 'mouth' ? /upper and lower[ -]lips?/i.test(narration) : ['leftEye', 'rightEye'].includes(key) && /upper and lower[ -](?:eye)?lids?/i.test(narration)
    if (pairedSections && points.length >= 4) {
      const center = (Math.min(...points.map(point => point.y)) + Math.max(...points.map(point => point.y))) / 2
      for (const section of ['upper', 'lower']) {
        const edge = points.filter(point => section === 'upper' ? point.y <= center : point.y >= center).sort((left, right) => left.x - right.x)
        if (edge.length >= 3) primitives.push({ id: `feature-${key}-${section}`, kind: 'polyline', points: [], closed: false, pixelPoints: smoothContour(edge.map(point)) })
      }
      continue
    }
    const partial = key === 'mouth' ? /(?:upper|lower)[ -]lips?/i.test(narration) : ['leftEye', 'rightEye'].includes(key) && /(?:upper|lower)[ -](?:eye)?lids?/i.test(narration)
    if (partial && points.length) {
      const center = (Math.min(...points.map(point => point.y)) + Math.max(...points.map(point => point.y))) / 2
      points = points.filter(point => /upper/i.test(narration) ? point.y <= center : point.y >= center).sort((left, right) => left.x - right.x)
    }
    if (key === 'jawline' && /chin|taper/i.test(narration) && points.length > 5) {
      const chin = landmarks.anchors.chin
      if (chin) points = points.filter(point => Math.abs(point.x - chin.x) < .17)
    }
    if (key === 'jawline' && points.length > 4 && landmarks.anchors.jawLeft && landmarks.anchors.jawRight) {
      const nearest = (anchor: PixelPoint) => points.reduce((best, candidate, index) => Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y) < Math.hypot(points[best].x - anchor.x, points[best].y - anchor.y) ? index : best, 0)
      const left = nearest(landmarks.anchors.jawLeft), right = nearest(landmarks.anchors.jawRight)
      if (Math.abs(right - left) >= 2) points = points.slice(Math.min(left, right), Math.max(left, right) + 1)
    }
    if (points.length < 3) continue
    const native = overlay.primitives.find(primitive => primitive.kind === 'polyline' && primitive.id.replace(/[^a-z]/gi, '').toLowerCase().includes(key.toLowerCase()))
    const closed = !partial && (['leftEye', 'rightEye', 'mouth', 'faceOutline'].includes(key) || ['leftBrow', 'rightBrow'].includes(key) && points.length >= 6)
    primitives.push({ ...(native?.kind === 'polyline' ? native : {}), id: `feature-${key}${partial ? '-partial' : ''}`, kind: 'polyline', points: [], closed, pixelPoints: smoothContour(points.map(point), closed) })
  }
  if (regions || category === 'skin') for (const region of faceRegionContours(landmarks, category === 'skin' ? 'overall' : category)) primitives.push({ id: `region-${region.id}`, kind: 'polyline', points: [], closed: true, pixelPoints: smoothContour(region.points.map(point), true) })
  return { ...overlay, measurement, faceBoundary: landmarks.contours?.faceOutline?.map(point), dots: [], primitives }
}

function smoothContour(points: PixelPoint[], closed = false) {
  const at = (index: number) => points[closed ? (index + points.length) % points.length : Math.max(0, Math.min(points.length - 1, index))]
  return points.slice(0, closed ? points.length : -1).flatMap((point, index) => {
    const before = at(index - 1), next = at(index + 1), after = at(index + 2)
    return Array.from({ length: 6 }, (_, step) => {
      const amount = step / 6
      const coordinate = (key: 'x' | 'y') => Math.max(Math.min(point[key], next[key]), Math.min(Math.max(point[key], next[key]), .5 * (2 * point[key] + (-before[key] + next[key]) * amount + (2 * before[key] - 5 * point[key] + 4 * next[key] - after[key]) * amount ** 2 + (-before[key] + 3 * point[key] - 3 * next[key] + after[key]) * amount ** 3)))
      return { x: coordinate('x'), y: coordinate('y') }
    })
  }).concat(closed ? points[0] : points.at(-1)!)
}

export function revealContour(points: PixelPoint[], progress: number) {
  if (points.length < 2 || progress <= 0) return points.slice(0, 1)
  if (progress >= 1) return points
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y))
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * progress
  const result = [points[0]]
  for (const [index, length] of lengths.entries()) {
    if (remaining >= length) { result.push(points[index + 1]); remaining -= length; continue }
    const amount = remaining / Math.max(.001, length)
    result.push({ x: points[index].x + (points[index + 1].x - points[index].x) * amount, y: points[index].y + (points[index + 1].y - points[index].y) * amount }); break
  }
  return result
}

function trace(ctx: CanvasRenderingContext2D, points: PixelPoint[], closed = false) {
  ctx.beginPath()
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y))
  if (closed) ctx.closePath()
}

function drawMeasurement(ctx: CanvasRenderingContext2D, measurement: FaceMeasurement, elapsed: number, reduced: boolean, reveal: number) {
  const anchors = measurement.anchors, left = anchors.leftPupil, right = anchors.rightPupil
  if (!left || !right) return
  const distance = Math.hypot(right.x - left.x, right.y - left.y)
  if (distance < 8) return
  const rotation = Math.atan2(right.y - left.y, right.x - left.x)
  const origin = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
  const local = (point: PixelPoint) => ({ x: (point.x - origin.x) * Math.cos(rotation) + (point.y - origin.y) * Math.sin(rotation), y: -(point.x - origin.x) * Math.sin(rotation) + (point.y - origin.y) * Math.cos(rotation) })
  const points = Object.fromEntries(Object.entries(anchors).flatMap(([key, point]) => point ? [[key, local(point)]] : [])) as Record<string, PixelPoint>
  const amount = (index: number) => reduced ? 1 : smoothMotion((elapsed - 100 - index * 100) / 650) * reveal
  const line = (from: PixelPoint, to: PixelPoint, index: number, dashed = false) => {
    const progress = amount(index)
    const horizontal = Math.abs(to.y - from.y) <= Math.abs(to.x - from.x) * .15
    ctx.save(); ctx.globalAlpha *= progress * (horizontal ? .62 : 1); ctx.lineWidth *= horizontal ? .78 : 1; ctx.setLineDash(dashed ? [2, 3] : [])
    const center = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
    ctx.beginPath(); ctx.moveTo(center.x + (from.x - center.x) * progress, center.y + (from.y - center.y) * progress); ctx.lineTo(center.x + (to.x - center.x) * progress, center.y + (to.y - center.y) * progress); ctx.stroke(); ctx.restore()
  }
  const span = (first: PixelPoint, second: PixelPoint, offset: number, index: number) => {
    const length = Math.max(.001, Math.hypot(second.x - first.x, second.y - first.y))
    const normal = { x: -(second.y - first.y) / length, y: (second.x - first.x) / length }
    const from = { x: first.x + normal.x * offset, y: first.y + normal.y * offset }, to = { x: second.x + normal.x * offset, y: second.y + normal.y * offset }
    line(first, from, index, true); line(second, to, index, true); line(from, to, index + 1)
    for (const point of [from, to]) line({ x: point.x - normal.x * 3, y: point.y - normal.y * 3 }, { x: point.x + normal.x * 3, y: point.y + normal.y * 3 }, index + 1)
  }
  ctx.save(); ctx.translate(origin.x, origin.y); ctx.rotate(rotation)
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.05; ctx.lineCap = 'round'; ctx.shadowColor = '#10203090'; ctx.shadowBlur = 2
  if (measurement.kind === 'spacing' || measurement.kind === 'inner-spacing') {
    const first = points[measurement.kind === 'spacing' ? 'leftPupil' : 'leftEyeInner'], second = points[measurement.kind === 'spacing' ? 'rightPupil' : 'rightEyeInner']
    if (first && second) span(first, second, -distance * .16, 0)
  } else if (measurement.kind === 'tilt') {
    for (const [index, side] of ['left', 'right'].entries()) {
      const inner = points[`${side}EyeInner`], outer = points[`${side}EyeOuter`]
      if (!inner || !outer) continue
      line(inner, outer, index * 2)
      line({ x: inner.x, y: outer.y }, outer, index * 2 + 1, true)
    }
  } else if (measurement.kind === 'width') {
    const first = points.leftCheek ?? points.jawLeft, second = points.rightCheek ?? points.jawRight
    if (first && second) span(first, second, distance * .13, 0)
  } else {
    const top = points.forehead, bottom = points.chin
    if (top && bottom) line({ x: 0, y: top.y }, { x: 0, y: bottom.y }, 0, true)
    if (measurement.kind === 'thirds') {
      const levels = [top, points.noseBridge, points.noseTip, bottom].filter((point): point is PixelPoint => Boolean(point))
      levels.forEach((point, index) => line({ x: -distance * .72, y: point.y }, { x: distance * .72, y: point.y }, index, true))
      for (let index = 1; index < levels.length; index++) span({ x: -distance * .8, y: levels[index - 1].y }, { x: -distance * .8, y: levels[index].y }, 0, index)
    } else {
      for (const [index, pair] of [['leftEyeOuter', 'rightEyeOuter'], ['mouthLeft', 'mouthRight'], ['jawLeft', 'jawRight']].entries()) {
        const first = points[pair[0]], second = points[pair[1]]
        if (!first || !second) continue
        span(first, second, -distance * .1, index * 2)
        for (const point of [first, second]) {
          ctx.save(); ctx.globalAlpha *= amount(index * 2); ctx.beginPath(); ctx.arc(point.x, point.y, 1.8, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
        }
      }
    }
  }
  ctx.restore()
}


const glassSurfaces = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>()

function glassSurface(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.save()
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.clip()
  if (typeof HTMLCanvasElement !== 'undefined' && ctx.canvas instanceof HTMLCanvasElement) {
    let surface = glassSurfaces.get(ctx)
    if (!surface) { surface = document.createElement('canvas'); glassSurfaces.set(ctx, surface) }
    surface.width = Math.max(48, Math.round(48 * width / height)); surface.height = 48
    const transform = ctx.getTransform(), scale = Math.hypot(transform.a, transform.b)
    const center = transform.transformPoint({ x: x + width / 2, y: y + height / 2 })
    const field = surface.getContext('2d')!
    field.drawImage(ctx.canvas, center.x - width * scale / 2, center.y - height * scale / 2, width * scale, height * scale, 0, 0, surface.width, surface.height)
    ctx.filter = 'blur(3px)'; ctx.drawImage(surface, x, y, width, height); ctx.filter = 'none'
  }
  ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(x, y, width, height)
  ctx.restore()
  ctx.save(); ctx.setLineDash([]); ctx.lineWidth = height * .022; ctx.strokeStyle = 'rgba(255,255,255,.42)'
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.stroke(); ctx.restore()
}

export function drawGlassLabel(ctx: CanvasRenderingContext2D, label: string, width: number, height: number, size = 26, right = false) {
  ctx.save(); ctx.font = `400 ${size}px "Mogging Share", Arial`
  const padding = 18, labelWidth = Math.min(width - 40, ctx.measureText(label).width + padding * 2), labelHeight = size + 28
  const x = right ? width - labelWidth - 20 : 20, y = height - labelHeight - 20
  glassSurface(ctx, x, y, labelWidth, labelHeight, 12)
  ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(12,18,24,.65)'; ctx.shadowBlur = 6
  ctx.fillText(label, x + padding, y + labelHeight / 2, labelWidth - padding * 2); ctx.restore()
}

function glassMarker(ctx: CanvasRenderingContext2D, point: PixelPoint, label: string, unit: number) {
  const side = 32 * unit, x = point.x - side / 2, y = point.y - 43 * unit
  ctx.save(); ctx.setLineDash([]); ctx.lineWidth = .7 * unit; ctx.strokeStyle = 'rgba(255,255,255,.38)'
  ctx.beginPath(); ctx.moveTo(point.x, point.y - 3 * unit); ctx.lineTo(point.x, y + side); ctx.stroke()
  glassSurface(ctx, x, y, side, side, 6 * unit)
  ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.font = `500 ${13 * unit}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(label, point.x, y + side / 2); ctx.restore()
}

export function drawFaceTreatment(ctx: CanvasRenderingContext2D, overlay: ReportOverlay, width: number, timeMs: number, reduced = false, reveal = 1, options: { appearance?: GlassOverlay; durationMs?: number } = {}) {
  const appearance = options.appearance ?? defaultGlassOverlay
  const exit = reduced || options.durationMs === undefined ? 1 : smoothMotion((options.durationMs - timeMs) / 300)
  ctx.save(); ctx.scale(width / overlay.size.width, width / overlay.size.width)
  const transform = ctx.getTransform(), scale = typeof transform?.a === 'number' ? Math.hypot(transform.a, transform.b) : 1
  const unit = 1 / Math.max(.001, scale)
  ctx.globalAlpha *= appearance.opacity; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.fillStyle = 'rgba(255,255,255,.8)'
  ctx.lineWidth = 1.8 * unit; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.shadowColor = 'rgba(15,22,28,.45)'; ctx.shadowBlur = 2.5 * unit
  if (overlay.measurement) drawMeasurement(ctx, overlay.measurement, timeMs, reduced, reveal * exit)
  const primitives = overlay.primitives.filter(primitive => primitive.kind === 'polyline' || primitive.kind === 'point')
  let marker = 0
  primitives.forEach((primitive, index) => {
    const amount = (reduced ? 1 : smoothMotion((timeMs - index * 100) / 850)) * Math.min(1, Math.max(0, reveal)) * exit
    if (amount <= 0) return
    ctx.save()
    ctx.setLineDash(appearance.pattern === 'dotted' ? [.5 * unit, 4.5 * unit] : appearance.pattern === 'dashed' ? [7 * unit, 5 * unit] : [])
    if (primitive.kind === 'polyline') {
      const points = primitive.pixelPoints
      if (points.length < 3) { ctx.restore(); return }
      if (appearance.regions && primitive.closed && overlay.faceBoundary?.length) {
        ctx.save(); trace(ctx, overlay.faceBoundary, true); ctx.clip()
        trace(ctx, points, true); ctx.globalAlpha *= .08 * amount; ctx.fill(); ctx.restore()
      }
      const visible = revealContour(points, amount)
      trace(ctx, visible, primitive.closed && amount >= 1); ctx.stroke()
      const tip = visible.at(-1)!
      ctx.setLineDash([]); ctx.beginPath(); ctx.arc(tip.x, tip.y, 1.7 * unit, 0, Math.PI * 2); ctx.fill()
      if (appearance.markers && amount > .55) {
        const candidates = primitive.closed || primitive.id.startsWith('region-') ? [points[0]] : /brow/i.test(primitive.id) ? [points.reduce((best, point) => point.x < best.x ? point : best), points.reduce((best, point) => point.y < best.y ? point : best), points.reduce((best, point) => point.x > best.x ? point : best)] : [points[0], points.at(-1)!]
        const locations = candidates.reduce<PixelPoint[]>((selected, point) => selected.some(previous => Math.hypot(point.x - previous.x, point.y - previous.y) < 42 * unit) ? selected : [...selected, point], [])
        locations.forEach(point => { if (marker >= 6) return; ctx.save(); ctx.globalAlpha *= smoothMotion((amount - .55) / .45); glassMarker(ctx, point, String(++marker).padStart(2, '0'), unit); ctx.restore() })
      }
    } else if (primitive.kind === 'point') {
      ctx.globalAlpha *= amount; ctx.setLineDash([])
      ctx.beginPath(); ctx.arc(primitive.point.x, primitive.point.y, 2 * unit, 0, Math.PI * 2); ctx.fill()
      if (appearance.markers) glassMarker(ctx, primitive.point, String(++marker).padStart(2, '0'), unit)
    }
    ctx.restore()
  })
  ctx.restore()
}
