import type { ContentSlide } from './content-generator'
import { drawReportOverlay, type ReportOverlay } from './report-overlay'
import type { ReportCategory } from './mobile-overlay-engine/report-data'
import { buildCategoryActionPlan } from './mobile-overlay-engine/category-action-plan'

// Logical iPhone 13/14 viewport. Dimensions, colors and typography follow
// mogging-mobile/src/screens/report-screen.tsx. Export uses the same painter.
export const mockReportSize = { width: 390, height: 844 }
export const mockReportFormat = { width: 1170, height: 2532 }
export const mockReportHeroHeight = Math.round(mockReportSize.height * .55)
const ink = '#0a0a0d', paper = '#f7f7f7', muted = '#71717a'
export const mockEyePalette = [
  { name: 'blue', hex: '#3974b9' }, { name: 'gray', hex: '#8996a1' },
  { name: 'green', hex: '#5a9458' }, { name: 'hazel', hex: '#827c4d' },
  { name: 'amber', hex: '#ae813f' }, { name: 'brown', hex: '#745b42' },
  { name: 'dark brown', hex: '#3f322c' },
]
const sans = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'

export function drawMockReport(ctx: CanvasRenderingContext2D, slide: ContentSlide, image: HTMLImageElement | null, overlay: ReportOverlay | null, width: number, height: number, time: number) {
  const report = slide.mockReport
  if (!report) return
  const { category } = report
  const w = mockReportSize.width, h = mockReportSize.height
  ctx.save()
  ctx.scale(width / w, height / h)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, w, h)
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.save()
  ctx.translate(0, -report.scroll)
  if (image) {
    // Mobile parallax keeps the image and its overlay on the same transform.
    ctx.save()
    ctx.beginPath(); ctx.rect(0, 0, w, mockReportHeroHeight); ctx.clip()
    ctx.translate(0, report.scroll * .18)
    ctx.globalAlpha = Math.max(.58, 1 - report.scroll / (mockReportHeroHeight * .7) * .42)
    const scale = Math.max(w / image.width, mockReportHeroHeight / image.height)
    ctx.drawImage(image, (w - image.width * scale) / 2, (mockReportHeroHeight - image.height * scale) / 2, image.width * scale, image.height * scale)
    if (overlay) drawReportOverlay(ctx, overlay, w, time)
    ctx.restore()
  }
  fade(ctx, mockReportHeroHeight - 150, 150)
  let y = mockReportHeroHeight - 82 + 6
  label(ctx, 'Overall score', 20, y)
  label(ctx, 'Potential', w - 20, y, true, '#A8A8AF')
  text(ctx, Number(slide.currentScore).toFixed(1), 20, y + 20, 44, 600)
  ctx.save()
  ctx.font = `600 44px ${sans}`
  const value = Number(slide.potentialScore).toFixed(1)
  const valueWidth = ctx.measureText(value).width
  const x = w - 20 - valueWidth
  const travel = valueWidth * 4 * (time % 2200 / 2200) - valueWidth * 2
  const gradientWidth = valueWidth * 2.4
  const gradient = ctx.createLinearGradient(x + travel + gradientWidth * .67101, y + 20 + 48 * .03015, x + travel + gradientWidth * .32899, y + 20 + 48 * .96985)
  gradient.addColorStop(0, '#9B9BA3'); gradient.addColorStop(.45, '#9B9BA3'); gradient.addColorStop(.55, '#d7d7dc'); gradient.addColorStop(1, '#9B9BA3')
  ctx.fillStyle = gradient; ctx.fillText(value, x, y + 20)
  ctx.restore()
  text(ctx, '/ 10', 20, y + 72, 13, 500, muted)
  text(ctx, '/ 10', w - 20, y + 72, 13, 500, '#B1B1B8', true)
  y += 112
  const summary = categorySummaryLayout(ctx, category)
  if (summary.height) {
    card(ctx, 18, y, w - 36, summary.height, 18)
    label(ctx, category.scoreLabel, 34, y + 16)
    const subtitleY = y + summary.height - 16 - summary.subtitle.length * 18
    const titleY = subtitleY - 8 - summary.title.length * 35
    summary.title.forEach((line, index) => text(ctx, line, 34, titleY + index * 35, 32, 600))
    summary.subtitle.forEach((line, index) => text(ctx, line, 34, subtitleY + index * 18, 13, 400, muted))
    text(ctx, summary.score, w - 34, y + summary.height - 42, 22, 500, ink, true, undefined, 'Courier')
    y += summary.height + 10
  }
  if (category.id === 'eyes' && category.eyeColor) {
    const selected = mockEyePalette.find(shade => shade.name === category.eyeColor)
    if (selected) {
      card(ctx, 18, y, w - 36, 125, 18)
      label(ctx, 'Eye color', 34, y + 16)
      text(ctx, selected.name[0].toUpperCase() + selected.name.slice(1), w - 34, y + 16, 14, 600, ink, true)
      const others = mockEyePalette.filter(shade => shade !== selected)
      const shades = [...others.slice(0, 3), selected, ...others.slice(3)]
      const sw = (w - 68 - 30) / 7
      shades.forEach((shade, index) => box(ctx, 34 + index * (sw + 5), y + 46 + (shade === selected ? 0 : 9), sw, shade === selected ? 64 : 46, 5, shade.hex))
      y += 135
    }
  }
  const tileWidth = (w - 46) / 2
  category.features.forEach((feature, index) => {
    const left = 18 + index % 2 * (tileWidth + 10)
    const top = y + Math.floor(index / 2) * 164
    card(ctx, left, top, tileWidth, 154, 18)
    label(ctx, feature.label, left + 13, top + 13, false, muted, tileWidth - 26)
    const quantitative = /^\s*\d+(?:\.\d+)?\s*$/.test(feature.value) || /\d+(?:\.\d+)?\s*(?:\/\s*\d+|%|°|x|×)/i.test(feature.value)
    let size = quantitative ? 34 : 23
    const lineHeight = quantitative ? 36 : 27
    let lines = wrap(ctx, feature.value, tileWidth - 26, size, 600)
    while (lines.length > 3 && size > (quantitative ? 25 : 17)) lines = wrap(ctx, feature.value, tileWidth - 26, --size, 600)
    const valueTop = top + 154 - 13 - Math.min(3, lines.length) * lineHeight
    if (feature.measurement) text(ctx, feature.measurement, left + 13, valueTop - 21, 13, 400, muted, false, tileWidth - 26, 'Courier')
    lines.slice(0, 3).forEach((line, i) => text(ctx, line, left + 13, valueTop + i * lineHeight, size, 600))
  })
  y += Math.ceil(category.features.length / 2) * 164 + 22
  text(ctx, 'Growth Opportunities', 18, y, 25, 700)
  y += 40
  card(ctx, 18, y, w - 36, 103, 22)
  box(ctx, 34, y + 16, 34, 34, 17, ink)
  symbol(ctx, 12, 42.5, y + 24.5, 17, true)
  text(ctx, 'Potential Score', 80, y + 22, 19, 700)
  text(ctx, `${Number(slide.potentialScore).toFixed(1)}/10`, w - 34, y + 22, 18, 600, muted, true)
  box(ctx, 34, y + 64, w - 68, 7, 4, 'rgba(7,7,9,.08)')
  box(ctx, 34, y + 64, (w - 68) * Math.max(.08, Number(slide.potentialScore) / 10), 7, 4, '#8df0a8')
  y += 115
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
    paragraph(ctx, block.value, 34, blockY, w - 68, block.size, block.lineHeight, muted)
    blockY += blockHeights[index] - (block.heading ? 27 : 0) + block.gap
  })
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
  drawChrome(ctx, category)
  ctx.restore()
}

function categorySummaryLayout(ctx: CanvasRenderingContext2D, category: ReportCategory) {
  const score = `${category.score.toFixed(1)} / 10`
  ctx.font = '500 22px Courier'
  const width = mockReportSize.width - 84 - ctx.measureText(score).width
  const title = wrap(ctx, category.title, width, 32, 600)
  const subtitle = wrap(ctx, category.subtitle, width, 13, 400)
  const height = category.id === 'overall' ? 0 : Math.max(116, 44 + title.length * 35 + 8 + subtitle.length * 18)
  return { title, subtitle, height, score }
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
    + (category.id === 'eyes' && category.eyeColor ? 135 : 0)
    + Math.ceil(category.features.length / 2) * 164 + 22 + 40 + 115 + actionHeight
    + (['skin-age', 'sun-damage'].includes(category.id) ? 168 : 0) + 132
  return Math.max(0, Math.ceil(contentHeight - mockReportSize.height))
}

function drawChrome(ctx: CanvasRenderingContext2D, category: ReportCategory) {
  const title = category.title
  const { width: w, height: h } = mockReportSize
  text(ctx, '9:41', 34, 19, 15, 600)
  box(ctx, w / 2 - 62, 11, 124, 36, 18, '#000')
  for (let i = 0; i < 4; i++) box(ctx, w - 91 + i * 4, 30 - i * 3, 3, 4 + i * 3, 1, ink)
  ctx.save(); ctx.strokeStyle = ink; ctx.lineWidth = 1.6
  for (const radius of [4, 8, 12]) { ctx.beginPath(); ctx.arc(w - 57, 33, radius, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke() }
  ctx.strokeRect(w - 40, 22, 23, 11); ctx.restore()
  box(ctx, w - 38, 24, 18, 7, 1, ink); box(ctx, w - 16, 25, 2, 5, 1, ink)
  ctx.font = `600 14px ${sans}`
  const pillWidth = ctx.measureText(title).width + 62
  box(ctx, 18, 61, pillWidth, 38, 19, 'rgba(255,255,255,.84)')
  symbol(ctx, categorySymbolIds.indexOf(category.id), 30, 72, 16)
  text(ctx, title, 54, 72, 14, 600)
  symbol(ctx, 15, 18 + pillWidth - 25, 72, 15)
  box(ctx, w - 46, 61, 38, 38, 19, 'rgba(255,255,255,.82)')
  text(ctx, '×', w - 35, 66, 23, 500)
  fade(ctx, h - 176, 92)
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

function box(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fillStyle = fill; ctx.fill()
}
function card(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  box(ctx, x, y, width, height, radius, '#fff'); ctx.strokeStyle = '#e4e4e7'; ctx.lineWidth = 1; ctx.stroke()
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, weight = 500, color = ink, right = false, maxWidth?: number, font = sans, align?: CanvasTextAlign) {
  ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align ?? (right ? 'right' : 'left'); ctx.fillText(value, x, y, maxWidth); ctx.textAlign = 'left'
}
function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, right = false, color = muted, maxWidth?: number) { text(ctx, value.toUpperCase(), x, y, 10, 500, color, right, maxWidth, 'Courier') }
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
  gradient.addColorStop(0, 'rgba(247,247,247,0)'); gradient.addColorStop(1, paper)
  ctx.fillStyle = gradient; ctx.fillRect(0, y, mockReportSize.width, height)
}
