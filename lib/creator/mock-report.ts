import { drawReportTriangulation, triangulationGeometry } from './report-triangulation'
import { drawReportPortrait, drawReportPortraitFade } from './report-portrait'
import { drawReportMetricTimeline, reportMetricHeight, reportTimelineStyle } from './metric-timeline'
import { drawFaceTreatment } from './face-treatment'
import { paintCanvasNode, type CanvasPainter } from './canvas-layout'
import { reportUi } from './mobile-report-ui'
import { drawRollingNumber, rollingNumberWidth } from './rolling-number'
import type { ContentSlide } from './content-generator'
import { type ReportOverlay } from './report-overlay'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import { buildCategoryActionPlan } from './mobile-overlay-engine/category-action-plan'

// Logical iPhone 13/14 viewport. Dimensions, colors and typography follow
// mogging-mobile/src/screens/report-screen.tsx. Export uses the same painter.
export const mockReportSize = { width: 390, height: 844 }
export const mockReportFormat = { width: 1170, height: 2532 }
export const mockReportHeroHeight = Math.round(mockReportSize.height * .55)
export const videoReportPortraitHeight = (viewportHeight: number) => Math.min(mockReportHeroHeight, viewportHeight * .45)
const ink = reportUi.ink, paper = reportUi.panel, muted = reportUi.muted
export const mockEyePalette = [
  { name: 'blue', hex: '#6ea5ce' }, { name: 'gray', hex: '#87989f' },
  { name: 'green', hex: '#6e8962' }, { name: 'hazel', hex: '#8c8555' },
  { name: 'amber', hex: '#ac8748' }, { name: 'brown', hex: '#795439' },
  { name: 'dark brown', hex: '#382723' },
]
const sans = '"Mogging Share", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'

export function animateMetricText(value: string, progress: number) {
  if (progress >= 1) return value
  return value.replace(/\d+(?:\.\d+)?/g, (number, offset: number) => /\/\s*$/.test(value.slice(0, offset)) ? number : (Number(number) * Math.max(0, progress)).toFixed(number.includes('.') ? number.split('.')[1].length : 0))
}

export function drawMockReport(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, overlay: ReportOverlay | null, width: number, height: number, time: number, paintOverlay = drawFaceTreatment, options: { viewportHeight?: number; deviceChrome?: boolean; presentation?: 'app' | 'video'; metricProgress?: number; growthProgress?: number; featureProgress?: (id: string, top: number) => number; paint?: CanvasPainter; regions?: ReportRegion[]; cull?: boolean } = {}) {
  const report = slide.mockReport
  if (!report) return
  const { category } = report, w = mockReportSize.width, h = options.viewportHeight ?? mockReportSize.height
  const paint = options.paint ?? paintCanvasNode
  const regions = options.regions ?? mockReportRegions(ctx, category)
  const contentTop = options.presentation === 'video' || options.deviceChrome ? 0 : 61
  const contentBottom = options.presentation === 'video' ? 0 : 84
  const portraitHeight = options.presentation === 'video' ? videoReportPortraitHeight(h) : mockReportHeroHeight
  const portraitTop = mockReportHeroHeight - portraitHeight
  paint(ctx, { id: 'report', label: 'Report', frame: { x: 0, y: 0, width, height }, size: { width: w, height: h }, clip: true, draw: ctx => {
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    paint(ctx, { id: 'background', label: 'Report background', frame: { x: 0, y: 0, width: w, height: h }, draw: ctx => { ctx.fillStyle = paper; ctx.fillRect(0, 0, w, h) } })
    paint(ctx, { id: 'report-viewport', label: 'Scrollable report', frame: { x: 0, y: contentTop, width: w, height: Math.max(0, h - contentTop - contentBottom) }, clip: true, draw: ctx => {
      ctx.translate(0, -report.scroll - contentTop)
      for (const region of regions) {
        if (region.id === 'features' || options.cull && (region.y + region.height < report.scroll + contentTop - 24 || region.y > report.scroll + h - contentBottom + 24)) continue
        if (region.id === 'hero') {
          paint(ctx, { id: 'hero', label: region.label, frame: region, draw: ctx => {
            if (image) paint(ctx, { id: 'portrait', label: 'Report portrait', frame: { x: 0, y: portraitTop, width: w, height: portraitHeight }, clip: true, draw: ctx => {
              drawReportPortrait(ctx, image, w, portraitHeight, overlay?.portraitCrop)
              if (overlay) paint(ctx, { id: 'overlay', label: 'Face measurements', frame: { x: 0, y: 0, width: w, height: portraitHeight }, draw: ctx => paintOverlay(ctx, overlay, w, time) })
            } })
          } })
          paint(ctx, { id: 'hero-fade', label: 'Portrait fade', frame: { x: 0, y: portraitTop, width: w, height: portraitHeight }, draw: ctx => {
            drawReportPortraitFade(ctx, w, portraitHeight)
          } })
        } else if (region.id === 'eye-color') {
          paint(ctx, { id: region.id, label: region.label, frame: region, draw: ctx => {
            const selected = mockEyePalette.find(shade => shade.name === category.eyeColor)!
            card(ctx, 0, 0, region.width, region.height, 18)
            label(ctx, 'Eye color', 16, 16)
            text(ctx, selected.name[0].toUpperCase() + selected.name.slice(1), region.width - 16, 16, 14, 600, ink, true)
            drawColorPalette(ctx, 16, 47, region.width - 32, 28, mockEyePalette.indexOf(selected))
          } })

        } else if (region.id === 'sources') {
          paint(ctx, { id: region.id, label: region.label, frame: region, draw: ctx => {
            card(ctx, 0, 0, region.width, region.height, 18)
            label(ctx, 'Sources', 14, 14)
            paragraph(ctx, 'Cosmetic UV and visible age context only. This is not medical advice.', 14, 36, w - 64, 13, 19, muted)
            text(ctx, category.id === 'skin-age' ? 'AAD: sunscreen and moisturizer for aging skin' : 'FDA sun safety and sunscreen guidance', 14, 86, 12, 600, ink, false, w - 64)
            text(ctx, category.id === 'skin-age' ? 'AAD: how to apply and reapply sunscreen' : 'CDC sun safety facts', 14, 112, 12, 600, ink, false, w - 64)
          } })
        } else {
          const amount = region.id === 'potential' ? options.growthProgress ?? options.metricProgress ?? 1 : region.id.startsWith('feature:') ? options.featureProgress?.(region.id, region.y) ?? options.metricProgress ?? 1 : options.metricProgress ?? 1
          drawReportComponent(ctx, slide, region, region, Math.max(0, Math.min(1, amount)), paint)
        }
      }
    } })
    paint(ctx, { id: 'report-finish', label: options.presentation === 'video' ? 'Bottom fade' : 'App controls', frame: { x: 0, y: 0, width: w, height: h }, draw: ctx => {
      if (options.presentation === 'video') fade(ctx, h - 110, 110, '255,255,255')
      else drawChrome(ctx, category, h, options.deviceChrome ?? false)
    } })
  } })
}

export function nativeMetricFeature(feature: ReportCategory['features'][number]) {
  if (feature.triangulation) return { ...feature, visual: feature.visual === 'Text' ? 'Rail' : feature.visual ?? 'Rail' }
  if (feature.visual && feature.visual !== 'Text') return feature
  if (feature.grade != null && Number.isFinite(feature.grade)) return { ...feature, visual: 'Rail' }
  if (feature.scale === 'quality' && feature.positions?.length && /^\d/.test(feature.value)) return { ...feature, visual: 'Orbit' }
  return { ...feature, visual: 'Text' }
}

export function drawFeatureCard(ctx: CanvasRenderingContext2D, source: ReportCategory['features'][number], width: number, height: number, progress = 1, identity = source.id ?? source.label, paint: CanvasPainter = paintCanvasNode, showVisual = true) {
  const feature = nativeMetricFeature(source)
  const part = (id: string, caption: string, frame: ReportRect, draw: (ctx: CanvasRenderingContext2D) => void) => paint(ctx, { id: `${identity}/${id}`, label: `${feature.label} · ${caption}`, frame, draw })
  const pad = reportUi.padding, visual = showVisual && feature.value.trim() ? feature.visual ?? 'Text' : 'Text', innerWidth = width - pad * 2
  const dial = visual !== 'Text' && reportTimelineStyle(feature.id ?? '', feature.label, visual === 'Orbit') === 'dial'
  part('surface', 'Card', { x: 0, y: 0, width, height }, ctx => card(ctx, 0, 0, width, height, reportUi.radius))
  const labelHeight = wrap(ctx, feature.label, innerWidth, 12, 400).length * 16
  const visualTop = pad + labelHeight + 18
  part('label', 'Label', { x: pad, y: pad, width: innerWidth, height: labelHeight }, ctx => paragraph(ctx, feature.label, 0, 0, innerWidth, 12, 16, ink))
  if (showVisual && feature.triangulation) {
    part('visual', 'Three measured axes', { x: pad, y: visualTop, width: innerWidth, height: triangulationGeometry(innerWidth).height }, ctx => drawReportTriangulation(ctx,feature.triangulation!,innerWidth,progress))
    return
  }
  if (visual !== 'Text') part('visual', 'Visualization', { x: pad, y: visualTop, width: innerWidth, height: dial ? reportMetricHeight(feature, innerWidth) : height - visualTop - 58 }, ctx => drawMetricVisual(ctx, feature, 0, 0, innerWidth, height - 124, progress))
  let size = width > 200 ? reportUi.valueSize : reportUi.compactValueSize
  const gradeWidth = !dial && feature.grade != null ? (width > 200 ? 78 : 64) : 0
  const valueWidth = innerWidth - gradeWidth
  const value = feature.value.trim() || 'Not assessed'
  const lines = wrap(ctx, value, valueWidth, size, 400)
  while (lines.length > 3 && size > 16) { size--; lines.splice(0, lines.length, ...wrap(ctx, value, valueWidth, size, 400)) }
  const lineCount = Math.min(3, lines.length)
  part(feature.value.trim() ? 'value' : 'status', 'Value', { x: dial ? width * .23 : pad, y: dial ? visualTop + reportMetricHeight(feature, innerWidth) * .47 : height - pad - lineCount * 32, width: dial ? width * .54 : valueWidth, height: lineCount * 32 }, ctx => lines.slice(0, 3).forEach((line, index) => metricValue(ctx, line, 0, index * 32, size, progress)))
  if (feature.measurement) part('measurement', 'Measurement', { x: pad, y: height - pad - lineCount * 32 - 24, width: innerWidth, height: 18 }, ctx => text(ctx, feature.measurement!, 0, 0, 12, 400, muted))
  if (feature.grade != null) part('grade', 'Grade', { x: dial ? width * .3 : width - pad - gradeWidth, y: dial ? visualTop + reportMetricHeight(feature, innerWidth) * .47 + lineCount * 32 + 4 : height - pad - 29, width: dial ? width * .4 : gradeWidth, height: 29 }, ctx => {
    const gradeSize = dial ? 16 : width > 200 ? 26 : 20
    const available = dial ? width * .4 : gradeWidth
    text(ctx, '/10', available, 7, 12, 400, muted, true)
    numericText(ctx, feature.grade!, 1, available - 24, 0, gradeSize, 400, muted, progress, true)
  })
}

function metricValue(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, progress: number) {
  const match = value.match(/^(-?\d+(?:\.\d+)?)(.*)$/)
  if (!match) { text(ctx, value, x, y, size, 400); return }
  const decimals = match[1].split('.')[1]?.length ?? 0
  const width = numericText(ctx, Number(match[1]), decimals, x, y, size, 400, ink, progress)
  text(ctx, match[2], x + width, y, size, 400)
}
function numericText(ctx: CanvasRenderingContext2D, value: number, decimals: number, x: number, y: number, size: number, weight: number, color: string, progress: number, right = false) {
  ctx.save(); ctx.font = `${weight} ${size}px ${sans}`; ctx.fillStyle = color
  const width = rollingNumberWidth(ctx, value.toFixed(decimals))
  drawRollingNumber(ctx, value, decimals, right ? x - width : x, y + size * .82, size, progress)
  ctx.restore(); return width
}
export function drawScorePair(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, progress = 1, paint: CanvasPainter = paintCanvasNode, charts = false) {
  const columnWidth = (width - 24) / 2
  for (const [index, item] of [{ id: 'current', label: 'Overall Score', value: Number(slide.currentScore), color: ink }, { id: 'potential', label: slide.potentialScale === 8 ? 'PSL potential' : 'Potential', value: Number(slide.potentialScore), color: '#9b9ba3' }].entries()) {
    paint(ctx, { id: `scores/${item.id}`, label: item.label, frame: { x: index ? width - 8 - columnWidth : 8, y: 0, width: columnWidth, height: 100 }, draw: ctx => {
      const right = index === 1, edge = right ? columnWidth : 0
      paint(ctx, { id: `scores/${item.id}/label`, label: `${item.label} label`, frame: { x: 0, y: charts ? 14 : 4, width: columnWidth, height: 18 }, draw: ctx => label(ctx, item.label, charts ? 18 : edge, 0, charts ? false : right, right ? '#a8a8af' : muted) })
      if (charts) paint(ctx, { id: `scores/${item.id}/visual`, label: `${item.label} chart`, frame: { x: 12, y: 36, width: columnWidth - 24, height: 70 }, draw: ctx => drawMetricVisual(ctx, { label: item.label, value: '', visual: 'Orbit', scale: 'quality', positions: [item.value / (item.id === 'potential' ? slide.potentialScale ?? 10 : 10)] }, 0, 0, columnWidth - 24, 70, progress) })
      paint(ctx, { id: `scores/${item.id}/value`, label: `${item.label} value`, frame: { x: 0, y: charts ? 116 : 24, width: columnWidth, height: 50 }, draw: ctx => numericText(ctx, item.value, 1, charts ? 18 : edge, 0, charts ? 34 : 44, 600, item.color, progress, charts ? false : right) })
      paint(ctx, { id: `scores/${item.id}/unit`, label: `${item.label} unit`, frame: { x: 0, y: charts ? 132 : 76, width: columnWidth, height: 18 }, draw: ctx => text(ctx, `/ ${item.id === 'potential' ? slide.potentialScale ?? 10 : 10}`, charts ? columnWidth - 18 : edge, 0, 13, 500, muted, charts || right) })
    } })
  }
}

const potentialSummary = 'Potential reflects the most realistic lift if the lowest-scoring visible signals improve first.'
function potentialHeight(ctx: CanvasRenderingContext2D) { return 145 + wrap(ctx, potentialSummary, 354, 15, 500).length * 22 }
function drawPotential(ctx: CanvasRenderingContext2D, slide: ContentSlide, progress: number, paint: CanvasPainter) {
  const width = 354, scale = slide.potentialScale ?? 10
  const current = Math.max(0, Math.min(scale, slide.potentialCurrentScore ?? Number(slide.currentScore))), target = Math.max(0, Math.min(scale, Number(slide.potentialScore)))
  text(ctx, scale === 8 ? 'PSL potential' : 'Your potential', 0, 0, 20, 700)
  text(ctx, target > current ? 'Clear upside' : 'Maintain your strengths', 0, 29, 13, 400, muted)
  text(ctx, `/${scale}`, width, 20, 14, 400, muted, true)
  paint(ctx, { id: 'potential/value', label: 'Potential value', frame: { x: width - 128, y: 0, width: 100, height: 44 }, draw: ctx => numericText(ctx, target, 1, 100, 0, 36, 600, reportUi.accent, progress, true) })
  box(ctx, 0, 77, width, 12, 6, '#efeff2')
  const end = width * target / scale * progress
  if (end > 0) {
    const gradient = ctx.createLinearGradient(0, 0, end, 0)
    gradient.addColorStop(0, '#53a553'); gradient.addColorStop(1, reportUi.accent)
    box(ctx, 0, 77, end, 12, 6, gradient)
  }
  box(ctx, width * current / scale * progress, 74, 2, 18, 1, '#ffffffcc')
  const glass = ctx.createLinearGradient(end - 7, 70, end + 7, 96)
  glass.addColorStop(0, '#ffffff80'); glass.addColorStop(.32, '#ffffff0a'); glass.addColorStop(.68, '#ffffff08'); glass.addColorStop(1, '#ffffff60')
  ctx.save(); ctx.shadowColor = '#00000014'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1
  box(ctx, end - 7, 70, 14, 26, 9, glass); ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#ffffffa6'; ctx.lineWidth = .7; ctx.stroke(); ctx.restore()
  text(ctx, scale === 8 ? `Now ${current.toFixed(1)} / 8` : `Now ${current.toFixed(1)}`, 0, 108, 13, 400, muted)
  text(ctx, target > current ? `+${(target - current).toFixed(1)} potential` : 'Maintain your strengths', width, 108, 13, 400, muted, true)
  paragraph(ctx, potentialSummary, 0, 145, width, 15, 22, muted)
}

function drawActions(ctx: CanvasRenderingContext2D, category: ReportCategory, editorial?: { width: number; paint: CanvasPainter; state: (text: string, index: number) => { reveal: number; checked: number } }) {
  if (editorial) {
    const items = buildCategoryActionPlan(category).items
    let size = 22
    let rows = items.map(item => wrap(ctx, item, editorial.width - 60, size, 500))
    while (rows.reduce((height, lines) => height + Math.max(34, lines.length * size * 1.32) + 24, 0) > 228 && size > 12) {
      size--; rows = items.map(item => wrap(ctx, item, editorial.width - 60, size, 500))
    }
    const lineHeight = size * 1.32
    let top = 12
    if (!items.length) text(ctx, 'No personalized actions in this report.', 0, top, 20, 500, muted, false, editorial.width)
    for (const [index, item] of items.entries()) {
      const state = editorial.state(item, index), lines = rows[index]
      const height = Math.max(34, lines.length * lineHeight)
      editorial.paint(ctx, { id: `action-plan/item:${index}`, label: `Action ${index + 1}: ${item}`, frame: { x: 0, y: top + (1 - state.reveal) * 12, width: editorial.width, height }, opacity: state.reveal, draw: ctx => {
        editorial.paint(ctx, { id: `action-plan/item:${index}/box`, label: `Action ${index + 1} checkbox`, frame: { x: 0, y: 1, width: 30, height: 30 }, draw: ctx => {
          box(ctx, 0, 0, 30, 30, 8, state.checked > 0 ? `rgba(0,168,239,${state.checked})` : '#fff')
          ctx.strokeStyle = state.checked > 0 ? reportUi.accent : '#c8c8ce'; ctx.lineWidth = 1.5; ctx.stroke()
          if (state.checked > 0) {
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 30 * state.checked, 30); ctx.clip(); ctx.beginPath()
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
            ctx.moveTo(7, 15); ctx.lineTo(13, 21); ctx.lineTo(23, 9); ctx.stroke(); ctx.restore()
          }
        } })
        editorial.paint(ctx, { id: `action-plan/item:${index}/text`, label: `Action ${index + 1} text`, frame: { x: 50, y: 0, width: editorial.width - 50, height }, draw: ctx => lines.forEach((line, index) => text(ctx, line, 0, index * lineHeight, size, 500)) })
      } })
      top += height + 24
    }
    return
  }
  const width = 354, items = reportActionItems(category)
  text(ctx, category.id === 'overall' ? 'Your priorities' : 'Action Plan', 0, 0, 20, 700)
  if (items.length) text(ctx, `0 of ${items.length}`, width, 4, 13, 400, muted, true)
  let y = 40
  for (const item of items) {
    const rows = wrap(ctx, item.label, width - 36, 15, item.detail ? 600 : 500), details = item.detail ? wrap(ctx, item.detail, width - 36, 14, 400) : []
    box(ctx, 0, y + 12, 24, 24, 6, '#fff'); ctx.strokeStyle = '#c8c8ce'; ctx.lineWidth = 1.5; ctx.stroke()
    rows.forEach((line, index) => text(ctx, line, 36, y + 12 + index * 22, 15, item.detail ? 600 : 500))
    details.forEach((line, index) => text(ctx, line, 36, y + 17 + rows.length * 22 + index * 21, 14, 400, muted))
    y += 24 + Math.max(24, rows.length * 22 + (details.length ? 5 + details.length * 21 : 0))
  }
  if (!items.length) paragraph(ctx, 'This report has no specific improvement steps for this category.', 0, y, width, 15, 22, muted)
}

export type ReportRect = { x: number; y: number; width: number; height: number }
/** The same component painter is used inside the app report and on the stage.
 * No component can sample pixels from a report, hero photo, or previous frame. */
export function drawReportComponent(ctx: CanvasRenderingContext2D, slide: ContentSlide, region: ReportRegion, frame: ReportRect, progress = 1, paint: CanvasPainter = paintCanvasNode, actionState?: (text: string, index: number) => { reveal: number; checked: number }) {
  const category = slide.mockReport!.category
  paint(ctx, { id: region.id, label: region.label, frame, size: region, draw: ctx => {
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    if (region.id.startsWith('feature:')) {
      const feature = category.features.find((feature, index) => `feature:${feature.id ?? index}` === region.id)
      if (feature) drawFeatureCard(ctx, feature, region.width, region.height, progress, region.id, paint, region.showVisual !== false)
    } else if (region.id === 'potential') { drawPotential(ctx, slide, progress, paint) }
    else if (region.id === 'action-plan') {
      drawActions(ctx, category, actionState ? { width: region.width, paint, state: actionState } : undefined)
    }
    else if (region.id === 'category-score') {
      const width = region.width
      card(ctx, 0, 0, width, region.height, 22)
      label(ctx, category.scoreLabel, 18, 18)
      text(ctx, category.title, 18, 46, 30, 400)
      paragraph(ctx, category.subtitle, 18, 89, width - 126, 13, 18, muted, 1)
      text(ctx, '/10', width - 18, 93, 13, 400, muted, true)
      paint(ctx, { id: 'category-score/value', label: 'Category score value', frame: { x: width - 126, y: 86, width: 80, height: 30 }, draw: ctx => numericText(ctx, category.score, 1, 80, 0, 22, 500, ink, progress, true) })
    } else {
      const charts = region.height > 110
      if (charts) paint(ctx, { id: 'scores/surface', label: 'Score summary', frame: { x: 0, y: 0, width: region.width, height: region.height }, draw: ctx => card(ctx, 0, 0, region.width, region.height, reportUi.radius) })
      drawScorePair(ctx, slide, region.width, progress, paint, charts)
    }
  } })
}

function reportActionItems(category: ReportCategory): Array<{ label: string; detail?: string }> {
  if (category.id === 'overall') {
    const ranked = [...category.features].sort((a, b) => parseFloat(a.value) - parseFloat(b.value))
    return category.recommendation.split(/\n+/).map(value => value.trim()).filter(Boolean).slice(0, 3).map((detail, index) => ({ label: ranked[index]?.label ?? 'Priority', detail }))
  }
  const plan = buildCategoryActionPlan(category)
  return [...plan.items.map(label => ({ label })), ...(plan.prevention ? [{ label: 'Daily skin protection', detail: plan.prevention }] : [])]
}
function reportActionHeight(ctx: CanvasRenderingContext2D, category: ReportCategory) {
  const items = reportActionItems(category)
  return 40 + (items.length ? items.reduce((height, item) => height + 24 + Math.max(24, wrap(ctx, item.label, 318, 15, item.detail ? 600 : 500).length * 22 + (item.detail ? 5 + wrap(ctx, item.detail, 318, 14, 400).length * 21 : 0)), 0) : 66)
}

export function mockReportScrollMax(category: ReportCategory) {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return 0
  return Math.max(0, Math.ceil(Math.max(...mockReportRegions(ctx, category).map(region => region.y + region.height)) + 132 - mockReportSize.height))
}

function drawChrome(ctx: CanvasRenderingContext2D, category: ReportCategory, viewportHeight = mockReportSize.height, deviceChrome = false) {
  const title = category.title
  const w = mockReportSize.width, h = viewportHeight
  if (!deviceChrome) { ctx.fillStyle = paper; ctx.fillRect(0, 0, w, 61) }
  if (deviceChrome) {
  text(ctx, '9:41', 34, 19, 15, 600)
  box(ctx, w / 2 - 62, 11, 124, 36, 18, '#000')
  for (let i = 0; i < 4; i++) box(ctx, w - 91 + i * 4, 30 - i * 3, 3, 4 + i * 3, 1, ink)
  ctx.save(); ctx.strokeStyle = ink; ctx.lineWidth = 1.6
  for (const radius of [4, 8, 12]) { ctx.beginPath(); ctx.arc(w - 57, 33, radius, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke() }
  ctx.strokeRect(w - 40, 22, 23, 11); ctx.restore()
  box(ctx, w - 38, 24, 18, 7, 1, ink); box(ctx, w - 16, 25, 2, 5, 1, ink)
  }
  ctx.save(); ctx.translate(0, deviceChrome ? 0 : -43)
  ctx.font = `600 14px ${sans}`
  const pillWidth = ctx.measureText(title).width + 62
  box(ctx, 18, 61, pillWidth, 38, 19, 'rgba(255,255,255,.84)')
  symbol(ctx, categorySymbolIds.indexOf(({ brows: 'eyes', cheeks: 'face-shape', proportions: 'symmetry', skin: 'skin-age', hair: 'face-shape', ears: 'face-shape' } as Record<string, string>)[category.id] ?? category.id), 30, 72, 16)
  text(ctx, title, 54, 72, 14, 600)
  symbol(ctx, 15, 18 + pillWidth - 25, 72, 15)
  box(ctx, w - 46, 61, 38, 38, 19, 'rgba(255,255,255,.82)')
  text(ctx, '×', w - 35, 66, 23, 500)
  ctx.restore()
  fade(ctx, h - 140, 56)
  ctx.fillStyle = paper; ctx.fillRect(0, h - 84, w, 84)
  box(ctx, 18, h - 84, w - 36, 58, 29, ink)
  text(ctx, 'SHARE YOUR SCORE', w / 2 + 12, h - 63, 15, 600, paper, false, undefined, sans, 'center')
  symbol(ctx, 11, w / 2 - 91, h - 65, 19, true)
  if (deviceChrome) box(ctx, w / 2 - 67, h - 9, 134, 5, 3, ink)
}

const categorySymbolIds = ['eyes', 'nose', 'mouth', 'jaw', 'dimorphism', 'face-shape', 'skin-age', 'symmetry', 'sun-damage', 'facial-fat', 'overall']
let symbols: { ink: HTMLImageElement; white: HTMLCanvasElement } | undefined
let symbolsPromise: Promise<void> | undefined
export function loadMockReportSymbols() {
  return symbolsPromise ??= new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const white = document.createElement('canvas')
      white.width = image.width; white.height = image.height
      const ctx = white.getContext('2d')
      if (!ctx) { symbolsPromise = undefined; reject(new Error('Report icons could not be prepared')); return }
      ctx.drawImage(image, 0, 0)
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = paper; ctx.fillRect(0, 0, white.width, white.height)
      symbols = { ink: image, white }
      resolve()
    }
    image.onerror = () => { symbolsPromise = undefined; reject(new Error('Report icons could not be loaded. Please retry.')) }
    image.src = '/creator-icons/report-symbols.png'
  })
}
function symbol(ctx: CanvasRenderingContext2D, index: number, x: number, y: number, size: number, white = false) {
  if (symbols) ctx.drawImage(white ? symbols.white : symbols.ink, index * 96, 0, 96, 96, x - size * .1, y - size * .1, size * 1.2, size * 1.2)
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string | CanvasGradient) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fillStyle = fill; ctx.fill()
}
function card(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  box(ctx, x, y, width, height, radius, reportUi.reportPanel)
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, weight = 500, color: string = ink, right = false, maxWidth?: number, font = sans, align?: CanvasTextAlign) {
  ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align ?? (right ? 'right' : 'left'); ctx.fillText(value, x, y, maxWidth); ctx.textAlign = 'left'
}
function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, right = false, color: string = muted, maxWidth?: number) { text(ctx, value.toUpperCase(), x, y, 10, 500, color, right, maxWidth, 'Courier') }
function wrap(ctx: CanvasRenderingContext2D, value: string, width: number, size: number, weight: number) {
  ctx.font = `${weight} ${size}px ${sans}`
  const lines: string[] = []
  for (const paragraph of value.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      if (line && ctx.measureText(`${line} ${word}`).width > width) { lines.push(line); line = word }
      else line = line ? `${line} ${word}` : word
    }
    lines.push(line)
  }
  return lines
}
function paragraph(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, size: number, lineHeight: number, color: string, maxLines = Infinity) {
  const lines = wrap(ctx, value, width, size, 500).slice(0, maxLines)
  lines.forEach((line, i) => text(ctx, line, x, y + i * lineHeight, size, 500, color))
  return lines.length * lineHeight
}
function fade(ctx: CanvasRenderingContext2D, y: number, height: number, color = '247,247,247', opaqueAt = 1) {
  const gradient = ctx.createLinearGradient(0, y, 0, y + height)
  for (let i = 0; i <= 12; i++) {
    const position = i / 12, opacity = (1 - Math.cos(Math.min(1, position / opaqueAt) * Math.PI)) / 2
    gradient.addColorStop(position, `rgba(${color},${opacity})`)
  }
  ctx.fillStyle = gradient; ctx.fillRect(0, y, mockReportSize.width, height)
}

export function mockFeatureLayout(category: Pick<ReportCategory, 'features'>) {
  const isFull = (feature: ReportCategory['features'][number]) => {
    const style = reportTimelineStyle(feature.id ?? '', feature.label, nativeMetricFeature(feature).visual === 'Orbit')
    return Boolean(feature.triangulation) || style === 'dial' || style === 'tapered' || nativeMetricFeature(feature).visual === 'Capsule' || ['proportions.fifths', 'proportions.width-hierarchy', 'proportions.vertical-alignment'].includes(feature.id ?? '') || feature.value.length > 28
  }
  const layout = category.features.map(feature => ({ feature, full: isFull(feature), showVisual: nativeMetricFeature(feature).visual !== 'Text' }))
  let pairedRow = 0
  for (let index = 0; index < layout.length; index++) {
    if (layout[index].full) continue
    const next = layout[index + 1]
    if (!next || next.full) { layout[index].full = true; continue }
    const pair = [layout[index], next], preferred = pair[pairedRow++ % 2]
    const selected = preferred.showVisual ? preferred : pair.find(item => item.showVisual)
    const overviewPair = pair[0].feature.id === 'overall.psl' && pair[1].feature.id === 'overall.eyes'
    for (const item of pair) item.showVisual = overviewPair ? item.showVisual : item === selected
    index++
  }
  let top = 0
  const tiles: Array<{ feature: ReportCategory['features'][number]; showVisual: boolean; x: number; top: number; width: number; height: number }> = []
  for (let index = 0; index < layout.length;) {
    const row = layout.slice(index, index + (layout[index].full ? 1 : 2)), width = row.length === 1 ? 354 : 172
    const height = Math.max(...row.map(({ feature, showVisual }) => {
      if (!showVisual) return reportUi.textHeight
      if (feature.triangulation) return 66 + triangulationGeometry(width - reportUi.padding * 2).height
      const style = reportTimelineStyle(feature.id ?? '', feature.label, nativeMetricFeature(feature).visual === 'Orbit')
      return Math.max(174, (style === 'dial' ? 82 : 132) + reportMetricHeight(nativeMetricFeature(feature), width - reportUi.padding * 2))
    }))
    row.forEach(({ feature, showVisual }, column) => tiles.push({ feature, showVisual, x: 18 + column * 182, top, width, height }))
    top += height + 10; index += row.length
  }
  return { tiles, height: top }
}

export type ReportRegion = { showVisual?: boolean; id: string; label: string; x: number; y: number; width: number; height: number }

// These are the same native-layout coordinates used by drawMockReport, before
// scroll/parallax and delivery scaling. The editor never guesses card positions.
export function mockReportRegions(ctx: CanvasRenderingContext2D, category: ReportCategory): ReportRegion[] {
  const regions: ReportRegion[] = [
    { id: 'hero', label: 'Face scan', x: 0, y: 0, width: 390, height: mockReportHeroHeight },
    { id: 'scores', label: 'Overall & potential scores', x: 12, y: mockReportHeroHeight - 80, width: 366, height: 110 },
  ]
  let top = mockReportHeroHeight - 76 + 112
  if (category.id !== 'overall') {
    regions.push({ id: 'category-score', label: `${category.title} category score`, x: 18, y: top, width: 354, height: 126 })
    top += 136
  }
  if (category.id === 'eyes' && mockEyePalette.some(shade => shade.name === category.eyeColor)) {
    regions.push({ id: 'eye-color', label: 'Eye color', x: 18, y: top, width: 354, height: 91 }); top += 101
  }
  const layout = mockFeatureLayout(category)
  regions.push({ id: 'features', label: 'Feature grid', x: 18, y: top, width: 354, height: Math.min(380, layout.height) })
  for (const tile of layout.tiles) {
    const index = category.features.indexOf(tile.feature)
    regions.push({ id: `feature:${tile.feature.id ?? index}`, showVisual: tile.showVisual, label: tile.feature.label, x: tile.x, y: top + tile.top, width: tile.width, height: tile.height })
  }
  top += layout.height + 22
  regions.push({ id: 'potential', label: 'Your potential', x: 18, y: top, width: 354, height: potentialHeight(ctx) }); top += potentialHeight(ctx) + 32
  const actionHeight = reportActionHeight(ctx, category)
  regions.push({ id: 'action-plan', label: category.id === 'overall' ? 'Your priorities' : 'Action plan', x: 18, y: top, width: 354, height: actionHeight }); top += actionHeight
  if (['skin-age', 'sun-damage'].includes(category.id)) regions.push({ id: 'sources', label: 'Sources', x: 18, y: top + 18, width: 354, height: 150 })
  return regions
}


function drawColorPalette(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, selected: number) {
  ctx.save()
  const gradient = ctx.createLinearGradient(x, 0, x + width, 0)
  mockEyePalette.forEach((shade, index) => gradient.addColorStop(index / (mockEyePalette.length - 1), shade.hex))
  box(ctx, x, y + height * .18, width, height * .64, 5, gradient)
  const cursor = Math.max(x, Math.min(x + width - 14, x + width * selected / (mockEyePalette.length - 1) - 7))
  box(ctx, cursor, y, 14, height, 6, '#ffffff70')
  ctx.strokeStyle = '#ffffffb3'; ctx.lineWidth = .7; ctx.stroke()
  box(ctx, cursor + 6.5, y + height * .28, 1, height * .44, .5, '#171d23a6')
  ctx.restore()
}

export const drawMetricVisual = drawReportMetricTimeline
