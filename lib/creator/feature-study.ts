import { sampleEditorialCursor, drawEditorialCursor, editorialCursorTiming } from './editorial-cursor'
import { drawEditorialTool, drawEditorialFeatheredReveal, drawEditorialInset, drawEditorialLeader, drawEditorialLocator, drawEditorialWipeHandle } from './editorial-motion'
import { applyGlassInk } from './glass-overlay'
import { drawPortraitInstruments, drawPortraitParticles, instrumentOwnsGuides, type PortraitInstrument } from './portrait-instruments'
import { z } from 'zod'
import { measuredProportionWarp, drawNaturalFreckles } from './portrait-detail-edits'
import { drawPortraitActivity, drawPortraitLabel, type PortraitActivity } from './portrait-program'
import { visualFeatures } from './video-semantics'
import { smoothMotion, videoContent, videoSize } from './video-layout'
import { originalVideoContext, isDarkVideoContext } from './video-theme'
import { drawPortraitColorExtension, drawPortraitProgressiveBlur } from './report-portrait'
import { portraitImageFrame, portraitDetailRegion } from './video-portrait'
import { drawPortraitEffects, warpDestinationPoint, type PortraitWarp } from './video-portrait-effects'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'

export const featureTopics = ['philtrum', 'freckles', 'facial-hair', 'ears', 'symmetry', 'dimorphism'] as const
export type FeatureTopic = typeof featureTopics[number]
export const featureTopicLabels: Record<FeatureTopic, string> = { philtrum: 'Philtrum length', freckles: 'Freckles', 'facial-hair': 'Facial hair', ears: 'Ear prominence', symmetry: 'Facial symmetry', dimorphism: 'Facial shape' }
export const featureStudySchema = z.object({
  editorial: z.boolean().optional(),
  opening: z.enum(['lip-choice', 'jaw-choice', 'jaw-width-choice', 'smile-choice']).optional(),
  phase: z.enum(['hold', 'clue', 'reveal']).optional(),
  topic: z.enum(visualFeatures), layout: z.enum(['hero', 'detail', 'compare', 'grid', 'evidence']),
  motion: z.enum(['hold', 'push', 'pull', 'pan-left', 'pan-right', 'pan-up']).optional(),
  guidesDuringEdit: z.boolean().optional(),
  annotationStyle: z.enum(['circle', 'guide', 'leader']).optional(),
  tool: z.enum(['brush','clipper']).optional(),
  comparison: z.enum(['blend', 'wipe', 'spotlight']).optional(),
  revealWord: z.number().int().nonnegative().optional(),
  labels: z.array(z.string().max(60)).max(4).optional(),
  footnote: z.string().max(120).optional(),
  adjustment: z.enum(['thirds','width']).optional(),
  editMode: z.enum(['warp', 'photo']).default('warp'),
  edit: z.number().min(-1).max(1).default(0), annotation: z.string().max(50).default(''),
  images: z.array(z.string().max(100)).max(4).default([]),
}).strict()
export type FeatureStudy = z.infer<typeof featureStudySchema>
type Point = { x: number; y: number }
type Frame = { x: number; y: number; width: number; height: number }
export type FeaturePhoto = { original?: HTMLCanvasElement | HTMLImageElement; image: HTMLCanvasElement | HTMLImageElement; landmarks: FaceLandmarksPayload | null | undefined; headTop?: number }

const hero = { x: 0, y: 500, width: videoSize.width, height: videoSize.height - 500 }
export function featureFrames(layout: FeatureStudy['layout']): Frame[] {
  if (layout === 'compare' || layout === 'grid') {
    const grid = layout === 'grid', inset = 44, gap = 22
    const width = (videoSize.width - inset * 2 - gap) / 2
    const height = grid ? 655 : 1180
    return Array.from({ length: grid ? 4 : 2 }, (_, index) => ({
      x: inset + index % 2 * (width + gap),
      y: (grid ? 505 : 535) + Math.floor(index / 2) * (height + 72),
      width, height,
    }))
  }
  return [{ ...hero }]
}
export function featureFrameAt(from: Frame, to: Frame, timeMs: number, reduced = false): Frame {
  if (reduced || timeMs >= 560) return { ...to }
  if (timeMs <= 0) return { ...from }
  const t = smoothMotion(timeMs / 560)
  return Object.fromEntries(Object.entries(to).map(([key, value]) => [key, from[key as keyof Frame] + (value - from[key as keyof Frame]) * t])) as Frame
}
export function comparisonTiming(durationMs: number) {
  return {intro:Math.min(2400,Math.max(1,durationMs)*.35),travel:780,hold:1500,pause:450}
}
export function comparisonExpansionTimes(durationMs: number) {
  const {intro,travel,hold,pause}=comparisonTiming(durationMs),cycle=intro+travel*4+hold*2+pause,times:number[]=[]
  for(let start=0;start<durationMs;start+=cycle) for(const offset of [intro,intro+travel*2+hold+pause]) if(start+offset<durationMs-250)times.push(start+offset)
  return times
}
// One clock owns the pair, expansion and return so caption cuts never restart the move.
export function comparisonFrames(timeMs: number, durationMs: number, reduced = false, pair = featureFrames('compare'), full = featureFrames('hero')[0], motion?: FeatureStudy['motion']): Frame[] {
  if (reduced) return pair
  const right = [{ ...full, x: -full.width - 22 }, full], left = [full, { ...full, x: full.width + 22 }]
  const {intro,travel,hold,pause}=comparisonTiming(durationMs)
  const [first, second] = motion === 'pan-left' ? [left, right] : [right, left]
  const pace = motion === 'push' ? .78 : motion === 'pull' ? 1.24 : 1
  const phases = [
    { from: pair, to: pair, duration: motion === 'hold' ? intro + 280 : intro },
    { from: pair, to: first, duration: travel * pace },
    { from: first, to: first, duration: hold },
    { from: first, to: pair, duration: travel * pace },
    { from: pair, to: pair, duration: pause },
    { from: pair, to: second, duration: travel * pace },
    { from: second, to: second, duration: hold },
    { from: second, to: pair, duration: travel * pace },
  ]
  let time = Math.max(0, timeMs) % phases.reduce((sum, phase) => sum + phase.duration, 0)
  for (const phase of phases) {
    if (time <= phase.duration) return phase.from.map((frame, index) => {
      const progress=time/phase.duration,placed=featureFrameAt(frame,phase.to[index],progress*560)
      const moving=phase.from!==phase.to,arc=moving?Math.sin(smoothMotion(progress)*Math.PI)*45:0
      return {...placed,y:placed.y+arc*(motion === 'pan-up' ? -2 : index ? -1 : 1)}
    })
    time -= phase.duration
  }
  return pair
}
export function comparisonSceneClock(scenes: Array<{ startMs: number; durationMs: number; source: { imageId?: string | null }; featureStudy?: FeatureStudy }>, scene: typeof scenes[number], localMs: number): { timeMs: number; durationMs: number; previousFrame?: Frame } {
  let first = scenes.findIndex(candidate => candidate.startMs === scene.startMs), last = first
  if (first < 0) return { timeMs: localMs, durationMs: scene.durationMs }
  const same = (other: typeof scene) => other.source.imageId === scene.source.imageId && other.featureStudy?.layout === scene.featureStudy?.layout && other.featureStudy?.opening === scene.featureStudy?.opening && other.featureStudy?.topic === scene.featureStudy?.topic && JSON.stringify(other.featureStudy?.images) === JSON.stringify(scene.featureStudy?.images)
  while (first > 0 && same(scenes[first - 1])) first--
  while (last < scenes.length - 1 && same(scenes[last + 1])) last++
  const previous = scenes[first - 1]
  let previousFrame: Frame | undefined
  if (scene.featureStudy?.layout !== 'compare' && previous?.featureStudy?.layout === 'compare' && !previous.featureStudy.opening && previous.source.imageId === scene.source.imageId) {
    const clock = comparisonSceneClock(scenes, previous, previous.durationMs)
    const visible = (frame: Frame) => Math.max(0,Math.min(videoSize.width,frame.x+frame.width)-Math.max(0,frame.x))*Math.max(0,Math.min(videoSize.height,frame.y+frame.height)-Math.max(0,frame.y))
    previousFrame = comparisonFrames(clock.timeMs,clock.durationMs).reduce((active,frame)=>visible(frame)>visible(active)?frame:active)
  }
  return { timeMs: scene.startMs + localMs - scenes[first].startMs, durationMs: scenes[last].startMs + scenes[last].durationMs - scenes[first].startMs, ...(previousFrame ? { previousFrame } : {}) }
}
function drawBackgroundRoll(ctx: CanvasRenderingContext2D, width: number, height: number, progress: number, original: (target: CanvasRenderingContext2D) => void, foreground: (target: CanvasRenderingContext2D) => void) {
  if (progress >= 1) { foreground(ctx); return }
  original(ctx)
  drawEditorialFeatheredReveal(ctx, width, height, progress, target => {
    target.fillStyle = '#fff'; target.fillRect(0, 0, width, height); foreground(target)
  }, true)
}
function requiredPoint(point: Point | undefined, name: string): Point {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error(`This feature study needs a detected ${name}.`)
  return point
}
function philtrumTop(landmarks: FaceLandmarksPayload) {
  return landmarks.contours?.noseBase?.[3] ?? landmarks.anchors.noseTip
}
export function featureTarget(landmarks: FaceLandmarksPayload, topic: FeatureStudy['topic']) {
  const a = landmarks.anchors, left = requiredPoint(a.leftPupil, 'left eye'), right = requiredPoint(a.rightPupil, 'right eye')
  const chin = requiredPoint(a.chin, 'chin'), nose = requiredPoint(topic === 'philtrum' ? philtrumTop(landmarks) : a.noseTip, 'nose'), lip = requiredPoint(a.upperLip, 'upper lip')
  const eyeWidth = Math.hypot(right.x - left.x, (right.y - left.y) * landmarks.image.height / landmarks.image.width)
  if (landmarks.confidence < .58 || eyeWidth < .03) throw new Error('Choose a clear front portrait for this feature study.')
  const midpoint = (p: Point, q: Point) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })
  const center = topic === 'philtrum' ? midpoint(nose, lip) : topic === 'facial-hair' || topic === 'jaw' ? midpoint(lip, chin)
    : topic === 'freckles' || topic === 'nose' ? nose : topic === 'lips' ? a.mouthCenter ?? lip
    : topic === 'eyes' ? midpoint(left, right) : topic === 'brows' && a.leftBrow && a.rightBrow ? midpoint(a.leftBrow, a.rightBrow)
    : midpoint(midpoint(left, right), chin)
  return { center, eyeWidth }
}
export function featureWarp(landmarks: FaceLandmarksPayload, topic: FeatureStudy['topic'], amount: number, adjustment?: 'thirds'|'width'): PortraitWarp | undefined {
  if (adjustment) return measuredProportionWarp(landmarks,adjustment,amount)
  if (!(featureTopics as readonly string[]).includes(topic) || ['freckles','facial-hair'].includes(topic) || !amount) return
  const { eyeWidth } = featureTarget(landmarks, topic), a = landmarks.anchors
  const ratio = landmarks.image.width / landmarks.image.height
  const points = topic === 'philtrum' ? [a.mouthCenter ?? a.upperLip] : topic === 'ears' ? [a.leftCheek, a.rightCheek] : topic === 'symmetry' ? [a.leftPupil, a.rightPupil, a.mouthLeft, a.mouthRight] : [a.jawLeft, a.jawRight, a.leftBrow, a.rightBrow]
  const regions = points.map((point, index) => {
    const p = requiredPoint(point, topic)
    return { x: topic === 'ears' ? p.x + (index ? 1 : -1) * eyeWidth * .16 : p.x, y: p.y, rx: eyeWidth * (topic === 'philtrum' ? .8 : .5), ry: eyeWidth * ratio * (topic === 'philtrum' ? .6 : .7) }
  })
  const strengths = regions.map((_, i) => {
    if (topic === 'symmetry') {
      const point = requiredPoint(points[i], topic), mate = requiredPoint(points[i % 2 ? i - 1 : i + 1], topic)
      // Level paired landmarks toward their own mean; preserve the person's proportions.
      const delta = (mate.y - point.y) / 2 / regions[i].ry
      return Math.max(-.2, Math.min(.2, delta)) * amount
    }
    return amount * (topic === 'philtrum' ? .055 : topic === 'ears' ? (i ? .04 : -.04) : .06)
  })
  return { regions, strengths, mode: topic === 'philtrum' || topic === 'ears' || topic === 'symmetry' ? 'drag' : 'stretch', axis: topic === 'philtrum' || topic === 'symmetry' ? 'y' : 'x' }
}
// A similarity registration uses unaffected eye anchors, not a different crop per edit.
export function featureRegistration(original: FaceLandmarksPayload, edited: FaceLandmarksPayload, originalSize: {width:number;height:number}, editedSize: {width:number;height:number}) {
  const pair = (landmarks: FaceLandmarksPayload, size: typeof originalSize) => [landmarks.anchors.leftPupil, landmarks.anchors.rightPupil].map(p => { const v = requiredPoint(p, 'eye registration'); return {x:v.x*size.width,y:v.y*size.height} })
  const [p,q] = pair(original, originalSize), [u,v] = pair(edited, editedSize)
  const dx=v.x-u.x,dy=v.y-u.y,den=dx*dx+dy*dy
  if (den < 16) throw new Error('The edited image is too small for reliable registration.')
  const a=((q.x-p.x)*dx+(q.y-p.y)*dy)/den,b=((q.y-p.y)*dx-(q.x-p.x)*dy)/den
  return {a,b,c:-b,d:a,e:p.x-a*u.x+b*u.y,f:p.y-b*u.x-a*u.y}
}
function drawNote(ctx: CanvasRenderingContext2D, photo: FeaturePhoto, study: FeatureStudy, progress: number) {
  if (study.topic === 'ears' || !study.annotation || !photo.landmarks || progress <= 0) return
  const { center, eyeWidth } = featureTarget(photo.landmarks, study.topic)
  const x = center.x * photo.image.width, y = center.y * photo.image.height
  const rx = eyeWidth * photo.image.width * (study.topic === 'philtrum' ? .25 : .68)
  const ry = rx * (study.topic === 'philtrum' ? 1 : .58)
  const matrix = ctx.getTransform(), unit = 1 / Math.max(.01, Math.hypot(matrix.a, matrix.b))
  ctx.save()
  applyGlassInk(ctx, unit, 2.5)
  ctx.beginPath()
  const steps = study.annotationStyle === 'guide' ? -1 : Math.ceil(72 * progress)
  for (let i = 0; i <= steps; i++) {
    const theta = i / 72 * Math.PI * 2.08, radius = 1 + .025 * Math.sin(theta * 3)
    const px = x + Math.cos(theta) * rx * radius, py = y + Math.sin(theta) * ry * radius
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py)
  }
  ctx.stroke()
  const a = photo.landmarks.anchors
  const line = (points: Point[]) => {
    ctx.beginPath()
    points.forEach((point, index) => index ? ctx.lineTo(point.x * photo.image.width, point.y * photo.image.height) : ctx.moveTo(point.x * photo.image.width, point.y * photo.image.height))
    ctx.stroke()
  }
  ctx.save(); ctx.globalAlpha *= progress
  const noseBase = philtrumTop(photo.landmarks)
  if (study.topic === 'philtrum' && noseBase && a.upperLip) {
    const bracketX = center.x + eyeWidth * .22, tick = eyeWidth * .07
    line([{ x: bracketX - tick, y: noseBase.y }, { x: bracketX, y: noseBase.y }, { x: bracketX, y: a.upperLip.y }, { x: bracketX - tick, y: a.upperLip.y }])
  } else if (study.topic === 'symmetry' && a.forehead && a.chin) {
    ctx.setLineDash([8 * unit, 8 * unit]); line([a.forehead, a.chin]); ctx.setLineDash([])
    for (const pair of [[a.leftPupil, a.rightPupil], [a.mouthLeft, a.mouthRight]]) if (pair[0] && pair[1]) line([pair[0], pair[1]])
  } else if (study.topic === 'dimorphism' && a.jawLeft && a.chin && a.jawRight) {
    line([a.jawLeft, a.chin, a.jawRight])
  }
  ctx.restore()
  if (study.annotationStyle === 'leader') {
    // Keep the note beside the target, with a single drawn leader rather than a box.
    const side = center.x > .5 ? -1 : 1, endX = x + side * rx * 1.6, endY = y - ry * 1.5
    const t = smoothMotion((progress - .35) / .5)
    drawEditorialLeader(ctx, { x: endX, y: endY }, { x: x + side * rx * 1.15, y: endY }, { x: x + side * rx * .58, y: y - ry * .25 }, t, unit)
  }
  ctx.globalAlpha *= smoothMotion((progress - .55) / .45)
  ctx.font = `400 ${27 * unit}px "SFMono-Regular",Consolas,monospace`; ctx.textAlign = 'left'
  const label = study.annotation.toUpperCase()
  const labelX = (study.annotationStyle === 'leader' ? x + (center.x > .5 ? -1 : 1) * rx * 1.6 : x) - ctx.measureText(label).width / 2
  drawPortraitLabel(ctx,label,labelX,y - ry * (study.annotationStyle === 'leader' ? 1.7 : 1) - 24 * unit,progress)

  ctx.restore()
}

export function featurePlacement(photo: FeaturePhoto, layout: FeatureStudy['layout'], frame: Frame, topic: FeatureStudy['topic'], preciseFocus?: Frame): Frame {
  let focus: Frame | undefined
  if (layout === 'detail' && photo.landmarks) {
    const target = featureTarget(photo.landmarks, topic)
    const span = topic === 'brows' ? 1.35 : topic === 'eyes' ? 1.6 : topic === 'philtrum' ? 1.05 : topic === 'lips' || topic === 'nose' ? 1.6 : topic === 'facial-hair' || topic === 'jaw' ? 1.8 : topic === 'ears' ? 3.8 : 2.3
    const width = target.eyeWidth * photo.image.width * span
    focus = { x: target.center.x * photo.image.width - width / 2, y: target.center.y * photo.image.height - width * .45, width, height: width * .9 }
  }
  const placement = portraitImageFrame(photo.image, frame, layout === 'detail' ? preciseFocus ?? focus : undefined, photo.landmarks, photo.headTop, layout === 'detail' ? 1.42 : 1.8, layout === 'hero' || layout === 'detail')
  return { ...placement, x: frame.x + placement.x, y: frame.y + placement.y }
}

// Geometric edits move original pixels. They never dissolve between two different faces.
export function registeredFeatureWarp(photo: FeaturePhoto, edited: FeaturePhoto, topic: FeatureStudy['topic'], amount: number): PortraitWarp | undefined {
  if (!['lips', 'brows', 'philtrum'].includes(topic) || !amount) return
  if (!photo.landmarks || !edited.landmarks) throw new Error('Before/after photos need detected landmarks.')
  const a = photo.landmarks.anchors, b = edited.landmarks.anchors
  const matrix = featureRegistration(photo.landmarks, edited.landmarks, photo.image, edited.image)
  const keys = topic === 'brows' ? ['leftBrow', 'rightBrow'] as const : topic === 'lips' ? ['upperLip', 'lowerLip'] as const : ['mouthLeft', 'mouthCenter', 'mouthRight'] as const
  const { eyeWidth } = featureTarget(photo.landmarks, topic), ratio = photo.image.width / photo.image.height
  const limit = eyeWidth * .03, strength = Math.min(1, Math.abs(amount))
  const regions = keys.map(key => {
    const point = requiredPoint(a[key], key)
    return { ...point, rx: eyeWidth * (topic === 'brows' ? .5 : .65), ry: eyeWidth * ratio * (topic === 'brows' ? .22 : .3) }
  })
  const shifts = keys.map((key, index) => {
    const target = requiredPoint(b[key], key), x = target.x * edited.image.width, y = target.y * edited.image.height
    const dx = (matrix.a * x + matrix.c * y + matrix.e) / photo.image.width - regions[index].x
    const dy = (matrix.b * x + matrix.d * y + matrix.f) / photo.image.height - regions[index].y
    const distance = Math.hypot(dx, dy / ratio), scale = Math.min(1, limit / Math.max(distance, 1e-9)) * strength
    return { x: dx * scale, y: dy * scale }
  })
  return { regions, shifts, strengths: regions.map(() => 0), mode: 'drag', axis: 'both' }
}

const registeredLayers = new WeakMap<FeaturePhoto['image'], { original: FeaturePhoto['image']; topic: FeatureStudy['topic']; canvas: HTMLCanvasElement }>()
function registeredTextureLayer(photo: FeaturePhoto, edited: FeaturePhoto, topic: FeatureStudy['topic']) {
  const cached = registeredLayers.get(edited.image)
  if (cached?.original === photo.image && cached.topic === topic) return cached.canvas
  const { width, height } = photo.image, canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!, matrix = featureRegistration(photo.landmarks!, edited.landmarks!, photo.image, edited.image)
  ctx.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
  ctx.drawImage(edited.image, 0, 0); ctx.resetTransform()
  // Only the named texture region is copied; hair, skin colour, pose and wardrobe stay original.
  if (topic !== 'whole') {
    const mask = document.createElement('canvas'); mask.width = width; mask.height = height
    const ink = mask.getContext('2d')!, a = photo.landmarks!.anchors
    const { center, eyeWidth } = featureTarget(photo.landmarks!, topic)
    const points = topic === 'eyes' ? [a.leftPupil!, a.rightPupil!] : [center]
    for (const point of points) {
      const rx = eyeWidth * width * (topic === 'eyes' ? .62 : topic === 'freckles' ? 1.15 : 1.1)
      const ry = topic === 'facial-hair' ? Math.abs(a.chin!.y - a.upperLip!.y) * height * .9 : rx * (topic === 'eyes' ? .55 : .6)
      ink.save(); ink.translate(point.x * width, point.y * height); ink.scale(rx, ry)
      const feather = ink.createRadialGradient(0, 0, .58, 0, 0, 1)
      feather.addColorStop(0, '#fff'); feather.addColorStop(.55, '#ffffffc9'); feather.addColorStop(1, '#ffffff00')
      ink.fillStyle = feather; ink.fillRect(-1, -1, 2, 2); ink.restore()
    }
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0)
  }
  registeredLayers.set(edited.image, { original: photo.image, topic, canvas })
  return canvas
}

export function prepareFeatureEdit(photo: FeaturePhoto, edited: FeaturePhoto, topic: FeatureStudy['topic']) {
  if (!['lips', 'brows', 'philtrum'].includes(topic)) registeredTextureLayer(photo, edited, topic)
}

function drawRegisteredEdit(ctx: CanvasRenderingContext2D, photo: FeaturePhoto, edited: FeaturePhoto, topic: FeatureStudy['topic'], amount: number) {
  if (!photo.landmarks || !edited.landmarks) throw new Error('Before/after photos need detected landmarks.')
  const warp = registeredFeatureWarp(photo, edited, topic, amount)
  if (warp) { drawPortraitEffects(ctx, photo.image, { landmarks: photo.landmarks, warp }); return warp }
  ctx.drawImage(photo.image, 0, 0)
  ctx.save(); ctx.globalAlpha *= Math.min(1, Math.abs(amount)) * (topic === 'freckles' ? .7 : 1)
  ctx.drawImage(registeredTextureLayer(photo, edited, topic), 0, 0); ctx.restore()
}

export function featureWipeProgress(timeMs: number, durationMs: number, reduced = false) {
  return reduced ? .5 : smoothMotion((timeMs / Math.max(1, durationMs) - .16) / .56)
}

export const featureCardOpacity = (index: number, timeMs: number, reduced = false) => reduced ? 1 : smoothMotion((timeMs - 280 - (index - 1) * 45) / 240)

export const featureClipFrame = (layout: FeatureStudy['layout'], frame: Frame): Frame => layout === 'hero' || layout === 'detail' ? { x: 0, y: 0, width: videoSize.width, height: frame.y + frame.height } : frame

function editForCell(study: FeatureStudy, index: number) {
  const single = study.layout === 'hero' || study.layout === 'detail'
  return index === (single ? 0 : 1) ? study.edit : 0
}

function drawGuessSpinner(ctx: CanvasRenderingContext2D, y: number, timeMs: number, opacity: number, reduced: boolean) {
  if (opacity <= 0) return
  const active = reduced ? 0 : Math.floor(timeMs / 78) % 12
  ctx.save()
  ctx.translate(videoSize.width / 2, y)
  ctx.strokeStyle = '#30363b'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  for (let index = 0; index < 12; index++) {
    const angle = index * Math.PI / 6
    const age = (active - index + 12) % 12
    ctx.globalAlpha = opacity * (.12 + .72 * (1 - age / 11))
    ctx.beginPath()
    ctx.moveTo(Math.cos(angle) * 22, Math.sin(angle) * 22)
    ctx.lineTo(Math.cos(angle) * 37, Math.sin(angle) * 37)
    ctx.stroke()
  }
  ctx.restore()
}

function drawFeatureOpening(ctx: CanvasRenderingContext2D, study: FeatureStudy, photos: FeaturePhoto[], localMs: number, durationMs: number, reduced: boolean, clockMs: number, comparisonClock: { timeMs: number; durationMs: number; matteProgress?: number }) {
  const { width } = videoSize
  const smile = study.opening === 'smile-choice'
  const jawWidth = study.opening === 'jaw-width-choice'
  const reveal = study.phase === 'reveal' ? reduced ? 1 : smoothMotion(localMs / Math.min(850, durationMs)) : 0
  const inset = width * .045 // Match the TikTok feed description inset on both sides.
  const gap = 16
  const cardWidth = (width - inset * 2 - gap) / 2
  const y = smile ? 635 : 520
  const height = 1360
  const maskY = y + 1035
  const alignment = photos.map(({ landmarks }) => {
    const a = landmarks?.anchors
    const mouth = a?.mouthCenter ?? { x: .5, y: .58 }
    const lipTop = Math.min(a?.upperLip?.y ?? mouth.y - .014, a?.mouthLeft?.y ?? mouth.y, a?.mouthRight?.y ?? mouth.y)
    const eyes = a?.leftPupil && a.rightPupil ? (a.leftPupil.y + a.rightPupil.y) / 2 : lipTop - .115
    return { mouth, lipTop, gap: Math.max(.06, lipTop - eyes) }
  })
  const eyeToLip = Math.max(420, ...photos.map((photo, index) => alignment[index].gap * photo.image.height * cardWidth / photo.image.width))
  const pair = photos.map((_, index) => ({ x: inset + index * (cardWidth + gap), y, width: cardWidth, height }))
  const frames = comparisonFrames(comparisonClock.timeMs, comparisonClock.durationMs, reduced, pair, { x: 0, y, width, height: videoSize.height - y }, study.motion)
  const expansion = Math.max(...frames.map(frame => (frame.width - cardWidth) / (width - cardWidth)))
  photos.forEach((photo, index) => {
    const { x, y, width: cardWidth, height } = frames[index]
    const maskY = y + height * (1035 / 1360)
    const { mouth, lipTop, gap: anchorGap } = alignment[index]
    const a = photo.landmarks?.anchors
    const chin = a?.chin ?? { x: .5, y: .72 }
    const focus = smile ? mouth : chin
    const faceWidth = a?.leftCheek && a.rightCheek ? Math.abs(a.rightCheek.x - a.leftCheek.x) : .51
    const zoom = jawWidth ? 1.04 + reveal * .06 : 1.62 - reveal * .56
    const scale = smile ? eyeToLip / (anchorGap * photo.image.height)
      : Math.max(cardWidth / photo.image.width, cardWidth * .72 * zoom / Math.max(.24, faceWidth) / photo.image.width)
    const w = photo.image.width * scale, h = photo.image.height * scale
    const px = Math.max(x + cardWidth - w, Math.min(x, x + cardWidth / 2 - focus.x * w))
    const py = smile ? maskY + 18 - lipTop * h : y + height * (.72 - reveal * .07) - focus.y * h
    const cover = maskY + (y + height - maskY) * reveal
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x, y, cardWidth, height, 26)
    ctx.clip()
    ctx.fillStyle = '#fff'
    ctx.fillRect(x, y, cardWidth, height)
    if (!smile && !jawWidth && reveal < 1) {
      const cropTop = py + (mouth.y - (chin.y - mouth.y) * .75) * h
      ctx.beginPath()
      ctx.rect(x, Math.max(y, cropTop + (y - cropTop) * reveal), cardWidth, height)
      ctx.clip()
    }
    const warp: PortraitWarp | undefined = jawWidth && a?.jawLeft && a.jawRight ? {
      regions: [a.jawLeft,a.jawRight].map(point=>({...point,rx:.16,ry:.085})),
      strengths: index ? [-.11-reveal*.07,.11+reveal*.07] : [0,0], mode:'drag',axis:'x',
    } : undefined
    const drawImage = (target: CanvasRenderingContext2D, image: FeaturePhoto['image']) => {
      if (warp && index && photo.landmarks) drawPortraitEffects(target,image,{landmarks:photo.landmarks,warp})
      else target.drawImage(image,0,0)
    }
    ctx.save(); ctx.translate(px,py); ctx.scale(scale,scale)
    const matte = Math.max(comparisonClock.matteProgress ?? 0, (cardWidth - pair[index].width) / (width - pair[index].width))
    if (photo.original) drawBackgroundRoll(ctx,photo.image.width,photo.image.height,matte,target=>drawImage(target,photo.original!),target=>drawImage(target,photo.image))
    else drawImage(ctx,photo.image)
    const jawline = photo.landmarks?.contours?.jawline
    if (warp && jawline && reveal > 0) {
      const unit=1/scale; applyGlassInk(ctx,unit,2.5); ctx.setLineDash([unit,5*unit])
      ctx.beginPath()
      for (const [i,point] of jawline.map(point=>warpDestinationPoint(point,warp)).slice(0,Math.max(2,Math.ceil(jawline.length*reveal))).entries()) {
        const x=point.x*photo.image.width,y=point.y*photo.image.height
        if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)
      }
      ctx.stroke()
    }
    ctx.restore()
    const bottom = ctx.createLinearGradient(0, y + height - 135, 0, y + height)
    bottom.addColorStop(0, '#ffffff00')
    bottom.addColorStop(1, '#fff')
    ctx.fillStyle = bottom
    ctx.fillRect(x, y + height - 135, cardWidth, 135)
    if (smile && reveal < 1) {
      const mask = ctx.createLinearGradient(0, cover - 12, 0, cover)
      mask.addColorStop(0, '#ffffff00')
      mask.addColorStop(1, '#fff')
      ctx.fillStyle = mask
      ctx.fillRect(x, cover - 12, cardWidth, Math.max(12, y + height - cover + 12))
    }
    if (smile && study.phase === 'clue') {
      const nose = a?.noseTip ?? { x: mouth.x, y: mouth.y - .045 }
      const edge = a?.mouthLeft ?? { x: mouth.x - .07, y: mouth.y }
      const target = { x: px + (nose.x + edge.x) / 2 * w, y: py + (nose.y * .7 + edge.y * .3) * h }
      const progress = reduced ? 1 : smoothMotion(localMs / 480)
      applyGlassInk(ctx, 1, 3.5)
      drawEditorialLeader(ctx, { x: target.x - 85, y: target.y - 46 }, { x: target.x - 48, y: target.y - 46 }, target, progress, 1)
    }
    ctx.restore()
    if (smile || jawWidth) {
      ctx.save()
      ctx.fillStyle = '#6b7280'
      ctx.font = '34px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(index ? 'B' : 'A', x + cardWidth / 2, (jawWidth ? y + height : cover) + 49)
      ctx.restore()
    }
  })
  if (jawWidth) drawGuessSpinner(ctx, y + height + 135, clockMs, (1 - smoothMotion(reveal * 4)) * (1 - expansion), reduced)
  if (smile) drawGuessSpinner(ctx, maskY + 175, clockMs, (1 - smoothMotion(reveal * 4)) * (1 - expansion), reduced)
}

export function drawFeatureStudy(ctx: CanvasRenderingContext2D, study: FeatureStudy, photo: FeaturePhoto, variants: FeaturePhoto[], localMs: number, _durationMs: number, reduced: boolean, previous?: FeatureStudy, activity?: PortraitActivity, instrument?: PortraitInstrument, clockMs = localMs, captureMetric?: (ctx: CanvasRenderingContext2D, width: number, height: number, warp?: ReturnType<typeof featureWarp>) => void, comparisonClock: { timeMs: number; durationMs: number; previousFrame?: Frame; matteProgress?: number; revealMs?: number } = { timeMs: localMs, durationMs: _durationMs }) {
  const dark = isDarkVideoContext(ctx), ink = dark ? '#f2eee5' : '#171717', panel = dark ? '#1b1b1b' : '#f5f4f1'
  ctx = originalVideoContext(ctx)
  if (study.layout === 'evidence') {
    if (comparisonClock.revealMs !== undefined) {
      const age = localMs - comparisonClock.revealMs
      const progress = reduced ? Number(age >= 0) : smoothMotion(age / 520)
      const inset = 32, gap = 18, bottom = 2110
      const cardWidth = (videoSize.width - inset * 2 - gap) / 2
      const pair = [0, 1].map(index => ({ x: inset + index * (cardWidth + gap), y: 620, width: cardWidth, height: bottom - 620 }))
      const hero = { x: inset, y: 600, width: videoSize.width - inset * 2, height: bottom - 600 }
      const beforeFrame = featureFrameAt(hero, pair[0], (reduced ? progress : age / 520) * 560)
      for (const [index, item] of variants.entries()) {
        if (index > 1 || index === 1 && !progress) continue
        const frame = index === 0 ? beforeFrame : pair[1]
        const source = item.original ?? item.image
        const anchors = item.landmarks?.anchors
        const eyes = anchors?.leftPupil && anchors.rightPupil
          ? { x: (anchors.leftPupil.x + anchors.rightPupil.x) / 2, y: (anchors.leftPupil.y + anchors.rightPupil.y) / 2 }
          : undefined
        const zoom = eyes ? 1 + .13 * (index === 0 ? progress : 1) : 1
        const scale = Math.max(frame.width / source.width, frame.height / source.height) * zoom
        const w = source.width * scale, h = source.height * scale
        const x = frame.x + Math.min(0, Math.max(frame.width - w, frame.width / 2 - w * (eyes?.x ?? .5)))
        const y = frame.y + Math.min(0, Math.max(frame.height - h, eyes ? frame.height * .41 - h * eyes.y : (frame.height - h) / 2))
        ctx.save()
        if (index === 1) {
          const revealLeft = Math.max(frame.x, beforeFrame.x + beforeFrame.width + gap)
          ctx.globalAlpha *= progress
          ctx.beginPath(); ctx.rect(revealLeft, frame.y, Math.max(0, frame.x + frame.width - revealLeft), frame.height); ctx.clip()
        }
        ctx.beginPath(); ctx.roundRect(frame.x, frame.y, frame.width, frame.height, 24); ctx.clip()
        ctx.drawImage(source, x, y, w, h)
        const label = study.labels?.[index]
        if (label) {
          ctx.font = '500 31px "Mogging Share",Arial,sans-serif'
          const labelX = frame.x + 24, labelY = frame.y + 26
          ctx.fillStyle = '#fffffff0'
          ctx.beginPath(); ctx.roundRect(labelX, labelY, ctx.measureText(label).width + 36, 52, 26); ctx.fill()
          ctx.fillStyle = '#252525'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
          ctx.fillText(label, labelX + 18, labelY + 26)
        }
        ctx.restore()
      }
      return
    }
    const frames = comparisonFrames(comparisonClock.timeMs, comparisonClock.durationMs, reduced)
    frames.forEach((frame, index) => {
      const item = variants[index]
      if (!item) throw new Error('Prepare both before-and-after portraits before rendering their comparison.')
      const scale = Math.max(frame.width / item.image.width, frame.height / item.image.height)
      const w = item.image.width * scale, h = item.image.height * scale
      const expansion = Math.max(0, Math.min(1, (frame.width - featureFrames('compare')[index].width) / (videoSize.width - featureFrames('compare')[index].width)))
      ctx.save(); ctx.beginPath(); ctx.roundRect(frame.x, frame.y, frame.width, frame.height, 22); ctx.clip()
      ctx.translate(frame.x + (frame.width - w) / 2, frame.y + (frame.height - h) / 2); ctx.scale(scale, scale)
      drawBackgroundRoll(ctx,item.image.width,item.image.height,Math.max(expansion,comparisonClock.matteProgress ?? 0),target=>target.drawImage(item.original ?? item.image,0,0),target=>target.drawImage(item.image,0,0))
      ctx.restore()
      ctx.save(); ctx.fillStyle='#70757b'; ctx.font='400 23px "Mogging Share",Arial,sans-serif'; ctx.textAlign='center'
      ctx.fillText(study.labels?.[index] ?? (index ? 'After' : 'Before'), frame.x + frame.width / 2, Math.min(frame.y + frame.height + 38, videoSize.height - 100))
      ctx.restore()
    })
    const fade = ctx.createLinearGradient(0, videoSize.height - 330, 0, videoSize.height)
    fade.addColorStop(0, '#ffffff00'); fade.addColorStop(1, '#fff')
    ctx.fillStyle=fade; ctx.fillRect(0,videoSize.height-330,videoSize.width,330)
    ctx.save(); ctx.fillStyle='#70757b'; ctx.font='400 19px "Mogging Share",Arial,sans-serif'; ctx.textAlign='center'
    if (study.footnote) ctx.fillText(study.footnote,videoSize.width/2,videoSize.height-65)
    ctx.restore()
    return
  }
  if (study.opening && variants[0]) {
    drawFeatureOpening(ctx, study, [photo, variants[0]], localMs, _durationMs, reduced, clockMs, comparisonClock)
    return
  }
  const cursorDetail=Boolean(study.editorial && study.layout==='detail' && study.comparison!=='wipe' && !study.edit && variants[1] && study.images[1]!==study.images[0] && variants[1].landmarks && photo.landmarks && _durationMs>=2200)
  const guideElapsed=cursorDetail?localMs-editorialCursorTiming(1460,0,undefined,reduced).clickAtMs:localMs-400
  const comparing = study.layout === 'compare'
  const frames = comparing ? comparisonFrames(comparisonClock.timeMs, comparisonClock.durationMs, reduced) : featureFrames(study.layout)
  const prior = comparisonClock.previousFrame ? [comparisonClock.previousFrame] : comparing && (!previous || previous.layout === 'compare') ? frames : featureFrames(previous?.layout ?? study.layout)
  const progress = reduced ? 1 : smoothMotion(localMs / 560)
  const textureEdit = study.editMode === 'photo'
  const wipe = study.comparison==='wipe'
  const wipeProgress = featureWipeProgress(comparisonClock.timeMs,comparisonClock.durationMs,reduced)
  const continuedWipe = wipe && comparisonClock.timeMs>localMs
  const count = Math.max(frames.length, prior.length)
  let primary: Frame | undefined
  for (let index = 0; index < count; index++) {
    const target = frames[index] ?? prior[index], from = prior[index] ?? frames[index]
    const frame = featureFrameAt(from, target, localMs, reduced)
    const item = index > 1 ? variants[index - 1] ?? photo : photo
    const focusFor = (overlay: PortraitActivity['focus']) => overlay ? portraitDetailRegion(overlay.primitives.flatMap(p=>p.kind==='polyline'?p.pixelPoints:[]),item.image.width,item.image.height) ?? undefined : undefined
    let before = featurePlacement(item, index >= prior.length ? 'hero' : previous?.layout ?? (study.layout === 'detail' ? 'hero' : study.layout), from, previous?.topic ?? study.topic, index===0?focusFor(activity?.previousFocus):undefined)
    let after = featurePlacement(item, index >= frames.length ? 'hero' : study.layout, target, study.topic, index===0?focusFor(activity?.focus):undefined)
    if (index === 0 && !reduced) {
      before = featureCameraFrame(before, previous?.motion, 1)
      after = featureCameraFrame(after, study.motion, wipe ? comparisonClock.timeMs/comparisonClock.durationMs : localMs/_durationMs)
    }
    const placement = continuedWipe || comparing && (!previous || previous.layout === 'compare') ? after : featureFrameAt(before, after, localMs, reduced)
    if (index === 0) primary = placement
    const initialEdit = previous ? editForCell(previous, index) : 0
    const development = reduced || study.comparison === 'wipe' || textureEdit && study.layout === 'compare' ? 1 : smoothMotion(localMs / Math.max(700, _durationMs * .78))
    const edit = initialEdit + (editForCell(study, index) - initialEdit) * development
    ctx.save()
    // The persistent first portrait is always opaque. Only arriving/departing cards fade.
    ctx.globalAlpha *= index >= frames.length ? 1 - (reduced ? 1 : smoothMotion(localMs / 240)) : index >= prior.length ? featureCardOpacity(index, localMs, reduced) : 1
    const clip = featureFrameAt(featureClipFrame(previous?.layout ?? study.layout, from), featureClipFrame(study.layout, target), localMs, reduced)
    const radius = 22 * ((prior.length > 1 ? 1 - progress : 0) + (frames.length > 1 ? progress : 0))
    ctx.beginPath(); ctx.roundRect(clip.x, clip.y, clip.width, clip.height, radius); ctx.clip()
    if (frames.length > 1) { ctx.fillStyle = comparing ? '#fff' : panel; ctx.fillRect(frame.x, frame.y, frame.width, frame.height) }
    ctx.translate(placement.x, placement.y); ctx.scale(placement.width / item.image.width, placement.height / item.image.height)
    let registeredWarp: PortraitWarp | undefined
    const drawEdit = (target = ctx, raw = false) => {
      const source = raw && photo.original ? { ...photo, image: photo.original } : photo
      const variant = variants[0] && raw && variants[0].original ? { ...variants[0], image: variants[0].original } : variants[0]
      if (textureEdit) {
        if (edit && variant) registeredWarp = drawRegisteredEdit(target, source, variant, study.topic, edit)
        else target.drawImage(raw ? item.original ?? item.image : item.image, 0, 0)
      } else if (edit && item.landmarks) drawPortraitEffects(target, raw ? item.original ?? item.image : item.image, { landmarks: item.landmarks, warp: featureWarp(item.landmarks, study.topic, edit, study.adjustment) })
      else target.drawImage(raw ? item.original ?? item.image : item.image, 0, 0)
    }
    if ((comparing || comparisonClock.previousFrame) && photo.original) {
      const base = featureFrames('compare')[0].width
      const expansion = Math.max(0, Math.min(1, ((comparing ? frame.width : comparisonClock.previousFrame!.width) - base) / (videoSize.width - base)))
      drawBackgroundRoll(ctx,item.image.width,item.image.height,Math.max(comparisonClock.matteProgress ?? 0,comparing ? expansion : Math.max(expansion,progress)),target=>drawEdit(target,true),target=>drawEdit(target))
    } else if (study.comparison === 'wipe' && edit) {
      ctx.drawImage(item.image, 0, 0)
      const reveal = study.editorial && reduced ? 1 : wipeProgress
      if (study.editorial && typeof document !== 'undefined') {
        drawEditorialFeatheredReveal(ctx, item.image.width, item.image.height, reveal, drawEdit)
      } else {
        const split = item.image.width * reveal
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, split, item.image.height); ctx.clip(); drawEdit(); ctx.restore()
        const unit = item.image.width / placement.width
        ctx.save(); applyGlassInk(ctx, unit, 2)
        ctx.beginPath(); ctx.moveTo(split, 0); ctx.lineTo(split, item.image.height); ctx.stroke(); ctx.restore()
      }
    } else drawEdit()
    if(index===0 && study.tool && edit && study.editMode==='photo' && variants[0] && item.landmarks){
      const target=featureTarget(item.landmarks,study.topic),w=target.eyeWidth*item.image.width
      drawEditorialTool(ctx,{x:target.center.x*item.image.width-w,y:target.center.y*item.image.height-w*.35,width:w*2,height:w*.7},localMs/1400,study.tool,reduced)
    }
    if (!textureEdit && study.topic === 'freckles' && item.landmarks) drawNaturalFreckles(ctx,item.image,item.landmarks,Math.max(0,edit))
    const showGuides = (!cursorDetail || guideElapsed>=0) && (study.guidesDuringEdit || !study.editorial || study.comparison !== 'wipe' || reduced || localMs >= _durationMs * .72)
    if (index===0 && instrument && showGuides) {
      if (instrument.particles!=='none' || instrument.trails) drawPortraitParticles(ctx,item.image,instrument,cursorDetail?guideElapsed:localMs,reduced)
      if(!activity) drawPortraitInstruments(ctx,item.landmarks,item.image.width,item.image.height,instrument,cursorDetail?guideElapsed:localMs,reduced)
    }
    if (index === 0 && activity && showGuides) {
      const warp=registeredWarp ?? (!textureEdit && item.landmarks ? featureWarp(item.landmarks,study.topic,edit,study.adjustment) : undefined)
      drawPortraitActivity(ctx,cursorDetail?{...activity,phase:Math.min(activity.phase,smoothMotion(guideElapsed/650)),blend:Math.min(activity.blend,smoothMotion(guideElapsed/650)),labelPhase:Math.min(activity.labelPhase,smoothMotion(guideElapsed/650)),elapsedMs:Math.min(activity.elapsedMs,guideElapsed)}:activity,item.image.width,item.image.height,warp)
      if (frames.length === 1 && prior.length === 1) captureMetric?.(ctx, item.image.width, item.image.height, warp)
    }
    if (showGuides && !activity && !instrumentOwnsGuides(instrument) && index === 0 && frames.length === 1) drawNote(ctx, photo, study, reduced ? 1 : smoothMotion(guideElapsed / 650))
    ctx.restore()
    const fadeOpacity = (prior.length === 1 ? 1 - progress : 0) + (frames.length === 1 ? progress : 0)
    if (index === 0 && fadeOpacity > 0) {
      ctx.save(); ctx.globalAlpha *= fadeOpacity; ctx.translate(0, frame.y)
      drawPortraitColorExtension(ctx, videoSize.width, frame.height, placement.y + placement.height - frame.y)
      drawPortraitProgressiveBlur(ctx, videoSize.width, frame.height, .12)
      const fade = ctx.createLinearGradient(0, frame.height * .88, 0, frame.height)
      for (let step = 0; step <= 24; step++) fade.addColorStop(step / 24, `rgba(${dark ? '17,17,17' : '255,255,255'},${smoothMotion(step / 24)})`)
      ctx.fillStyle = fade; ctx.fillRect(0, frame.height * .88, videoSize.width, frame.height * .12 + 1); ctx.restore()
    }
    if (frames.length > 1 && index < frames.length) {
      ctx.save(); ctx.fillStyle = ink; ctx.font = '400 25px "Mogging Share",Arial,sans-serif'; ctx.textAlign = 'left'; ctx.globalAlpha *= index >= prior.length ? featureCardOpacity(index, localMs, reduced) : progress
      ctx.fillText(study.labels?.[index] ?? (study.editorial && study.layout === 'compare' ? ['A', 'B'][index] : undefined) ?? ['Original', 'Edited illustration', 'Three-quarter', 'Profile'][index], target.x, target.y + target.height + 34)
      ctx.restore()
    }
  }
  if (comparing) {
    const baseWidth = featureFrames('compare')[0].width
    const expansion = Math.max(...frames.map(frame => (frame.width - baseWidth) / (videoSize.width - baseWidth)))
    ctx.save(); ctx.globalAlpha *= expansion
    const fade = ctx.createLinearGradient(0, videoSize.height - 330, 0, videoSize.height)
    fade.addColorStop(0, '#ffffff00'); fade.addColorStop(1, '#fff')
    ctx.fillStyle = fade; ctx.fillRect(0, videoSize.height - 330, videoSize.width, 330); ctx.restore()
  }
  if (study.editorial && study.comparison === 'wipe' && study.edit && !reduced && !comparing && primary) {
    const amount = wipeProgress
    const frame = featureClipFrame(study.layout,frames[0])
    const focus = photo.landmarks ? featureTarget(photo.landmarks,study.topic).center : {y:.48}
    const y=Math.min(frame.y+frame.height-160,Math.max(videoSize.height*.30,primary.y+primary.height*focus.y))
    drawEditorialWipeHandle(ctx,{x:frame.x,y:frame.y,w:frame.width,h:frame.height*.89},primary.x+primary.width*amount,y,amount)
  }
  const reference = variants[1]
  if (cursorDetail && reference && reference.landmarks && photo.landmarks && primary) {
    const entry = reduced ? 1 : smoothMotion((localMs - 460) / 460)
    const exit = reduced ? 1 : smoothMotion((_durationMs - localMs) / 280)
    const card = { x: videoContent.inset, y: videoSize.height * .56, w: videoSize.width * .20, h: videoSize.width * .145 }
    const focus = featureTarget(reference.landmarks, study.topic).center
    ctx.save()
    ctx.globalAlpha *= exit
    drawEditorialInset(ctx, card, entry, frame => {
      const image = reference.image
      const width = Math.min(image.width * .62, image.height * frame.w / frame.h), height = width * frame.h / frame.w
      const x = Math.max(0, Math.min(image.width - width, focus.x * image.width - width / 2))
      const y = Math.max(0, Math.min(image.height - height, focus.y * image.height - height / 2))
      ctx.drawImage(image, x, y, width, height, frame.x, frame.y, frame.w, frame.h)
    })
    const main = featureTarget(photo.landmarks, study.topic).center
    const target = { x: primary.x + main.x * primary.width, y: primary.y + main.y * primary.height }
    const origin = { x: card.x + card.w, y: card.y + card.h / 2 }
    const cursor=sampleEditorialCursor(localMs,origin,target,1460,0,undefined,reduced)
    if(cursor.clicked)drawEditorialLocator(ctx,target,{x:target.x-origin.x,y:target.y-origin.y},reduced?1:smoothMotion(cursor.effectMs/440))
    drawEditorialCursor(ctx,cursor)
    ctx.restore()
  }
  if ((study.edit || frames.length > 1) && study.footnote !== '' && !(study.editorial && study.layout === 'compare' && study.footnote === undefined)) {
    ctx.save(); ctx.fillStyle = ink; ctx.globalAlpha = .55
    ctx.font = '400 23px "Mogging Share",Arial,sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(study.footnote ?? 'Illustrative edit · compare with the original', videoSize.width / 2, 2080); ctx.restore()
  }
}

export function featureCameraFrame(frame: Frame, motion: FeatureStudy['motion'], progress: number): Frame {
  const t = smoothMotion(progress)
  const pan = motion === 'pan-left' ? -1 : motion === 'pan-right' ? 1 : 0
  const vertical = motion === 'pan-up' ? -frame.height * .02 * (2 * t - 1) : 0
  const scale = motion === 'push' ? 1 + .065 * t : motion === 'pull' ? 1 + .065 * (1 - t) : pan || motion === 'pan-up' ? 1.055 : 1
  return { x: frame.x - frame.width * (scale - 1) / 2 + pan * frame.width * .02 * (2 * t - 1), y: frame.y - frame.height * (scale - 1) / 2 + vertical, width: frame.width * scale, height: frame.height * scale }
}

