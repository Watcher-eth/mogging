import { videoSize, captionDesign, videoContent } from './video-layout'
import { expect, test } from 'bun:test'
import { createCanvasPainter, type CanvasElement } from './canvas-layout'
import { compileAnalysisVideo, parseComposition, videoRecipes, type VideoComposition, type VideoScene } from './video-composition'
import { continuesGraphicItem, reportScoreGrid, resolveReportGraphic, graphicMetricFeature, drawExplainer, explainerCaptionFrame, explainerGraphicSchema, explainerLayout, explainerLayouts, explainerTone, graphicItemLimit, scriptGraphic, sameInstrumentGrid, stableInstrumentGrid } from './video-explainer'
import { subjectStudies } from './video-subject-studies'
import { scriptToPlan } from './script-edit'
import { reportCategories } from './mock-report-data'
import { alignVideoVoiceover } from './video-voiceover'
import type { AnalysisPostInput } from './analysis-post'
import { drawVideoFrame, type PreparedVideo } from './video-renderer'
import { reportTriangulation } from './report-triangulation'
import { mockReportRegions, mockFeatureLayout } from './mock-report'

const input: AnalysisPostInput = { formatId: 'feature-audit', subject: 'Sample', hook: 'Look at the whole picture.', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2', recommendation: 'Keep your grooming routine consistent.', productFeatures: ['Category scores', 'Personalized protocol', 'Progress tracking'], cta: 'Explore your report.' }
const script = 'Map 46 measurements across the face. Split the points into two groups. Compare the strongest feature with the opportunity. Build a consistent routine with a focused plan. Open the eye report and highlight eye spacing. Your overall score is 7.1.'

test('every solid-background layout shares the same top caption frame', () => {
  for (const layout of explainerLayouts) {
    const graphic = explainerGraphicSchema.parse({ layout, items: Array.from({ length: Math.min(3, graphicItemLimit(layout)) }, (_, index) => ({ id: `item-${index}`, label: 'Category', value: '7.1', detail: '/ 10' })) })
    expect(explainerLayout(graphic).headline).toEqual(explainerCaptionFrame)
    const items = explainerLayout(graphic).items
    if (items.length) {
      const top = Math.min(...items.map(item => item.y)), bottom = Math.max(...items.map(item => item.y + item.height))
      const left = Math.min(...items.map(item => item.x)), right = Math.max(...items.map(item => item.x + item.width))
      expect((top + bottom) / 2).toBeCloseTo((explainerCaptionFrame.y + explainerCaptionFrame.height + videoSize.height - 220) / 2)
      expect((left + right) / 2).toBeCloseTo(videoSize.width / 2)
      expect(top).toBeGreaterThan(explainerCaptionFrame.y + explainerCaptionFrame.height)
      expect(bottom).toBeLessThan(videoSize.height - 220)
    }
  }
})

test('short captions center the bento in their actual remaining space', () => {
  const graphic = explainerGraphicSchema.parse({ layout: 'pillars', items: ['eyes', 'jaw', 'overall'].map(id => ({ id, label: id, value: '7.1', detail: '/ 10' })) })
  const items = explainerLayout(graphic, 200).items
  const top = Math.min(...items.map(item => item.y)), bottom = Math.max(...items.map(item => item.y + item.height))
  expect((top + bottom) / 2).toBeCloseTo((explainerCaptionFrame.y + 200 + videoSize.height - 220) / 2)
  expect(top).toBeGreaterThan(280)
  expect(bottom).toBeLessThan(videoSize.height - 220)
  const native = mockFeatureLayout({ features: graphic.items.map(graphicMetricFeature) }).tiles
  expect(items[0].width / items[2].width).toBeCloseTo(native[0].width / native[2].width)
})

test('scale variations reuse the same score data for straight and rounded dashboard rulers', () => {
  for (const variant of [0, 1, 2]) {
    const graphic = explainerGraphicSchema.parse({ layout: 'scale', variant, items: [{ id: 'score', label: 'Overall', value: '7.1', detail: '/ 10' }] })
    const native = canvas(), elements: CanvasElement[] = []
    drawExplainer(native.ctx, { graphic, durationMs: 4000, tracks: [] } as unknown as VideoScene, 3000, false, createCanvasPainter(undefined, element => elements.push(element)))
    expect(elements.find(element => element.id.endsWith('/visual'))!.label).toContain(['Graduated score ruler', 'Curved dashboard ruler', 'Segmented dashboard gauge'][variant])
    expect(native.labels).toContain('7.1 / 10')
    expect(elements.every(element => Object.values(element.placement).every(Number.isFinite))).toBe(true)
  }
})

test('score groups use real rounded report cards in centered bentos without an empty grid cell', () => {
  for (const count of [2, 3, 6]) {
    const graphic = explainerGraphicSchema.parse({ layout: 'pillars', items: Array.from({ length: count }, (_, index) => ({ id: `score-${index}`, label: `Feature ${index + 1}`, value: '7.1', detail: '/ 10' })) })
    const layout = explainerLayout(graphic), native = canvas(), elements: CanvasElement[] = []
    drawExplainer(native.ctx, { graphic, durationMs: 4000, tracks: [] } as unknown as VideoScene, 3000, true, createCanvasPainter(undefined, element => elements.push(element)))
    expect(layout.items).toHaveLength(count)
    expect(elements.filter(element => element.id.endsWith('/visual'))).toHaveLength(mockFeatureLayout({ features: graphic.items.map(graphicMetricFeature) }).tiles.filter(tile => tile.showVisual).length)
    expect(elements.filter(element => element.id.endsWith('/surface'))).toHaveLength(count)
    expect(layout.items.every(row => row.y > 540 && row.y + row.height < videoSize.height - 220)).toBe(true)
    for (let first = 0; first < count; first++) for (let second = first + 1; second < count; second++) {
      const left = layout.items[first], right = layout.items[second]
      expect(left.x + left.width <= right.x || right.x + right.width <= left.x || left.y + left.height <= right.y || right.y + right.height <= left.y).toBe(true)
    }
  }
})

test('Marlon and Johnson qualitative explainers share the light instrument grids without invented scores or duplicate rails', () => {
  for (const study of subjectStudies) {
    const composition = compileAnalysisVideo(scriptToPlan(study.script, study.readingPace), input, study.images!.map(image => image.id), 'brand', reportCategories, { recipe: study.recipe, directions: study.directions })
    const scenes = composition.scenes.filter(scene => scene.graphic?.layout === 'pillars')
    expect(scenes.length).toBeGreaterThan(0)
    for (const scene of scenes) {
      scene.graphic!.tone = 'ink'
      expect(explainerTone(scene.graphic!)).toBe('light')
      const native = canvas(), elements: CanvasElement[] = []
      drawExplainer(native.ctx, scene, 2000, true, createCanvasPainter(undefined, element => elements.push(element)))
      expect(elements.filter(element => element.id.endsWith('/surface'))).toHaveLength(scene.graphic!.items.length)
      expect(elements.filter(element => element.id.endsWith('/visual'))).toHaveLength(scene.graphic!.items.length)
      expect(elements.some(element => element.id.endsWith('/reference-range'))).toBe(false)
      expect(elements.some(element => element.id.endsWith('/value'))).toBe(false)
      for (const item of scene.graphic!.items) expect(native.labels).toContain(item.label)
    }
  }
})

test('three-step explainers place captions high and center their larger list above the footer', () => {
  const graphic = explainerGraphicSchema.parse({ layout: 'sequence', items: ['Light', 'Distance', 'Expression'].map((label, index) => ({ id: `step-${index}`, label })) })
  const layout = explainerLayout(graphic)
  const top = Math.min(...layout.items.map(item => item.y)), bottom = Math.max(...layout.items.map(item => item.y + item.height))
  expect(layout.headline.y).toBe(captionDesign.top)
  expect((top + bottom) / 2).toBe((layout.headline.y + layout.headline.height + videoSize.height - 220) / 2)
  expect(bottom).toBeLessThan(videoSize.height - 220)
  expect(Math.min(...layout.items.map(item => item.x))).toBe(videoContent.inset)
  expect(Math.max(...layout.items.map(item => item.x + item.width))).toBe(videoSize.width - videoContent.inset)
})

test('single-score explainers separate label, value and unit and center the full group below the caption', () => {
  const graphic = explainerGraphicSchema.parse({ layout: 'evidence', items: [{ id: 'score', label: 'Overall', value: '7.1', detail: '/ 10' }] })
  const layout = explainerLayout(graphic), native = canvas(), elements: CanvasElement[] = []
  const scene = { graphic, durationMs: 4000, tracks: [] } as unknown as VideoScene
  drawExplainer(native.ctx, scene, 3000, true, createCanvasPainter(undefined, element => elements.push(element)))
  const label = elements.find(element => element.id.endsWith('/label'))!.frame
  const value = elements.find(element => element.id.endsWith('/value'))!.frame
  const detail = elements.find(element => element.id.endsWith('/detail'))!.frame
  expect(layout.headline.y).toBe(captionDesign.top)
  expect(label.y + label.height).toBeLessThan(value.y)
  expect(value.y + value.height).toBeLessThan(detail.y)
  const group = layout.items[0]
  expect(group.y + group.height / 2).toBe((layout.headline.y + layout.headline.height + videoSize.height - 220) / 2)
  expect(group.x + group.width / 2).toBe(videoSize.width / 2)
})

test('score comparisons and sparse score summaries become full dashboard instruments', () => {
  const source = compileAnalysisVideo(scriptToPlan('Open your report.'), input, ['face'], 'brand', reportCategories).scenes[0].source
  const comparison = scriptGraphic('Compare the strongest feature and opportunity.', source, input, 0, 0)
  expect(comparison.layout).toBe('dashboard')
  expect(comparison.items.map(item => item.value)).toEqual(['8.1', '6.2'])
  const summary = scriptGraphic('Read the overall score.', source, input, 0, 1)
  expect(summary.layout).toBe('dashboard')
  expect(summary.items).toHaveLength(3)
  expect(summary.items.map(item => item.value)).toEqual(['7.1', '8.1', '6.2'])
  const frames = explainerLayout(summary).items
  expect(Math.max(...frames.map(frame => frame.y + frame.height)) - Math.min(...frames.map(frame => frame.y))).toBeGreaterThan(1000)
})

test('dashboard cards use mobile mixed rows while retaining every category value', () => {
  const graphic = explainerGraphicSchema.parse({ layout: 'dashboard', items: [{ id: 'eye', label: 'Eye area', value: '8.1', detail: '/ 10' }, { id: 'jaw', label: 'Jaw definition', value: '6.2', detail: '/ 10' }] })
  const elements: CanvasElement[] = [], native = canvas()
  drawExplainer(native.ctx, { graphic, durationMs: 4000, tracks: [] } as unknown as VideoScene, 2000, true, createCanvasPainter(undefined, element => elements.push(element)))
  const plan = mockFeatureLayout({ features: graphic.items.map(graphicMetricFeature) })
  expect(elements.filter(element => element.id.endsWith('/visual'))).toHaveLength(plan.tiles.filter(tile => tile.showVisual).length)
  for (const id of ['eye','jaw']) {
    expect(elements.some(element => element.id === `graphic/item:${id}/label`)).toBe(true)
    expect(elements.some(element => element.id === `graphic/item:${id}/value`)).toBe(true)
  }
  expect(native.labels.join('').replace(/\s/g,'')).toContain('8.1/10')
  expect(native.labels.join('').replace(/\s/g,'')).toContain('6.2/10')
})

test('spoken category cues keep unchanged bento objects in place instead of swapping their order', () => {
  const graphic = explainerGraphicSchema.parse({ layout: 'dashboard', items: [{ id: 'eye', label: 'Eye area', value: '8.1', detail: '/ 10' }, { id: 'jaw', label: 'Jaw definition', value: '6.2', detail: '/ 10' }, { id: 'overall', label: 'Overall', value: '7.1', detail: '/ 10' }] })
  const scene = { narration: 'Eye area first. Jaw definition next.', graphic, durationMs: 6000, tracks: [], words: [{ text: 'Eye', startMs: 0, endMs: 300 }, { text: 'area', startMs: 300, endMs: 600 }, { text: 'first', startMs: 600, endMs: 1000 }, { text: 'Jaw', startMs: 2500, endMs: 2800 }, { text: 'definition', startMs: 2800, endMs: 3300 }, { text: 'next', startMs: 3300, endMs: 3900 }] } as unknown as VideoScene
  const widths: number[] = []
  for (const time of [1500, 2900, 3900]) {
    const elements: CanvasElement[] = [], native = canvas()
    drawExplainer(native.ctx, scene, time, false, createCanvasPainter(undefined, element => elements.push(element)))
    expect(new Set(elements.map(element => element.id)).size).toBe(elements.length)
    const jaw = elements.find(element => element.id === 'graphic/item:jaw')!.frame
    widths.push(jaw.width)
  }
  expect(widths[0]).toBe(widths[1])
  expect(widths[1]).toBe(widths[2])
  expect(widths[2]).toBeGreaterThanOrEqual(440)
  expect(widths[2]).toBeLessThanOrEqual(videoContent.width / 2)
})

test('unchanged grids retain their authored order and instrument style, but new content permits a new layout', () => {
  const before = explainerGraphicSchema.parse({ layout: 'pillars', variant: 1, items: [{ id: 'width', label: 'Width', diagram: 'width' }, { id: 'taper', label: 'Taper', diagram: 'taper' }] })
  const reordered = { ...before, layout: 'comparison' as const, variant: 3, items: [...before.items].reverse() }
  const stable = stableInstrumentGrid(reordered, before)
  expect(sameInstrumentGrid(before, reordered)).toBe(true)
  expect(stable.items.map(item => item.id)).toEqual(['width', 'taper'])
  expect(stable.variant).toBe(1)
  expect(stable.layout).toBe('pillars')
  const changed = { ...reordered, items: reordered.items.map(item => ({ ...item, detail: 'New explanation' })) }
  expect(sameInstrumentGrid(before, changed)).toBe(false)
  expect(stableInstrumentGrid(changed, before)).toEqual(changed)
  expect(explainerLayout(before).items.every(frame => frame.height >= 430)).toBe(true)
})

test('continued grid captions share a fixed layout budget instead of pushing panels between cues', () => {
  const graphic = explainerGraphicSchema.parse({ layout: 'pillars', items: [{ id: 'width', label: 'Upper frame', diagram: 'width' }, { id: 'taper', label: 'Lower taper', diagram: 'taper' }] })
  const frames = ['A short caption.', 'A much longer explanation that spans several lines of our original word-aligned captions.'].map(text => {
    const elements: CanvasElement[] = [], native = canvas()
    drawExplainer(native.ctx, { text, graphic, tracks: [], durationMs: 4000 } as unknown as VideoScene, 2000, false, createCanvasPainter(undefined, element => elements.push(element)), graphic, undefined, undefined, 320)
    return elements.filter(element => /^graphic\/item:[^/]+$/.test(element.id)).map(element => element.frame)
  })
  expect(frames[0]).toEqual(frames[1])
})

test('ordinary feature panels never render generic skull models', () => {
  const graphic = explainerGraphicSchema.parse({ layout: 'pillars', items: [{ id: 'upper', label: 'Upper frame', diagram: 'width' }, { id: 'lower', label: 'Lower taper', diagram: 'taper' }] })
  const calls: Array<{ time: number; duration: number; pose: unknown }> = []
  const anatomy = { draw: (_ctx: CanvasRenderingContext2D, _frame: unknown, time: number, duration: number, _dark: boolean, _reduced: boolean, pose: unknown) => calls.push({ time, duration, pose }) }
  for (const local of [0, 2000]) drawExplainer(canvas().ctx, { graphic, tracks: [], durationMs: 4000 } as unknown as VideoScene, local, false, createCanvasPainter(), graphic, anatomy, undefined, 320, undefined, { elapsed: 4500, duration: 10000 })
  expect(calls).toHaveLength(0)
})

test('expression panels show photographed soft tissue, not a deforming bone model', () => {
  const graphic = explainerGraphicSchema.parse({ layout: 'pillars', items: [{ id: 'expression', label: 'Expression', diagram: 'expression' }] })
  const image = { width: 1000, height: 1500 } as HTMLImageElement, native = canvas()
  let boneCalls = 0
  drawExplainer(native.ctx, { graphic, tracks: [], durationMs: 4000 } as unknown as VideoScene, 2000, true, createCanvasPainter(), undefined, { draw: () => { boneCalls++ } }, undefined, 320, { id: 'mouth', label: 'Mouth', image, crop: { x: 300, y: 900, width: 400, height: 250 } })
  expect(native.images).toContain(image)
  expect(boneCalls).toBe(0)
})

function canvas() {
  let state = { a: 1, d: 1, e: 0, f: 0, globalAlpha: 1 }
  const stack: Array<typeof state> = [], labels: string[] = [], images: unknown[] = []
  const ctx = new Proxy({}, { get: (_, key) => {
    if (key === 'save') return () => stack.push({ ...state })
    if (key === 'restore') return () => { state = stack.pop()! }
    if (key === 'translate') return (x: number, y: number) => { state.e += x * state.a; state.f += y * state.d }
    if (key === 'scale') return (x: number, y: number) => { state.a *= x; state.d *= y }
    if (key === 'setTransform') return (a: number, _b: number, _c: number, d: number, e: number, f: number) => { state = { ...state, a, d, e, f } }
    if (key === 'getTransform') return () => ({ ...state, b: 0, c: 0 })
    if (key === 'measureText') return (text: string) => ({ width: text.length * 20 })
    if (key === 'fillText') return (text: string) => labels.push(text)
    if (key === 'drawImage') return (image: unknown) => images.push(image)
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} })
    return state[key as keyof typeof state] ?? (() => {})
  }, set: (_, key, value) => { if (key === 'globalAlpha') state.globalAlpha = value; return true } }) as CanvasRenderingContext2D
  return { ctx, labels, images }
}

function preparedGraphics(composition: VideoComposition) {
  const incoming = canvas(), output = canvas()
  const scenes = new Map(composition.scenes.map(scene => [scene.id, {
    image: null, secondary: null, portrait: null, overlay: null, initialScroll: 0, scrollMax: 0, graphicCaptionHeight: explainerCaptionFrame.height,
    slide: { currentScore: '7.1', potentialScore: '8.2', mockReport: { category: scene.source.report!, scroll: 0 } },
    regions: mockReportRegions(incoming.ctx, scene.source.report!),
  }]))
  const prepared = { composition, scenes, incoming: { getContext: () => incoming.ctx }, outgoing: { getContext: () => { throw new Error('Graphic morph must not paint a second scene surface') } } } as unknown as PreparedVideo
  return { incoming, output, prepared }
}

test('five format recipes and twelve seeds compile deterministically without altering narration or scores', () => {
  const plan = scriptToPlan(script)
  for (const recipe of Object.keys(videoRecipes) as Array<keyof typeof videoRecipes>) for (let variation = 0; variation < 12; variation++) {
    const composition = compileAnalysisVideo(plan, input, ['face'], 'brand', reportCategories, { recipe, variation })
    expect(composition).toEqual(compileAnalysisVideo(plan, input, ['face'], 'brand', reportCategories, { recipe, variation }))
    expect(composition.durationMs).toBe(Math.round(plan.duration * 1000))
    expect(composition.scenes.map(scene => scene.narration).join(' ')).toBe(script)
    expect(parseComposition(JSON.parse(JSON.stringify(composition)))).toEqual(composition)
    expect(composition.scenes.every(scene => scene.source.currentScore === 7.1 && scene.source.potentialScore === 8.2)).toBe(true)
    if (recipe === 'minimal-explainer') expect(composition.scenes.filter(scene => scene.source.kind !== 'report').every(scene => scene.source.kind === 'explainer' && scene.source.imageId === null)).toBe(true)
    if (recipe === 'hybrid-story') expect(composition.scenes.some(scene => scene.source.kind === 'report')).toBe(true)
  }
})

test('all graphic layouts fit the stage and paint native named components without image captures', () => {
  for (const layout of explainerLayouts) for (let variant = 0; variant < 12; variant++) {
    const graphic = explainerGraphicSchema.parse({ layout, variant, count: 46, items: Array.from({ length: graphicItemLimit(layout) }, (_, index) => ({ id: `item-${index}`, label: 'Eye area', value: '8.1' })) })
    const scene = { graphic, durationMs: 4000, tracks: [] } as unknown as VideoScene
    for (const rect of Object.values(explainerLayout(graphic)).flat()) {
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(videoSize.width)
      expect(rect.y + rect.height).toBeLessThanOrEqual(videoSize.height - 120)
    }
    const placement = explainerLayout(graphic)
    expect(placement.items.every(item => item.y >= placement.headline.y + placement.headline.height || item.y + item.height <= placement.headline.y)).toBe(true)
    const elements: CanvasElement[] = [], native = canvas()
    drawExplainer(native.ctx, scene, 3000, false, createCanvasPainter(undefined, element => elements.push(element)))
    expect(native.images).toHaveLength(0)
    expect(new Set(elements.map(element => element.id)).size).toBe(elements.length)
    expect(elements.every(element => Object.values(element.placement).every(Number.isFinite))).toBe(true)
  }
})

test('comparison cards become persistent context objects above the next sequence', () => {
  const source = compileAnalysisVideo(scriptToPlan('Open your report.'), input, ['face'], 'brand', reportCategories).scenes[0].source
  const comparison = scriptGraphic('Compare the strongest feature and opportunity.', source, input, 0, 0)
  const sequence = scriptGraphic('Build your routine.', source, input, 0, 1, comparison)
  expect(sequence.items.slice(0, 2).map(item => ({ id: item.id, value: item.value }))).toEqual(comparison.items.map(item => ({ id: item.id, value: item.value })))
  expect(sequence.items.slice(0, 2).every(item => item.role === 'context')).toBe(true)
  expect(explainerLayout(sequence).items[0].width).toBeLessThan(explainerLayout(comparison).items[0].width)
  const contextFrames = explainerLayout(sequence).items.slice(0, 2)
  expect(contextFrames.every(frame => frame.width >= 440 && frame.height >= 400)).toBe(true)
  expect(contextFrames[0].x).toBeGreaterThanOrEqual(videoContent.inset)
  expect(contextFrames[1].x + contextFrames[1].width).toBeLessThanOrEqual(videoSize.width - videoContent.inset)
  const sequenceFrames = explainerLayout(sequence).items
  expect((Math.min(...sequenceFrames.map(frame => frame.x)) + Math.max(...sequenceFrames.map(frame => frame.x + frame.width))) / 2).toBeCloseTo(videoSize.width / 2)
  expect(sequence.items.filter(item => item.role === 'main').length).toBeGreaterThan(0)
  expect(continuesGraphicItem(comparison, sequence, 'primary')).toBe(true)
  const native = canvas()
  drawExplainer(native.ctx, { graphic: sequence, durationMs: 4000, tracks: [] } as unknown as VideoScene, 0, false, createCanvasPainter(), comparison)
  expect(native.labels).toContain('8')
  expect(native.labels.join('')).toContain('8.1')
  expect(native.labels.join('')).toContain('6.2')
})

test('graphic handoffs preserve values and the same native card surfaces', () => {
  const composition = compileAnalysisVideo(scriptToPlan('Compare the strongest feature with the opportunity. Build a consistent routine.'), input, [], 'brand', reportCategories, { recipe: 'minimal-explainer' })
  const target = composition.scenes[1], { incoming, output, prepared } = preparedGraphics(composition)
  const widths: number[] = []
  for (const local of [0, 180, 360, 540, 719, 720]) {
    const elements: CanvasElement[] = [], alphas: number[] = []
    drawVideoFrame(output.ctx, prepared, target.startMs + local, 1080, 1920, false, element => {
      elements.push(element)
      if (element.id === 'graphic/item:primary/value' || element.id === 'graphic/item:primary/surface') alphas.push(incoming.ctx.globalAlpha)
    })
    expect(new Set(elements.map(element => element.id)).size).toBe(elements.length)
    expect(alphas).toEqual([1, 1])
    expect(elements.filter(element => element.id.endsWith('/surface'))).toHaveLength(2)
    widths.push(elements.find(element => element.id === 'graphic/item:primary')!.frame.width)
  }
  expect(widths[0]).toBeCloseTo(explainerLayout(composition.scenes[0].graphic!).items[0].width)
  expect(widths.at(-1)).toBeCloseTo(explainerLayout(target.graphic!).items[0].width)
  expect(widths.every((width, index) => index === 0 || width <= widths[index - 1])).toBe(true)
  const reduced: CanvasElement[] = []
  drawVideoFrame(output.ctx, prepared, target.startMs + 360, 1080, 1920, true, element => reduced.push(element))
  expect(reduced.find(element => element.id === 'graphic/item:primary')!.frame.width).toBeCloseTo(explainerLayout(target.graphic!).items[0].width)
})

test('light-to-dark explainer transitions dissolve instead of switching backgrounds at the morph midpoint', () => {
  const composition = compileAnalysisVideo(scriptToPlan('Compare the strongest feature with the opportunity. Build a consistent routine.'), input, [], 'brand', reportCategories, { recipe: 'minimal-explainer' })
  composition.scenes[0].graphic = explainerGraphicSchema.parse({ layout: 'scale', tone: 'ink', items: [{ id: 'primary', label: 'Overall', value: '7.1', detail: '/ 10' }] })
  const target = composition.scenes[1]
  const { prepared, output } = preparedGraphics(composition), outgoing = canvas()
  prepared.outgoing = { getContext: () => outgoing.ctx } as unknown as HTMLCanvasElement
  drawVideoFrame(output.ctx, prepared, target.startMs + 180, 1080, 1920)
  expect(output.images).toEqual([prepared.outgoing, prepared.incoming])
})

test('persistent feature dots do not jump when the scene data changes at the morph midpoint', () => {
  const composition = compileAnalysisVideo(scriptToPlan('Map 46 points. Split the points into two groups.'), input, [], 'brand', reportCategories, { recipe: 'minimal-explainer' })
  const { output, prepared } = preparedGraphics(composition), target = composition.scenes[1]
  const positions = [359, 360, 361, 719, 720, 721].map(time => {
    const elements: CanvasElement[] = []
    drawVideoFrame(output.ctx, prepared, target.startMs + time, 1080, 1920, false, element => elements.push(element))
    return elements.find(element => element.id === 'graphic/item:primary/dot:20')!.frame
  })
  for (const index of [1, 2, 4, 5]) expect(Math.hypot(positions[index].x - positions[index - 1].x, positions[index].y - positions[index - 1].y)).toBeLessThan(3)
})

test('a spoken regroup cue preserves the exact constellation and binds to its spoken word', () => {
  const composition = compileAnalysisVideo(scriptToPlan('Map 46 measurements. Split them into two groups.'), input, [], 'brand', reportCategories, { recipe: 'minimal-explainer' })
  expect(composition.scenes[0].graphic!.count).toBe(46)
  expect(composition.scenes[1].graphic!.count).toBe(46)
  expect(composition.scenes[1].graphic!.variant).toBe(composition.scenes[0].graphic!.variant)
  expect(composition.scenes[1].graphic!.items).toEqual(composition.scenes[0].graphic!.items)
  const words = composition.scenes.flatMap(scene => scene.narration.split(/\s+/)).map((text, index) => ({ text, startMs: index * 500, endMs: index * 500 + 300 }))
  const aligned = alignVideoVoiceover(composition, { words }, words.length * 500 + 500)
  const track = aligned.scenes[1].tracks.find(track => track.primitive === 'graphic-regroup')!
  expect(track.wordIndex).toBe(0)
  expect(track.startMs).toBe(aligned.scenes[1].words![0].startMs)
  const scene = aligned.scenes[1], before: CanvasElement[] = [], after: CanvasElement[] = []
  drawExplainer(canvas().ctx, scene, 0, false, createCanvasPainter(undefined, element => before.push(element)))
  drawExplainer(canvas().ctx, scene, scene.durationMs, false, createCanvasPainter(undefined, element => after.push(element)))
  expect(before.filter(element => element.id.includes('/dot:')).map(element => element.id)).toEqual(after.filter(element => element.id.includes('/dot:')).map(element => element.id))
  expect(before.find(element => element.id.endsWith('/dot:20'))!.frame).not.toEqual(after.find(element => element.id.endsWith('/dot:20'))!.frame)
})

test('malformed graphics and duplicate identities are rejected at import', () => {
  expect(() => explainerGraphicSchema.parse({ layout: 'comparison', items: [{ id: 'same', label: 'A' }, { id: 'same', label: 'B' }] })).toThrow('unique')
  expect(() => explainerGraphicSchema.parse({ layout: 'constellation', count: 5000, items: [] })).toThrow()
  expect(() => explainerGraphicSchema.parse({ layout: 'scale', items: [{ id: 'first', label: 'A' }, { id: 'second', label: 'B' }] })).toThrow('Too many')
  expect(() => explainerGraphicSchema.parse({ layout: 'comparison', items: [{ id: 'first/surface', label: 'A' }] })).toThrow('Graphic IDs')
  const composition = compileAnalysisVideo(scriptToPlan('Look at the whole picture.'), input, [], 'brand', reportCategories, { recipe: 'minimal-explainer' })
  delete composition.scenes[0].graphic
  expect(() => parseComposition(composition)).toThrow('graphic layout')
  const largeCount = scriptGraphic('Map 999 points.', composition.scenes[0].source, input, 0, 0)
  expect(largeCount.layout).toBe('evidence')
  expect(largeCount.items[0].value).toBe('999')
})

test('the complete supported constellation remains inside its graphic frame before and after regrouping', () => {
  const composition = compileAnalysisVideo(scriptToPlan('Map 128 points. Split the points into two groups.'), input, [], 'brand', reportCategories, { recipe: 'minimal-explainer' })
  for (const scene of composition.scenes) for (const time of [0, scene.durationMs]) {
    const elements: CanvasElement[] = []
    drawExplainer(canvas().ctx, scene, time, false, createCanvasPainter(undefined, element => elements.push(element)))
    const points = elements.filter(element => element.id.includes('/dot:'))
    expect(points).toHaveLength(128)
    const root = elements.find(element => element.id === 'graphic/item:primary')!.frame
    expect(points.every(point => point.frame.x >= root.x && point.frame.x + point.frame.width <= root.x + root.width && point.frame.y >= root.y && point.frame.y + point.frame.height <= root.y + root.height)).toBe(true)
  }
})

test('calendar and instrument scenes use supplied values and explicit weekdays rather than inventing a schedule', () => {
  const source = compileAnalysisVideo(scriptToPlan('Open your report.'), input, [], 'brand', reportCategories).scenes[0].source
  const calendar = scriptGraphic('Build your weekly routine on Monday, Wednesday and Friday.', source, input, 0, 0)
  expect(calendar.layout).toBe('calendar')
  expect(calendar.days).toEqual([0, 2, 4])
  expect(calendar.items[0].value).toBe('3')
  const frequency = scriptGraphic('Choose 4 days per week for your routine.', source, input, 0, 0)
  expect(frequency.items[0].value).toBe('4')
  expect(frequency.days).toEqual([])
  expect(scriptGraphic('Build a consistent routine.', source, input, 0, 0).layout).toBe('sequence')
  const dial = scriptGraphic('Read your overall score.', source, input, 2, 0)
  expect(dial.layout).toBe('dial')
  expect(dial.items[0].value).toBe('7.1')
  expect(scriptGraphic('Read your overall score.', source, input, 2, 1).layout).toBe('scale')
})

test('connective narration keeps a visual reference without inventing scores or product plans', () => {
  const source = compileAnalysisVideo(scriptToPlan('Open your report.'), input, [], 'brand', reportCategories).scenes[0].source
  const first = scriptGraphic('Compare photographs in consistent lighting.', source, input, 0, 0)
  expect(first.items.length).toBeGreaterThan(0)
  expect(first.items.every(item => item.diagram && !item.value)).toBe(true)
  expect(scriptGraphic('The goal is a clearer plan.', source, input, 0, 1, first)).toEqual(first)
  expect(scriptGraphic('Dating involves social context.', source, input, 0, 2, first)).toEqual(first)
})

test('qualitative narration uses one focused feature instead of a crowded anatomy board', () => {
  const source = compileAnalysisVideo(scriptToPlan('Open your report.'), input, ['face'], 'brand', reportCategories).scenes[0].source
  const graphic = scriptGraphic('Width, contour and expression describe different things.', source, input, 0, 0)
  expect(graphic.items.map(item => item.diagram)).toEqual(['width'])
  expect(graphic.items.every(item => !item.value)).toBe(true)
})

test('anatomy renders a supplied 3D reference rather than hand-drawn skull primitives', () => {
  const composition = compileAnalysisVideo(scriptToPlan('Illustrative anatomy shows the skull and mandible.'), input, [], 'brand', reportCategories, { recipe: 'minimal-explainer' })
  const scene = composition.scenes[0]
  expect(scene.graphic!.tone).toBe('ink')
  expect(scene.graphic!.layout).toBe('story')
  expect(scene.graphic!.items[0].value).toBe('')
  expect(scene.graphic!.items[0].detail).toContain('not inferred')
  const elements: CanvasElement[] = [], times: number[] = [], native = canvas()
  drawExplainer(native.ctx, scene, 1000, false, createCanvasPainter(undefined, element => elements.push(element)), undefined, { draw: (_ctx, _frame, time) => { times.push(time) } })
  expect(times).toEqual([1000])
  expect(elements.some(element => element.id.endsWith('/model'))).toBe(true)
  expect(elements.some(element => /\/(skull|mandible)$/.test(element.id))).toBe(false)
  expect(native.labels.join(' ')).not.toContain('not a scan of this person')
})

test('registered anatomy occupies the preceding head frame and receives the authored regional pose', () => {
  const composition = compileAnalysisVideo(scriptToPlan('Illustrative anatomy shows the skull.'), input, [], 'brand', reportCategories, { recipe: 'minimal-explainer' })
  const scene = composition.scenes[0]
  scene.graphic!.anatomy = { focus: 'orbits', action: 'cutaway' }
  const head = { x: 220, y: 300, width: 500, height: 700 }, elements: CanvasElement[] = [], poses: unknown[] = [], native = canvas()
  const photo = { width: 1200, height: 1600 } as HTMLImageElement
  drawExplainer(native.ctx, scene, 600, false, createCanvasPainter(undefined, element => elements.push(element)), undefined, { draw: (_ctx, _frame, _time, _duration, _dark, _reduced, pose) => poses.push(pose) }, { frame: head, photo: { image: photo, frame: { x: 0, y: 0, width: 1080, height: 1920 } }, reveal: true })
  expect(elements.find(element => element.id.endsWith('/model'))!.frame).toEqual(head)
  expect(native.images.filter(image => image === photo)).toHaveLength(1)
  expect(poses).toEqual([{ focus: 'orbits', action: 'cutaway' }])
})


test('a single feature photo uses the full card width and most of the space below captions', () => {
  const graphic = explainerGraphicSchema.parse({ layout: 'pillars', items: [{ id: 'eye', label: 'Eye detail', diagram: 'orbits' }] })
  const elements: CanvasElement[] = []
  drawExplainer(canvas().ctx, { graphic, text: 'Eye spacing.', tracks: [], durationMs: 4000 } as unknown as VideoScene, 2000, true, createCanvasPainter(undefined, element => elements.push(element)), undefined, undefined, undefined, 320)
  const card = elements.find(element => element.id === 'graphic/item:eye')!.frame
  const photo = elements.find(element => element.id === 'graphic/item:eye/visual')!.frame
  expect(photo.x).toBe(card.x)
  expect(photo.width).toBe(card.width)
  expect(photo.height).toBeGreaterThan(card.height * .85)
  expect(card.y).toBe(explainerCaptionFrame.y + 320 + 48)
  expect(card.y + card.height).toBe(videoSize.height - 220)
})


test('dial, calendar and anatomy center their rendered content below captions rather than an oversized empty frame', () => {
  for (const layout of ['dial', 'calendar', 'story'] as const) for (const captionHeight of [200, 320]) {
    const graphic = explainerGraphicSchema.parse({ layout, items: [{ id: 'main', label: 'Overall', value: '7.1', detail: '/ 10' }] })
    const elements: CanvasElement[] = []
    drawExplainer(canvas().ctx, { graphic, text: 'A caption.', tracks: [], durationMs: 4000 } as unknown as VideoScene, 2000, true, createCanvasPainter(undefined, element => elements.push(element)), undefined, undefined, undefined, captionHeight)
    const parts = elements.filter(element => element.id.startsWith('graphic/item:main/'))
    const top = Math.min(...parts.map(part => part.frame.y)), bottom = Math.max(...parts.map(part => part.frame.y + part.frame.height))
    const left = Math.min(...parts.map(part => part.frame.x)), right = Math.max(...parts.map(part => part.frame.x + part.frame.width))
    expect((top + bottom) / 2).toBeCloseTo((explainerCaptionFrame.y + captionHeight + videoSize.height - 220) / 2)
    expect((left + right) / 2).toBeCloseTo(videoSize.width / 2)
    expect(top).toBeGreaterThan(explainerCaptionFrame.y + captionHeight)
    expect(bottom).toBeLessThan(videoSize.height - 220)
  }
})


test('reference photographs align to caption edges, retain the source top and render no card text', () => {
  const graphic = explainerGraphicSchema.parse({ layout: 'pillars', items: [{ id: 'context', label: 'Whole-face context', detail: 'No extra text', diagram: 'profile' }] })
  const elements: CanvasElement[] = [], words: string[] = []
  const base = canvas().ctx
  const ctx = new Proxy(base, { get: (target, key) => key === 'fillText' ? (word: string) => words.push(word) : Reflect.get(target, key) })
  const image = { width: 2160, height: 3840 } as HTMLImageElement
  const specimen = { id: 'photo', label: 'Photo', imageId: 'front', image, crop: { x: 300, y: 600, width: 1000, height: 1200 } }
  drawExplainer(ctx, { graphic, text: 'The caption.', tracks: [], durationMs: 4000 } as unknown as VideoScene, 2000, true, createCanvasPainter(undefined, element => elements.push(element)), undefined, undefined, undefined, 320, specimen)
  const portrait = elements.find(element => element.id === 'portrait')!.frame
  const subject = elements.find(element => element.id === 'subject')!.frame
  expect(portrait.x).toBe(captionDesign.inset)
  expect(portrait.width).toBe(captionDesign.width)
  expect(subject.y).toBeCloseTo(portrait.y)
  expect(subject.width).toBe(portrait.width)
  expect(subject.width / subject.height).toBeCloseTo(image.width / image.height)
  expect(words).toEqual([])
})


test('real report grids retain units, grades and marker geometry, and repair older blank cards', () => {
  const source = compileAnalysisVideo(scriptToPlan('Open the eye report.'), input, ['face'], 'brand', reportCategories).scenes[0].source
  const report = { ...source.report!, assessmentId: 'saved-photo', features: [
    { id: 'eyes.tilt', label: 'Canthal tilt', value: '4.2°', visual: 'Orbit', positions: [.63], grade: 8, scale: 'range' as const },
    { id: 'eyes.spacing', label: 'Eye spacing', value: '1.02×', visual: 'Slider', positions: [.51], grade: 7.5, scale: 'range' as const },
    { id: 'eyes.coverage', label: 'Coverage', value: '42.0%', visual: 'Rail', positions: [.42], grade: 7, scale: 'range' as const },
  ] }
  const graphic = reportScoreGrid({ ...source, report }, input, 0, 'Canthal tilt')
  expect(graphic.items.map(item => item.value)).toEqual(report.features.map(feature => feature.value))
  expect(graphic.items.map(item => item.metric!.positions)).toEqual(report.features.map(feature => feature.positions))
  expect(explainerGraphicSchema.parse(graphic).items.map(graphicMetricFeature)).toEqual(report.features)
  const legacy = explainerGraphicSchema.parse({ layout: 'dashboard', items: [{ id: 'old', label: 'Canthal tilt', value: '' }] })
  expect(resolveReportGraphic(legacy, report).items[0].value).toBe('4.2°')
  const mouth = { ...report, id: 'mouth', features: [{ id: 'mouth.width', label: 'Mouth width', value: '0.9×' }, { id: 'mouth.fullness', label: 'Visible lip fullness', value: 'Moderate' }] }
  expect(reportScoreGrid({ ...source, report: mouth },input,0,'It is the fuller lips.').items[0].metric!.id).toBe('mouth.fullness')
  const native = canvas(), elements: CanvasElement[] = []
  drawExplainer(native.ctx, { graphic, source: { ...source, report }, durationMs: 4000, tracks: [] } as unknown as VideoScene, 3000, true, createCanvasPainter(undefined, element => elements.push(element)))
  for (const feature of report.features) expect(native.labels.join('')).toContain(feature.value)
  expect(elements.filter(element => element.id.endsWith('/grade'))).toHaveLength(3)
  expect(native.labels.some(label => label.includes('ANALYSIS /'))).toBe(false)
})

test('an unassessed grid shows an explicit status without a fabricated instrument or score', () => {
  const source = compileAnalysisVideo(scriptToPlan('Open the report.'), input, ['face'], 'brand', reportCategories).scenes[0].source
  const graphic = reportScoreGrid({ ...source, report: undefined }, { ...input, overallScore: '', strongestScore: '', opportunityScore: '' })
  const native = canvas(), elements: CanvasElement[] = []
  drawExplainer(native.ctx, { graphic, durationMs: 4000, tracks: [] } as unknown as VideoScene, 3000, true, createCanvasPainter(undefined, element => elements.push(element)))
  expect(native.labels).toContain('Not assessed')
  expect(elements.some(element => element.id.endsWith('/visual'))).toBe(false)
})


test('native triangulations require all measured axes and render their actual values', () => {
  const entries = new Map([['cheeks.height', { grade: 8 }], ['cheeks.width', { grade: 7 }], ['cheeks.midface', { grade: 6 }]])
  const profile = reportTriangulation('overall.cheeks', entries)!
  expect(profile.axes.map(axis => axis.value)).toEqual([8, 7, 6])
  expect(reportTriangulation('overall.cheeks')).toBeUndefined()
  const incomplete = new Map(entries)
  incomplete.delete('cheeks.width')
  expect(reportTriangulation('overall.cheeks', incomplete)).toBeUndefined()
  const feature = { id: 'overall.cheeks', label: 'Cheekbones', value: '7.0', triangulation: profile }
  const layout = mockFeatureLayout({ features: [feature] })
  expect(layout.tiles[0].width).toBe(354)
  const source = compileAnalysisVideo(scriptToPlan('Open the report.'), input, ['face'], 'brand', reportCategories).scenes[0].source
  const report = { ...source.report!, features: [feature] }
  const graphic = reportScoreGrid({ ...source, report }, input)
  const native = canvas()
  drawExplainer(native.ctx, { graphic, source: { ...source, report }, durationMs: 4000, tracks: [] } as unknown as VideoScene, 3000, true, createCanvasPainter())
  for (const value of ['8.0 /10', '7.0 /10', '6.0 /10']) expect(native.labels).toContain(value)
})
