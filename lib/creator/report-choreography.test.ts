import { expect, test } from 'bun:test'
import { videoContent } from './video-layout'
import { reportEmphasis, drawAppReport, drawFeatureMetric, metricRevealState, reportMetricCues, type AppReportAsset } from './report-choreography'
import { createMotionTrack, type VideoScene } from './video-composition'
import { reportCategories } from './mock-report-data'
import { mockReportRegions } from './mock-report'
import type { CanvasNode, CanvasPainter } from './canvas-layout'

function scene(narration: string, startMs = 0, focus = 'features') {
  return { narration, startMs, durationMs: 4000, focus, source: { report: { features: [{ id: 'spacing', label: 'Eye spacing' }, { id: 'tilt', label: 'Canthal tilt' }, { id: 'width', label: 'Eye width' }] } } } as VideoScene
}

test('detailed chapters reveal metrics at their first spoken mention, not viewport entry', () => {
  const first = { ...scene('First eye spacing.'), words: [{ text: 'First', startMs: 0, endMs: 400 }, { text: 'eye', startMs: 800, endMs: 1100 }, { text: 'spacing.', startMs: 1100, endMs: 1500 }] }
  const second = { ...scene('Then canthal tilt.', 4000), words: [{ text: 'Then', startMs: 0, endMs: 400 }, { text: 'canthal', startMs: 1200, endMs: 1600 }, { text: 'tilt.', startMs: 1600, endMs: 2000 }] }
  expect(reportMetricCues([first, second])).toEqual({ 'feature:spacing': 800, 'feature:tilt': 5200 })
  expect(metricRevealState(799, 800, false)).toEqual({ content: 0, chart: 0 })
  expect(metricRevealState(900, 800, false).content).toBeGreaterThan(0)
  expect(metricRevealState(900, 800, false).chart).toBe(0)
  expect(metricRevealState(2500, 800, false)).toEqual({ content: 1, chart: 1 })
  expect(metricRevealState(2500, Infinity, false)).toEqual({ content: 0, chart: 0 })
})

test('generic reports and isolated focus retain normal entry unless narration names multiple metrics', () => {
  expect(reportMetricCues([scene('Here is the report.')])).toBeNull()
  expect(reportMetricCues([scene('Look here.', 3000, 'feature:spacing')])).toBeNull()
  expect(reportMetricCues([scene('Look here.', 0, 'feature:spacing'), scene('Notice this.', 4000, 'feature:tilt')])).toBeNull()
  expect(reportMetricCues([scene('Compare eye width with eye spacing.')])).toBeNull()
  expect(reportMetricCues([scene('Eye width measures one relationship.'), scene('Eye spacing measures another.', 4000)])).toHaveProperty('feature:width')
  expect(reportMetricCues([scene('Spacing is not the same as tilt.')])).toBeNull()
})

test('reduced motion preserves spoken gating and scrubbing is deterministic', () => {
  expect(metricRevealState(200, 500, true)).toEqual({ content: 0, chart: 0 })
  expect(metricRevealState(500, 500, true)).toEqual({ content: 1, chart: 1 })
  expect(metricRevealState(900, 500, false)).toEqual(metricRevealState(900, 500, false))
})

test('overview highlights do not turn the rest of the report into placeholders', () => {
  const overview = [scene('First tile.', 0, 'feature:spacing'), scene('Second tile.', 4000, 'feature:tilt')].map(scene => ({ ...scene, source: { ...scene.source, categoryId: 'overall' } }))
  expect(reportMetricCues(overview)).toBeNull()
})

test('native metric labels and values are absent before narration while their grid bounds remain', () => {
  const glyphs: string[] = [], roots: string[] = []
  const ctx = new Proxy({}, { get: (_, key) => key === 'globalAlpha' ? 1 : key === 'measureText' ? (text: string) => ({ width: text.length * 7 }) : key === 'fillText' ? (text: string) => glyphs.push(text) : ['createLinearGradient', 'createRadialGradient'].includes(String(key)) ? () => ({ addColorStop() {} }) : () => {}, set: () => true }) as CanvasRenderingContext2D
  const category = reportCategories.find(category => category.id === 'eyes')!
  const asset: AppReportAsset = { slide: { id: 'test', templateId: 'mock-report', imageId: 'face', categoryId: 'eyes', eyebrow: '', headline: '', supportingCopy: '', metricLabel: '', metricValue: '', cta: '', categoryScores: [], currentScore: '7.1', potentialScore: '8.2', mockReport: { category, scroll: 0 } }, image: null, overlay: null, initialScroll: 0, scrollMax: 0, regions: mockReportRegions(ctx, category), narratedMetrics: true, entryTimes: { 'feature:eyes.spacing': 1000 } }
  const report = { ...scene('Eye spacing.', 0, 'feature:eyes.spacing'), source: { kind: 'report' }, framing: 'full', tracks: [] } as unknown as VideoScene
  const paint: CanvasPainter = (ctx, node) => { roots.push(node.id); node.draw?.(ctx, paint) }
  drawAppReport(ctx, asset, report, 500, true, () => {}, paint)
  expect(roots).toContain('feature:eyes.spacing')
  expect(glyphs).not.toContain('Eye spacing')
  glyphs.length = 0
  drawAppReport(ctx, asset, report, 2000, true, () => {}, paint)
  expect(glyphs).toContain('Eye spacing')
  expect(glyphs).not.toContain('Inner-eye gap')
})

test('borderless portrait metrics put the category left and score right in one row above a full-width ruler', () => {
  const nodes: CanvasNode[] = []
  const ctx = new Proxy({}, { get: (_, key) => key === 'globalAlpha' ? 1 : () => {}, set: () => true }) as CanvasRenderingContext2D
  const category = reportCategories.find(category => category.id === 'eyes')!
  const asset = { slide: { mockReport: { category }, currentScore: '7.1', potentialScore: '8.2' }, regions: [{ id: 'category-score', label: 'Eyes', x: 0, y: 0, width: 354, height: 200 }] } as unknown as AppReportAsset
  const portrait = { focus: 'category-score', tracks: [], source: { categoryId: 'eyes' } } as unknown as VideoScene
  const paint: CanvasPainter = (_ctx, node) => { nodes.push(node, ...(node.children ?? [])) }
  drawFeatureMetric(ctx, asset, portrait, 2000, true, paint)
  const label = nodes.find(node => node.id === 'category-score/label')!, value = nodes.find(node => node.id === 'category-score/value')!, visual = nodes.find(node => node.id === 'category-score/visual')!
  expect(label.frame!.y).toBe(value.frame!.y)
  expect(label.frame!.x).toBeLessThan(value.frame!.x)
  expect(value.frame!.x + value.frame!.width).toBe(videoContent.width)
  expect(visual.frame!.width).toBe(videoContent.width - 16)
  expect(visual.frame!.y).toBeGreaterThan(label.frame!.height)
  expect(visual.frame!.y + visual.frame!.height).toBeLessThanOrEqual(350)
})

test('a continuing metric holds its settled value across caption boundaries and arbitrary seeks', () => {
  const glyphs: string[] = []
  const ctx = new Proxy({}, { get: (_, key) => key === 'globalAlpha' ? 1 : key === 'font' ? '40px Arial' : key === 'measureText' ? (text: string) => ({ width: text.length * 20 }) : key === 'fillText' ? (text: string) => glyphs.push(text) : () => {}, set: () => true }) as CanvasRenderingContext2D
  const category = reportCategories.find(category => category.id === 'eyes')!
  const asset = { slide: { mockReport: { category }, currentScore: '7.1', potentialScore: '8.2' }, regions: [{ id: 'category-score', label: 'Eyes', x: 0, y: 0, width: 354, height: 200 }], metricStartMs: 0 } as unknown as AppReportAsset
  const portrait = { startMs: 0, focus: 'category-score', tracks: [], source: { categoryId: 'eyes' } } as unknown as VideoScene
  const paint: CanvasPainter = (ctx, node) => { node.draw?.(ctx, paint); node.children?.forEach(child => paint(ctx, child)) }
  const render = (startMs: number, localMs: number, continued = true) => {
    glyphs.length = 0
    drawFeatureMetric(ctx, { ...asset, metricStartMs: continued ? 0 : startMs }, { ...portrait, startMs }, localMs, false, paint)
    return [...glyphs]
  }
  const settled = render(0, 2000)
  expect(render(2000, 0)).toEqual(settled)
  expect(render(2000, 0, false)).not.toEqual(settled)
  expect(render(2000, 0)).toEqual(settled)
})


test('overlapping section tracks and a group target resolve to one deterministic emphasis owner', () => {
  const report = { ...scene('Look at eye spacing.'), source: { ...scene('').source, kind: 'report' }, tracks: [
    { ...createMotionTrack('section-lift', 'report', 4000), section: 'features', startMs: 0, durationMs: 4000 },
    { ...createMotionTrack('section-expand', 'report', 4000), section: 'feature:tilt', startMs: 1500, durationMs: 2000 },
    { ...createMotionTrack('border-beam', 'report', 4000), section: 'feature:tilt', startMs: 1500, durationMs: 2000 },
  ] } as VideoScene
  expect(reportEmphasis(report, 1000)?.section).toBe('feature:spacing')
  expect(reportEmphasis(report, 2000)?.section).toBe('feature:tilt')
  expect(reportEmphasis(report, 2000)).toEqual(reportEmphasis(report, 2000))
  expect(reportEmphasis(report, 0)?.amount).toBe(0)
  expect(reportEmphasis(report, 3999)!.amount).toBeLessThan(.01)
  expect(reportEmphasis(report, 4000)).toBeNull()
})

test('report playback culls offscreen tiles while the measurement pass retains the complete grid', () => {
  const ctx = new Proxy({}, { get: (_, key) => key === 'globalAlpha' ? 1 : key === 'measureText' ? (text: string) => ({ width: text.length * 6 }) : ['createLinearGradient', 'createRadialGradient'].includes(String(key)) ? () => ({ addColorStop() {} }) : () => {}, set: () => true }) as CanvasRenderingContext2D
  const category = reportCategories.find(category => category.id === 'jaw')!
  const regions = mockReportRegions(ctx, category)
  const asset: AppReportAsset = { slide: { id: 'report', mockReport: { category, scroll: 0 }, currentScore: '7.1', potentialScore: '8.2' } as AppReportAsset['slide'], image: null, overlay: null, regions, scrollMax: 3000, initialScroll: 0 }
  const report = { ...scene('Read the report.'), source: { kind: 'report' }, framing: 'full', tracks: [] } as unknown as VideoScene
  const render = (cull: boolean) => {
    const roots: string[] = []
    const paint: CanvasPainter = (ctx, node) => { if (node.id.startsWith('feature:') && !node.id.includes('/')) roots.push(node.id); node.draw?.(ctx, paint) }
    drawAppReport(ctx, asset, report, 3000, true, () => {}, paint, cull)
    return roots
  }
  const all = render(false), visible = render(true)
  expect(all).toHaveLength(category.features.length)
  expect(visible.length).toBeGreaterThan(0)
  expect(visible.length).toBeLessThan(all.length)
})
