import { z } from 'zod'
import { drawFaceTreatment, drawGlassLabel } from './video-face-treatment'
import { defaultGlassOverlay } from './video-portrait-effects'
import type { ReportOverlay } from './report-overlay'
import type { CanvasPainter } from './canvas-layout'
import { elementEntrance, smoothMotion, portraitStage, videoContent, type VideoFrame } from './video-layout'

export const editorialStudySchema = z.object({
  id: z.string().min(1).max(100),
  operation: z.enum(['establish', 'planes', 'contour', 'light', 'inspect', 'compare', 'recap']),
  activeId: z.string().max(100).optional(),
  references: z.array(z.object({ id: z.string().min(1).max(100), imageId: z.string().min(1).max(100), categoryId: z.string().min(1).max(80), label: z.string().min(1).max(80) }).strict()).min(1).max(3),
}).strict().superRefine((study, ctx) => {
  if (new Set(study.references.map(reference => reference.id)).size !== study.references.length) ctx.addIssue({ code: 'custom', path: ['references'], message: 'Study reference identities must be unique.' })
  if (study.activeId && !study.references.some(reference => reference.id === study.activeId)) ctx.addIssue({ code: 'custom', path: ['activeId'], message: 'Active evidence must belong to the study.' })
})
export type EditorialStudy = z.infer<typeof editorialStudySchema>
export type StudyReference = { id: string; label: string; imageId?: string; image: HTMLImageElement | HTMLCanvasElement; crop: VideoFrame; overlay?: ReportOverlay }
export const editorialStudyMotion = { reframeMs: 880, referenceEnterMs: 640, referenceStaggerMs: 130, splitStart: .15, splitDuration: .22, joinStart: .74, joinDuration: .22 } as const

export function studyPortraitFrame(_operation: EditorialStudy['operation']): VideoFrame {
  return { ...portraitStage }
}

export function studyMosaicSeparation(elapsed: number, duration: number, reduced = false) {
  if (reduced) return 1
  const progress = Math.max(0, Math.min(1, elapsed / Math.max(1, duration)))
  return smoothMotion((progress - editorialStudyMotion.splitStart) / editorialStudyMotion.splitDuration) * (1 - smoothMotion((progress - editorialStudyMotion.joinStart) / editorialStudyMotion.joinDuration))
}

export function drawStudyBackdrop(ctx: CanvasRenderingContext2D) {
  ctx.save(); ctx.strokeStyle = '#9aa7b51c'; ctx.lineWidth = 1
  ctx.beginPath()
  for (let position = 36; position < 1080; position += 44) { ctx.moveTo(position, 350); ctx.lineTo(position, 1740) }
  for (let position = 350; position < 1740; position += 44) { ctx.moveTo(36, position); ctx.lineTo(1044, position) }
  ctx.stroke()
  const wash = ctx.createLinearGradient(0, 350, 0, 1740)
  wash.addColorStop(0, '#fff'); wash.addColorStop(.12, '#ffffff66'); wash.addColorStop(.5, '#ffffff33'); wash.addColorStop(.88, '#ffffff99'); wash.addColorStop(1, '#fff')
  ctx.fillStyle = wash; ctx.fillRect(0, 350, 1080, 1390); ctx.restore()
}

export const studyReferenceDesign = { border: 5, radius: 40, floatingRadius: 28, paper: '#fff', inactiveOpacity: .94, inset: 32, width: 352, portraitWidth: 275 } as const

function referenceAspect(categoryId: string, crop?: VideoFrame) {
  if (categoryId === 'mouth') return 1.8
  if (['eyes', 'brows'].includes(categoryId)) return 2.1
  if (['cheeks', 'face-shape', 'symmetry', 'proportions'].includes(categoryId)) return 1.6
  if (categoryId === 'jaw') return .8
  if (categoryId === 'nose') return .75
  return Math.max(.75, Math.min(2, crop ? crop.width / crop.height : 1.8))
}

export function studyReferenceFrames(study: EditorialStudy, references?: StudyReference[]): VideoFrame[] {
  if (study.operation !== 'recap') {
    const { inset, width, portraitWidth } = studyReferenceDesign
    const frames = study.references.map((reference, index) => {
      const ratio = referenceAspect(reference.categoryId, references?.find(asset => asset.id === reference.id)?.crop)
      const cardWidth = ratio < 1 ? portraitWidth : width, height = Math.min(374, cardWidth / ratio)
      return { x: index % 2 ? portraitStage.width - inset - cardWidth : inset, y: index * 500 - height / 2, width: cardWidth, height }
    })
    const top = Math.min(...frames.map(frame => frame.y)), bottom = Math.max(...frames.map(frame => frame.y + frame.height))
    const offset = portraitStage.y + portraitStage.height / 2 - (top + bottom) / 2
    return frames.map(frame => ({ ...frame, y: frame.y + offset }))
  }

  const recapTop = portraitStage.y + (portraitStage.height - 1220) / 2
  const upper = study.references.find(reference => reference.categoryId === 'cheeks') ?? study.references[0]
  const lower = study.references.filter(reference => reference.id !== upper.id).toSorted((first, second) => {
    const left = references?.find(reference => reference.id === first.id)?.crop, right = references?.find(reference => reference.id === second.id)?.crop
    return left && right ? left.x + left.width / 2 - right.x - right.width / 2 : 0
  })
  const order = [upper, ...lower]
  return study.references.map(reference => {
    const index = order.indexOf(reference)
    return study.references.length === 1 ? { x: videoContent.inset, y: recapTop, width: videoContent.width, height: 1220 }
      : index === 0 ? { x: videoContent.inset, y: recapTop, width: videoContent.width, height: 580 } : { x: videoContent.inset + (index - 1) * videoContent.width / 2, y: recapTop + 580, width: videoContent.width / (study.references.length === 2 ? 1 : 2), height: 640 }
  })
}

export function studyReferenceImageId(study: EditorialStudy, index: number) {
  return study.references[study.operation === 'recap' ? 0 : index].imageId
}

export function studyMosaicCrops(references: StudyReference[], frames: VideoFrame[]): VideoFrame[] {
  if (!references.length || !frames.length) return []
  const left = Math.min(...frames.map(frame => frame.x)), top = Math.min(...frames.map(frame => frame.y))
  const width = Math.max(...frames.map(frame => frame.x + frame.width)) - left, height = Math.max(...frames.map(frame => frame.y + frame.height)) - top
  const sourceLeft = Math.min(...references.map(reference => reference.crop.x)), sourceTop = Math.min(...references.map(reference => reference.crop.y))
  const region = { x: sourceLeft, y: sourceTop, width: Math.max(...references.map(reference => reference.crop.x + reference.crop.width)) - sourceLeft, height: Math.max(...references.map(reference => reference.crop.y + reference.crop.height)) - sourceTop }
  const image = references[0].image, crop = studyReferenceCrop(region, image.width, image.height, width, height)
  return frames.map(frame => ({ x: crop.x + (frame.x - left) / width * crop.width, y: crop.y + (frame.y - top) / height * crop.height, width: frame.width / width * crop.width, height: frame.height / height * crop.height }))
}

export function studyReferenceCrop(crop: VideoFrame, imageWidth: number, imageHeight: number, width: number, height: number): VideoFrame {
  const aspect = width / height
  const desiredWidth = Math.max(crop.width, crop.height * aspect), desiredHeight = Math.max(crop.height, crop.width / aspect)
  const scale = Math.min(1, imageWidth / desiredWidth, imageHeight / desiredHeight)
  const cropWidth = desiredWidth * scale, cropHeight = desiredHeight * scale
  return { x: Math.max(0, Math.min(imageWidth - cropWidth, crop.x + crop.width / 2 - cropWidth / 2)), y: Math.max(0, Math.min(imageHeight - cropHeight, crop.y + crop.height / 2 - cropHeight / 2)), width: cropWidth, height: cropHeight }
}

export function drawStudyReferences(ctx: CanvasRenderingContext2D, paint: CanvasPainter, study: EditorialStudy, references: StudyReference[], elapsed: number, reduced: boolean, operationTime?: { elapsed: number; duration: number }) {
  if (study.operation === 'establish') return
  const frames = studyReferenceFrames(study, references)
  const mosaic = study.operation === 'recap' ? studyMosaicCrops(references, frames) : undefined
  const separation = operationTime ? studyMosaicSeparation(operationTime.elapsed, operationTime.duration, reduced) : 1
  for (const [index, reference] of study.references.entries()) {
    const asset = references.find(asset => asset.id === reference.id)
    if (!asset) continue
    const active = !study.activeId || study.operation === 'recap' || study.activeId === reference.id
    const base = frames[index], upper = base.y === Math.min(...frames.map(frame => frame.y))
    const frame = mosaic ? { ...base, x: base.x + (upper ? 0 : base.x < portraitStage.width / 2 ? -18 : 18) * separation, y: base.y + (upper ? -30 : 46) * separation } : base
    paint(ctx, { id: `study/${study.id}/reference:${reference.id}`, label: reference.label, frame, opacity: reduced ? 1 : elementEntrance(elapsed, index * editorialStudyMotion.referenceStaggerMs, editorialStudyMotion.referenceEnterMs), draw: ctx => {
      const imageHeight = frame.height, crop = mosaic?.[index] ?? studyReferenceCrop(asset.crop, asset.image.width, asset.image.height, frame.width, imageHeight)
      ctx.save()
      const { border, paper, radius: mosaicCorner, floatingRadius, inactiveOpacity } = studyReferenceDesign
      const corner = mosaic ? mosaicCorner : floatingRadius
      const innerRadius = corner * separation
      const radius = !mosaic || study.references.length === 1 ? corner : upper ? [corner, corner, innerRadius, innerRadius] : study.references.length === 2 ? [innerRadius, innerRadius, corner, corner] : base.x < portraitStage.width / 2 ? [innerRadius, innerRadius, innerRadius, corner] : [innerRadius, innerRadius, corner, innerRadius]
      const outline = mosaic ? border * separation : border
      if (outline > 0) {
        ctx.shadowBlur = 0; ctx.fillStyle = paper
        const outerRadius = typeof radius === 'number' ? radius + outline : radius.map(value => value + outline)
        ctx.beginPath(); ctx.roundRect(-outline, -outline, frame.width + outline * 2, imageHeight + outline * 2, outerRadius); ctx.fill()
      }
      ctx.beginPath(); ctx.roundRect(0, 0, frame.width, imageHeight, radius); ctx.clip()
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, frame.width, imageHeight)
      const scale = frame.width / crop.width
      ctx.globalAlpha *= active ? 1 : inactiveOpacity
      ctx.drawImage(asset.image, crop.x, crop.y, crop.width, crop.height, 0, 0, frame.width, imageHeight)
      if (asset.overlay) {
        ctx.save(); ctx.scale(scale, scale); ctx.translate(-crop.x, -crop.y)
        drawFaceTreatment(ctx, asset.overlay, asset.image.width, elapsed, reduced, 1, { appearance: { ...defaultGlassOverlay, markers: false } })
        ctx.restore()
      }
      if (!mosaic) drawGlassLabel(ctx, reference.label, frame.width, imageHeight, 23, index === 2)
      ctx.restore()
      if (mosaic && separation > .01) {
        ctx.save(); ctx.globalAlpha *= smoothMotion((separation - .35) / .65)
        ctx.font = '400 25px "Mogging Share", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        const width = Math.min(frame.width - 24, ctx.measureText(reference.label).width + 36)
        ctx.fillStyle = '#eef1f5ee'; ctx.beginPath(); ctx.roundRect((frame.width - width) / 2, imageHeight + 12, width, 46, 23); ctx.fill()
        ctx.fillStyle = '#56616c'; ctx.fillText(reference.label, frame.width / 2, imageHeight + 35, width - 24); ctx.restore()
      }
    } })
  }
}
