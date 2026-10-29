import { timelineAxisLabels, timelineGeometry, timelinePoint, timelinePositions, timelineStyle, timelinePalette } from './mobile-report-geometry'
import { triangulationGeometry, triangulationPoint, triangulationEntry, triangulationValue, type Triangulation } from './mobile-overlay-engine/triangulation'
import type { ReportFeature } from './mobile-overlay-engine/report-data'

export function nativeMetricHeight(feature: ReportFeature, width: number, full = width > 200) {
  if (feature.triangulation) return triangulationGeometry(width).height
  const style = timelineStyle(feature.id ?? '', feature.label, feature.visual === 'Orbit')
  if (style === 'dial') return width / 1.12
  if (style === 'triangulation') return 70
  const axis = full || style === 'psl' || feature.axis
  return Math.max(full ? 70 : 64, timelineGeometry(width, style).height + (axis ? 12 : 0))
}

export function drawNativeReportMetric(ctx: CanvasRenderingContext2D, feature: ReportFeature, x: number, y: number, width: number, _height: number, progress = 1) {
  if (feature.triangulation) { drawTriangulation(ctx, feature.triangulation, x, y, width, progress); return }
  const selected = timelineStyle(feature.id ?? '', feature.label, feature.visual === 'Orbit')
  const style = selected === 'triangulation' ? 'balanced' : selected
  const visual = { kind: feature.visual ?? 'Text', positions: feature.positions ?? [], grade: feature.grade ?? null, scale: feature.scale, maximum: feature.maximum, axis: feature.axis }
  const positions = timelinePositions(visual, false, style)
  if (!positions.length) return
  const geometry = timelineGeometry(width, style)
  ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'
  ctx.save(); ctx.globalAlpha *= progress * .72; ctx.strokeStyle = timelinePalette.muted
  ctx.lineWidth = geometry.ticks[0].weight; ctx.beginPath()
  for (const [index, tick] of geometry.ticks.entries()) {
    // Match Skia's path reveal in the native entry animation.
    if (index / geometry.ticks.length > progress) break
    ctx.moveTo(tick.start.x, tick.start.y); ctx.lineTo(tick.end.x, tick.end.y)
  }
  ctx.stroke(); ctx.restore()
  positions.forEach((position, index) => {
    const point = timelinePoint(position * progress, width, style)
    ctx.save(); ctx.globalAlpha *= progress; ctx.translate(point.x, point.y); ctx.rotate(point.rotation)
    ctx.strokeStyle = index ? timelinePalette.ink : geometry.sparse ? timelinePalette.warm : timelinePalette.accent
    ctx.lineWidth = geometry.sparse ? 4.8 : 3
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, geometry.majorLength + 7); ctx.stroke()
    ctx.fillStyle = timelinePalette.ink; ctx.beginPath(); ctx.arc(0, -10, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  })
  if (width > 200 || style === 'psl' || feature.axis) {
    ctx.globalAlpha *= progress; ctx.fillStyle = timelinePalette.muted; ctx.font = '400 8px -apple-system, BlinkMacSystemFont, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    for (const item of timelineAxisLabels(width, style, visual)) ctx.fillText(item.text, item.x, item.y)
  }
  ctx.restore()
}

function drawTriangulation(ctx: CanvasRenderingContext2D, profile: Triangulation, x: number, y: number, width: number, progress: number) {
  const geometry = triangulationGeometry(width), gray = '#97979e'
  const points = geometry.vertices.map((vertex, index) => triangulationPoint(geometry.center, vertex, (profile.axes[index].value ?? 0) / profile.maximum * triangulationEntry(progress, index)))
  const polygon = (vertices: { x: number; y: number }[]) => { ctx.beginPath(); vertices.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath() }
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = gray; ctx.lineCap = 'round'; ctx.globalAlpha *= progress
  ctx.save(); ctx.globalAlpha *= .2; ctx.lineWidth = .8; polygon(geometry.vertices); ctx.stroke(); ctx.restore()
  ctx.save(); ctx.globalAlpha *= .35; ctx.lineWidth = 1.8; ctx.beginPath()
  for (const tick of geometry.ticks) { ctx.moveTo(tick.start.x, tick.start.y); ctx.lineTo(tick.end.x, tick.end.y) }
  ctx.stroke(); ctx.restore()
  if (profile.axes.every(axis => axis.value !== null)) {
    polygon(points); ctx.fillStyle = '#97979e11'; ctx.fill(); ctx.strokeStyle = '#97979e59'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = '#97979ea6'
    for (const point of points) { ctx.beginPath(); ctx.arc(point.x, point.y, 2.5, 0, Math.PI * 2); ctx.fill() }
  }
  profile.axes.forEach((axis, index) => {
    const left = index === 0 ? width * .5 : index === 1 ? width : 0, top = index === 0 ? 0 : geometry.readoutTop
    ctx.textAlign = index === 0 ? 'center' : index === 1 ? 'right' : 'left'; ctx.textBaseline = 'top'
    ctx.fillStyle = timelinePalette.muted; ctx.font = '400 9px Courier'; ctx.fillText(axis.label.toUpperCase(), left, top)
    ctx.fillStyle = timelinePalette.ink; ctx.font = '400 26px -apple-system, BlinkMacSystemFont, Arial'; ctx.fillText(axis.value === null ? '—' : triangulationValue(axis.value, profile.unit), left, top + 16)
  })
  ctx.restore()
}
