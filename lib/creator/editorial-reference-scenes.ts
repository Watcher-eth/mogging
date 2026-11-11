import { applyGlassInk } from './glass-overlay'
import { creatorStudies } from './creator-studies'
import { editorialBackground, drawEditorialPortrait, editorialCoverPose, mixEditorialPose, type EditorialPortraitPose } from './editorial-layout'
import { editorialEase } from './editorial-motion'
import type { EditorialEvent, EditorialFrame, EditorialPhoto, EditorialPresentation } from './editorial-scenes'

export const referenceSceneKinds = [
  'mirror-pair', 'view-filmstrip', 'crop-extraction', 'contour-relay', 'feature-loupe',
  'sample-matrix', 'premise-revision', 'reply-highlight', 'source-docket',
] as const
type Kind = typeof referenceSceneKinds[number]
type Size = { width: number; height: number }
type Point = { x: number; y: number }
type Lettering = typeof import('./editorial-scenes').drawEditorialText
type Geometry = typeof import('./editorial-scenes').editorialFeatureGeometry
type Feature = Parameters<Geometry>[1]
type ReferenceCue = { time: number; events: EditorialEvent[]; reduced: boolean }

export function isReferenceScene(kind: string): kind is Kind {
  return referenceSceneKinds.some(candidate => candidate === kind)
}

const portraitMoveMs = 560
const annotationMs = 420
const frameAt = ({ width, height }: Size, x: number, y: number, w: number, h: number): EditorialFrame =>
  ({ x: width * x, y: height * y, width: width * w, height: height * h })
const progressAt = (cue: ReferenceCue, at: number, duration = annotationMs) =>
  cue.time < at ? 0 : cue.reduced ? 1 : editorialEase((cue.time - at) / duration)

function portraitPose(photo: EditorialPhoto, frame: EditorialFrame, radius = 0) {
  const anchors = photo.landmarks?.anchors
  const { width, height } = photo.image
  const aspect = frame.width / frame.height
  const cropHeight = Math.min(height, width / aspect)
  const cropWidth = cropHeight * aspect
  const x = (anchors?.noseTip?.x ?? .5) * width
  const y = (anchors?.forehead && anchors.chin ? (anchors.forehead.y + anchors.chin.y) / 2 : .44) * height
  return editorialCoverPose(photo, frame, radius, {
    x: Math.min(width - cropWidth, Math.max(0, x - cropWidth / 2)),
    y: Math.min(height - cropHeight, Math.max(0, y - cropHeight / 2)),
    width: cropWidth, height: cropHeight,
  })
}

export function editorialReferencePose(kind: Kind, primary: EditorialPhoto, size: Size, cue: ReferenceCue) {
  const full = portraitPose(primary, frameAt(size, 0, .19, 1, .81))
  const stage = kind === 'mirror-pair' ? frameAt(size, .055, .272, .436, .526)
    : kind === 'view-filmstrip' ? frameAt(size, .16, .26, .68, .53)
      : undefined
  if (!stage) return full
  return mixEditorialPose(full, portraitPose(primary, stage, 28), progressAt(cue, cue.events[0]?.atMs ?? Infinity, portraitMoveMs))
}

function strokeFrame(ctx: CanvasRenderingContext2D, frame: EditorialFrame, radius: number) {
  ctx.beginPath()
  ctx.roundRect(frame.x, frame.y, frame.width, frame.height, radius)
  ctx.stroke()
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number) {
  ctx.font = '500 34px "Mogging Share",Arial,sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(text, x, y, width)
}

function position(pose: EditorialPortraitPose, photo: EditorialPhoto, point: Point) {
  return {
    x: pose.image.x + pose.image.width * point.x / photo.image.width,
    y: pose.image.y + pose.image.height * point.y / photo.image.height,
  }
}

function squareCrop(photo: EditorialPhoto, point: Point, edge: number) {
  const width = Math.min(photo.image.width, photo.image.height, edge)
  return {
    x: Math.max(0, Math.min(photo.image.width - width, point.x - width / 2)),
    y: Math.max(0, Math.min(photo.image.height - width, point.y - width / 2)),
    width, height: width,
  }
}

function paper(ctx: CanvasRenderingContext2D, frame: EditorialFrame, dark: boolean, radius = 24) {
  ctx.save()
  ctx.fillStyle = dark ? '#29292df7' : '#fffffff7'
  ctx.shadowColor = dark ? '#00000033' : '#00000014'
  ctx.shadowBlur = 26
  ctx.shadowOffsetY = 6
  ctx.beginPath()
  ctx.roundRect(frame.x, frame.y, frame.width, frame.height, radius)
  ctx.fill()
  ctx.restore()
}

export function drawEditorialReferenceScene(
  ctx: CanvasRenderingContext2D, kind: Kind, presentation: EditorialPresentation, feature: Feature,
  primary: EditorialPhoto, references: EditorialPhoto[], size: Size, cue: ReferenceCue, dark: boolean,
  geometry: Geometry, lettering: Lettering, swatches: (photo: EditorialPhoto, feature: Feature) => string[],
  shared?: { from?: EditorialPortraitPose; amount: number },
) {
  const { width, height } = size
  const ink = dark ? '#f3f3f3' : '#252529'
  const muted = dark ? '#b7b7bd' : '#56565f'
  const base = editorialReferencePose(kind, primary, size, cue)
  const pose = shared?.from ? mixEditorialPose(shared.from, base, shared.amount) : base
  const start = cue.events[0]?.atMs ?? (presentation.claim ? 0 : Infinity)
  const entrance = progressAt(cue, start, portraitMoveMs)
  ctx.save()
  ctx.fillStyle = editorialBackground(dark)
  ctx.fillRect(0, 0, width, height)
  drawEditorialPortrait(ctx, primary, pose)
  if (!entrance) { ctx.restore(); return }
  ctx.fillStyle = ink
  ctx.strokeStyle = ink
  ctx.lineWidth = 2.5

  if (kind === 'mirror-pair') {
    const frame = frameAt(size, .509, .272, .436, .526)
    ctx.save()
    ctx.globalAlpha *= entrance
    ctx.translate(frame.x * 2 + frame.width, 0)
    ctx.scale(-1, 1)
    drawEditorialPortrait(ctx, primary, portraitPose(primary, frame, 28))
    ctx.restore()
    ctx.globalAlpha *= entrance
    label(ctx, 'Original photo', width * .067, height * .83, width * .36)
    label(ctx, 'Mirrored photo', width * .523, height * .83, width * .36)
    ctx.strokeStyle = muted
    ctx.setLineDash([5, 10])
    ctx.beginPath()
    ctx.moveTo(width * .5, height * .28); ctx.lineTo(width * .5, height * .79); ctx.stroke()
  } else if (kind === 'view-filmstrip') {
    const items = [primary, ...references.slice(0, 2)]
    if (items.length > 1) {
      const chosen = Math.min(items.length - 1, presentation.referenceIndex + 1)
      const transition = progressAt(cue, start + 210, 510)
      if (transition > 0) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(pose.frame.x, pose.frame.y, pose.frame.width * transition, pose.frame.height)
        ctx.clip()
        drawEditorialPortrait(ctx, items[chosen], portraitPose(items[chosen], pose.frame, pose.radius))
        ctx.restore()
      }
      items.forEach((photo, index) => {
        const x = .19 + index * .22
        const tile = frameAt(size, x, .81 + (1 - entrance) * .03, .19, .105)
        ctx.save()
        ctx.globalAlpha *= entrance * (index === chosen ? 1 : .73)
        drawEditorialPortrait(ctx, photo, portraitPose(photo, tile, 16))
        if (index === chosen) strokeFrame(ctx, tile, 16)
        ctx.restore()
      })
    }
  } else if (kind === 'premise-revision') {
    const [premise, correction] = presentation.dialogue ?? []
    if (premise && correction) {
      const revision = progressAt(cue, cue.events[1]?.atMs ?? Infinity, 520)
      const card = frameAt(size, .08, .705, .77, .125)
      ctx.font = 'italic 48px Georgia,serif'
      const lines = Math.max(1, Math.ceil(Math.max(ctx.measureText(premise).width, ctx.measureText(correction).width) / (card.width - 110)))
      card.height = 100 + 55 * lines
      ctx.globalAlpha *= entrance
      paper(ctx, card, dark)
      ctx.fillStyle = muted
      label(ctx, revision ? 'IN CONTEXT' : 'THE PREMISE', card.x + 32, card.y + 49, card.width - 64)
      ctx.fillStyle = ink
      ctx.font = 'italic 48px Georgia,serif'
      lettering(ctx, premise, correction, card.x + 32, card.y + 110, revision, card.width - 64, 55)
      if (revision > 0 && revision < 1) {
        ctx.globalAlpha *= Math.sin(revision * Math.PI)
        ctx.beginPath()
        ctx.moveTo(card.x + 28, card.y + 108)
        ctx.lineTo(card.x + 28 + (card.width - 65) * revision, card.y + 108)
        ctx.stroke()
      }
    }
  } else if (kind === 'reply-highlight' || kind === 'source-docket') {
    const study = presentation.studies?.[0] && creatorStudies[presentation.studies[0]]
    const line = Math.max(0, cue.events.findLastIndex(event => event.atMs <= cue.time))
    const quote = presentation.claim?.text ?? presentation.dialogue?.[line]
    const prior = !presentation.claim && line > 0 ? presentation.dialogue?.[line - 1] ?? '' : ''
    const highlightAt = cue.events[line]?.atMs ?? start
    const content = kind === 'source-docket' ? study?.title : quote
    if (content) {
      const isSource = kind === 'source-docket'
      const card = frameAt(size, .065 - (1 - entrance) * .08, .71, isSource ? .60 : .57, .12)
      const font = isSource ? 'italic 48px Georgia,serif' : '500 45px "Mogging Share",Arial,sans-serif'
      ctx.font = font
      const lineCount = Math.max(1, Math.ceil(ctx.measureText(content).width / (card.width - 112)))
      card.height = 105 + 53 * lineCount + (isSource ? 53 : 0)
      ctx.globalAlpha *= entrance
      paper(ctx, card, dark, isSource ? 22 : 40)
      if (!isSource) {
        ctx.fillStyle = dark ? '#29292d' : '#fff'
        ctx.beginPath()
        ctx.moveTo(card.x + 28, card.y + card.height - 29)
        ctx.lineTo(card.x + 8, card.y + card.height + 13)
        ctx.lineTo(card.x + 81, card.y + card.height - 5)
        ctx.closePath(); ctx.fill()
      }
      ctx.fillStyle = muted
      const byline = isSource && study ? `${study.authors} · ${study.year}` : presentation.claim?.author ?? 'Quoted in the script'
      label(ctx, byline, card.x + 36, card.y + 51, card.width - 76)
      ctx.font = font
      ctx.fillStyle = ink
      lettering(ctx, prior, content, card.x + 36, card.y + 113, progressAt(cue, highlightAt), card.width - 72, 53)
      const underline = progressAt(cue, highlightAt + 260)
      const underlineWidth = Math.min(card.width - 72, ctx.measureText(content).width)
      const underlineY = card.y + card.height - (isSource ? 66 : 25)
      ctx.strokeStyle = muted
      ctx.beginPath()
      ctx.moveTo(card.x + 36, underlineY)
      ctx.lineTo(card.x + 36 + underlineWidth * underline, underlineY)
      ctx.stroke()
      if (kind === 'source-docket' && study) {
        ctx.fillStyle = muted
        label(ctx, study.journal, card.x + 36, card.y + card.height - 37, card.width - 72)
        ctx.fillStyle = dark ? '#48484b' : '#deded8'
        ctx.beginPath()
        ctx.moveTo(card.x + card.width - 57, card.y); ctx.lineTo(card.x + card.width, card.y + 57)
        ctx.lineTo(card.x + card.width - 57, card.y + 57); ctx.closePath(); ctx.fill()
      }
    }
  } else {
    const detail = geometry(primary, feature)
    if (detail) {
      const center = { x: detail.frame.x + detail.frame.width / 2, y: detail.frame.y + detail.frame.height / 2 }
      const target = position(pose, primary, center)
      const side = target.x < width * .48 ? 1 : -1
      const edge = width * .22
      const parked = { x: width * (side === 1 ? .67 : .10), y: height * .66, width: edge, height: edge }
      const origin = { x: target.x - edge * .25, y: target.y - edge * .25, width: edge * .5, height: edge * .5 }
      const crop = squareCrop(primary, center, Math.max(detail.frame.width, detail.frame.height, detail.eyeSpan * .42) * 1.45)
      if (kind === 'crop-extraction') {
        const cropPose = mixEditorialPose(editorialCoverPose(primary, origin, 12, crop), editorialCoverPose(primary, parked, 20, crop), entrance)
        drawEditorialPortrait(ctx, primary, cropPose)
        ctx.strokeStyle = '#ffffffe6'
        ctx.lineWidth = 4
        strokeFrame(ctx, cropPose.frame, cropPose.radius)
        ctx.globalAlpha *= progressAt(cue, start + 350)
        paper(ctx, { ...parked, y: parked.y + edge + 9, height: 48 }, dark, 16)
        ctx.fillStyle = ink
        label(ctx, presentation.label ?? feature.replace('-', ' '), parked.x + 16, parked.y + edge + 42, edge - 32)
      } else if (kind === 'feature-loupe') {
        const diameter = edge * (1 + entrance * .18)
        const frame = { x: Math.min(width - diameter - 125, Math.max(85, target.x + side * (diameter * .62 + 58) - diameter / 2)),
          y: Math.min(height * .75 - diameter / 2, Math.max(height * .29, target.y - diameter * .58)), width: diameter, height: diameter }
        ctx.globalAlpha *= entrance
        ctx.strokeStyle = '#ffffffed'
        ctx.beginPath(); ctx.moveTo(target.x, target.y); ctx.lineTo(frame.x + diameter / 2, frame.y + diameter / 2); ctx.stroke()
        const lens = squareCrop(primary, center, crop.width * .78)
        drawEditorialPortrait(ctx, primary, editorialCoverPose(primary, frame, diameter / 2, lens))
        ctx.lineWidth = 5; strokeFrame(ctx, frame, diameter / 2)
        ctx.lineWidth = 1.5; strokeFrame(ctx, { x: frame.x - 12, y: frame.y - 12, width: diameter + 24, height: diameter + 24 }, diameter / 2 + 12)
      } else if (kind === 'contour-relay') {
        const paths = detail.paths.filter(path => path.length >= 2)
        ctx.setLineDash(presentation.variant % 3 ? [6, 6] : [])
        for (const [index, path] of paths.entries()) {
          const trace = progressAt(cue, start + index * 130, 720)
          if (!trace) continue
          const points = presentation.variant % 2 ? [...path].reverse() : path
          const length = (points.length - 1) * trace
          const first = position(pose, primary, points[0])
          let head = first
          ctx.strokeStyle = '#fffffff2'; ctx.lineWidth = 3.75
          applyGlassInk(ctx, 1, 3.75)
          ctx.beginPath(); ctx.moveTo(first.x, first.y)
          for (let step = 1; step <= Math.ceil(length); step++) {
            const from = points[step - 1], to = points[step]
            const amount = Math.min(1, length - step + 1)
            head = position(pose, primary, { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount })
            ctx.lineTo(head.x, head.y)
          }
          ctx.stroke()
          ctx.save(); ctx.setLineDash([])
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(head.x, head.y, 5, 0, Math.PI * 2); ctx.fill()
          ctx.beginPath(); ctx.arc(first.x, first.y, 13, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
        }
      } else if (kind === 'sample-matrix') {
        const colors = swatches(primary, feature)
        if (colors.length) {
          const card = frameAt(size, side === 1 ? .61 : .10, .66, .28, .186)
          ctx.globalAlpha *= entrance
          paper(ctx, card, dark)
          ctx.fillStyle = muted
          label(ctx, 'Photo samples', card.x + 25, card.y + 48, card.width - 50)
          const step = (card.width - 50) / 3
          colors.forEach((color, index) => {
            const t = progressAt(cue, start + index * 52, 450)
            if (!t) return
            const column = index % 3, row = Math.floor(index / 3)
            const sample = position(pose, primary, {
              x: detail.frame.x + detail.frame.width * (column + 1) / 4,
              y: detail.frame.y + detail.frame.height * (row + 1) / 4,
            })
            const x = card.x + 25 + step * (column + .5), y = card.y + 83 + step * (row + .5)
            const r = step * (.10 + .22 * t)
            ctx.fillStyle = color
            ctx.strokeStyle = '#ffffffc0'
            ctx.beginPath()
            ctx.roundRect(sample.x + (x - sample.x) * t - r, sample.y + (y - sample.y) * t - r, r * 2, r * 2, r * .32)
            ctx.fill(); ctx.stroke()
          })
        }
      }
    }
  }
  ctx.restore()
}
