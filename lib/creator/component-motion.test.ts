import { expect, test } from 'bun:test'
import { createCanvasPainter } from './canvas-layout'
import { drawReportComponent, mockReportRegions } from './mock-report'
import { reportCategories } from './mock-report-data'
import { digitColumns, drawRollingNumber, rollingNumberWidth } from './rolling-number'
import { preciseFaceOverlay } from './video-face-treatment'
import type { ReportOverlay } from './report-overlay'
import type { ContentSlide, GeneratorImage } from './content-generator'
import { drawVideoFrame, type PreparedVideo } from './video-renderer'
import { compileAnalysisVideo } from './video-composition'
import { scriptToPlan } from './script-edit'
import type { AnalysisPostInput } from './analysis-post'

function canvas() {
  const images: unknown[] = [], labels: string[] = []
  let state: Record<string, unknown> = { globalAlpha: 1 }
  const stack: Array<Record<string, unknown>> = []
  const ctx = new Proxy({}, { get: (_, key) => {
    if (key === 'save') return () => stack.push({ ...state })
    if (key === 'restore') return () => { state = stack.pop()! }
    if (key === 'drawImage') return (image: unknown) => images.push(image)
    if (key === 'clearRect') return () => { images.length = 0; labels.length = 0 }
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
    for (const feature of category.features) expect(labels.join(' ')).toContain(feature.label)
  }
})

test('editorial action scenes expose large checklist rows without report-card headers or wrappers', () => {
  const category = { ...reportCategories.find(category => category.id === 'jaw')!, recommendation: 'Keep your grooming routine consistent. Review your daily Protocol tasks each morning.' }
  const { ctx, labels, images } = canvas(), components: string[] = []
  const paint = createCanvasPainter(undefined, element => components.push(element.id))
  drawReportComponent(ctx, { mockReport: { category, scroll: 0 } } as ContentSlide,
    { id: 'action-plan', label: 'Actions', x: 0, y: 0, width: 450, height: 240 }, { x: 60, y: 1340, width: 960, height: 512 }, 1, paint,
    (_text, index) => ({ reveal: 1, checked: index === 0 ? 1 : 0 }))
  expect(components.filter(id => /^action-plan\/item:\d+$/.test(id))).toHaveLength(2)
  expect(labels.join(' ')).toContain('grooming routine')
  expect(labels.join(' ')).toContain('Protocol tasks')
  expect(labels).not.toContain('Action Plan')
  expect(labels.some(label => label.includes('/10'))).toBe(false)
  expect(images).toHaveLength(0)
})

test('rolling score digits keep fixed cells and paint directly through the canvas', () => {
  const { ctx, labels } = canvas()
  expect(rollingNumberWidth(ctx, '7.1')).toBe(24)
  drawRollingNumber(ctx, 7.1, 1, 30, 70, 44, 1)
  expect(labels.join('')).toBe('7.1')
  expect(digitColumns(7.1, 1, 1).map(column => column.digit ?? column.character).join('')).toBe('7.1')
  for (let step = 0; step <= 30; step++) expect(digitColumns(8.2, 1, step / 30).every(column => column.fraction >= 0 && column.fraction < 1)).toBe(true)
})

const overlay = (x: number): ReportOverlay => ({ size: { width: 360, height: 500 }, dots: [], primitives: [{ kind: 'line', id: 'measure', from: { anchor: 'leftPupil' }, to: { anchor: 'rightPupil' }, fromPoint: { x, y: 120 }, toPoint: { x: x + 80, y: 130 } }] })

test('jaw outlines use the detected lower contour, never a closed cheek polygon or diagonal chin shortcut', () => {
  const points = [{ x: .2, y: .3 }, { x: .25, y: .6 }, { x: .35, y: .7 }, { x: .5, y: .75 }, { x: .65, y: .7 }, { x: .75, y: .6 }, { x: .8, y: .3 }]
  const source = { width: 1000, height: 1000, landmarks: { anchors: { jawLeft: points[1], jawRight: points[5] }, contours: { jawline: points } } } as GeneratorImage
  const original = { ...overlay(20), size: { width: 360, height: 360 } }
  const refined = preciseFaceOverlay(original, source, 'jaw')
  expect(refined.primitives.filter(item => item.kind === 'line' || item.kind === 'region')).toHaveLength(0)
  const path = refined.primitives[0]
  expect(path.kind).toBe('polyline')
  if (path.kind === 'polyline') {
    expect(path.closed).toBe(false)
    expect(path.pixelPoints[0]).toEqual({ x: 90, y: 216 })
    expect(path.pixelPoints.at(-1)).toEqual({ x: 270, y: 216 })
    expect(path.pixelPoints).toHaveLength(25)
    expect(path.pixelPoints.every(point => point.y >= 216)).toBe(true)
  }
  expect(preciseFaceOverlay(original, source, 'eyes').primitives.every(item => item.kind === 'point')).toBe(true)
})

test('eye traces preserve real contour coordinates without cross-face measuring lines', () => {
  const points = [{ x: .2, y: .3 }, { x: .3, y: .28 }, { x: .4, y: .3 }, { x: .3, y: .32 }]
  const source = { width: 1000, height: 1000, landmarks: { anchors: {}, contours: { leftEye: points } } } as GeneratorImage
  const original = { ...overlay(20), size: { width: 360, height: 360 } }
  original.primitives.push(...['left-pupil', 'right-pupil'].map((id, index) => ({ kind: 'point' as const, id, at: { anchor: 'leftPupil' as const }, point: { x: 90 + index * 100, y: 108 } })))
  const traced = preciseFaceOverlay(original, source, 'eyes')
  const path = traced.primitives.find(item => item.id === 'feature-leftEye')!
  expect(path.kind === 'polyline' && path.pixelPoints[0]).toEqual({ x: 72, y: 108 })
  expect(path.kind === 'polyline' && path.closed).toBe(true)
  expect(traced.primitives.every(item => item.kind !== 'line')).toBe(true)
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
  const prepared = { composition, scenes, incoming: { getContext: () => incoming.ctx }, outgoing: { getContext: () => { throw new Error('Shared transitions must not render a second scene surface') } } } as unknown as PreparedVideo
  for (const local of [0, 180, 360, 540, 719]) {
    incoming.images.length = 0
    drawVideoFrame(output.ctx, prepared, target.startMs + local, 1080, 1920, false)
    expect(incoming.images).toEqual([portrait])
  }
})
