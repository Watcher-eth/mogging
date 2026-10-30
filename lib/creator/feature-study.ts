import { drawPortraitInstruments, drawPortraitParticles, instrumentOwnsGuides, type PortraitInstrument } from './portrait-instruments'
import { z } from 'zod'
import { measuredProportionWarp, drawNaturalFreckles } from './portrait-detail-edits'
import { drawPortraitActivity, drawPortraitLabel, type PortraitActivity } from './portrait-program'
import { visualFeatures } from './video-semantics'
import { smoothMotion, videoSize } from './video-layout'
import { originalVideoContext, isDarkVideoContext } from './video-theme'
import { drawPortraitColorExtension, drawPortraitProgressiveBlur } from './report-portrait'
import { portraitImageFrame, portraitDetailRegion } from './video-portrait'
import { drawPortraitEffects, type PortraitWarp } from './video-portrait-effects'
import type { FaceLandmarksPayload } from '@/lib/analysis/landmarks'

export const featureTopics = ['philtrum', 'freckles', 'facial-hair', 'ears', 'symmetry', 'dimorphism'] as const
export type FeatureTopic = typeof featureTopics[number]
export const featureTopicLabels: Record<FeatureTopic, string> = { philtrum: 'Philtrum length', freckles: 'Freckles', 'facial-hair': 'Facial hair', ears: 'Ear prominence', symmetry: 'Facial symmetry', dimorphism: 'Facial shape' }
export const featureStudySchema = z.object({
  topic: z.enum(visualFeatures), layout: z.enum(['hero', 'detail', 'compare', 'grid']),
  motion: z.enum(['hold', 'push', 'pull']).optional(),
  annotationStyle: z.enum(['circle', 'guide', 'leader']).optional(),
  comparison: z.enum(['blend', 'wipe']).optional(),
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
export type FeaturePhoto = { image: HTMLCanvasElement | HTMLImageElement; landmarks: FaceLandmarksPayload | null | undefined; headTop?: number }

const hero = { x: 60, y: 500, width: 960, height: videoSize.height - 500 }
export function featureFrames(layout: FeatureStudy['layout']): Frame[] {
  if (layout === 'compare') return [0, 1].map(i => ({ x: 64 + i * 486, y: 660, width: 466, height: 1130 }))
  if (layout === 'grid') return [0, 1, 2, 3].map(i => ({ x: 64 + i % 2 * 486, y: 550 + Math.floor(i / 2) * 716, width: 466, height: 686 }))
  return [{ ...hero }]
}
export function featureFrameAt(from: Frame, to: Frame, timeMs: number, reduced = false): Frame {
  if (reduced || timeMs >= 560) return { ...to }
  if (timeMs <= 0) return { ...from }
  const t = smoothMotion(timeMs / 560)
  return Object.fromEntries(Object.entries(to).map(([key, value]) => [key, from[key as keyof Frame] + (value - from[key as keyof Frame]) * t])) as Frame
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
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 2.5 * unit; ctx.lineCap = 'round'
  ctx.shadowColor = '#0009'; ctx.shadowBlur = 3 * unit
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
    ctx.beginPath(); ctx.moveTo(x + side * rx * .7, y - ry * .5)
    ctx.lineTo(x + side * rx * .7 + (endX - x - side * rx * .7) * t, y - ry * .5 + (endY - y + ry * .5) * t); ctx.stroke()
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
  const placement = portraitImageFrame(photo.image, frame, layout === 'detail' ? preciseFocus ?? focus : undefined, photo.landmarks, photo.headTop, layout === 'detail' ? 3.6 : 1.8, layout === 'hero' || layout === 'detail')
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

export function drawFeatureStudy(ctx: CanvasRenderingContext2D, study: FeatureStudy, photo: FeaturePhoto, variants: FeaturePhoto[], localMs: number, _durationMs: number, reduced: boolean, previous?: FeatureStudy, activity?: PortraitActivity, instrument?: PortraitInstrument) {
  const dark = isDarkVideoContext(ctx), ink = dark ? '#f2eee5' : '#171717', panel = dark ? '#1b1b1b' : '#f5f4f1'
  ctx = originalVideoContext(ctx)
  const frames = featureFrames(study.layout), prior = featureFrames(previous?.layout ?? study.layout)
  const progress = reduced ? 1 : smoothMotion(localMs / 560)
  const textureEdit = study.editMode === 'photo'
  const count = Math.max(frames.length, prior.length)
  for (let index = 0; index < count; index++) {
    const target = frames[index] ?? prior[index], from = prior[index] ?? frames[index]
    const frame = featureFrameAt(from, target, localMs, reduced)
    const item = index > 1 ? variants[index - 1] ?? photo : photo
    const focusFor = (overlay: PortraitActivity['focus']) => overlay ? portraitDetailRegion(overlay.primitives.flatMap(p=>p.kind==='polyline'?p.pixelPoints:[]),item.image.width,item.image.height) ?? undefined : undefined
    let before = featurePlacement(item, index >= prior.length ? 'hero' : previous?.layout ?? (study.layout === 'detail' ? 'hero' : study.layout), from, previous?.topic ?? study.topic, index===0?focusFor(activity?.previousFocus):undefined)
    let after = featurePlacement(item, index >= frames.length ? 'hero' : study.layout, target, study.topic, index===0?focusFor(activity?.focus):undefined)
    if (index === 0 && !reduced) {
      before = featureCameraFrame(before, previous?.motion, 1)
      after = featureCameraFrame(after, study.motion, localMs / _durationMs)
    }
    const placement = featureFrameAt(before, after, localMs, reduced)
    const initialEdit = previous ? editForCell(previous, index) : 0
    const development = reduced || study.comparison === 'wipe' || textureEdit && study.layout === 'compare' ? 1 : smoothMotion(localMs / Math.max(700, _durationMs * .78))
    const edit = initialEdit + (editForCell(study, index) - initialEdit) * development
    ctx.save()
    // The persistent first portrait is always opaque. Only arriving/departing cards fade.
    ctx.globalAlpha *= index >= frames.length ? 1 - (reduced ? 1 : smoothMotion(localMs / 240)) : index >= prior.length ? featureCardOpacity(index, localMs, reduced) : 1
    const clip = featureFrameAt(featureClipFrame(previous?.layout ?? study.layout, from), featureClipFrame(study.layout, target), localMs, reduced)
    const radius = 22 * ((prior.length > 1 ? 1 - progress : 0) + (frames.length > 1 ? progress : 0))
    ctx.beginPath(); ctx.roundRect(clip.x, clip.y, clip.width, clip.height, radius); ctx.clip()
    if (frames.length > 1) { ctx.fillStyle = panel; ctx.fillRect(frame.x, frame.y, frame.width, frame.height) }
    ctx.translate(placement.x, placement.y); ctx.scale(placement.width / item.image.width, placement.height / item.image.height)
    let registeredWarp: PortraitWarp | undefined
    const drawEdit = () => {
      if (textureEdit) {
        if (edit && variants[0]) registeredWarp = drawRegisteredEdit(ctx, photo, variants[0], study.topic, edit)
        else ctx.drawImage(item.image, 0, 0)
      } else if (edit && item.landmarks) drawPortraitEffects(ctx, item.image, { landmarks: item.landmarks, warp: featureWarp(item.landmarks, study.topic, edit, study.adjustment) })
      else ctx.drawImage(item.image, 0, 0)
    }
    if (study.comparison === 'wipe' && edit) {
      ctx.drawImage(item.image, 0, 0)
      const split = item.image.width * featureWipeProgress(localMs, _durationMs, reduced)
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, split, item.image.height); ctx.clip(); drawEdit(); ctx.restore()
      const unit = item.image.width / placement.width
      ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * unit; ctx.shadowColor = '#0008'; ctx.shadowBlur = 3 * unit
      ctx.beginPath(); ctx.moveTo(split, 0); ctx.lineTo(split, item.image.height); ctx.stroke(); ctx.restore()
    } else drawEdit()
    if (!textureEdit && study.topic === 'freckles' && item.landmarks) drawNaturalFreckles(ctx,item.image,item.landmarks,Math.max(0,edit))
    if (index===0 && instrument) {
      if (instrument.particles!=='none' || instrument.trails) drawPortraitParticles(ctx,item.image,instrument,localMs,reduced)
      drawPortraitInstruments(ctx,item.landmarks,item.image.width,item.image.height,instrument,localMs,reduced)
    }
    if (index === 0 && activity && !instrumentOwnsGuides(instrument)) drawPortraitActivity(ctx, activity, item.image.width, item.image.height, registeredWarp ?? (!textureEdit && item.landmarks ? featureWarp(item.landmarks, study.topic, edit, study.adjustment) : undefined))
    if (!activity && !instrumentOwnsGuides(instrument) && index === 0 && frames.length === 1) drawNote(ctx, photo, study, reduced ? 1 : smoothMotion((localMs - 400) / 650))
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
      ctx.fillText(study.labels?.[index] ?? ['Original', 'Edited illustration', 'Three-quarter', 'Profile'][index], target.x, target.y + target.height + 34)
      ctx.restore()
    }
  }
  if ((study.edit || frames.length > 1) && study.footnote !== '') {
    ctx.save(); ctx.fillStyle = ink; ctx.globalAlpha = .55
    ctx.font = '400 23px "Mogging Share",Arial,sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(study.footnote ?? 'Illustrative edit · compare with the original', videoSize.width / 2, 2080); ctx.restore()
  }
}

export function featureCameraFrame(frame: Frame, motion: FeatureStudy['motion'], progress: number): Frame {
  const t = smoothMotion(progress)
  const scale = motion === 'push' ? 1 + .035 * t : motion === 'pull' ? 1 + .035 * (1 - t) : 1
  return { x: frame.x - frame.width * (scale - 1) / 2, y: frame.y - frame.height * (scale - 1) / 2, width: frame.width * scale, height: frame.height * scale }
}

