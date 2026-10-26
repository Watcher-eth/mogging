import { reportUi } from './mobile-report-ui'
import { drawRollingNumber, rollingNumberWidth, type NumberSink } from './rolling-number'
import type { ContentSlide } from './content-generator'
import { drawReportOverlay, type ReportOverlay } from './report-overlay'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import { buildCategoryActionPlan } from './mobile-overlay-engine/category-action-plan'

// Logical iPhone 13/14 viewport. Dimensions, colors and typography follow
// mogging-mobile/src/screens/report-screen.tsx. Export uses the same painter.
export const mockReportSize = { width: 390, height: 844 }
export const mockReportFormat = { width: 1170, height: 2532 }
export const mockReportHeroHeight = Math.round(mockReportSize.height * .55)
const ink = reportUi.ink, paper = '#f7f7f7', muted = reportUi.muted
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

export function drawMockReport(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, overlay: ReportOverlay | null, width: number, height: number, time: number, paintOverlay = drawReportOverlay, options: { viewportHeight?: number; deviceChrome?: boolean; metricProgress?: number; growthProgress?: number; featureProgress?: (id: string, top: number) => number; numbers?: NumberSink; omit?: Set<string>; componentFrame?: (region: ReportRegion) => ReportRect } = {}) {
  const report = slide.mockReport
  if (!report) return
  const { category } = report
  const w = mockReportSize.width, h = options.viewportHeight ?? mockReportSize.height
  ctx.save()
  ctx.scale(width / w, height / h)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, w, h)
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.save()
  // Content cannot show through translucent/fading app chrome during a handoff.
  const contentTop = options.deviceChrome ? 104 : 61
  ctx.beginPath(); ctx.rect(0, contentTop, w, Math.max(0, h - contentTop - 84)); ctx.clip()
  ctx.translate(0, -report.scroll)
  if (image && !options.omit?.has('hero')) {
    // Mobile parallax keeps the image and its overlay on the same transform.
    ctx.save()
    ctx.beginPath(); ctx.rect(0, 0, w, mockReportHeroHeight); ctx.clip()
    ctx.translate(0, report.scroll * .18)
    ctx.globalAlpha *= Math.max(.58, 1 - report.scroll / (mockReportHeroHeight * .7) * .42)
    const scale = Math.max(w / image.width, mockReportHeroHeight / image.height)
    ctx.drawImage(image, (w - image.width * scale) / 2, (mockReportHeroHeight - image.height * scale) / 2, image.width * scale, image.height * scale)
    if (overlay) paintOverlay(ctx, overlay, w, time)
    ctx.restore()
  }
  fade(ctx, mockReportHeroHeight - 120, 120)
  let y = mockReportHeroHeight - 82 + 6
  const scoresRegion = { id: 'scores', label: 'Scores', x: 12, y: y - 4, width: 366, height: 110 }
  if (!options.omit?.has('scores')) drawReportComponent(ctx, slide, scoresRegion, options.componentFrame?.(scoresRegion) ?? scoresRegion, options.metricProgress ?? 1, options.numbers)
  y += 112
  const summary = categorySummaryLayout(ctx, category)
  if (summary.height && !options.omit?.has('category-score')) {
    const region = { id: 'category-score', label: category.title, x: 18, y, width: 354, height: 44 }
    drawReportComponent(ctx, slide, region, options.componentFrame?.(region) ?? region, options.metricProgress ?? 1, options.numbers)
  }
  if (summary.height) y += summary.height + 10
  if (category.id === 'eyes' && category.eyeColor) {
    const selected = mockEyePalette.find(shade => shade.name === category.eyeColor)
    if (selected) {
      card(ctx, 18, y, w - 36, 91, 18)
      label(ctx, 'Eye color', 34, y + 16)
      text(ctx, selected.name[0].toUpperCase() + selected.name.slice(1), w - 34, y + 16, 14, 600, ink, true)
      const gradient = ctx.createLinearGradient(34, 0, w - 34, 0)
      mockEyePalette.forEach((shade, index) => gradient.addColorStop(index / (mockEyePalette.length - 1), shade.hex))
      box(ctx, 34, y + 48, w - 68, 18, 5, gradient)
      const position = mockEyePalette.indexOf(selected) / (mockEyePalette.length - 1)
      const px = 34 + (w - 68) * .94 * position
      box(ctx, px, y + 44, 14, 26, 9, '#ffffff70')
      ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = .7; ctx.stroke()
      y += 101
    }
  }
  const layout = mockFeatureLayout(category)
  for (const { feature, x, top, width: tileWidth, height: tileHeight } of layout.tiles) {
    const id = `feature:${feature.id ?? category.features.indexOf(feature)}`
    const region = { id, label: feature.label, x, y: y + top, width: tileWidth, height: tileHeight }
    const progress = Math.max(0, Math.min(1, options.featureProgress?.(id, region.y) ?? options.metricProgress ?? 1))
    if (!options.omit?.has(id)) drawReportComponent(ctx, slide, region, options.componentFrame?.(region) ?? region, progress, options.numbers)

  }
  y += layout.height + 22
  text(ctx, 'Growth Opportunities', 18, y, 25, 700)
  y += 40
  const growthProgress = options.growthProgress ?? options.metricProgress ?? 1
  const potentialRegion = { id: 'potential', label: 'Potential', x: 18, y, width: 354, height: 103 }
  if (!options.omit?.has('potential')) drawReportComponent(ctx, slide, potentialRegion, options.componentFrame?.(potentialRegion) ?? potentialRegion, growthProgress, options.numbers)
  y += 115
  const blocks = growthBlocks(category)
  const actionHeight = 82 + blocks.reduce((sum, block) => sum + wrap(ctx, block.value, w - 68, block.size, block.weight).length * block.lineHeight + (block.heading ? 27 : 0) + block.gap, 0)
  const actionRegion = { id: 'action-plan', label: 'Action plan', x: 18, y, width: 354, height: actionHeight }
  if (!options.omit?.has('action-plan')) drawReportComponent(ctx, slide, actionRegion, options.componentFrame?.(actionRegion) ?? actionRegion, options.metricProgress ?? 1, options.numbers)
  y += actionHeight
  if (['skin-age', 'sun-damage'].includes(category.id)) {
    y += 18
    card(ctx, 18, y, w - 36, 150, 18)
    label(ctx, 'Sources', 32, y + 14)
    paragraph(ctx, 'Cosmetic UV and visible age context only. This is not medical advice.', 32, y + 36, w - 64, 13, 19, muted)
    text(ctx, category.id === 'skin-age' ? 'AAD: sunscreen and moisturizer for aging skin' : 'FDA sun safety and sunscreen guidance', 32, y + 86, 12, 600, ink, false, w - 64)
    text(ctx, category.id === 'skin-age' ? 'AAD: how to apply and reapply sunscreen' : 'CDC sun safety facts', 32, y + 112, 12, 600, ink, false, w - 64)
  }
  ctx.restore()
  drawChrome(ctx, category, h, options.deviceChrome ?? false)
  ctx.restore()
}

export function drawFeatureCard(ctx: CanvasRenderingContext2D, feature: ReportCategory['features'][number], width: number, height: number, progress = 1, sink?: NumberSink, identity = feature.id ?? feature.label) {
  card(ctx, 0, 0, width, height, reportUi.radius)
  const pad = reportUi.padding, visual = feature.visual ?? 'Text'
  label(ctx, feature.label, pad, pad, false, muted, width - pad * 2)
  if (visual !== 'Text') drawMetricVisual(ctx, feature, pad, 38, width - pad * 2, height - 82, progress)
  let size = visual === 'Orbit' ? 19 : width > 200 ? reportUi.valueSize : reportUi.compactValueSize
  const lines = wrap(ctx, feature.value, width - pad * 2, size, 600)
  while (lines.length > 3 && size > 16) { size--; lines.splice(0, lines.length, ...wrap(ctx, feature.value, width - pad * 2, size, 600)) }
  lines.slice(0, 3).forEach((line, index) => metricValue(ctx, line, pad, height - pad - Math.min(3, lines.length) * 26 + index * 26, size, progress, `${identity}:${index}`, sink))
  if (visual === 'Rail' && feature.grade != null) {
    text(ctx, '/ 10', width - pad, height - 40, 13, 500, muted, true)
    numericText(ctx, feature.grade, 1, width - pad - 29, height - 40, 20, 500, muted, progress, `grade:${identity}`, sink, true)
  }
}

function metricValue(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, progress: number, id: string, sink?: NumberSink) {
  const match = value.match(/^(-?\d+(?:\.\d+)?)(.*)$/)
  if (!match) { text(ctx, value, x, y, size, 600); return }
  const decimals = match[1].split('.')[1]?.length ?? 0
  const width = numericText(ctx, Number(match[1]), decimals, x, y, size, 600, ink, progress, id, sink)
  text(ctx, match[2], x + width, y, size, 600)
}
function numericText(ctx: CanvasRenderingContext2D, value: number, decimals: number, x: number, y: number, size: number, weight: number, color: string, progress: number, id: string, sink?: NumberSink, right = false) {
  ctx.save(); ctx.font = `${weight} ${size}px ${sans}`; ctx.fillStyle = color
  const width = rollingNumberWidth(ctx, value.toFixed(decimals))
  drawRollingNumber(ctx, id, value, decimals, right ? x - width : x, y + size * .82, size, progress, sink)
  ctx.restore(); return width
}
export function drawScorePair(ctx: CanvasRenderingContext2D, slide: ContentSlide, width: number, progress = 1, sink?: NumberSink) {
  const w = width, y = 0
  label(ctx, 'Overall Score', 8, 4)
  label(ctx, 'Potential', w - 8, 4, true, '#A8A8AF')
  numericText(ctx, Number(slide.currentScore), 1, 8, 24, 44, 600, ink, progress, 'overall-score', sink)
  numericText(ctx, Number(slide.potentialScore), 1, w - 8, 24, 44, 600, '#9b9ba3', progress, 'potential-score', sink, true)
  text(ctx, '/ 10', 8, 76, 13, 500, muted)
  text(ctx, '/ 10', w - 8, 76, 13, 500, '#B1B1B8', true)
}

function drawPotential(ctx: CanvasRenderingContext2D, slide: ContentSlide, progress: number, sink?: NumberSink) {
  const w = 390, y = 0
  const growthProgress = progress
  ctx.save()
  card(ctx, 18, y, w - 36, 103, 22)
  box(ctx, 34, y + 16, 34, 34, 17, ink)
  symbol(ctx, 12, 42.5, y + 24.5, 17, true)
  text(ctx, 'Potential Score', 80, y + 22, 19, 700)
  numericText(ctx, Number(slide.potentialScore), 1, w - 64, y + 22, 18, 600, muted, progress, 'growth-score', sink, true)
  text(ctx, '/10', w - 34, y + 22, 18, 600, muted, true)
  box(ctx, 34, y + 64, w - 68, 7, 4, 'rgba(7,7,9,.08)')
  const potentialGradient = ctx.createLinearGradient(34, 0, w - 34, 0)
  potentialGradient.addColorStop(0, '#53A553'); potentialGradient.addColorStop(1, '#00A8EF')
  const metricProgress = growthProgress
  box(ctx, 34, y + 64, (w - 68) * Math.max(.08, Number(slide.potentialScore) / 10) * metricProgress, 7, 4, potentialGradient)
  for (const score of [slide.currentScore, slide.potentialScore]) box(ctx, 34 + (w - 68) * Number(score) / 10 * metricProgress - 4, y + 59, 8, 17, 4, '#ffffffcc')
  ctx.restore()
}
function drawActions(ctx: CanvasRenderingContext2D, category: ReportCategory) {
  const w = 390, y = 0
  const blocks = growthBlocks(category)
  const blockHeights = blocks.map(block => wrap(ctx, block.value, w - 68, block.size, block.weight).length * block.lineHeight + (block.heading ? 27 : 0))
  const actionHeight = 66 + blockHeights.reduce((sum, n, index) => sum + n + blocks[index].gap, 0) + 16
  card(ctx, 18, y, w - 36, actionHeight, 22)
  box(ctx, 34, y + 16, 34, 34, 10, ink)
  symbol(ctx, 13, 42, y + 24, 18, true)
  text(ctx, category.id === 'overall' ? 'Your priorities' : 'Action Plan', 80, y + 22, 19, 700)
  symbol(ctx, 14, w - 52, y + 24, 18)
  let blockY = y + 66
  blocks.forEach((block, index) => {
    if (block.heading) {
      text(ctx, block.heading, 34, blockY, 16, 600)
      if (block.score) text(ctx, block.score, w - 34, blockY + 2, 13, 400, muted, true)
      blockY += 27
    }
    const todo = block.value.startsWith('•  ')
    if (todo) { box(ctx, 34, blockY + 2, 15, 15, 4, '#fff'); ctx.strokeStyle = '#d4d4d8'; ctx.lineWidth = 1; ctx.stroke() }
    paragraph(ctx, todo ? block.value.slice(3) : block.value, todo ? 59 : 34, blockY, todo ? w - 93 : w - 68, block.size, block.lineHeight, muted)
    blockY += blockHeights[index] - (block.heading ? 27 : 0) + block.gap
  })
}

export type ReportRect = { x: number; y: number; width: number; height: number }
/** The same component painter is used inside the app report and on the stage.
 * No component can sample pixels from a report, hero photo, or previous frame. */
export function drawReportComponent(ctx: CanvasRenderingContext2D, slide: ContentSlide, region: ReportRegion, frame: ReportRect, progress = 1, numbers?: NumberSink) {
  const category = slide.mockReport!.category
  ctx.save(); ctx.translate(frame.x, frame.y); ctx.scale(frame.width / region.width, frame.height / region.height)
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'
  if (region.id.startsWith('feature:')) {
    const feature = category.features.find((feature, index) => `feature:${feature.id ?? index}` === region.id)
    if (feature) drawFeatureCard(ctx, feature, region.width, region.height, progress, numbers, region.id)
  } else if (region.id === 'potential') { ctx.translate(-18, 0); drawPotential(ctx, slide, progress, numbers) }
  else if (region.id === 'action-plan') { ctx.translate(-18, 0); drawActions(ctx, category) }
  else if (region.id === 'category-score') {
    text(ctx, category.title, 0, 4, 24, 600)
    numericText(ctx, category.score, 1, region.width - 40, 8, 20, 600, muted, progress, `category:${category.id}`, numbers, true)
    text(ctx, '/ 10', region.width, 8, 14, 500, muted, true)
  } else drawScorePair(ctx, slide, region.width, progress, numbers)
  ctx.restore()
}

function categorySummaryLayout(ctx: CanvasRenderingContext2D, category: ReportCategory) {
  const score = `${category.score.toFixed(1)} / 10`
  const title = wrap(ctx, category.title, 290, 32, 600)
  return { title, subtitle: [] as string[], height: category.id === 'overall' ? 0 : 38, score }
}

type GrowthBlock = { value: string; size: number; lineHeight: number; weight: number; gap: number; heading?: string; score?: string }
function growthBlocks(category: ReportCategory): GrowthBlock[] {
  const body = (value: string, patch: Partial<GrowthBlock> = {}): GrowthBlock => ({ value, size: 15, lineHeight: 22, weight: 500, gap: 10, ...patch })
  if (category.id === 'overall') {
    const priorities = category.recommendation.split(/\n+/).map(value => value.trim()).filter(Boolean).slice(0, 3)
    const ranked = [...category.features].sort((a, b) => parseFloat(a.value) - parseFloat(b.value))
    return [body('Start with the first priority. These steps come from your category recommendations, ordered by score.', { size: 13, lineHeight: 19, gap: 18 }),
      ...priorities.map((value, index) => body(value, { heading: `${index + 1}.  ${ranked[index]?.label ?? 'Priority'}`, score: ranked[index]?.value, gap: 18 })),
      ...(priorities.length ? [] : [body('This report does not include specific improvement steps beyond photo guidance. No personalized priorities are available yet.')])]
  }
  const plan = buildCategoryActionPlan(category)
  return [
    ...(plan.items.length && plan.focus ? [body(`${category.score.toFixed(1)}/10 · ${plan.focus}`, { size: 13, lineHeight: 19 })] : []),
    ...(plan.items.length ? plan.items.map(item => body(`•  ${item}`)) : [body('This report has no specific action for this category. A new evaluation can generate recommendations tied to your visible findings.')]),
    ...(plan.prevention ? [body(plan.prevention, { heading: 'Daily skin protection' })] : []),
  ]
}

export function mockReportScrollMax(category: ReportCategory) {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return 0
  const actionHeight = 82 + growthBlocks(category).reduce((sum, block) => sum + wrap(ctx, block.value, mockReportSize.width - 68, block.size, block.weight).length * block.lineHeight + (block.heading ? 27 : 0) + block.gap, 0)
  const contentHeight = mockReportHeroHeight + 36 + (category.id === 'overall' ? 0 : categorySummaryLayout(ctx, category).height + 10)
    + (category.id === 'eyes' && category.eyeColor ? 101 : 0)
    + mockFeatureLayout(category).height + 22 + 40 + 115 + actionHeight
    + (['skin-age', 'sun-damage'].includes(category.id) ? 168 : 0) + 132
  return Math.max(0, Math.ceil(contentHeight - mockReportSize.height))
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
  box(ctx, x, y, width, height, radius, '#fff'); ctx.strokeStyle = '#e4e4e7'; ctx.lineWidth = 1; ctx.stroke()
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
function fade(ctx: CanvasRenderingContext2D, y: number, height: number) {
  const gradient = ctx.createLinearGradient(0, y, 0, y + height)
  for (let i = 0; i <= 12; i++) {
    const position = i / 12, opacity = (1 - Math.cos(position * Math.PI)) / 2
    gradient.addColorStop(position, `rgba(247,247,247,${opacity})`)
  }
  ctx.fillStyle = gradient; ctx.fillRect(0, y, mockReportSize.width, height)
}

export function mockFeatureLayout(category: ReportCategory) {
  const isFull = (feature: ReportCategory['features'][number]) => feature.visual === 'Capsule' || ['proportions.fifths','proportions.width-hierarchy','proportions.vertical-alignment'].includes(feature.id ?? '') || feature.value.length > 28
  const full = category.features.filter(isFull)
  const orbits = category.features.filter(feature => !isFull(feature) && feature.visual === 'Orbit')
  const remaining = category.features.filter(feature => !isFull(feature) && feature.visual !== 'Orbit')
  if (orbits.length % 2) full.push(orbits.pop()!)
  if (remaining.length % 2) full.push(remaining.pop()!)
  let top = 0
  const tiles: Array<{ feature: ReportCategory['features'][number]; x: number; top: number; width: number; height: number }> = []
  for (const feature of full) {
    const height = feature.visual === 'Orbit' ? 176 : feature.visual !== 'Text' ? 145 : 138
    tiles.push({ feature, x: 18, top, width: 354, height }); top += height + 10
  }
  const halves = [...orbits, ...remaining]
  for (let index = 0; index < halves.length; index += 2) {
    const height = halves[index].visual === 'Orbit' ? 176 : 138
    halves.slice(index,index + 2).forEach((feature, column) => tiles.push({ feature, x: 18 + column * 182, top, width: 172, height }))
    top += height + 10
  }
  return { tiles, height: top }
}

export type ReportRegion = { id: string; label: string; x: number; y: number; width: number; height: number }

// These are the same native-layout coordinates used by drawMockReport, before
// scroll/parallax and delivery scaling. The editor never guesses card positions.
export function mockReportRegions(ctx: CanvasRenderingContext2D, category: ReportCategory): ReportRegion[] {
  const featuresTop = mockReportHeroHeight - 76 + 112 + (category.id === 'overall' ? 0 : 48)
    + (category.id === 'eyes' && mockEyePalette.some(shade => shade.name === category.eyeColor) ? 101 : 0)
  const layout = mockFeatureLayout(category)
  const potentialY = featuresTop + layout.height + 22 + 40
  const blocks = growthBlocks(category)
  const actionHeight = 82 + blocks.reduce((sum, block) => sum + wrap(ctx, block.value, 322, block.size, block.weight).length * block.lineHeight + (block.heading ? 27 : 0) + block.gap, 0)
  return [
    { id: 'hero', label: 'Face scan', x: 0, y: 0, width: 390, height: mockReportHeroHeight },
    { id: 'scores', label: 'Overall & potential scores', x: 12, y: mockReportHeroHeight - 80, width: 366, height: 110 },
    ...(category.id === 'overall' ? [] : [{ id: 'category-score', label: `${category.title} category score`, x: 18, y: mockReportHeroHeight - 76 + 112, width: 354, height: 44 }]),
    { id: 'features', label: 'Feature grid', x: 18, y: featuresTop, width: 354, height: Math.min(380, layout.height) },
    ...layout.tiles.map((tile, index) => ({ id: `feature:${tile.feature.id ?? index}`, label: tile.feature.label, x: tile.x, y: featuresTop + tile.top, width: tile.width, height: tile.height })),
    { id: 'potential', label: 'Growth potential', x: 18, y: potentialY, width: 354, height: 103 },
    { id: 'action-plan', label: category.id === 'overall' ? 'Your priorities' : 'Action plan', x: 18, y: potentialY + 115, width: 354, height: actionHeight },
  ]
}
function drawMetricVisual(ctx: CanvasRenderingContext2D, feature: ReportCategory['features'][number], x: number, y: number, width: number, height: number, progress = 1) {
  const quality = feature.visual === 'Rail' || feature.scale === 'quality'
  const colors = quality ? reportUi.quality : reportUi.range
  const stops: Array<[number, string]> = colors.map((color, index) => [index / (colors.length - 1), color])
  const gradient = ctx.createLinearGradient(x, y, x + width, y); stops.forEach(([position,color]) => gradient.addColorStop(position,color))
  const positions = (feature.visual === 'Rail' ? [(feature.grade ?? 7.4) / 10] : feature.positions ?? [.5]).map(value => value * progress)
  const opacity = ctx.globalAlpha
  ctx.save()
  if (feature.visual === 'Orbit') {
    const radius = Math.min(width * .43, height - 14), cx = x + width / 2, cy = y + (height + radius) / 2
    ctx.beginPath(); ctx.arc(cx, cy, radius, Math.PI, Math.PI * (1 + progress))
    ctx.strokeStyle = gradient; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.shadowColor = '#00A8EF55'; ctx.shadowBlur = 10; ctx.globalAlpha = opacity * .25; ctx.stroke()
    ctx.shadowBlur = 0; ctx.globalAlpha = opacity * .55; ctx.lineWidth = 9; ctx.stroke()
    ctx.shadowBlur = 0; ctx.globalAlpha = opacity * .75; ctx.lineWidth = 1.3; ctx.strokeStyle = 'white'; ctx.stroke()
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fillStyle = '#71717a'; ctx.fill()
    for (const position of positions) {
      const angle = Math.PI * (1 + Math.max(0,Math.min(1,position))), px = cx + radius * Math.cos(angle), py = cy + radius * Math.sin(angle)
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(px,py); ctx.lineWidth = 1; ctx.strokeStyle = '#71717a55'; ctx.stroke()
      ctx.beginPath(); ctx.arc(px,py,7,0,Math.PI*2); ctx.fillStyle = '#ffffffcc'; ctx.fill(); ctx.strokeStyle = 'white'; ctx.stroke()
    }
  } else {
    const cy = y + height / 2
    box(ctx, x, cy - 4, width, 8, 4, '#e4e4e7')
    ctx.globalAlpha = opacity * .65; ctx.shadowColor = '#00A8EF66'; ctx.shadowBlur = 5
    box(ctx, x, cy - 4, feature.visual === 'Rail' ? width * positions[0] : width * progress, 8, 4, gradient)
    ctx.globalAlpha = opacity; ctx.shadowBlur = 0
    positions.forEach(position => box(ctx, x + width * Math.max(0,Math.min(1,position)) - 4, cy - 8, 8, 16, 4, '#ffffffdd'))
  }
  ctx.restore()
}
