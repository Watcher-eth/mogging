import { afterEach, expect, spyOn, test } from 'bun:test'
import { randomScore, randomScorePair, scoreRanges, type ScoreRange } from './random-scores'
import { reportCategories } from './mock-report-data'
import { nativeMetricFeature, drawFeatureCard, mockReportFormat, mockReportHeroHeight, mockReportSize, mockFeatureLayout, mockReportRegions } from './mock-report'
import { sampleReportTour } from './report-tour'
import { drawSlideFrame } from './export-slides'
import type { ContentSlide } from './content-generator'

let random: ReturnType<typeof spyOn> | undefined
afterEach(() => random?.mockRestore())

test('native cards keep unscored descriptions without inventing a chart', () => {
  const scored = { label: 'Under-chin contour', value: 'Smooth transition', visual: 'Text', grade: 7.4 }
  expect(nativeMetricFeature(scored).visual).toBe('Rail')
  expect(scored.visual).toBe('Text')
  expect(nativeMetricFeature({ label: 'Eye area', value: '8.1 / 10', visual: 'Text', scale: 'quality', positions: [.81] }).visual).toBe('Orbit')
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? (text: string) => ({ width: text.length * 7 }) : () => {}, set: () => true }) as CanvasRenderingContext2D
  for (const [feature, chart] of [[scored, true], [{ label: 'Contour', value: 'Smooth transition', visual: 'Text' }, false]] as const) {
    const parts: string[] = []
    drawFeatureCard(ctx, feature, 354, 145, 1, 'metric', (_, node) => { parts.push(node.id) })
    expect(parts.includes('metric/surface')).toBe(true)
    expect(parts.includes('metric/visual')).toBe(chart)
  }
})

test('random scores respect every range, including rounded endpoints and the PSL cap', () => {
  random = spyOn(Math, 'random')
  for (const range of Object.keys(scoreRanges) as ScoreRange[]) {
    for (const maximum of [8, 10]) {
      for (const sample of [0, .01, .25, .5, .75, .99, .999999]) {
        random.mockReturnValue(sample)
        const value = Number(randomScore(range, maximum))
        expect(value).toBeGreaterThanOrEqual(scoreRanges[range].min)
        expect(value).toBeLessThanOrEqual(Math.min(maximum, scoreRanges[range].max))
      }
    }
  }
})

test('potential remains at least current while both stay in the chosen range', () => {
  random = spyOn(Math, 'random').mockReturnValueOnce(.99).mockReturnValueOnce(.01)
  expect(randomScorePair('low')).toEqual({ current: '1.0', potential: '2.5' })
})

test('iPhone export dimensions support H.264 and preserve the hero crop ratio', () => {
  expect(mockReportFormat.width % 2).toBe(0)
  expect(mockReportFormat.height % 2).toBe(0)
  expect(mockReportFormat.width / mockReportFormat.height).toBe(mockReportSize.width / mockReportSize.height)
  expect(mockReportHeroHeight).toBe(Math.round(mockReportSize.height * .55))
})

test('every mobile report category draws its complete feature grid and growth section through the export renderer', () => {
  expect(reportCategories.map(item => item.id)).toEqual(['eyes', 'brows', 'nose', 'mouth', 'jaw', 'cheeks', 'face-shape', 'proportions', 'symmetry', 'skin', 'hair', 'ears', 'overall'])
  for (const category of reportCategories) {
    const texts: string[] = []
    let saves = 0
    const ctx = new Proxy({}, { get: (_target, key) => {
      if (key === 'fillText') return (text: string) => texts.push(text)
      if (key === 'measureText') return (text: string) => ({ width: text.length * 7 })
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} })
      if (key === 'save') return () => saves++
      if (key === 'restore') return () => saves--
      return () => {}
    } }) as CanvasRenderingContext2D
    const slide: ContentSlide = { id: 'test', templateId: 'mock-report', categoryId: category.id, imageId: 'test', currentScore: '6.3', potentialScore: '8.2', categoryScores: [], eyebrow: '', headline: '', supportingCopy: '', metricLabel: category.title, metricValue: '', cta: '', mockReport: { category, scroll: 0 } }
    drawSlideFrame(ctx, slide, null, null, mockReportFormat.width, mockReportFormat.height, 4000, null)
    expect(texts.join('')).toContain('6.3')
    expect(texts.join('')).toContain('8.2')
    expect(texts).toContain('Your potential')
    expect(texts).toContain(category.id === 'overall' ? 'Your priorities' : 'Action Plan')
    for (const feature of category.features) expect(texts.join(' ').replace(/\s+/g, ' ')).toContain(feature.label)
    expect(saves).toBe(0)
    const regions = mockReportRegions(ctx, category), maximum = Math.max(...regions.map(region => region.y + region.height)) - 712
    for (const time of [0, 5200, 11000, 17000, 22000, 26400]) {
      const tour = sampleReportTour(time, regions, maximum)
      expect(tour.scroll).toBeGreaterThanOrEqual(0)
      expect(tour.scroll).toBeLessThanOrEqual(maximum)
      expect(Number.isFinite(tour.lift)).toBe(true)
      expect(regions).toContain(tour.region)
    }
  }
})

test('mock summaries use the real report fields and keep zero scores and category aliases', async () => {
  const { buildMockOverallCategory } = await import('./mock-report-data')
  const report = buildMockOverallCategory('0', { psl: '0', cheekbones: '6.5', 'skin-quality': '8.1' })
  expect(report.score).toBe(0)
  expect(report.features.find(item => item.label === 'PSL score')?.value).toBe('0.0 / 8')
  expect(report.features.find(item => item.label === 'Cheekbone structure')?.positions).toEqual([.65])
  expect(report.features.find(item => item.label === 'Skin quality')?.value).toBe('8.1 / 10')
  expect(report.features.find(item => item.label === 'Facial thirds')).toBeDefined()
  expect(report.features.some(item => item.visual === 'Text')).toBe(true)
  expect(report.features.find(item => item.id === 'overall.cheeks')?.triangulation?.axes).toHaveLength(3)
  const tiles = mockFeatureLayout(report).tiles
  expect(tiles[0].top).toBe(tiles[1].top)
  expect(tiles.find(tile => tile.feature.id === 'overall.cheeks')?.width).toBe(354)
  expect(tiles.some(tile => !tile.showVisual)).toBe(true)
})

test('chart entries wait for the visible instrument area rather than the tile heading', async () => {
  const { reportInstrumentIsVisible } = await import('./report-tour')
  expect(reportInstrumentIsVisible(700, 140, 0)).toBe(false)
  expect(reportInstrumentIsVisible(600, 140, 0)).toBe(true)
  expect(reportInstrumentIsVisible(0, 80, 0)).toBe(false)
  expect(reportInstrumentIsVisible(1000, 140, 500)).toBe(true)
  expect(reportInstrumentIsVisible(1000, 0, 500)).toBe(false)
  expect(reportInstrumentIsVisible(600, 140, 0, 104, 500)).toBe(false)
  expect(reportInstrumentIsVisible(600, 140, 0, 104, 734)).toBe(true)
})
