import { drawFaceTreatment, revealContour } from './face-treatment'
import type { ReportOverlay } from './report-overlay'
import type { PixelPoint, ResolvedPrimitive } from './mobile-overlay-engine/resolve'
import type { GlassOverlay } from './glass-overlay'

export type FaceMorph = { from: ReportOverlay; to: ReportOverlay; progress: number }
const mix = (from: PixelPoint, to: PixelPoint, p: number) => ({ x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p })

// Match the web preview's fixed path topology, sampled by distance rather than
// landmark index so unevenly spaced contours move at a consistent speed.
function sample(points: PixelPoint[], count = 65) {
  if (!points.length) return []
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  let segment = 0, offset = 0
  return Array.from({ length: count }, (_, index) => {
    const distance = total * index / (count - 1)
    while (segment < lengths.length - 1 && offset + lengths[segment] < distance) offset += lengths[segment++]
    return mix(points[segment], points[segment + 1] ?? points[segment], lengths[segment] ? (distance - offset) / lengths[segment] : 0)
  })
}

export function morphFaceOverlay(from: ReportOverlay, to: ReportOverlay, p: number): ReportOverlay {
  if (p <= 0) return from
  if (p >= 1) return to
  const lines = (overlay: ReportOverlay) => overlay.primitives.filter((item): item is Extract<ResolvedPrimitive, { kind: 'polyline' }> => item.kind === 'polyline' && item.pixelPoints.length >= 3)
  const originals = new Map(lines(from).map(line => [line.id,line]))
  const primitives = lines(to).map(target => {
    const source = originals.get(target.id)
    const targetPoints = sample(target.closed ? [...target.pixelPoints, target.pixelPoints[0]] : target.pixelPoints)
    const sourcePoints = source ? sample(source.closed ? [...source.pixelPoints, source.pixelPoints[0]] : source.pixelPoints) : []
    const direction = (points: PixelPoint[]) => { const end = points[Math.floor(points.length/4)] ?? points[0]; return points.length ? { x:end.x-points[0].x,y:end.y-points[0].y } : {x:0,y:0} }
    const a = direction(sourcePoints), b = direction(targetPoints)
    const aligned = (a.x*b.x+a.y*b.y)/Math.max(.001,Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y)) > .94
    const nearby = aligned && source?.closed === target.closed && sourcePoints.length === targetPoints.length && sourcePoints.every((point,index) => Math.hypot(point.x-targetPoints[index].x,point.y-targetPoints[index].y) < Math.min(to.size.width,to.size.height)*.06)
    return { ...target, closed: false, pixelPoints: nearby ? targetPoints.map((point,index)=>mix(sourcePoints[index],point,p)) : revealContour(targetPoints,p) }
  })
  // Point markers and different measuring instruments dissolve independently;
  // contours remain a single moving geometry, never two stacked face maps.
  return { ...to, primitives, measurement: undefined, dots: [] }
}

export function drawFaceMorph(ctx: CanvasRenderingContext2D, morph: FaceMorph, width: number, appearance?: GlassOverlay) {
  const geometry = morphFaceOverlay(morph.from, morph.to, morph.progress)
  ctx.save(); ctx.globalAlpha *= Math.max(0,1-morph.progress*4)
  drawFaceTreatment(ctx, { ...morph.from, measurement: undefined, dots: [], primitives: morph.from.primitives.filter(item => item.kind === 'polyline' && !morph.to.primitives.some(next => next.id === item.id)) }, width, 0, true, 1, { appearance })
  ctx.restore()
  drawFaceTreatment(ctx, { ...geometry, measurement: undefined, primitives: geometry.primitives.filter(item => item.kind === 'polyline') }, width, 0, true, 1, { appearance })
  for (const [overlay, opacity] of [[morph.from, 1 - morph.progress], [morph.to, morph.progress]] as const) {
    ctx.save(); ctx.globalAlpha *= opacity
    drawFaceTreatment(ctx, { ...overlay, primitives: overlay.primitives.filter(item => item.kind === 'point') }, width, 0, true, 1, { appearance })
    ctx.restore()
  }
}
