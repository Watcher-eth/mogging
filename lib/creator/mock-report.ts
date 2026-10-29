import { drawReportPortrait, drawReportPortraitFade } from './report-portrait'
import { drawReportMetricTimeline, reportMetricHeight, reportTimelineStyle } from './metric-timeline'
import { reportGlassInk, drawReportHeaderGlass } from './report-glass'
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
export const mockReportFormat = { width: 1560, height: 3376 }
export const mockReportHeroHeight = Math.round(mockReportSize.height * .55)
const ink = reportUi.ink, paper = reportUi.panel, muted = reportUi.muted
export const mockEyePalette = [
  { name: 'blue', hex: '#6ea5ce' }, { name: 'gray', hex: '#87989f' },
  { name: 'green', hex: '#6e8962' }, { name: 'hazel', hex: '#8c8555' },
  { name: 'amber', hex: '#ac8748' }, { name: 'brown', hex: '#795439' },
  { name: 'dark brown', hex: '#382723' },
]
const mockHairPalette = ['#171417','#322623','#624532','#987555','#844732','#bc704b','#d39d71','#d5bd83','#eadfb6','#96939b','#eee9e7'].map((hex, index) => ({ hex, name: ['black','dark brown','brown','light brown','auburn','red','strawberry blond','blond','platinum blond','gray','white'][index] }))
const sans = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'

export function drawMockReport(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, overlay: ReportOverlay | null, width: number, height: number, time: number, options: { interactiveChrome?: boolean; metricProgress?: number; growthProgress?: number; featureProgress?: (id: string, top: number) => number; actionState?: (text: string, index: number) => { reveal: number; checked: number }; paint?: CanvasPainter; regions?: ReportRegion[]; cull?: boolean } = {}) {
  const report = slide.mockReport
  if (!report) return
  const { category } = report, w = mockReportSize.width, h = mockReportSize.height
  const paint = options.paint ?? paintCanvasNode
  const regions = options.regions ?? mockReportRegions(ctx, category)
  const contentTop = 0
  const contentBottom = 84
  paint(ctx, { id: 'report', label: 'Report', frame: { x: 0, y: 0, width, height }, size: { width: w, height: h }, clip: true, draw: ctx => {
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    paint(ctx, { id: 'background', label: 'Report background', frame: { x: 0, y: 0, width: w, height: h }, draw: ctx => { ctx.fillStyle = paper; ctx.fillRect(0, 0, w, h) } })
    paint(ctx, { id: 'report-viewport', label: 'Scrollable report', frame: { x: 0, y: contentTop, width: w, height: Math.max(0, h - contentTop - contentBottom) }, clip: true, draw: ctx => {
      ctx.translate(0, -report.scroll - contentTop)
      for (const region of regions) {
        if (region.id === 'features' || options.cull && (region.y + region.height < report.scroll + contentTop - 24 || region.y > report.scroll + h - contentBottom + 24)) continue
        if (region.id === 'hero') {
          paint(ctx, { id: 'hero', label: region.label, frame: region, draw: ctx => {
            if (image) paint(ctx, { id: 'portrait', label: 'Report portrait', frame: { x: 0, y: 0, width: w, height: mockReportHeroHeight }, clip: true, draw: ctx => {
              drawReportPortrait(ctx, image, w, mockReportHeroHeight)
              if (overlay) paint(ctx, { id: 'overlay', label: 'Face measurements', frame: { x: 0, y: 0, width: w, height: mockReportHeroHeight }, draw: ctx => drawFaceTreatment(ctx, overlay, w, time) })
            } })
          } })
          paint(ctx, { id: 'hero-fade', label: 'Portrait fade', frame: { x: 0, y: 0, width: w, height: mockReportHeroHeight }, draw: ctx => {
            drawReportPortraitFade(ctx, w, mockReportHeroHeight)
          } })
        } else if ((region.id === 'eye-color' || region.id === 'hair-color')) {
          paint(ctx, { id: region.id, label: region.label, frame: region, draw: ctx => {
            const palette = region.id === 'hair-color' ? mockHairPalette : mockEyePalette
            const selected = palette.find(shade => shade.name === (region.id === 'hair-color' ? category.hairColor : category.eyeColor))!
            card(ctx, 0, 0, region.width, region.height, 18)
            text(ctx, region.id === 'hair-color' ? 'Hair color' : 'Eye color', 16, 16, 12, 400)
            text(ctx, selected.name[0].toUpperCase() + selected.name.slice(1), region.width - 16, 16, 14, 600, ink, true)
            drawColorPalette(ctx, 16, 47, region.width - 32, 28, palette.indexOf(selected), palette)
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
          drawReportComponent(ctx, slide, region, region, Math.max(0, Math.min(1, amount)), paint, options.actionState)
        }
      }
    } })
    paint(ctx, { id: 'report-finish', label: 'App controls', frame: { x: 0, y: 0, width: w, height: h }, draw: ctx => {
      drawReportHeaderGlass(ctx, w, report.scroll)
      drawChrome(ctx, category, options.interactiveChrome)
    } })
  } })
}

export function nativeMetricFeature(feature: ReportCategory['features'][number]) {
  return { ...feature, visual: feature.visual ?? 'Text' }
}

export function drawFeatureCard(ctx: CanvasRenderingContext2D, source: ReportCategory['features'][number], width: number, height: number, progress = 1, identity = source.id ?? source.label, paint: CanvasPainter = paintCanvasNode, showVisual = true) {
  const feature = nativeMetricFeature(source)
  const part = (id: string, caption: string, frame: ReportRect, draw: (ctx: CanvasRenderingContext2D) => void) => paint(ctx, { id: `${identity}/${id}`, label: `${feature.label} · ${caption}`, frame, draw })
  const pad = reportUi.padding, visual = showVisual ? feature.visual ?? 'Text' : 'Text', innerWidth = width - pad * 2
  const profile = showVisual && feature.triangulation
  const dial = visual !== 'Text' && reportTimelineStyle(feature.id ?? '', feature.label, visual === 'Orbit') === 'dial'
  part('surface', 'Card', { x: 0, y: 0, width, height }, ctx => card(ctx, 0, 0, width, height, reportUi.radius))
  const labelHeight = wrap(ctx, feature.label, innerWidth, 12, 400).length * 16
  const visualTop = pad + labelHeight + 18
  part('label', 'Label', { x: pad, y: pad, width: innerWidth, height: labelHeight }, ctx => paragraph(ctx, feature.label, 0, 0, innerWidth, 12, 16, ink))
  if (visual !== 'Text') part('visual', 'Visualization', { x: pad, y: visualTop, width: innerWidth, height: dial ? reportMetricHeight(feature, innerWidth) : height - visualTop - 58 }, ctx => drawMetricVisual(ctx, feature, 0, 0, innerWidth, height - 124, progress))
  let size = dial ? 24 : width > 200 ? reportUi.valueSize : reportUi.compactValueSize
  const valueWidth = dial ? innerWidth * .54 : innerWidth
  const lines = wrap(ctx, feature.value, valueWidth, size, 400)
  while (lines.length > 3 && size > 16) { size--; lines.splice(0, lines.length, ...wrap(ctx, feature.value, valueWidth, size, 400)) }
  const lineCount = Math.min(3, lines.length)
  if (!profile) part('value', 'Value', { x: dial ? pad + innerWidth * .23 : pad, y: dial ? visualTop + reportMetricHeight(feature, innerWidth) * .47 : height - pad - lineCount * 32, width: valueWidth, height: lineCount * 32 }, ctx => lines.slice(0, 3).forEach((line, index) => { ctx.font = `400 ${size}px ${sans}`; metricValue(ctx, line, dial ? (valueWidth - ctx.measureText(line).width) / 2 : 0, index * 32, size, progress) }))
  if (!profile && source.visual !== 'Text' && feature.grade != null) part('grade', 'Grade', { x: dial ? width / 2 - 40 : width - pad - 80, y: dial ? visualTop + reportMetricHeight(feature, innerWidth) * .47 + lineCount * 32 : height - 40, width: 80, height: 28 }, ctx => {
    text(ctx, '/ 10', 80, 0, 13, 500, muted, true)
    numericText(ctx, feature.grade!, 1, 51, 0, 16, 500, muted, progress, true)
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
function drawScorePair(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, progress: number, paint: CanvasPainter) {
  const columnWidth = (width - 24) / 2
  for (const [index, item] of [{ id: 'current', label: 'Mogging Score', value: Number(slide.currentScore), color: ink }, { id: 'potential', label: 'Potential', value: Number(slide.potentialScore), color: '#9b9ba3' }].entries()) {
    paint(ctx, { id: `scores/${item.id}`, label: item.label, frame: { x: index ? width - 8 - columnWidth : 8, y: 0, width: columnWidth, height: 100 }, draw: ctx => {
      const right = index === 1, edge = right ? columnWidth : 0
      label(ctx, item.label, edge, 4, right, right ? '#a8a8af' : muted)
      numericText(ctx, item.value, 1, edge, 24, 44, 600, item.color, progress, right)
      text(ctx, '/ 10', edge, 76, 13, 500, muted, right)
    } })
  }
}

const potentialSummary = 'Potential reflects the most realistic lift if the lowest-scoring visible signals improve first.'
function potentialHeight(ctx: CanvasRenderingContext2D) { return 160 + wrap(ctx, potentialSummary, 322, 15, 400).length * 22 }
function drawPotential(ctx: CanvasRenderingContext2D, slide: ContentSlide, progress: number, paint: CanvasPainter) {
  const width = 322, current = Math.max(0, Math.min(10, Number(slide.currentScore))), target = Math.max(0, Math.min(10, Number(slide.potentialScore)))
  text(ctx, 'Your potential', 0, 0, 24, 400)
  text(ctx, 'Clear upside', 0, 29, 13, 400, muted)
  text(ctx, '/10', width, 20, 14, 400, muted, true)
  paint(ctx, { id: 'potential/value', label: 'Potential value', frame: { x: width - 128, y: 0, width: 100, height: 44 }, draw: ctx => numericText(ctx, target, 1, 100, 0, 36, 400, reportUi.accent, progress, true) })
  box(ctx, 0, 77, width, 12, 6, '#efeff2')
  const end = width * target / 10 * progress
  if (end > 0) {
    const gradient = ctx.createLinearGradient(0, 0, end, 0)
    gradient.addColorStop(0, '#53a553'); gradient.addColorStop(1, reportUi.accent)
    box(ctx, 0, 77, end, 12, 6, gradient)
  }
  box(ctx, width * current / 10 * progress, 74, 2, 18, 1, '#ffffffcc')
  const glass = ctx.createLinearGradient(end - 7, 70, end + 7, 96)
  glass.addColorStop(0, '#ffffff80'); glass.addColorStop(.32, '#ffffff0a'); glass.addColorStop(.68, '#ffffff08'); glass.addColorStop(1, '#ffffff60')
  ctx.save(); ctx.shadowColor = '#00000014'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1
  box(ctx, end - 7, 70, 14, 26, 9, glass); ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#ffffffa6'; ctx.lineWidth = .7; ctx.stroke(); ctx.restore()
  text(ctx, `Now ${current.toFixed(1)}`, 0, 108, 13, 400, muted)
  text(ctx, target > current ? `+${(target - current).toFixed(1)} potential` : 'Maintain your strengths', width, 108, 13, 400, muted, true)
  paragraph(ctx, potentialSummary, 0, 145, width, 15, 22, muted)
}

function drawActions(ctx: CanvasRenderingContext2D, category: ReportCategory, state?: (text: string, index: number) => { reveal: number; checked: number }) {
  const width = 322, items = reportActionItems(category)
  text(ctx, category.id === 'overall' ? 'Your priorities' : 'Action Plan', 0, 0, 24, 400)
  if (items.length) text(ctx, `${items.filter((item, index) => (state?.(item.label, index).checked ?? 0) > .9).length} of ${items.length}`, width, 4, 13, 400, muted, true)
  let y = 40
  items.forEach((item, index) => {
    const animation = state?.(item.label, index) ?? { reveal: 1, checked: 0 }
    const rows = wrap(ctx, item.label, width - 36, 15, 500), details = item.detail ? wrap(ctx, item.detail, width - 36, 15, 400) : []
    ctx.save(); ctx.globalAlpha *= animation.reveal; ctx.translate(0, (1 - animation.reveal) * 10)
    box(ctx, 0, y + 12, 24, 24, 6, animation.checked > .1 ? '#00A8EF' : '#fff')
    ctx.strokeStyle = animation.checked > .1 ? '#00A8EF' : '#c8c8ce'; ctx.lineWidth = 1.5; ctx.stroke()
    if (animation.checked > 0) {
      ctx.save(); ctx.globalAlpha *= animation.checked; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(6, y + 24); ctx.lineTo(11, y + 29); ctx.lineTo(19, y + 19); ctx.stroke(); ctx.restore()
    }
    rows.forEach((line, row) => text(ctx, line, 36, y + 12 + row * 22, 15, 500, animation.checked > .9 ? muted : ink))
    details.forEach((line, row) => text(ctx, line, 36, y + 17 + rows.length * 22 + row * 22, 15, 400, muted))
    ctx.restore()
    y += 24 + Math.max(24, rows.length * 22 + (details.length ? 5 + details.length * 22 : 0))
  })
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
    } else if (region.id === 'potential') { card(ctx, 0, 0, region.width, region.height, 22); ctx.translate(16, 16); drawPotential(ctx, slide, progress, paint) }
    else if (region.id === 'explanation') { card(ctx, 0, 0, region.width, region.height, 22); text(ctx, 'Explanation', 18, 18, 12, 400); paragraph(ctx, category.explanation, 18, 50, region.width - 36, 15, 22, muted) }
    else if (region.id === 'action-plan') {
      card(ctx, 0, 0, region.width, region.height, 22); ctx.translate(16, 16)
      drawActions(ctx, category, actionState)
    }
    else if (region.id === 'category-score') {
      const width = region.width
      card(ctx, 0, 0, width, region.height, 22)
      text(ctx, category.title, 18, 18, 30, 400)
      paragraph(ctx, category.subtitle, 18, 69, width - 110, 13, 18, muted, 2)
      numericText(ctx, category.score, 1, width - 18, 66, 24, 400, ink, progress, true)
    } else {
      drawScorePair(ctx, slide, region.width, progress, paint)
    }
  } })
}

function reportActionItems(category: ReportCategory): Array<{ label: string; detail?: string }> {
  if (category.id === 'overall') {
    const ranked = category.features.filter(feature => feature.id !== 'overall.psl').sort((a, b) => parseFloat(a.value) - parseFloat(b.value))
    return category.recommendation.split(/\n+/).map(value => value.trim()).filter(Boolean).slice(0, 3).map((detail, index) => { const separator = detail.indexOf(':'); return separator > 0 ? { label: detail.slice(0, separator), detail: detail.slice(separator + 1).trim() } : { label: ranked[index]?.label ?? 'Priority', detail } })
  }
  const plan = buildCategoryActionPlan(category)
  return [...plan.items.map(label => ({ label })), ...(plan.prevention ? [{ label: 'Daily skin protection', detail: plan.prevention }] : [])]
}
function reportActionHeight(ctx: CanvasRenderingContext2D, category: ReportCategory) {
  const items = reportActionItems(category)
  return 72 + (items.length ? items.reduce((height, item) => height + 24 + Math.max(24, wrap(ctx, item.label, 286, 15, 500).length * 22 + (item.detail ? 5 + wrap(ctx, item.detail, 286, 15, 400).length * 22 : 0)), 0) : 66)
}

export function mockReportScrollMax(category: ReportCategory) {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return 0
  return Math.max(0, Math.ceil(Math.max(...mockReportRegions(ctx, category).map(region => region.y + region.height)) + 132 - mockReportSize.height))
}

const glassSurfaces = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>()
function glass(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.clip()
  if (typeof document !== 'undefined') {
    let surface = glassSurfaces.get(ctx)
    if (!surface) { surface = document.createElement('canvas'); glassSurfaces.set(ctx, surface) }
    const matrix = ctx.getTransform(), scale = Math.abs(matrix.a)
    surface.width = Math.ceil((width + 24) * scale); surface.height = Math.ceil((height + 24) * scale)
    surface.getContext('2d')!.drawImage(ctx.canvas, matrix.e + (x - 12) * scale, matrix.f + (y - 12) * scale, surface.width, surface.height, 0, 0, surface.width, surface.height)
    ctx.filter = `blur(${8 * scale}px) saturate(1.5)`
    ctx.drawImage(surface, x - 12, y - 12, width + 24, height + 24); ctx.filter = 'none'
  }
  const tint = ctx.createLinearGradient(x, y, x + width, y + height)
  ;[[0,.5],[.32,.04],[.68,.03],[1,.38]].forEach(([stop,alpha]) => tint.addColorStop(stop, `rgba(255,255,255,${alpha})`))
  ctx.fillStyle = tint; ctx.fillRect(x, y, width, height); ctx.restore()
  ctx.save(); ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = .7; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.stroke(); ctx.restore()
}

function drawChrome(ctx: CanvasRenderingContext2D, category: ReportCategory, interactive = false) {
  const title = category.title
  const w = mockReportSize.width, h = mockReportSize.height

  text(ctx, '9:41', 34, 19, 15, 600)
  box(ctx, w / 2 - 62, 11, 124, 36, 18, '#000')
  for (let i = 0; i < 4; i++) box(ctx, w - 91 + i * 4, 30 - i * 3, 3, 4 + i * 3, 1, ink)
  ctx.save(); ctx.strokeStyle = ink; ctx.lineWidth = 1.6
  for (const radius of [4, 8, 12]) { ctx.beginPath(); ctx.arc(w - 57, 33, radius, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke() }
  ctx.strokeRect(w - 40, 22, 23, 11); ctx.restore()
  box(ctx, w - 38, 24, 18, 7, 1, ink); box(ctx, w - 16, 25, 2, 5, 1, ink)
  ctx.save()
  if (!interactive) {
  ctx.font = `600 14px ${sans}`
  const pillWidth = ctx.measureText(title).width + 68
  const pillLight = reportGlassInk(ctx.canvas, { x: 18, y: 61, width: pillWidth, height: 38 }) === 'light'
  const closeLight = reportGlassInk(ctx.canvas, { x: 344, y: 61, width: 38, height: 38 }) === 'light'
  glass(ctx, 18, 61, pillWidth, 38, 19)
  symbol(ctx, categorySymbolIds.indexOf(({ brows: 'eyes', cheeks: 'face-shape', proportions: 'symmetry', skin: 'skin-age', hair: 'face-shape', ears: 'face-shape' } as Record<string, string>)[category.id] ?? category.id), 30, 72, 16, pillLight)
  ctx.textBaseline = 'middle'
  text(ctx, title, 54, 80, 14, 600, pillLight ? '#fff' : ink)
  symbol(ctx, 15, 18 + pillWidth - 25, 72, 15, pillLight)
  glass(ctx, w - 46, 61, 38, 38, 19)
  ctx.strokeStyle = closeLight ? '#fff' : ink; ctx.lineWidth = 1.7; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(359, 76); ctx.lineTo(367, 84); ctx.moveTo(367, 76); ctx.lineTo(359, 84); ctx.stroke()
  }
  ctx.restore()
  fade(ctx, h - 140, 56)
  ctx.fillStyle = paper; ctx.fillRect(0, h - 84, w, 84)
  box(ctx, 18, h - 84, w - 36, 58, 29, ink)
  text(ctx, 'SHARE YOUR SCORE', w / 2 + 12, h - 63, 15, 600, paper, false, undefined, sans, 'center')
  symbol(ctx, 11, w / 2 - 91, h - 65, 19, true)
  box(ctx, w / 2 - 67, h - 9, 134, 5, 3, ink)
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
  const lines = wrap(ctx, value, width, size, 400).slice(0, maxLines)
  lines.forEach((line, i) => text(ctx, line, x, y + i * lineHeight, size, 400, color))
  return lines.length * lineHeight
}
function fade(ctx: CanvasRenderingContext2D, y: number, height: number, color = '255,255,255', opaqueAt = 1) {
  const gradient = ctx.createLinearGradient(0, y, 0, y + height)
  for (let i = 0; i <= 12; i++) {
    const position = i / 12, opacity = (1 - Math.cos(Math.min(1, position / opaqueAt) * Math.PI)) / 2
    gradient.addColorStop(position, `rgba(${color},${opacity})`)
  }
  ctx.fillStyle = gradient; ctx.fillRect(0, y, mockReportSize.width, height)
}

export function mockFeatureLayout(category: ReportCategory) {
  const isFull = (feature: ReportCategory['features'][number]) => {
    const style = feature.visual && feature.visual !== 'Text' ? reportTimelineStyle(feature.id ?? '', feature.label, feature.visual === 'Orbit') : null
    return style === 'dial' || style === 'tapered' || Boolean(feature.triangulation) || nativeMetricFeature(feature).visual === 'Capsule' || ['proportions.fifths', 'proportions.width-hierarchy', 'proportions.vertical-alignment'].includes(feature.id ?? '') || feature.value.length > 28
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
      const style = feature.visual && feature.visual !== 'Text' ? reportTimelineStyle(feature.id ?? '', feature.label, feature.visual === 'Orbit') : null
      return Math.max(174, (style === 'dial' || feature.triangulation ? 66 : 113) + reportMetricHeight(nativeMetricFeature(feature), width - reportUi.padding * 2))
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
    regions.push({ id: 'category-score', label: `${category.title} category score`, x: 18, y: top, width: 354, height: 116 })
    top += 126
  }
  if (category.id === 'eyes' && mockEyePalette.some(shade => shade.name === category.eyeColor)) {
    regions.push({ id: 'eye-color', label: 'Eye color', x: 18, y: top, width: 354, height: 91 }); top += 101
  }
  if (category.hairColor && mockHairPalette.some(shade => shade.name === category.hairColor)) { regions.push({ id: 'hair-color', label: 'Hair color', x: 18, y: top, width: 354, height: 91 }); top += 101 }
  const layout = mockFeatureLayout(category)
  regions.push({ id: 'features', label: 'Feature grid', x: 18, y: top, width: 354, height: Math.min(380, layout.height) })
  for (const tile of layout.tiles) {
    const index = category.features.indexOf(tile.feature)
    regions.push({ id: `feature:${tile.feature.id ?? index}`, showVisual: tile.showVisual, label: tile.feature.label, x: tile.x, y: top + tile.top, width: tile.width, height: tile.height })
  }
  top += layout.height
  if (category.explanation) { const height = 68 + wrap(ctx, category.explanation, 318, 15, 400).length * 22; regions.push({ id: 'explanation', label: 'Explanation', x: 18, y: top, width: 354, height }); top += height + 10 }
  regions.push({ id: 'potential', label: 'Your potential', x: 18, y: top, width: 354, height: potentialHeight(ctx) }); top += potentialHeight(ctx) + 10
  const actionHeight = reportActionHeight(ctx, category)
  regions.push({ id: 'action-plan', label: category.id === 'overall' ? 'Your priorities' : 'Action plan', x: 18, y: top, width: 354, height: actionHeight }); top += actionHeight
  if (['skin-age', 'sun-damage'].includes(category.id)) regions.push({ id: 'sources', label: 'Sources', x: 18, y: top + 18, width: 354, height: 150 })
  return regions
}


function drawColorPalette(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, selected: number, palette = mockEyePalette) {
  ctx.save()
  const gradient = ctx.createLinearGradient(x, 0, x + width, 0)
  palette.forEach((shade, index) => gradient.addColorStop(index / (palette.length - 1), shade.hex))
  box(ctx, x, y + height * .18, width, height * .64, 5, gradient)
  const cursor = Math.max(x, Math.min(x + width - 14, x + width * selected / (palette.length - 1) - 7))
  box(ctx, cursor, y, 14, height, 6, '#ffffff70')
  ctx.strokeStyle = '#ffffffb3'; ctx.lineWidth = .7; ctx.stroke()
  box(ctx, cursor + 6.5, y + height * .28, 1, height * .44, .5, '#171d23a6')
  ctx.restore()
}

export const drawMetricVisual = drawReportMetricTimeline
