import { creatorStudies } from './creator-studies'
import { drawEditorialDefocus, drawEditorialPortrait, editorialBackground, editorialReveal, editorialCoverPose, wrapEditorialText, mixEditorialPose, type EditorialPortraitPose } from './editorial-layout'
import { editorialEase } from './editorial-motion'
import type { EditorialEvent, EditorialPhoto, EditorialPresentation } from './editorial-scenes'

export const featureEffectKinds = [
  'cue-index', 'relationship-bridge', 'landmark-route', 'timing-dial', 'paired-leaders',
  'feature-ordinal', 'statement-slit', 'contour-matte', 'source-pin', 'measurement-projection',
] as const
type Kind = typeof featureEffectKinds[number]
type Point = { x: number; y: number }
type Geometry = typeof import('./editorial-scenes').editorialFeatureGeometry
type Feature = Parameters<Geometry>[1]
type Cue = { time: number; duration: number; events: EditorialEvent[]; reduced: boolean }
const isFeatureEffect = (value: string): value is Kind => featureEffectKinds.some(kind => kind === value)
const mix = (a: Point, b: Point, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const labels: Partial<Record<Feature, string>> = { eyes: 'Eyes', brows: 'Brows', nose: 'Nose', lips: 'Lips', jaw: 'Jawline', cheeks: 'Cheekbones', philtrum: 'Philtrum' }

function stroke(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (!points.length) return
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y)
  ctx.stroke()
}

function dot(ctx: CanvasRenderingContext2D, point: Point, radius: number) {
  ctx.beginPath()
  ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI)
  ctx.fill()
}

function arrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, amount: number) {
  if (!amount) return
  const tip = mix(from, to, amount)
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const wing = Math.min(26, Math.hypot(tip.x - from.x, tip.y - from.y) * .4)
  stroke(ctx, [from, tip])
  stroke(ctx, [
    { x: tip.x - Math.cos(angle - .53) * wing, y: tip.y - Math.sin(angle - .53) * wing },
    tip,
    { x: tip.x - Math.cos(angle + .53) * wing, y: tip.y - Math.sin(angle + .53) * wing },
  ])
}

export function drawEditorialFeatureEffect(
  ctx: CanvasRenderingContext2D, presentation: EditorialPresentation, feature: Feature, primary: EditorialPhoto,
  pose: EditorialPortraitPose, size: { width: number; height: number }, cue: Cue, dark: boolean, geometry: Geometry,
) {
  const kind = presentation.kind
  if (!isFeatureEffect(kind)) return false
  const { width, height } = size
  const first = cue.events[0]?.atMs
  if (first === undefined || cue.time < first) return true
  const ease = (at: number, ms = 500) => cue.time < at ? 0 : cue.reduced ? 1 : editorialEase((cue.time - at) / ms)
  const entry = ease(first)
  const variant = presentation.variant
  const ink = dark ? '#fafafa' : '#202629'
  const quiet = dark ? '#dadfe1' : '#535f62'
  const backdrop = dark ? '#292b2ef5' : '#fafbfaf5'
  const project = (p: Point) => ({
    x: pose.image.x + p.x / primary.image.width * pose.image.width,
    y: pose.image.y + p.y / primary.image.height * pose.image.height,
  })
  const targets = cue.events.flatMap(event => {
    const detail = geometry(primary, event.feature)
    if (!detail) return []
    const bounds = detail.frame
    const center = project({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    return [{ event, detail, center }]
  })
  const selected = targets.findLast(target => target.event.atMs <= cue.time) ?? targets[0]
  const panel = (x: number, y: number, w: number, h: number) => {
    ctx.save()
    ctx.fillStyle = backdrop
    ctx.shadowColor = dark ? '#00000030' : '#14181720'
    ctx.shadowBlur = 17
    ctx.shadowOffsetY = 4
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 23); ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = dark ? '#ffffff42' : '#ffffffda'
    ctx.lineWidth = 1.6; ctx.stroke()
    ctx.restore()
  }
  const type = (text: string, x: number, y: number, font = '500 32px "Mogging Share",Arial,sans-serif', max?: number) => {
    ctx.font = font; ctx.fillStyle = ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
    ctx.fillText(text, x, y, max)
  }
  const glassInk = () => {
    ctx.strokeStyle = ctx.fillStyle = '#f7ffffed'
    ctx.lineWidth = 3.4
  }
  ctx.save()
  if (kind === 'cue-index' && cue.events.length >= 2) {
    const current = Math.max(0, cue.events.findLastIndex(event => cue.time >= event.atMs))
    const next = cue.events[current]
    const marker = current ? current - 1 + ease(next.atMs, 300) : 0
    const x = width * .091, y = height * .753 - entry * 24
    ctx.globalAlpha *= entry
    panel(x, y, width * .43, cue.events.length * 55 + 31)
    cue.events.forEach((event, i) => {
      ctx.save()
      ctx.globalAlpha *= i === current ? 1 : .51
      type(String(i + 1).padStart(2, '0'), x + 55, y + 44 + i * 55, '400 27px monospace')
      type(labels[event.feature] ?? event.feature, x + 121, y + 44 + i * 55)
      ctx.restore()
    })
    ctx.strokeStyle = quiet; ctx.lineWidth = 2.5
    arrow(ctx, { x: x + 12, y: y + 44 + marker * 55 }, { x: x + 40, y: y + 44 + marker * 55 }, 1)
  } else if (kind === 'relationship-bridge' && targets.length >= 2) {
    const left = width * .10, y = height * .704, edge = width * .265, right = width * .635
    for (const [i, target] of targets.slice(0, 2).entries()) {
      const t = ease(target.event.atMs, 560)
      if (!t) continue
      const frame = { x: i ? right : left, y, width: edge, height: height * .139 }
      const detail = target.detail.frame
      const aspect = frame.width / frame.height
      const cropWidth = Math.max(detail.width * 1.15, detail.height * aspect * 1.15)
      const cropHeight = cropWidth / aspect
      const crop = { x: detail.x + (detail.width - cropWidth) / 2, y: detail.y + (detail.height - cropHeight) / 2, width: cropWidth, height: cropHeight }
      const destination = editorialCoverPose(primary, frame, 23, crop)
      const near = { ...frame, x: target.center.x - edge * .14, y: target.center.y - edge * .14, width: edge * .28, height: edge * .28 }
      drawEditorialPortrait(ctx, primary, mixEditorialPose(editorialCoverPose(primary, near, 17, crop), destination, t))
      ctx.save(); ctx.globalAlpha *= t
      panel(frame.x, frame.y + frame.height + 10, edge, 53)
      type(labels[target.event.feature] ?? target.event.feature, frame.x + 15, frame.y + frame.height + 37, undefined, edge - 30)
      ctx.restore()
    }
    const t = ease(targets[1].event.atMs + 190)
    ctx.strokeStyle = '#effff8'; ctx.lineWidth = 5
    arrow(ctx, { x: left + edge + 18, y: y + height * .069 }, { x: right - 18, y: y + height * .069 }, t)
  } else if (kind === 'landmark-route' && targets.length >= 2) {
    glassInk()
    for (let i = 1; i < targets.length; i++) {
      const from = targets[i - 1], to = targets[i], t = ease(to.event.atMs, 640)
      if (!t) continue
      const bend = { x: (from.center.x + to.center.x) / 2 + width * (variant % 2 ? .086 : -.086), y: (from.center.y + to.center.y) / 2 }
      const pointAt = (position: number) => mix(mix(from.center, bend, position), mix(bend, to.center, position), position)
      const shaft = Math.max(0, t - .10)
      stroke(ctx, Array.from({ length: 13 }, (_, index) => pointAt(shaft * index / 12)))
      arrow(ctx, pointAt(shaft), pointAt(t), 1)
      dot(ctx, from.center, 7)
      if (t > .88) dot(ctx, to.center, 8)
    }
  } else if (kind === 'timing-dial') {
    const center = { x: width * (variant % 2 ? .77 : .22), y: height * .72 }
    const radius = width * .089, t = ease(first, 1360)
    ctx.globalAlpha *= entry
    panel(center.x - radius - 28, center.y - radius - 28, (radius + 28) * 2, radius * 2 + 115)
    ctx.strokeStyle = quiet; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI); ctx.stroke()
    for (let i = 0; i < 12; i++) {
      const theta = i * Math.PI / 6
      stroke(ctx, [radius * .85, radius].map(r => ({ x: center.x + Math.cos(theta) * r, y: center.y + Math.sin(theta) * r })))
    }
    const theta = t * 2 * Math.PI - Math.PI / 2
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius * .76, -Math.PI / 2, theta)
    ctx.strokeStyle = dark ? '#d3dcd87a' : '#4d6a6174'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.strokeStyle = quiet
    ctx.lineWidth = 4
    stroke(ctx, [center, { x: center.x + Math.cos(theta) * radius * .75, y: center.y + Math.sin(theta) * radius * .75 }])
    type(presentation.label ?? '', center.x - radius, center.y + radius + 48, '500 30px monospace', radius * 2)
  } else if (kind === 'paired-leaders' && selected) {
    const { center, detail } = selected
    const sorted = detail.points.toSorted((a, b) => a.x - b.x)
    const left = sorted[0], right = sorted.at(-1)!
    if (left.x !== right.x) {
      for (const [i, p] of [left, right].entries()) {
        const start = project(p)
        const t = ease(first + i * 145)
        if (!t) continue
        const end = { x: width * (i ? .89 : .11), y: center.y + (i ? 96 : -88) }
        const elbow = { x: end.x, y: start.y }
        glassInk()
        ctx.setLineDash([4, 8])
        stroke(ctx, [start, mix(start, elbow, Math.min(1, t * 1.5))])
        if (t > 2 / 3) stroke(ctx, [elbow, mix(elbow, end, t * 3 - 2)])
        ctx.setLineDash([])
        dot(ctx, start, 7)
        if (t > .85) {
          const x = i ? end.x - 225 : end.x - 10
          panel(x, end.y - 29, 235, 58)
          type(i ? 'Image right' : 'Image left', x + 14, end.y, '500 32px monospace', 203)
        }
      }
    }
  } else if (kind === 'feature-ordinal' && selected) {
    const target = selected.center
    const x = Math.min(width * .71, Math.max(width * .10, target.x + (variant % 2 ? 118 : -274)))
    const y = target.y - 123 * entry
    glassInk()
    arrow(ctx, { x: x + 90, y: y + 72 }, target, entry)
    ctx.globalAlpha *= entry
    panel(x, y, 187, 90)
    type(labels[feature] ?? feature, x + 16, y + 25, '500 25px monospace', 152)
    type(presentation.label ?? '', x + 16, y + 61, 'italic 41px Georgia,serif', 152)
  } else if (kind === 'statement-slit') {
    const text = (presentation.dialogue?.[0] ?? '').replace(/^[“"‘']|[”"’']$/g, '')
    const { enter: wipe, opacity } = editorialReveal(cue.time, first, cue.duration, 680, 400, cue.reduced)
    ctx.globalAlpha *= opacity
    ctx.fillStyle = editorialBackground(dark)
    ctx.fillRect(0, 0, width, height)
    const inset = width * .135, available = width - 2 * inset
    const font = '600 81px "Mogging Share",Arial,sans-serif'
    ctx.font = font
    const rows = wrapEditorialText(ctx, text, available)
    const leading = 103, top = height * .50 - (rows.length - 1) * leading / 2
    ctx.save()
    ctx.beginPath()
    ctx.rect(inset - 16, 0, (available + 32) * wipe, height)
    ctx.clip()
    ctx.font = '500 154px "Mogging Share",Arial,sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = quiet
    ctx.textAlign = 'left'
    ctx.fillText('“', inset, top - 136)
    ctx.textAlign = 'right'
    ctx.fillText('”', width - inset, top + (rows.length - 1) * leading + 127)
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.fillStyle = ink
    rows.forEach((row, index) => ctx.fillText(row, width / 2, top + index * leading, available))
    ctx.restore()
  } else if (kind === 'contour-matte' && selected) {
    const paths = selected.detail.paths.filter(path => path.length >= 4)
    if (paths.length) {
      const { opacity } = editorialReveal(cue.time, first, cue.duration, 500, 400, cue.reduced)
      ctx.globalAlpha *= opacity
      drawEditorialDefocus(ctx, primary, pose, size, dark, { key: selected.event.feature, paths })
    }
  } else if (kind === 'source-pin' && selected) {
    const study = presentation.studies?.[0] && creatorStudies[presentation.studies[0]]
    if (study) {
      const x = width * (variant % 2 ? .11 : .32), y = height * .754, w = width * .56
      glassInk()
      arrow(ctx, { x: x + w / 2, y }, selected.center, entry)
      ctx.globalAlpha *= entry
      panel(x, y, w, 124)
      type(study.title, x + 21, y + 38, undefined, w - 42)
      type(`${study.authors} · ${study.year} · ${study.doi}`, x + 21, y + 87, '400 27px monospace', w - 42)
    }
  } else if (kind === 'measurement-projection' && selected) {
    const samples = selected.detail.points.map(project).toSorted((a, b) => a.x - b.x)
    const vertical = variant % 2 === 1
    const datum = vertical ? width * .83 : height * .79
    const projected = samples.filter((_, i) => i % Math.max(1, Math.floor(samples.length / 6)) === 0).slice(0, 7)
    glassInk()
    projected.forEach((point, i) => {
      const to = vertical ? { x: datum, y: point.y } : { x: point.x, y: datum }
      const t = ease(first + i * 80, 510)
      if (!t) return
      ctx.setLineDash([6, 8])
      stroke(ctx, [point, mix(point, to, t)])
      ctx.setLineDash([])
      dot(ctx, point, 5)
      if (t > .91) dot(ctx, to, 7)
    })
    if (entry > .6) {
      const a = vertical ? { x: datum, y: height * .37 } : { x: width * .16, y: datum }
      const b = vertical ? { x: datum, y: height * .78 } : { x: width * .84, y: datum }
      stroke(ctx, [a, mix(a, b, ease(first + 350, 640))])
    }
  }
  ctx.restore()
  return true
}
