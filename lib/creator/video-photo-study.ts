import { z } from 'zod'
import type { FaceLandmarksPayload, NormalizedPoint } from '@/lib/analysis/landmarks'
import { smoothMotion } from './video-layout'
import { drawPortraitEffects, warpDestinationPoint, type PortraitWarp, type PortraitLighting, type PortraitEffects, type WarpRegion } from './video-portrait-effects'
import { drawFaceTreatment } from './video-face-treatment'
import type { ReportOverlay } from './report-overlay'
import { paintCanvasNode, type CanvasPainter } from './canvas-layout'

export const photoStudySchema = z.object({
  feature: z.enum(['nose', 'cheeks', 'face-width', 'jaw', 'eyes', 'lips', 'brows']),
  amount: z.number().finite().min(-.25).max(.25).default(.055),
  mode: z.enum(['pinch', 'stretch', 'drag']).optional(),
  axis: z.enum(['x', 'y', 'both']).optional(),
  cursor: z.boolean().optional(),
}).strict()
export type PhotoStudy = z.infer<typeof photoStudySchema>

export function photoStudyRegions(landmarks: FaceLandmarksPayload | null | undefined, feature: PhotoStudy['feature']): WarpRegion[] {
  if (landmarks && (landmarks.confidence < .58 || Math.abs(landmarks.quality?.yawRadians ?? 0) > .65)) throw new Error('Use a clear, near-frontal photo for illustrative image variations.')
  const anchors = landmarks?.anchors ?? {}, { leftPupil: left, rightPupil: right, noseTip: nose, leftCheek, rightCheek, chin, forehead } = anchors
  if (!left || !right || !nose || [left, right, nose].some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('Image variations need detected pupil and nose anchors. Analyze the photo first.')
  const eyeWidth = Math.abs(right.x - left.x), ratio = landmarks?.image ? landmarks.image.width / landmarks.image.height : 1
  if (eyeWidth < .03) throw new Error('The face is too small or turned for a reliable image variation.')
  const local = (points: (NormalizedPoint | undefined)[], rx: number, ry: number) => points.map(point => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error(`${feature} variations need all detected feature anchors.`)
    return { x: point.x, y: point.y, rx: eyeWidth * rx, ry: eyeWidth * ry * ratio }
  })
  if (feature === 'nose') return local([{ x: nose.x, y: nose.y - eyeWidth * .1 * ratio }], .52, .72)
  if (feature === 'cheeks') return local([leftCheek, rightCheek], .65, .75)
  if (feature === 'eyes') return local([left, right], .46, .32)
  if (feature === 'brows') return local([anchors.leftBrow, anchors.rightBrow], .48, .3)
  if (feature === 'lips') return local([anchors.mouthCenter ?? anchors.upperLip], .62, .4)
  if (feature === 'jaw') return local([anchors.jawLeft, anchors.jawRight], .7, .85)
  if (!leftCheek || !rightCheek || !chin || !forehead) throw new Error('Face-width variations need cheek, forehead and chin anchors.')
  if ([leftCheek, rightCheek, chin, forehead].some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('Face-width variations need finite detected anchors.')
  if (chin.y <= forehead.y || Math.abs(rightCheek.x - leftCheek.x) < .05) throw new Error('Face-width anchors are not reliable enough for this variation.')
  return [{ x: (leftCheek.x + rightCheek.x) / 2, y: (forehead.y + chin.y) / 2, rx: Math.abs(rightCheek.x - leftCheek.x) * .8, ry: (chin.y - forehead.y) * .8 }]
}

export function photoStudyGesture(study: PhotoStudy, regions: WarpRegion[], timeMs: number, durationMs: number, reduced = false) {
  const time = reduced ? .6 : Math.max(0, Math.min(1, timeMs / Math.max(1, durationMs)))
  const restore = 1 - smoothMotion((time - .78) / .17)
  const warp: PortraitWarp = { regions, strengths: regions.map((_, index) => Math.max(-.08, Math.min(.08, study.amount)) * (reduced ? 1 : smoothMotion((time - .12 - index * .24) / .16) * restore)), mode: study.mode ?? 'pinch', axis: study.axis ?? (['face-width', 'jaw'].includes(study.feature) ? 'x' : 'both') }
  const handle = (index: number) => ({ x: regions[index].x + (warp.axis === 'y' ? 0 : regions[index].rx * .48), y: regions[index].y + (warp.axis === 'x' ? 0 : regions[index].ry * .18) })
  const active = regions.length > 1 && time >= .28 ? 1 : 0, grab = handle(active), target = warpDestinationPoint(grab, warp)
  const start = active ? warpDestinationPoint(handle(0), warp) : { x: grab.x + regions[0].rx * .55, y: grab.y - regions[0].ry * .6 }
  const approach = smoothMotion((time - (active ? .28 : .04)) / .08)
  const cursor = { x: start.x + (target.x - start.x) * approach, y: start.y + (target.y - start.y) * approach }
  const pressed = time >= .12 + active * .24 && time < .28 + active * .24
  const opacity = reduced || study.cursor === false ? 0 : smoothMotion(time / .04) * (1 - smoothMotion((time - .66) / .1))
  return { warp, grab, target, cursor, pressed, opacity }
}

export function warpStudyOverlay(overlay: ReportOverlay, warp: PortraitWarp): ReportOverlay {
  if (warp.strengths.every(strength => Math.abs(strength) < .00001)) return overlay
  const point = (value: { x: number; y: number }) => {
    const moved = warpDestinationPoint({ x: value.x / overlay.size.width, y: value.y / overlay.size.height }, warp)
    return { x: moved.x * overlay.size.width, y: moved.y * overlay.size.height }
  }
  return { ...overlay, faceBoundary: overlay.faceBoundary?.map(point), dots: overlay.dots.map(dot => ({ ...dot, ...point(dot) })), measurement: overlay.measurement ? { ...overlay.measurement, anchors: Object.fromEntries(Object.entries(overlay.measurement.anchors).map(([key, value]) => [key, value ? point(value) : value])) } : undefined,
    primitives: overlay.primitives.filter(primitive => primitive.kind === 'polyline' || primitive.kind === 'point').map(primitive => primitive.kind === 'polyline' ? { ...primitive, pixelPoints: primitive.pixelPoints.map(point) } : { ...primitive, point: point(primitive.point) }) }
}

export function drawPhotoStudy(ctx: CanvasRenderingContext2D, image: HTMLImageElement | HTMLCanvasElement, landmarks: FaceLandmarksPayload | null | undefined, study: PhotoStudy, timeMs: number, durationMs: number, reduced: boolean, effects: { lighting?: PortraitLighting; mask?: HTMLCanvasElement; overlay?: ReportOverlay | null; appearance?: PortraitEffects['overlay']; paint?: CanvasPainter; measuring?: boolean } = {}) {
  const gesture = photoStudyGesture(study, photoStudyRegions(landmarks, study.feature), timeMs, durationMs, reduced)
  if (effects.measuring || !effects.lighting && gesture.warp.strengths.every(strength => Math.abs(strength) < .00001)) ctx.drawImage(image, 0, 0)
  else drawPortraitEffects(ctx, image, { lighting: effects.lighting, mask: effects.mask, landmarks, timeMs, reduced, warp: gesture.warp })
  if (effects.overlay) (effects.paint ?? paintCanvasNode)(ctx, { id: 'overlay', label: 'Deforming feature outlines', frame: { x: 0, y: 0, width: image.width, height: image.height }, draw: ctx => {
    if (!effects.measuring) drawFaceTreatment(ctx, warpStudyOverlay(effects.overlay!, gesture.warp), image.width, timeMs, reduced, 1, { durationMs, appearance: effects.appearance })
  } })
  if (!gesture.opacity || effects.measuring) return
  const transform = ctx.getTransform(), unit = 1 / Math.max(.001, Math.hypot(transform.a, transform.b))
  ctx.save(); ctx.globalAlpha *= gesture.opacity
  ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = unit; ctx.setLineDash([3 * unit, 5 * unit])
  ctx.beginPath(); ctx.moveTo(gesture.grab.x * image.width, gesture.grab.y * image.height); ctx.lineTo(gesture.target.x * image.width, gesture.target.y * image.height); ctx.stroke(); ctx.setLineDash([])
  ctx.beginPath(); ctx.arc(gesture.target.x * image.width, gesture.target.y * image.height, (gesture.pressed ? 10 : 7) * unit, 0, Math.PI * 2); ctx.stroke()
  ctx.translate(gesture.cursor.x * image.width, gesture.cursor.y * image.height); ctx.scale(unit, unit)
  ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 2
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 25); ctx.lineTo(7, 18); ctx.lineTo(12, 29); ctx.lineTo(17, 27); ctx.lineTo(12, 16); ctx.lineTo(22, 16); ctx.closePath()
  ctx.fillStyle = gesture.pressed ? '#dadde0' : '#fff'; ctx.strokeStyle = 'rgba(20,24,29,.85)'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke(); ctx.restore()
}
