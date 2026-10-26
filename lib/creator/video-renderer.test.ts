import { expect, test } from 'bun:test'
import { drawVideoFrame, type PreparedVideo } from './video-renderer'
import { compileAnalysisVideo } from './video-composition'
import { scriptToPlan } from './script-edit'
import { reportCategories } from './mock-report-data'
import { mockReportRegions } from './mock-report'
import type { AnalysisPostInput } from './analysis-post'

test('component captions retain finite positions after report rendering restores canvas state', () => {
  const calls: Array<{ text: string; x: number; y: number }> = []
  const images: unknown[] = []
  function context(record = false) {
    let state: Record<string, unknown> = { globalAlpha: 1 }
    const stack: Array<Record<string, unknown>> = []
    return new Proxy({}, { get: (_, key) => {
      if (key === 'save') return () => stack.push({ ...state })
      if (key === 'restore') return () => { state = stack.pop() ?? state }
      if (key === 'measureText') return (text: string) => ({ width: text.length * 20 })
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} })
      if (key === 'fillText') return (text: string, x: number, y: number) => { if (record) calls.push({ text, x, y }) }
      if (key === 'drawImage') return (image: unknown) => { if (record) images.push(image) }
      return state[String(key)] ?? (() => {})
    }, set: (_, key, value) => { state[String(key)] = value; return true } }) as CanvasRenderingContext2D
  }
  const input = { formatId: 'score-reveal', subject: 'Test', hook: '', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2', recommendation: '', productFeatures: [], cta: '' } as AnalysisPostInput
  const composition = compileAnalysisVideo(scriptToPlan('Open the eye report. Show the eye spacing slider big in the center.'), input, ['face'], 'brand', reportCategories)
  const scene = composition.scenes.findLast(scene => scene.source.kind === 'component')!
  const native = context()
  const slide = { currentScore: '7.1', potentialScore: '8.2', mockReport: { category: scene.source.report!, scroll: 0 } }
  const portrait = { width: 1024, height: 1400 }
  const asset = { image: null, secondary: null, portrait, overlay: null, slide, regions: mockReportRegions(native, scene.source.report!), scrollMax: 2000, initialScroll: 450 }
  const prepared = { composition, scenes: new Map([[scene.id, asset]]), incoming: { getContext: () => context(true) }, outgoing: { getContext: () => context() }, reportCanvas: { width: 1170, height: 2080, getContext: () => native } } as unknown as PreparedVideo
  drawVideoFrame(context(), prepared, scene.startMs + 1600, 1080, 1920)
  expect(calls.some(call => call.text === 'Eye spacing')).toBe(true)
  expect(calls.every(call => Number.isFinite(call.x) && Number.isFinite(call.y))).toBe(true)
  expect(images).toContain(portrait)
  expect(images).not.toContain(prepared.reportCanvas)
})
