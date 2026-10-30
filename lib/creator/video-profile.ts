import { originalVideoContext, isDarkVideoContext } from './video-theme'
import { overlayOutlineColor } from './glass-overlay'
import { z } from 'zod'
import type { GeneratorImage } from './content-generator'
import { defaultGlassOverlay, type PortraitEffects } from './video-portrait-effects'
import { revealContour } from './video-face-treatment'
import { smoothMotion } from './video-layout'

export const profileStudySchema = z.object({ view: z.enum(['three-quarter', 'profile']), side: z.enum(['left', 'right']), feature: z.enum(['jaw', 'cheek', 'angle', 'nose', 'lips', 'chin']) }).strict()
export type ProfileStudy = z.infer<typeof profileStudySchema>
type Point = { x: number; y: number }
export type ProfileGeometry = { contour: Point[]; angle?: { vertex: Point; from: Point; to: Point; degrees: number }; view: ProfileStudy['view'] }

export function projectedAngle(from: Point, vertex: Point, to: Point) {
  const first = { x: from.x - vertex.x, y: from.y - vertex.y }, second = { x: to.x - vertex.x, y: to.y - vertex.y }
  const denominator = Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y)
  if (denominator < 1) return null
  return Math.acos(Math.max(-1, Math.min(1, (first.x * second.x + first.y * second.y) / denominator))) * 180 / Math.PI
}

export function profileGeometry(image: GeneratorImage, study: ProfileStudy): ProfileGeometry {
  const landmarks = image.landmarks, anchors = landmarks?.anchors
  if (!landmarks || landmarks.confidence < .58 || !anchors?.chin) throw new Error(`${image.name}: profile annotations need reliable detected contours.`)
  const boundary = landmarks.contours?.faceOutline ?? [], jaw = landmarks.contours?.jawline ?? boundary
  const pixel = (point: Point) => ({ x: point.x * image.width, y: point.y * image.height })
  const distance = (a: Point, b: Point) => Math.hypot((a.x - b.x) * image.width, (a.y - b.y) * image.height)
  const nearest = (points: Point[], point: Point) => points.reduce((best, candidate, index) => distance(candidate, point) < distance(points[best], point) ? index : best, 0)
  const nose = anchors.noseTip
  const leftSpan = nose && anchors.leftCheek ? distance(nose, anchors.leftCheek) : 0
  const rightSpan = nose && anchors.rightCheek ? distance(nose, anchors.rightCheek) : 0
  // The wider projected half is the visible cheek, independently of image mirroring.
  const side = leftSpan > rightSpan * 1.15 ? 'left' : rightSpan > leftSpan * 1.15 ? 'right' : study.side
  const corner = side === 'right' ? anchors.jawRight : anchors.jawLeft
  const cheek = side === 'right' ? anchors.rightCheek : anchors.leftCheek
  const anchored = (points: Array<Point | undefined>) => {
    if (points.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error(`${image.name}: no reliable ${study.feature} anchors.`)
    return { view: study.view, contour: (points as Point[]).map(pixel) }
  }
  if (study.feature === 'nose') return anchored([anchors.noseBridge, nose, landmarks.contours?.noseBase?.[3]])
  if (study.feature === 'lips') return anchored([anchors.upperLip, anchors.mouthCenter, anchors.lowerLip])
  if (study.feature === 'cheek') {
    if (!cheek || !corner || boundary.length < 9) throw new Error(`${image.name}: no reliable visible cheek contour.`)
    const start = nearest(boundary, cheek), end = nearest(boundary, corner)
    return { view: study.view, contour: boundary.slice(Math.min(start, end), Math.max(start, end) + 1).map(pixel) }
  }
  if (!corner || jaw.length < 9) throw new Error(`${image.name}: no reliable visible jaw contour.`)
  const start = nearest(jaw, corner), end = nearest(jaw, anchors.chin)
  const contour = jaw.slice(Math.min(start, end), Math.max(start, end) + 1).map(pixel)
  if (contour.length < 3) throw new Error(`${image.name}: jaw contour is too short for this annotation.`)
  if (study.feature === 'chin') {
    const towardChin = start < end ? contour : [...contour].reverse()
    return { view: study.view, contour: towardChin.slice(-Math.max(3, Math.ceil(towardChin.length * .5))) }
  }
  if (study.feature !== 'angle') return { view: study.view, contour }
  if (!cheek) return { view: study.view, contour }
  const vertex = pixel(jaw[start]), from = pixel(cheek), to = pixel(jaw[end])
  const degrees = projectedAngle(from, vertex, to)
  if (degrees === null) return { view: study.view, contour }
  return { view: study.view, contour, angle: { from, vertex, to, degrees } }
}

// Arms reveal independently; the arc follows after both have acquired their anchors.
export function anglePaths(angle: NonNullable<ProfileGeometry['angle']>): Point[][] {
  const {from,vertex,to}=angle
  const radius=Math.min(Math.hypot(from.x-vertex.x,from.y-vertex.y),Math.hypot(to.x-vertex.x,to.y-vertex.y))*.33
  const start=Math.atan2(from.y-vertex.y,from.x-vertex.x),end=Math.atan2(to.y-vertex.y,to.x-vertex.x)
  const delta=Math.atan2(Math.sin(end-start),Math.cos(end-start))
  return [[vertex,from],[vertex,to],Array.from({length:25},(_,i)=>({x:vertex.x+radius*Math.cos(start+delta*i/24),y:vertex.y+radius*Math.sin(start+delta*i/24)}))]
}

export function drawProfileStudy(ctx: CanvasRenderingContext2D, geometry: ProfileGeometry, timeMs: number, reduced: boolean, options: { lightingLeadMs?: number; appearance?: PortraitEffects['overlay']; durationMs?: number } = {}) {
  const dark = isDarkVideoContext(ctx)
  ctx = originalVideoContext(ctx)
  const appearance = { ...(options.appearance ?? { ...defaultGlassOverlay, pattern: 'solid' }), ...(dark ? {color:'#fff'} : {}) }, lightingLeadMs = options.lightingLeadMs ?? 0
  const exit = reduced || options.durationMs === undefined ? 1 : smoothMotion((options.durationMs - timeMs) / 300)
  const phase = Math.max(0, timeMs), transform = ctx.getTransform(), unit = 1 / Math.max(.01, Math.hypot(transform.a, transform.b))
  const progress = reduced ? 1 : smoothMotion((phase - 80 - lightingLeadMs) / 520)
  ctx.save(); ctx.globalAlpha *= appearance.opacity * exit * (reduced ? 1 : smoothMotion(phase / 160)); ctx.strokeStyle = appearance.color ?? '#fff'; ctx.fillStyle = appearance.color ?? '#fff'; ctx.lineWidth = unit * (appearance.contrast ? 2.4 : 1.8); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = overlayOutlineColor(appearance.color); ctx.shadowBlur = unit * 1.5
  ctx.setLineDash(appearance.pattern === 'dotted' ? [.5 * unit, 4.5 * unit] : appearance.pattern === 'dashed' ? [7 * unit, 5 * unit] : [])
  const path = revealContour(geometry.contour, progress)
  if (!geometry.angle) { ctx.beginPath(); path.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.stroke() }
  ctx.setLineDash([])
  const anchor = geometry.angle?.vertex ?? path[0]
  if (!anchor) { ctx.restore(); return }
  ctx.beginPath(); ctx.arc(anchor.x, anchor.y, unit * 2, 0, Math.PI * 2); ctx.fill()
  if (geometry.angle) {
    const { from, vertex, to } = geometry.angle
    const radius = Math.min(Math.hypot(from.x - vertex.x, from.y - vertex.y), Math.hypot(to.x - vertex.x, to.y - vertex.y)) * .33
    const ray = (point: Point, delay: number) => {
      const amount = reduced ? 1 : smoothMotion((phase - delay) / 360)
      const length = Math.hypot(point.x - vertex.x, point.y - vertex.y), extent = Math.min(length, radius * 2.1) / Math.max(1, length)
      ctx.beginPath(); ctx.moveTo(vertex.x, vertex.y); ctx.lineTo(vertex.x + (point.x - vertex.x) * amount * extent, vertex.y + (point.y - vertex.y) * amount * extent); ctx.stroke()
    }
    ray(from, 180); ray(to, 260)
    const start = Math.atan2(from.y - vertex.y, from.x - vertex.x), end = Math.atan2(to.y - vertex.y, to.x - vertex.x)
    const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start)), amount = reduced ? 1 : smoothMotion((phase - 360) / 360)
    ctx.beginPath(); ctx.arc(vertex.x, vertex.y, radius, start, start + delta * amount, delta < 0); ctx.stroke()
  }
  ctx.restore()
}

export function profileFeatureForText(text: string, category = ''): ProfileStudy['feature'] {
  if (/jaw angle|gonial|jaw corner/i.test(text)) return 'angle'
  if (/chin/i.test(text)) return 'chin'
  if (/nose|nasal/i.test(text) || category === 'nose') return 'nose'
  if (/lip|mouth/i.test(text) || category === 'lips' || category === 'mouth') return 'lips'
  if (/cheek/i.test(text) || category === 'cheeks') return 'cheek'
  return 'jaw'
}
