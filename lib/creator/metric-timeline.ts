import { smoothMotion } from './report-motion'

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
  const place = (value: number) => {
    const angle = (value / 10 - .5) * sweep
    return { x: curved ? width / 2 + Math.sin(angle) * curveRadius : tracking && current !== undefined ? width / 2 + (value - current) * width / 4 : value / 10 * width, y: curved ? 20 + (1 - Math.cos(angle)) * curveHeight : balanced ? baseY + majorLength / 2 : baseY, rotation: curved ? Math.atan2(curveHeight * Math.sin(angle), curveRadius * Math.cos(angle)) : 0 }
  }
  const ticks = []
  const step = sparse ? labels && maximum > 0 ? 100 / maximum : 10 : segmented ? 5 : curved ? 2.5 : 2
  for (let tick = 0; tick <= 100; tick += .5) {
    const value = tick / 10
    const calibrated = value / 10 * maximum, labeled = labels && Math.abs(calibrated / 2 - Math.round(calibrated / 2)) < .000001, major = tick % 10 === 0 || labeled
    if (tick % step !== 0 && !labeled) continue
    const point = place(value)
    if (point.x < 0 || point.x > width) continue
    const length = sparse ? majorLength * (tick % 20 === 0 || labeled ? 1 : .45) : major ? majorLength : majorLength * (tick % 5 === 0 ? .55 : .32)
    ticks.push({ ...point, value, length, weight: sparse ? 10 : segmented ? 9 : tracking ? 6 : 5, opacity: (.42 + .58 * smoothMotion(amount * 1.6 - tick / 100 * .35)) * (current === undefined || value <= current ? 1 : .58), label: labeled ? String(Math.round(calibrated * 10) / 10) : undefined })
  }
  const cursors = values.map(place)
  const bottom = Math.max(baseY, ...ticks.map(tick => tick.y + Math.cos(tick.rotation) * (balanced ? tick.length / 2 : tick.length)), ...cursors.map(point => point.y + Math.cos(point.rotation) * (balanced ? majorLength / 2 + 13 : majorLength + 13)))
  return { ticks, cursors, majorLength, balanced, curved, sparse, baseY, bottom, place }
}

type TimelineOptions = GeometryOptions & { position?: number; ink: string; muted: string; line: string; accent: string; cursorLabel?: string; paintLabel?: (ctx: CanvasRenderingContext2D, frame: { x: number; y: number; width: number; height: number }, draw: (ctx: CanvasRenderingContext2D) => void) => void }

export function drawMetricTimeline(ctx: CanvasRenderingContext2D, options: TimelineOptions) {
  const { width, height, progress, ink, muted, labels = true, cursorLabel } = options
  const geometry = metricTimelineGeometry({ ...options, labels, positions: options.positions ?? (options.position === undefined ? [] : [options.position]) })
  const { majorLength, balanced } = geometry
  const accent = geometry.sparse ? metricTimelinePalette.warm : options.accent
  ctx.save(); ctx.lineCap = 'round'
  for (const tick of geometry.ticks) {
    ctx.save(); ctx.globalAlpha *= tick.opacity; ctx.translate(tick.x, tick.y); ctx.rotate(tick.rotation)
    ctx.strokeStyle = muted; ctx.lineWidth = tick.weight
    ctx.beginPath(); ctx.moveTo(0, balanced ? -tick.length / 2 : 0); ctx.lineTo(0, balanced ? tick.length / 2 : tick.length); ctx.stroke(); ctx.restore()
    if (tick.label !== undefined) { ctx.fillStyle = muted; ctx.font = '400 22px "Mogging Share", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(tick.label, tick.x, tick.y + (balanced ? tick.length / 2 : tick.length) + 20) }
  }
  geometry.cursors.forEach((point, index) => {
    ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(point.rotation); ctx.strokeStyle = index ? ink : accent; ctx.lineWidth = index ? 7 : geometry.sparse ? 16 : 9
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

// Report metrics use the native aperture and geometry, rather than the large
// editorial chart used elsewhere on the web.
export { drawNativeReportMetric as drawReportMetricTimeline, nativeMetricHeight as reportMetricHeight } from './native-report-metric'
export { timelineStyle as reportTimelineStyle } from './mobile-report-geometry'
