import { drawEditorialFeatureEffect, featureEffectKinds } from './editorial-feature-effects'
import { applyGlassInk } from './glass-overlay'
import { creatorStudies } from './creator-studies'
import { drawEditorialDefocus, drawEditorialPortrait, editorialBackground, editorialReveal, editorialCoverPose, wrapEditorialText, mixEditorialPose, type EditorialPortraitPose } from './editorial-layout'
import { editorialEase } from './editorial-motion'
import type { EditorialEvent, EditorialFrame, EditorialPhoto, EditorialPresentation } from './editorial-scenes'

const unframedMediaHeight = .775
export const sourceUnframeViewport = { width: 1080, height: 1920 * unframedMediaHeight }

export const editorialSequenceKinds = [
  'thirds-transfer', 'chapter-defocus', 'example-deck', 'example-constellation', 'coverage-sweep',
  'axis-tension', 'contour-construction', 'source-excerpt', 'social-unframe', 'feature-match-cut',
  ...featureEffectKinds,
] as const
type Kind = typeof editorialSequenceKinds[number]
type Size = { width: number; height: number }
type Point = { x: number; y: number }
type Geometry = typeof import('./editorial-scenes').editorialFeatureGeometry
type Feature = Parameters<Geometry>[1]
type Cue = { time: number; duration: number; events: EditorialEvent[]; reduced: boolean }

export const isEditorialSequence = (kind: string): kind is Kind => editorialSequenceKinds.some(item => item === kind)
const progress = (cue: Cue, at: number, duration = 480) => cue.time < at ? 0 : cue.reduced ? 1 : editorialEase((cue.time - at) / duration)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const box = (size: Size, x: number, y: number, width: number, height: number) =>
  ({ x: x * size.width, y: y * size.height, width: width * size.width, height: height * size.height })

function project(pose: EditorialPortraitPose, photo: EditorialPhoto, point: Point): Point {
  return { x: pose.image.x + point.x * pose.image.width / photo.image.width, y: pose.image.y + point.y * pose.image.height / photo.image.height }
}

function basePose(primary: EditorialPhoto, size: Size) {
  return editorialCoverPose(primary, box(size, 0, .197, 1, .803))
}

function detailPose(photo: EditorialPhoto, size: Size, target: EditorialFrame, eyeSpan: number) {
  const frame = box(size, 0, .28, 1, .62)
  const width = Math.max(target.width * 2.45, eyeSpan * 2.7)
  const height = Math.max(target.height * 2.7, width * frame.height / frame.width)
  const focus = { x: target.x + (target.width - width) / 2, y: target.y + (target.height - height) / 2, width, height }
  return editorialCoverPose(photo, frame, 0, focus)
}

export function sequencePose(kind: Kind, primary: EditorialPhoto, size: Size, cue: Cue, geometry: Geometry) {
  const base = basePose(primary, size)
  const start = cue.events[0]?.atMs ?? Infinity
  if (kind === 'source-excerpt' || kind === 'contour-construction') {
    const frame = box(size, .38, .245, .62, .755)
    return mixEditorialPose(base, editorialCoverPose(primary, frame, 0), progress(cue, start, 620))
  }
  if (kind === 'coverage-sweep') {
    const brow = geometry(primary, 'brows'), stops = faceStops(primary)
    if (brow && stops) {
      const frame = box(size, 0, .255, 1, .745)
      const width = brow.eyeSpan * 3.5, height = width * frame.height / frame.width
      const center = { x: (stops[0].x + stops[1].x) / 2, y: (stops[0].y + stops[1].y) / 2 }
      const focus = { x: center.x - width / 2, y: center.y - height * .38, width, height }
      return mixEditorialPose(base, editorialCoverPose(primary, frame, 0, focus), progress(cue, start, 620))
    }
  }
  if (kind !== 'feature-match-cut') return base
  let from = base, to = base, at = -480
  for (const event of cue.events) {
    if (event.atMs > cue.time) break
    const detail = geometry(primary, event.feature)
    if (!detail) continue
    from = mixEditorialPose(from, to, cue.reduced ? 1 : (event.atMs - at) / 480)
    to = detailPose(primary, size, detail.frame, detail.eyeSpan)
    at = event.atMs
  }
  return mixEditorialPose(from, to, cue.reduced ? 1 : (cue.time - at) / 480)
}

function card(ctx: CanvasRenderingContext2D, frame: EditorialFrame, color: string, radius = 24) {
  ctx.fillStyle = color
  ctx.beginPath(); ctx.roundRect(frame.x, frame.y, frame.width, frame.height, radius); ctx.fill()
}

function glassCard(ctx: CanvasRenderingContext2D, frame: EditorialFrame, dark: boolean, radius = 34) {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(frame.x, frame.y, frame.width, frame.height, radius)
  const tint = ctx.createLinearGradient(frame.x, frame.y, frame.x + frame.width, frame.y + frame.height)
  tint.addColorStop(0, dark ? '#3c4144f5' : '#f9fdfbea')
  tint.addColorStop(1, dark ? '#202326ed' : '#e5eeeeed')
  ctx.fillStyle = tint
  ctx.shadowColor = dark ? '#0000003d' : '#23333519'
  ctx.shadowBlur = 26
  ctx.shadowOffsetY = 7
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = dark ? '#ffffff35' : '#ffffffeb'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

function line(ctx: CanvasRenderingContext2D, a: Point, b: Point) {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
}

function dot(ctx: CanvasRenderingContext2D, point: Point, radius = 5) {
  ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI); ctx.fill()
}

function mono(ctx: CanvasRenderingContext2D, content: string, x: number, y: number, ink: string, width?: number) {
  ctx.fillStyle = ink; ctx.font = '500 32px "Mogging Share",Arial,sans-serif'
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(content, x, y, width)
}

function faceStops(photo: EditorialPhoto) {
  const landmarks = photo.landmarks
  if (!landmarks || landmarks.confidence < .75) return
  const { forehead, leftBrow, rightBrow, chin } = landmarks.anchors
  const nose = landmarks.contours?.noseBase
  const noseBase = nose?.length ? nose.reduce((a, b) => a.y > b.y ? a : b) : undefined
  if (!forehead || !leftBrow || !rightBrow || !noseBase || !chin) return
  const points = [forehead, { x: (leftBrow.x + rightBrow.x) / 2, y: (leftBrow.y + rightBrow.y) / 2 }, noseBase, chin]
  if (points.some((point, i) => i > 0 && point.y <= points[i - 1].y)) return
  return points.map(point => ({ x: point.x * photo.image.width, y: point.y * photo.image.height }))
}

export function drawEditorialSequence(
  ctx: CanvasRenderingContext2D, kind: Kind, presentation: EditorialPresentation, feature: Feature,
  primary: EditorialPhoto, references: EditorialPhoto[], size: Size, cue: Cue, dark: boolean,
  geometry: Geometry, shared?: { from?: EditorialPortraitPose; amount: number; hold?: boolean },
) {
  const { width: w, height: h } = size
  const paper = dark ? '#242426' : '#fff', field = editorialBackground(dark)
  const ink = dark ? '#eee' : '#262629', muted = dark ? '#bbb' : '#616165'
  const start = cue.events[0]?.atMs ?? Infinity
  const enter = progress(cue, start)
  const base = sequencePose(kind, primary, size, cue, geometry)
  const pose = shared?.from ? mixEditorialPose(shared.from, base, shared.amount) : base
  ctx.save()
  ctx.fillStyle = field; ctx.fillRect(0, 0, w, h)
  const sequence = kind === 'example-deck' || kind === 'example-constellation' || kind === 'social-unframe'
  if (!sequence || !enter || !references[0] || kind === 'social-unframe') drawEditorialPortrait(ctx, primary, pose)
  if (!enter || drawEditorialFeatureEffect(ctx, presentation, feature, primary, pose, size, cue, dark, geometry)) {
    ctx.restore()
    return
  }

  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4
  const position = (point: Point) => project(pose, primary, point)
  if (kind === 'thirds-transfer') {
    const stops = faceStops(primary)
    if (stops) {
      const points = stops.map(position)
      const total = points[3].y - points[0].y
      const cardFrame = { ...box(size, .095, .765, .67, 0), height: 199 }
      const transfer = progress(cue, start + 680, 660)
      const split = progress(cue, start + 280, 580) * (1 - progress(cue, start + 1700, 520))
      if (split) {
        ctx.save(); ctx.fillStyle = field; ctx.globalAlpha *= split * .88
        ctx.fillRect(0, size.height * .22, size.width, size.height * .78); ctx.restore()
        for (let i = 0; i < 3; i++) {
          const top = points[i].y, bottom = points[i + 1].y, offset = (i - 1) * size.height * .052 * split
          ctx.save()
          ctx.beginPath(); ctx.rect(0, top + offset, size.width, bottom - top); ctx.clip()
          ctx.translate((i % 2 ? 1 : -1) * size.width * .028 * split, offset)
          drawEditorialPortrait(ctx, primary, pose); ctx.restore()
        }
      }
      ctx.save(); ctx.globalAlpha *= transfer; glassCard(ctx, cardFrame, dark); ctx.restore()
      const names = ['Forehead to brows', 'Brows to nose base', 'Nose base to chin']
      for (let i = 0; i < 3; i++) {
        const a = points[i], b = points[i + 1]
        const length = b.y - a.y
        const acquire = progress(cue, start + i * 104, 450)
        const bandWidth = w * .44, bandX = (a.x + b.x) / 2 - bandWidth / 2
        const rowY = cardFrame.y + 42 + 55 * i
        const railWidth = cardFrame.width * .48
        const x = lerp(bandX, cardFrame.x + cardFrame.width * .47, transfer)
        const y = lerp(a.y, rowY, transfer)
        ctx.save(); ctx.globalAlpha *= acquire
        ctx.fillStyle = transfer > .45 ? muted : '#ffffff38'
        const span = lerp(bandWidth, Math.max(18, railWidth * length / total), transfer)
        const thickness = lerp(length, 6, transfer)
        ctx.beginPath()
        ctx.roundRect(x, y, span * acquire, thickness, Math.min(thickness / 2, 5))
        ctx.fill()
        ctx.globalAlpha *= 1 - transfer
        ctx.setLineDash([6, 7]); line(ctx, { x: bandX, y: a.y }, { x: bandX + bandWidth * acquire, y: a.y })
        ctx.restore()
        ctx.save(); ctx.globalAlpha *= transfer
        mono(ctx, names[i], cardFrame.x + 26, rowY + 14, ink, cardFrame.width * .40)
        ctx.restore()
      }
    }
  } else if (kind === 'chapter-defocus') {
    const hold = Math.min(1560, Math.max(480, (cue.duration - start) * .62))
    const { opacity: veil } = editorialReveal(cue.time, start, Math.min(cue.duration, start + hold + 440), 480, 440, cue.reduced)
    if (veil > 0) {
      ctx.save(); ctx.globalAlpha *= veil
      drawEditorialDefocus(ctx, primary, pose, size, dark)
      const title = presentation.label ?? cue.events[0]?.label
      if (title) {
        ctx.font = 'italic 108px Georgia,serif'
        ctx.fillStyle = ink
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const rows = wrapEditorialText(ctx, title, w * .76).slice(0, 3)
        rows.forEach((row, i) => ctx.fillText(row, w * .5, h * .51 + (i - (rows.length - 1) / 2) * 105))
      }
      ctx.restore()
    }
  } else if (kind === 'example-deck' || kind === 'example-constellation') {
    const items = [primary, ...references.slice(0, 2)]
    const index = Math.max(0, cue.events.findLastIndex(event => event.atMs <= cue.time))
    const selected = Math.min(index, items.length - 1)
    const turn = progress(cue, cue.events[index]?.atMs ?? Infinity, 600)
    if (kind === 'example-deck') {
      const front = box(size, .13, .29, .74, .58)
      const draw = (photo: EditorialPhoto, depth: number, slide: number) => {
        const frame = { ...front, x: front.x + depth * 17 - w * .66 * slide, y: front.y - depth * 22 + h * .065 * slide }
        ctx.save(); ctx.translate(frame.x + frame.width / 2, frame.y + frame.height / 2)
        ctx.rotate((depth * .025 - slide * .14) * (presentation.variant % 2 ? -1 : 1))
        ctx.translate(-frame.x - frame.width / 2, -frame.y - frame.height / 2)
        ctx.globalAlpha *= 1 - slide * .82
        glassCard(ctx, { x: frame.x - 11, y: frame.y - 11, width: frame.width + 22, height: frame.height + 22 }, dark, 30)
        const target = editorialCoverPose(photo, frame, 22)
        const initial = selected === 0 && depth === 0 ? mixEditorialPose(pose, target, enter) : target
        if (depth > 0) ctx.globalAlpha *= enter
        drawEditorialPortrait(ctx, photo, initial); ctx.restore()
      }
      for (let depth = items.length - 1; depth >= 0; depth--) draw(items[(selected + depth) % items.length], depth ? depth : selected && !cue.reduced ? 1 - turn : 0, 0)
      if (selected && turn < 1) draw(items[selected - 1], 0, turn)
    } else {
      const radius = w * .158
      const center = { x: w * .49, y: h * .55 }
      ctx.save(); ctx.strokeStyle = dark ? '#ffffff42' : '#18181836'
      const nodes = items.map((_, index) => {
        const phase = (index - selected + (selected ? 1 - turn : 0)) * Math.PI * 2 / items.length - Math.PI / 2
        return { x: center.x + Math.cos(phase) * w * .26, y: center.y + Math.sin(phase) * h * .19 }
      })
      ctx.setLineDash([3, 7])
      for (const point of nodes) line(ctx, center, point)
      ctx.setLineDash([])
      ctx.fillStyle = muted
      dot(ctx, center, 4.5)
      items.forEach((item, index) => {
        const point = nodes[index], r = index === selected ? radius * (1 + .34 * turn) : radius
        const frame = { x: point.x - r, y: point.y - r, width: r * 2, height: r * 2 }
        ctx.save()
        if (index > 0) ctx.globalAlpha *= enter
        ctx.save(); ctx.globalAlpha *= enter
        card(ctx, { x: frame.x - 5, y: frame.y - 5, width: frame.width + 10, height: frame.height + 10 }, paper, r + 5)
        ctx.restore()
        const focal = item.landmarks?.anchors.noseTip
        const crop = focal && { x: focal.x * item.image.width - item.image.width * .28, y: focal.y * item.image.height - item.image.width * .33, width: item.image.width * .56, height: item.image.width * .56 }
        const target = editorialCoverPose(item, frame, r, crop)
        drawEditorialPortrait(ctx, item, index === 0 && selected === 0 ? mixEditorialPose(pose, target, enter) : target)
        ctx.restore()
      })
      ctx.restore()
    }
    mono(ctx, `VIEW ${selected + 1} / ${items.length}`, w * .12, h * .91, ink, w * .65)
  } else if (kind === 'coverage-sweep') {
    const stops = faceStops(primary)
    if (stops) {
      const [top, brow] = stops.map(position)
      const undo = /\b(?:uncover|expose|reveal|away from|pull(?:ed)? back)\b/i.test(presentation.label ?? '')
      const t = undo ? 1 - enter : enter
      const left = top.x - w * .19, right = top.x + w * .19, bottom = lerp(top.y, brow.y, t)
      const shade = ctx.createLinearGradient(0, top.y, 0, Math.max(top.y + 1, bottom))
      shade.addColorStop(0, '#19191906'); shade.addColorStop(1, '#17171786')
      ctx.fillStyle = shade
      ctx.beginPath(); ctx.moveTo(left, top.y); ctx.lineTo(right, top.y)
      ctx.quadraticCurveTo(right - 13, bottom - 5, top.x, bottom)
      ctx.quadraticCurveTo(left + 13, bottom - 5, left, top.y); ctx.fill()
      ctx.setLineDash([7, 7]); line(ctx, { x: left, y: bottom }, { x: right, y: bottom })
      if (t > .12) {
        const label = 'Forehead visibility'
        glassCard(ctx, { x: left, y: bottom + 21, width: w * .28, height: 56 }, dark, 18)
        mono(ctx, label, left + 15, bottom + 60, ink, w * .25)
      }
    }
  } else if (kind === 'axis-tension' || kind === 'contour-construction') {
    const detail = geometry(primary, feature === 'whole' || kind === 'contour-construction' ? 'whole' : feature)
    if (detail) {
      const f = detail.frame
      const left = position({ x: f.x, y: f.y }), right = position({ x: f.x + f.width, y: f.y + f.height })
      applyGlassInk(ctx, 1, 4)
      if (kind === 'axis-tension') {
        const index = Math.max(0, cue.events.findLastIndex(item => item.atMs <= cue.time))
        const event = cue.events[index]
        const vertical = (event?: EditorialEvent) => /\b(?:length|tall|vertical|height)\b/i.test(event?.label ?? '')
        const t = progress(cue, event?.atMs ?? start, 540)
        const from = index ? Number(vertical(cue.events[index - 1])) : Number(vertical(event))
        const orientation = lerp(from, Number(vertical(event)), t)
        const angle = orientation * Math.PI / 2
        const dx = Math.cos(angle), dy = Math.sin(angle)
        const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
        const span = lerp(right.x - left.x, right.y - left.y, orientation) / 2 * (index ? 1 : t)
        for (const sign of [-1, 1]) {
          const x = center.x + sign * span * dx, y = center.y + sign * span * dy
          line(ctx, center, { x, y })
          ctx.beginPath()
          ctx.moveTo(x - sign * 25 * dx - 17 * dy, y - sign * 25 * dy + 17 * dx)
          ctx.lineTo(x, y)
          ctx.lineTo(x - sign * 25 * dx + 17 * dy, y - sign * 25 * dy - 17 * dx)
          ctx.stroke()
          dot(ctx, { x, y }, 4)
        }
      } else {
        const outline = detail.paths.find(path => path.length > 8)
        if (outline) {
          const diagram = box(size, .065, .39, .30, .32)
          const scale = Math.min(diagram.width / f.width, diagram.height / f.height)
          const transfer = progress(cue, start + 560, 650)
          const projectDiagram = (p: Point) => {
            const target = { x: diagram.x + (p.x - f.x) * scale + (diagram.width - f.width * scale) / 2,
              y: diagram.y + (p.y - f.y) * scale + (diagram.height - f.height * scale) / 2 }
            const origin = position(p)
            return { x: lerp(origin.x, target.x, transfer), y: lerp(origin.y, target.y, transfer) }
          }
          const center = projectDiagram({ x: f.x + f.width / 2, y: f.y + f.height / 2 })
          const build = progress(cue, start, 760)
          const rays = Math.min(outline.length, Math.floor(build * outline.length))
          for (let i = 0; i < rays; i++) {
            const point = projectDiagram(outline[i]), next = projectDiagram(outline[(i + 1) % outline.length])
            applyGlassInk(ctx, 1, 3, transfer > .6 ? (dark ? '#dddddd' : '#66666d') : '#ffffffec')
            ctx.globalAlpha = .88
            line(ctx, point, next)
            if (i % 3 === 0) {
              ctx.globalAlpha = .25; ctx.setLineDash([4, 8]); line(ctx, center, point); ctx.setLineDash([])
              ctx.globalAlpha = .95; dot(ctx, point, 5)
            }
          }
          if (transfer) {
            ctx.globalAlpha = transfer
            mono(ctx, 'Outline', diagram.x, diagram.y + diagram.height + 54, muted, diagram.width)
          }
        }
      }
    }
  } else if (kind === 'source-excerpt') {
    const study = presentation.studies?.[0] && creatorStudies[presentation.studies[0]]
    const claim = study && Object.values(study.claims)[0]
    if (study && claim) {
      const frame = box(size, .067, .455 + (1 - enter) * .065, .53, 0)
      const padding = 36, available = frame.width - padding * 2
      const headingFont = '600 51px Georgia,serif'
      const passageFont = '400 42px "Mogging Share",Arial,sans-serif'
      ctx.font = headingFont
      const title = wrapEditorialText(ctx, study.title, available)
      ctx.font = passageFont
      const passage = wrapEditorialText(ctx, claim, available)
      const headingY = 103, headingLeading = 55, passageLeading = 52
      const passageY = headingY + (title.length - 1) * headingLeading + 66
      const footerY = passageY + (passage.length - 1) * passageLeading + 63
      frame.height = footerY + 35
      ctx.globalAlpha *= enter
      glassCard(ctx, frame, dark)
      mono(ctx, `${study.authors} · ${study.year}`, frame.x + padding, frame.y + 57, muted, available)
      ctx.fillStyle = ink
      ctx.font = headingFont
      title.forEach((row, i) => ctx.fillText(row, frame.x + padding, frame.y + headingY + i * headingLeading))
      ctx.font = passageFont
      passage.forEach((row, i) => {
        const amount = progress(cue, start + 390 + i * 145, 390)
        const y = frame.y + passageY + i * passageLeading
        card(ctx, { x: frame.x + padding - 7, y: y - 36, width: (ctx.measureText(row).width + 14) * amount, height: 45 },
          dark ? '#77878e61' : '#9fb7b15c', 10)
        ctx.fillStyle = ink
        ctx.fillText(row, frame.x + padding, y)
      })
      ctx.strokeStyle = dark ? '#ffffff32' : '#4a5a592e'
      ctx.lineWidth = 1.5
      line(ctx, { x: frame.x + padding, y: frame.y + footerY - 34 }, { x: frame.x + frame.width - padding, y: frame.y + footerY - 34 })
      mono(ctx, `DOI ${study.doi}`, frame.x + padding, frame.y + footerY, muted, available)
    }
  } else if (kind === 'social-unframe') {
    const source = references[0]
    if (source) {
      const expand = progress(cue, start + 400, 660)
      const inset = editorialCoverPose(source, box(size, .13, .36, .74, .37), 24)
      const hero = editorialCoverPose(source, box(size, 0, 1 - unframedMediaHeight, 1, unframedMediaHeight), 0)
      const moving = mixEditorialPose(inset, hero, expand)
      ctx.save(); ctx.globalAlpha *= 1 - expand
      glassCard(ctx, { x: moving.frame.x - 12, y: moving.frame.y - 82, width: moving.frame.width + 24, height: moving.frame.height + 124 }, dark, 32)
      mono(ctx, presentation.assetCaption ?? source.label ?? 'Source footage', moving.frame.x + 25, moving.frame.y - 31, muted, moving.frame.width - 50)
      ctx.restore()
      ctx.save(); ctx.globalAlpha *= enter; drawEditorialPortrait(ctx, source, moving); ctx.restore()
      if (expand > .8 && (presentation.assetCaption || source.label)) {
        const frame = box(size, .075, .848, .63, .036)
        glassCard(ctx, frame, dark, 22)
        mono(ctx, presentation.assetCaption ?? source.label!, frame.x + 24, frame.y + 54, ink, frame.width - 48)
      }
    }
  } else if (kind === 'feature-match-cut') {
    const active = cue.events.findLast(event => event.atMs <= cue.time)
    const detail = active && geometry(primary, active.feature)
    if (active && detail) {
      const center = position({ x: detail.frame.x + detail.frame.width / 2, y: detail.frame.y + detail.frame.height / 2 })
      const t = progress(cue, active.atMs, 480)
      const flash = cue.reduced ? 0 : Math.sin(t * Math.PI)
      ctx.globalAlpha *= flash
      ctx.setLineDash([5, 7])
      const reach = w * (.095 + t * .07)
      line(ctx, { x: center.x - reach, y: center.y }, { x: center.x + reach, y: center.y })
      line(ctx, { x: center.x, y: center.y - reach }, { x: center.x, y: center.y + reach })
      dot(ctx, center, 9)
    }
  }
  ctx.restore()
}
