import { afterEach, expect, spyOn, test } from 'bun:test'
import { randomScore, randomScorePair, scoreRanges, type ScoreRange } from './random-scores'
import { reportCategories } from './mock-report-data'
import { mockReportFormat, mockReportHeroHeight, mockReportSize } from './mock-report'
import { drawSlideFrame } from './export-slides'
import type { ContentSlide } from './content-generator'

let random: ReturnType<typeof spyOn> | undefined
afterEach(() => random?.mockRestore())

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
    expect(texts).toContain('6.3')
    expect(texts).toContain('8.2')
    expect(texts).toContain('Growth Opportunities')
    expect(texts).toContain('Potential Score')
    expect(texts).toContain(category.id === 'overall' ? 'Your priorities' : 'Action Plan')
    for (const feature of category.features) expect(texts).toContain(feature.label.toUpperCase())
    expect(saves).toBe(0)
  }
})
