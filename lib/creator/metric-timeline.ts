import { smoothMotion } from './report-motion'
import { isDarkVideoContext, originalVideoContext } from './video-theme'

export const metricTimelineStyles = ['linear', 'arc', 'segmented', 'tracking', 'shallow-arc', 'balanced', 'sparse', 'sparse-arc'] as const

export function metricTimelineVariant(category: string, label = '', variation = 0) {
  const description = `${label} ${category}`.toLowerCase(), alternate = Math.abs(variation) % 2 === 1
  if (/psl|overall score|potential|facial thirds/.test(description)) return 6
  if (/eye area|jaw & chin|jaw definition|brow arch|forehead inclination|taper/.test(description)) return 7
  if (/angle|tilt/.test(label.toLowerCase())) return alternate ? 4 : 1
  if (/symmetr|balance|harmon|spacing|ratio|proportion/.test(label.toLowerCase())) return 5
  if (/width|height|volume|breadth/.test(label.toLowerCase())) return alternate ? 5 : 0
  if (/symmetr|balance|harmon|spacing|ratio|proportion/.test(description)) return 5
  if (/angle|tilt|jaw|chin|mandib/.test(description)) return alternate ? 4 : 1
  if (/brow|eye|lid|taper|curv/.test(description)) return alternate ? 1 : 4
  if (/skin|texture|smooth|tone|condition|hair/.test(description)) return 2
  if (/nose|nasal|projection|progress|change|week/.test(description)) return 3
  if (/width|cheek|volume|breadth/.test(description)) return alternate ? 5 : 0
  return 0
}


export const metricTimelinePalette = { ink: '#171d23', muted: '#83909d', line: '#dce2e8', accent: '#32b1ed', warm: '#ed982b' } as const
export const darkMetricTimelinePalette = { ink: '#f5eee2', muted: '#42403d', line: '#292827', accent: '#ff9d00', warm: '#ff9d00' } as const

type GeometryOptions = { width: number; height: number; positions?: number[]; progress: number; variant: number; labels?: boolean; maximum?: number }

export function metricTimelineGeometry({ width, height, positions = [], progress, variant, labels = false, maximum = 10 }: GeometryOptions) {
  const amount = Math.max(0, Math.min(1, progress)), style = ((variant % metricTimelineStyles.length) + metricTimelineStyles.length) % metricTimelineStyles.length
  const sparse = style >= 6, treatment = style === 6 ? 0 : style === 7 ? 4 : style
  const curved = treatment === 1 || treatment === 4, segmented = treatment === 2, tracking = treatment === 3, balanced = treatment === 5
  const values = positions.filter(Number.isFinite).map(position => Math.max(0, Math.min(1, position)) * amount * 10), current = values[0]
  const majorLength = Math.max(28, Math.min(sparse ? 100 : curved ? width * .1 : 140, height * .48)), baseY = Math.max(20, (height - majorLength - (labels ? 50 : 20)) / 2)
  const sweep = treatment === 4 ? 1.1 : 1.85
  const curveRadius = Math.max(0, width / 2 - 12) / Math.sin(sweep / 2)
  const curveHeight = Math.min(curveRadius * .7, Math.max(0, height - majorLength - (labels ? 52 : 20)) / (1 - Math.cos(sweep / 2)))
  const inset = labels ? Math.min(24,width*.04) : 0
  const place = (value: number) => {
    const angle = (value / 10 - .5) * sweep
    return { x: curved ? width / 2 + Math.sin(angle) * curveRadius : tracking && current !== undefined ? width / 2 + (value - current) * width / 4 : inset + value / 10 * (width - inset*2), y: curved ? 20 + (1 - Math.cos(angle)) * curveHeight : balanced ? baseY + majorLength / 2 : baseY, rotation: curved ? Math.atan2(curveHeight * Math.sin(angle), curveRadius * Math.cos(angle)) : 0 }
  }
  const ticks = []
  const divisions = Math.max(1,Math.round(maximum * (sparse || segmented ? 2 : curved ? 4 : 5)))
  for (let index = 0; index <= divisions; index++) {
    const tick = index / divisions * 100, value = tick / 10
    const calibrated = value / 10 * maximum, labeled = labels && Math.abs(calibrated / 2 - Math.round(calibrated / 2)) < .000001, major = Math.abs(calibrated - Math.round(calibrated)) < .000001 || labeled
    const point = place(value)
    if (point.x < 0 || point.x > width) continue
    const length = sparse ? majorLength * (major ? 1 : .45) : major ? majorLength : majorLength * (tick % 5 === 0 ? .55 : .32)
    const entrance = smoothMotion((amount - index / divisions * .22) / .68)
    ticks.push({ ...point, labelY:point.y+(balanced?length/2:length)+20, y:point.y+(1-entrance)*10, value, length:length*(.35+.65*entrance), weight: sparse ? 5 : segmented ? 7 : tracking ? 5 : 4, opacity: entrance * (current === undefined || value <= current ? 1 : .58), label: labeled ? String(Math.round(calibrated * 10) / 10) : undefined })
  }
  const cursors = values.map(place)
  const bottom = Math.max(baseY, ...ticks.map(tick => tick.y + Math.cos(tick.rotation) * (balanced ? tick.length / 2 : tick.length)), ...cursors.map(point => point.y + Math.cos(point.rotation) * (balanced ? majorLength / 2 + 13 : majorLength + 13)))
  return { ticks, cursors, majorLength, balanced, curved, sparse, baseY, bottom, place }
}

type TimelineOptions = GeometryOptions & { position?: number; ink: string; muted: string; line: string; accent: string; cursorLabel?: string; paintLabel?: (ctx: CanvasRenderingContext2D, frame: { x: number; y: number; width: number; height: number }, draw: (ctx: CanvasRenderingContext2D) => void) => void }

export function drawMetricTimeline(ctx: CanvasRenderingContext2D, options: TimelineOptions) {
  const dark = isDarkVideoContext(ctx)
  const palette = dark ? darkMetricTimelinePalette : options
  if (dark) ctx = originalVideoContext(ctx)
  const { width, height, progress, labels = true, cursorLabel } = options
  const { ink, muted } = palette
  const geometry = metricTimelineGeometry({ ...options, labels, positions: options.positions ?? (options.position === undefined ? [] : [options.position]) })
  const { majorLength, balanced } = geometry
  const accent = dark ? palette.accent : geometry.sparse ? metricTimelinePalette.warm : options.accent
  ctx.save(); ctx.lineCap = 'round'
  for (const tick of geometry.ticks) {
    ctx.save(); ctx.globalAlpha *= tick.opacity; ctx.translate(tick.x, tick.y); ctx.rotate(tick.rotation)
    ctx.strokeStyle = dark && geometry.cursors.some(point => Math.hypot(point.x - tick.x, point.y - tick.y) < width * .09) ? palette.ink : muted; ctx.lineWidth = tick.weight
    ctx.beginPath(); ctx.moveTo(0, balanced ? -tick.length / 2 : 0); ctx.lineTo(0, balanced ? tick.length / 2 : tick.length); ctx.stroke(); ctx.restore()
    if (tick.label !== undefined) { ctx.save(); ctx.globalAlpha *= tick.opacity; ctx.fillStyle = muted; ctx.font = '400 22px "Mogging Share", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(tick.label, tick.x, tick.labelY); ctx.restore() }
  }
  geometry.cursors.forEach((point, index) => {
    ctx.save(); ctx.globalAlpha *= smoothMotion(progress / .3); ctx.translate(point.x, point.y); ctx.rotate(point.rotation); ctx.strokeStyle = index ? ink : accent; ctx.lineWidth = index ? 7 : geometry.sparse ? 16 : 9
    ctx.beginPath(); ctx.moveTo(0, balanced ? -majorLength / 2 - 10 : -10); ctx.lineTo(0, balanced ? majorLength / 2 + 13 : majorLength + 13); ctx.stroke()
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(0, balanced ? -majorLength / 2 - 20 : -20, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  })
  if (cursorLabel) {
    const point = geometry.cursors[0] ?? { x: width / 2, y: geometry.baseY }
    ctx.font = '500 48px "Mogging Share", Arial, sans-serif'; ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    const textWidth = ctx.measureText(cursorLabel).width, size = Math.min(48, 48 * width / Math.max(width, textWidth))
    ctx.font = `500 ${size}px "Mogging Share", Arial, sans-serif`
    const labelWidth = ctx.measureText(cursorLabel).width
    ctx.globalAlpha *= smoothMotion((progress - .15) / .85)
    const frame = { x: Math.max(0, Math.min(width - labelWidth, point.x - labelWidth / 2)), y: geometry.bottom + 36 + (1 - progress) * 10, width: labelWidth, height: size * 1.2 }
    const draw = (ctx: CanvasRenderingContext2D) => { ctx.textAlign = 'left'; ctx.fillText(cursorLabel, 0, 0) }
    if (options.paintLabel) options.paintLabel(ctx, frame, draw)
    else { ctx.save(); ctx.translate(frame.x, frame.y); draw(ctx); ctx.restore() }
  }
  ctx.restore()
}

// Native report instruments mirror mogging-mobile/src/lib/metric-timeline.ts.
export function reportTimelineStyle(metricId: string, label = '', orbit = false) {
  const description = `${metricId} ${label}`.toLowerCase()
  if (/psl/.test(description)) return 'psl'
  if (metricId === 'overall.eyes') return 'arc'
  if (['cheeks.height', 'symmetry.eyes-height', 'skin.texture', 'jaw.height', 'eyes.opening'].includes(metricId)) return 'dial'
  if (['cheeks.midface', 'symmetry.chin-axis', 'face.frame', 'brows.length'].includes(metricId)) return 'tapered'
  if (metricId === 'symmetry.eyes-opening') return 'sparse-arc'
  if (metricId === 'symmetry.brows-shape' || metricId === 'symmetry.lip-contour') return 'arc'
  if (metricId === 'symmetry.nose-wings') return 'segmented'
  if (metricId === 'skin.tone') return 'sparse'
  if (metricId === 'skin.under-eye-contrast') return 'balanced'
  if (/symmetr|balance|harmon|spacing|ratio|alignment|angle.coordination/.test(description)) return 'balanced'
  if (/jaw.angle|brow.arch|projection/.test(description)) return 'sparse-arc'
  if (/angle|tilt|rotation|slope|convex|corner.position/.test(description)) return 'arc'
  if (/width|proportion|facial thirds|cheek|zygomatic/.test(description)) return 'balanced'
  if (/skin|texture|smooth|tone|condition|hair|density|coverage|groom/.test(description)) return 'segmented'
  if (/height|length|distance|opening/.test(description)) return 'linear'
  if (/jaw|chin|taper/.test(description)) return 'sparse-arc'
  if (/brow|eye|lid|curv/.test(description)) return 'arc'
  if (/overall score|potential/.test(description) || metricId === 'overall') return 'sparse'
  return orbit ? 'arc' : 'linear'
}
export type ReportTimelineStyle = ReturnType<typeof reportTimelineStyle>
export function reportTimelinePoint(position: number, width: number, style: ReportTimelineStyle) {
  const usable = Math.max(0, width - 20)
  if (style === 'dial') {
    const radius = Math.max(0, width / 2 - 14), angle = Math.PI * (.75 + position * 1.5)
    return { x: width / 2 + Math.cos(angle) * radius, y: radius + 14 + Math.sin(angle) * radius, rotation: angle + Math.PI / 2 }
  }
  if (style !== 'arc' && style !== 'sparse-arc') return { x: 10 + usable * position, y: 16, rotation: 0 }
  const sweep = style === 'sparse-arc' ? 1.1 : 1.85, angle = (position - .5) * sweep, radius = usable / 2 / Math.sin(sweep / 2)
  return { x: width / 2 + Math.sin(angle) * radius, y: 14 + (1 - Math.cos(angle)) * radius * .65, rotation: Math.atan2(.65 * Math.sin(angle), Math.cos(angle)) }
}
function buildReportTimelineGeometry(width: number, style: ReportTimelineStyle) {
  const sparse = ['sparse', 'sparse-arc', 'psl', 'tapered', 'dial'].includes(style), curved = style === 'arc' || style === 'sparse-arc'
  const count = style === 'psl' ? 14 : style === 'dial' ? 40 : style === 'tapered' ? 20 : sparse || style === 'segmented' ? 10 : 20
  const majorLength = style === 'dial' ? Math.min(28, width * .09) : curved ? 25 : 32
  const ticks = Array.from({ length: count + 1 }, (_, index) => {
    const point = reportTimelinePoint(index / count, width, style)
    const major = style === 'dial' ? index % 4 === 0 : sparse ? index % 2 === 0 : index % (count / 10) === 0
    const tapered = style === 'psl' || style === 'tapered'
    const length = tapered ? 11 + Math.pow(1 - index / count, .8) * 21 + (major ? 9 : 0) : major ? majorLength : majorLength * .48
    const start = tapered ? 48 - length + (major ? 5 : 0) - point.y : style === 'balanced' ? -length / 2 + majorLength / 2 : 0
    return { ...point, start, length, bottom: point.y + Math.cos(point.rotation) * (start + length), weight: style === 'psl' || style === 'tapered' ? 2.8 : style === 'dial' ? 2.6 : sparse || style === 'segmented' ? 3.4 : 2.2 }
  })
  return { ticks, majorLength, sparse, height: Math.ceil(Math.max(...ticks.map(tick => tick.bottom)) + 14) }
}
const reportGeometry = new Map<string, ReturnType<typeof buildReportTimelineGeometry>>()
export function reportTimelineGeometry(width: number, style: ReportTimelineStyle) {
  const key = `${width}:${style}`
  let geometry = reportGeometry.get(key)
  if (!geometry) {
    geometry = buildReportTimelineGeometry(width, style)
    if (reportGeometry.size >= 96) reportGeometry.clear()
    reportGeometry.set(key, geometry)
  }
  return geometry
}
type ReportTimelineFeature = { id?: string; label: string; value: string; visual?: string; grade?: number | null; positions?: number[]; scale?: string }
export function reportMetricHeight(feature: ReportTimelineFeature, width: number) {
  const style = reportTimelineStyle(feature.id ?? '', feature.label, feature.visual === 'Orbit')
  return style === 'dial' ? Math.ceil(width / 1.12) : Math.max(width > 200 ? 70 : 64, reportTimelineGeometry(width, style).height)
}
export function drawReportMetricTimeline(ctx: CanvasRenderingContext2D, feature: ReportTimelineFeature, x: number, y: number, width: number, _height: number, progress = 1) {
  const dark = isDarkVideoContext(ctx)
  const palette = dark ? darkMetricTimelinePalette : metricTimelinePalette
  if (dark) ctx = originalVideoContext(ctx)
  const positions = feature.visual === 'Rail' ? feature.grade == null ? feature.positions ?? [] : [feature.grade / 10] : feature.positions ?? []
  if (!positions.length) return
  const style = reportTimelineStyle(feature.id ?? '', feature.label, feature.visual === 'Orbit'), geometry = reportTimelineGeometry(width, style)
  ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'
  // Batch the static ruler into one path, as mobile does with its Skia path.
  ctx.save(); ctx.globalAlpha *= dark ? 1 : .72; ctx.strokeStyle = palette.muted; ctx.lineWidth = geometry.ticks[0].weight; ctx.beginPath()
  for (const tick of geometry.ticks) {
    ctx.moveTo(tick.x - Math.sin(tick.rotation) * tick.start, tick.y + Math.cos(tick.rotation) * tick.start)
    ctx.lineTo(tick.x - Math.sin(tick.rotation) * (tick.start + tick.length), tick.y + Math.cos(tick.rotation) * (tick.start + tick.length))
  }
  ctx.stroke(); ctx.restore()
  positions.filter(Number.isFinite).forEach((position, index) => {
    const normalized = style === 'psl' ? (Math.max(1 / 8, position) * 8 - 1) / 7 : position
    const point = reportTimelinePoint(Math.max(0, Math.min(1, normalized)) * progress, width, style)
    if (dark && index === 0) {
      // Keep distant marks quiet; a few warm highlights lead into the active tick.
      ctx.save(); ctx.strokeStyle = palette.ink; ctx.lineWidth = geometry.ticks[0].weight
      const opacity = ctx.globalAlpha
      for (const tick of geometry.ticks) {
        const proximity = Math.max(0, 1 - Math.hypot(tick.x - point.x, tick.y - point.y) / (width * .16))
        if (!proximity) continue
        ctx.globalAlpha = opacity * proximity * progress
        ctx.beginPath()
        ctx.moveTo(tick.x - Math.sin(tick.rotation) * tick.start, tick.y + Math.cos(tick.rotation) * tick.start)
        ctx.lineTo(tick.x - Math.sin(tick.rotation) * (tick.start + tick.length), tick.y + Math.cos(tick.rotation) * (tick.start + tick.length))
        ctx.stroke()
      }
      ctx.restore()
    }
    ctx.save(); ctx.globalAlpha *= progress; ctx.translate(point.x, point.y); ctx.rotate(point.rotation)
    ctx.strokeStyle = index ? palette.ink : dark ? palette.accent : geometry.sparse ? palette.warm : palette.accent
    ctx.lineWidth = geometry.sparse ? 4.8 : 3
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, geometry.majorLength + 7); ctx.stroke()
    ctx.fillStyle = palette.ink; ctx.beginPath(); ctx.arc(0, -10, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  })
  if (style === 'psl') {
    ctx.save(); ctx.globalAlpha *= progress; ctx.fillStyle = palette.muted; ctx.font = '400 8px "Mogging Share", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    for (let index = 0; index < 8; index++) ctx.fillText(String(index + 1), reportTimelinePoint(index / 7, width, style).x, 59)
    ctx.restore()
  }
  ctx.restore()
}
