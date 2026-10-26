import { expect, test } from 'bun:test'
import { drawReportComponent, mockReportRegions } from './mock-report'
import { reportCategories } from './mock-report-data'
import { digitColumns, drawRollingNumber, rollingNumberWidth, type NumberPort } from './rolling-number'
import { morphContours, focusMeasurement } from './overlay-morph'
import type { ReportOverlay } from './report-overlay'
import type { ContentSlide } from './content-generator'
import { drawVideoFrame, type PreparedVideo } from './video-renderer'
import { compileAnalysisVideo } from './video-composition'
import { scriptToPlan } from './script-edit'
import type { AnalysisPostInput } from './analysis-post'
import { featureStageLayout, subjectAboveComponent } from './video-layout'

function canvas() {
  const images: unknown[] = [], labels: string[] = []
  const state: Record<string, unknown> = { globalAlpha: 1 }
  const ctx = new Proxy({}, { get: (_, key) => {
    if (key === 'drawImage') return (image: unknown) => images.push(image)
    if (key === 'fillText') return (text: string) => labels.push(text)
    if (key === 'measureText') return (text: string) => ({ width: text === '1' ? 4 : text.length * 8 })
    if (key === 'getTransform') return () => ({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 })
    if (key === 'createLinearGradient') return () => ({ addColorStop() {} })
    return state[String(key)] ?? (() => {})
  }, set: (_, key, value) => { state[String(key)] = value; return true } }) as CanvasRenderingContext2D
  return { ctx, images, labels }
}

test('standalone score and feature components cannot carry report-photo pixels', () => {
  for (const category of reportCategories) {
    const { ctx, images, labels } = canvas()
    const slide = { currentScore: '7.1', potentialScore: '8.2', mockReport: { category, scroll: 0 } } as ContentSlide
    for (const region of mockReportRegions(ctx, category).filter(region => region.id === 'scores' || region.id.startsWith('feature:'))) {
      drawReportComponent(ctx, slide, region, { x: 40, y: 1400, width: 1000, height: 400 })
    }
    expect(images).toEqual([])
    expect(labels.filter(label => label === 'OVERALL SCORE')).toHaveLength(1)
    for (const feature of category.features) expect(labels.filter(label => label === feature.label.toUpperCase())).toHaveLength(1)
  }
})

test('rolling score digits reserve wide cells and emit exact NumberFlow slots', () => {
  const { ctx } = canvas(), ports: NumberPort[] = []
  expect(rollingNumberWidth(ctx, '7.1')).toBe(24)
  drawRollingNumber(ctx, 'score', 7.1, 1, 30, 70, 44, .5, port => { ports.push(port); return true })
  expect(ports[0]).toMatchObject({ id: 'score', value: 7.1, current: 3.55, decimals: 1, x: 70, fontSize: 88, width: 48 })
  expect(digitColumns(7.1, 1, 1).map(column => column.digit ?? column.character).join('')).toBe('7.1')
  for (let step = 0; step <= 30; step++) expect(digitColumns(8.2, 1, step / 30).every(column => column.fraction >= 0 && column.fraction < 1)).toBe(true)
})

const overlay = (x: number): ReportOverlay => ({ size: { width: 360, height: 500 }, dots: [], primitives: [{ kind: 'line', id: 'measure', from: { anchor: 'leftPupil' }, to: { anchor: 'rightPupil' }, fromPoint: { x, y: 120 }, toPoint: { x: x + 80, y: 130 } }] })
test('measurement geometry moves continuously and reaches exact endpoints', () => {
  const a = overlay(30), b = overlay(110)
  expect(morphContours(a, b, 0)[0].points[0]).toEqual({ x: 30, y: 120 })
  expect(morphContours(a, b, 1)[0].points[0]).toEqual({ x: 110, y: 120 })
  let previous = 30
  for (let step = 1; step <= 60; step++) {
    const result = morphContours(a, b, step / 60)
    expect(result).toHaveLength(1)
    expect(result[0].points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
    expect(Math.abs(result[0].points[0].x - previous)).toBeLessThan(3)
    previous = result[0].points[0].x
  }
})
test('eye spacing measures pupils while inner gap measures inner corners', () => {
  const source = overlay(30)
  source.primitives.push(...['left-pupil', 'right-pupil', 'left-eye-inner', 'right-eye-inner'].map((id, index) => ({ kind: 'point' as const, id, at: { anchor: 'leftPupil' as const }, point: { x: 40 + index * 20, y: 100 } })))
  const spacing = focusMeasurement(source, 'eye spacing').primitives.find(item => item.id === 'pupil-distance')!
  const gap = focusMeasurement(source, 'inner eye gap').primitives.find(item => item.id === 'inner-eye-distance')!
  expect(spacing.kind === 'line' && spacing.fromPoint.x).toBe(40)
  expect(gap.kind === 'line' && gap.fromPoint.x).toBe(80)
})
test('portrait fits above the travelling card and reaches its exact settled bounds', () => {
  const layout = featureStageLayout({ width: 354, height: 145 })
  for (let y = 400; y <= layout.metric.y; y += 10) {
    const portrait = subjectAboveComponent(layout.face, { ...layout.metric, y })
    expect(portrait.height).toBeGreaterThanOrEqual(0)
    expect(portrait.y + portrait.height).toBeLessThanOrEqual(y - 48)
  }
  expect(subjectAboveComponent(layout.face, layout.metric)).toEqual(layout.face)
})
test('shared feature transitions draw one subject without rendering stacked scene captures', () => {
  const input = { formatId: 'score-reveal', subject: 'Test', hook: '', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2', recommendation: '', productFeatures: [], cta: 'Mogging' } as AnalysisPostInput
  const composition = compileAnalysisVideo(scriptToPlan('Open the eye report. Show the eye spacing slider big in the center. Highlight the jaw contour and its score on the portrait.'), input, ['face'], 'brand', reportCategories)
  const target = composition.scenes.find(scene => scene.source.kind === 'portrait')!
  const portrait = { width: 1000, height: 1400 }
  const incoming = canvas(), output = canvas()
  const scenes = new Map(composition.scenes.map(scene => [scene.id, {
    image: null, secondary: null, portrait, overlay: null, initialScroll: 0, scrollMax: 2000,
    slide: { currentScore: '7.1', potentialScore: '8.2', mockReport: { category: scene.source.report!, scroll: 0 } },
    regions: mockReportRegions(incoming.ctx, scene.source.report!),
  }]))
  const prepared = { composition, scenes, incoming: { getContext: () => incoming.ctx }, outgoing: { getContext: () => { throw new Error('Shared transitions must not render a second scene surface') } }, reportCanvas: {} } as unknown as PreparedVideo
  for (const local of [0, 180, 360, 540, 719]) {
    incoming.images.length = 0
    drawVideoFrame(output.ctx, prepared, target.startMs + local, 1080, 1920)
    expect(incoming.images).toEqual([portrait])
  }
})
