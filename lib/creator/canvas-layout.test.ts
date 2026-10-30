import { videoTickerMotion, videoBrandFrame, videoBrandSafeArea } from './video-branding'
import { expect, test } from 'bun:test'
import { videoSize, featureStageLayout } from './video-layout'
import { createCanvasPainter, type CanvasEffect, type CanvasElement, type CanvasNode } from './canvas-layout'
import { drawMockReport, drawReportComponent, mockReportRegions } from './mock-report'
import { reportCategories } from './mock-report-data'
import { compileAnalysisVideo, createMotionTrack, type VideoScene } from './video-composition'
import { createVideoPainter } from './video-renderer'
import { scriptToPlan } from './script-edit'
import type { AnalysisPostInput } from './analysis-post'
import type { ContentSlide } from './content-generator'
import { drawFeatureMetric } from './report-choreography'
import { drawBrandLockup, type CreatorBrand } from './brand'

test('the app and App Store icons flank a precisely centered name lockup', () => {
  const icons: Array<{ x: number; width: number }> = []
  let textLeft = 0
  const name = 'Mogging: Face Scan', textWidth = 242, width = 690
  const ctx = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: textWidth }) : key === 'drawImage' ? (_image: unknown, x: number, _y: number, width: number) => { icons.push({ x, width }) } : key === 'fillText' ? (text: string, left: number) => { expect(text).toBe(name); textLeft = left } : () => {}, set: () => true }) as CanvasRenderingContext2D
  drawBrandLockup(ctx, { logo: {}, appStore: {} } as CreatorBrand, 0, 0, width)
  expect(icons).toHaveLength(2)
  expect((icons[0].x+icons[1].x+icons[1].width)/2).toBeCloseTo(width/2)
  expect(icons[0].x+icons[0].width).toBeLessThan(textLeft)
  expect(textLeft+textWidth).toBeLessThan(icons[1].x)
})

test('only native feature cards use outline emphasis; score sections remain borderless', () => {
  const { ctx } = context()
  for (const section of ['scores', 'potential', 'category-score', 'hero', 'feature:eye']) {
    let effect: CanvasEffect = {}
    const scene = { source: { kind: 'report' }, focus: section, tracks: [{ ...createMotionTrack('border-beam', 'report', 5000), section }] } as VideoScene
    const paint = createVideoPainter(scene, 500, false, undefined, (_node, result) => { effect = result; return result })
    paint(ctx, { id: section, frame: { x: 0, y: 0, width: 360, height: 200 } })
    expect(effect.beam).toBeUndefined()
    expect(effect.lift).toBeUndefined()
    if (section !== 'feature:eye') expect(effect.highlight).toBeUndefined()
    else expect(effect.highlight?.amount).toBeGreaterThan(0)
  }
})

test('unchanged metric dimensions stay fixed across portrait and stacked scene layouts', () => {
  for (const height of [145, 176, 180]) {
    const region = { width: 354, height }
    expect(featureStageLayout(region, 'portrait').metric).toEqual(featureStageLayout(region, 'stacked').metric)
  }
  expect(featureStageLayout({ width: 354, height: 145 }).metric).not.toEqual(featureStageLayout({ width: 354, height: 176 }).metric)
})

function context() {
  let state = { a: 1, d: 1, e: 0, f: 0, globalAlpha: 1 }
  const stack: Array<typeof state> = [], glyphs: Array<{ text: string; x: number; y: number }> = []
  const ctx = new Proxy({}, { get: (_, key) => {
    if (key === 'save') return () => stack.push({ ...state })
    if (key === 'restore') return () => { state = stack.pop()! }
    if (key === 'translate') return (x: number, y: number) => { state.e += x * state.a; state.f += y * state.d }
    if (key === 'scale') return (x: number, y: number) => { state.a *= x; state.d *= y }
    if (key === 'setTransform') return (a: number, _b: number, _c: number, d: number, e: number, f: number) => { state = { ...state, a, d, e, f } }
    if (key === 'getTransform') return () => ({ ...state, b: 0, c: 0 })
    if (key === 'measureText') return (text: string) => ({ width: text.length * 7 })
    if (key === 'fillText') return (text: string, x: number, y: number) => glyphs.push({ text, x: state.e + x * state.a, y: state.f + y * state.d })
    if (key === 'createLinearGradient') return () => ({ addColorStop() {} })
    return state[key as keyof typeof state] ?? (() => {})
  }, set: (_, key, value) => { if (key === 'globalAlpha') state.globalAlpha = value; return true } }) as CanvasRenderingContext2D
  return { ctx, glyphs }
}

test('the report portrait fade remains opaque when the hero is dimmed for a lifted tile', () => {
  const native = context(), opacity = new Map<string, number>()
  const category = reportCategories.find(category => category.id === 'overall')!
  const paint = createCanvasPainter(node => node.id === 'hero' ? { opacity: .35, blur: 7 } : {}, node => opacity.set(node.id, native.ctx.globalAlpha))
  const slide = { currentScore: '7.1', potentialScore: '8.2', mockReport: { category, scroll: 120 } } as ContentSlide
  drawMockReport(native.ctx, slide, { width: 390, height: 500 } as HTMLImageElement, null, 1080, 1920, 2000, undefined, { presentation: 'video', paint })
  expect(opacity.get('hero')).toBe(.35)
  expect(opacity.get('hero-fade')).toBe(1)
})

test('portrait and measurements inherit one transformed coordinate system', () => {
  const elements: CanvasElement[] = []
  const paint = createCanvasPainter(node => node.id === 'portrait' ? { scale: 1.2, x: 10 } : {}, element => elements.push(element))
  const { ctx } = context()
  paint(ctx, { id: 'portrait', frame: { x: 100, y: 200, width: 400, height: 600 }, size: { width: 200, height: 300 }, children: [
    { id: 'image', frame: { x: 0, y: 0, width: 200, height: 300 } },
    { id: 'geometry', frame: { x: 0, y: 0, width: 200, height: 300 } },
  ] })
  expect(elements.find(element => element.id === 'image')!.frame).toEqual(elements.find(element => element.id === 'geometry')!.frame)
  expect(elements[0].frame.width).toBe(480)
  expect(elements[0].frame.x).toBe(100)
})

test('in-view entrances transform the image and geometry together and report entry follows the viewport timeline', () => {
  const scene = { source: { kind: 'portrait' }, framing: 'captioned', tracks: [] } as unknown as VideoScene
  for (const time of [0, 300, 850, 300]) {
    const elements: CanvasElement[] = [], native = context()
    createVideoPainter(scene, time, false, element => elements.push(element))(native.ctx, { id: 'portrait', frame: { x: 0, y: 200, width: 1080, height: 1200 }, children: [
      { id: 'image', frame: { x: 0, y: 0, width: 1080, height: 1200 } },
      { id: 'geometry', frame: { x: 0, y: 0, width: 1080, height: 1200 } },
    ] })
    expect(elements[1].frame).toEqual(elements[2].frame)
    expect(elements[0].frame.width).toBeGreaterThanOrEqual(1080 * .94 - .000001)
    expect(elements[0].frame.width).toBeLessThanOrEqual(1080 + .000001)
  }
  const report = { ...scene, source: { kind: 'report' } } as unknown as VideoScene
  const render = (time: number, reduced = false) => {
    const native = context()
    let opacity = -1
    createVideoPainter(report, time, reduced, undefined, undefined, { 'feature:test': 600 })(native.ctx, { id: 'feature:test', frame: { x: 10, y: 500, width: 170, height: 140 }, draw: ctx => { opacity = ctx.globalAlpha } })
    return opacity
  }
  expect(render(500)).toBe(0)
  expect(render(1300)).toBe(1)
  expect(render(500, true)).toBe(1)
  expect(render(500)).toBe(0)
})

test('a lifted native tile centers in world coordinates and returns exactly without duplicating children', () => {
  const node: CanvasNode = { id: 'tile', frame: { x: 12, y: 450, width: 172, height: 138 }, children: [{ id: 'value', frame: { x: 16, y: 80, width: 130, height: 30 }, draw: ctx => ctx.fillText('7.1', 0, 0) }] }
  const render = (amount: number) => {
    const elements: CanvasElement[] = [], canvas = context()
    canvas.ctx.scale(1080 / 390, 1080 / 390)
    createCanvasPainter(node => node.id === 'tile' ? { lift: { amount, viewport: { x: 0, y: 0, width: 1080, height: 1920 } } } : {}, element => elements.push(element))(canvas.ctx, node)
    expect(canvas.glyphs).toHaveLength(1)
    return elements
  }
  const initial = render(0), centered = render(1), returned = render(0)
  expect(centered[0].frame.x + centered[0].frame.width / 2).toBeCloseTo(540)
  expect(centered[0].frame.y + centered[0].frame.height / 2).toBeCloseTo(960)
  expect(centered[0].frame.width).toBeGreaterThan(initial[0].frame.width)
  expect(returned).toEqual(initial)
})

test('native tile focus leaves every card in its grid cell and its backdrop crisp', () => {
  const track = { ...createMotionTrack('section-lift', 'report', 4000), durationMs: 4000, section: 'feature:0' }
  const scene = { source: { kind: 'report' }, framing: 'full', focus: 'feature:0', tracks: [track] } as VideoScene
  for (const reduced of [false, true]) {
    const effects = new Map<string, CanvasEffect>(), native = context()
    const paint = createVideoPainter(scene, 2000, reduced, undefined, (node, effect) => { effects.set(node.id, { ...effect }); return {} })
    paint(native.ctx, { id: 'report', frame: { x: 0, y: 0, width: 1080, height: 1920 }, children: [
      { id: 'hero', frame: { x: 0, y: 0, width: 1080, height: 900 } },
      { id: 'feature:0', frame: { x: 12, y: 900, width: 172, height: 138 } },
      { id: 'feature:1', frame: { x: 194, y: 900, width: 172, height: 138 } },
    ] })
    expect(effects.get('report')?.blur).toBeUndefined()
    expect(effects.get('feature:0')?.blur).toBeUndefined()
    expect(effects.get('feature:1')?.blur ?? 0).toBe(0)
    expect(effects.get('hero')?.blur ?? 0).toBe(0)
    expect(effects.get('feature:0')?.lift).toBeUndefined()
    expect(effects.get('feature:0')?.highlight?.amount).toBeGreaterThan(0)
    expect(effects.get('feature:1')?.highlight).toBeUndefined()
  }
})

test('portrait features use one borderless timeline and leave branding to the scene chrome', () => {
  const category = reportCategories.find(category => category.id === 'eyes')!, native = context(), elements: CanvasElement[] = []
  const scene = { source: { kind: 'component' }, focus: 'feature:eyes.spacing', layout: 'stacked', tracks: [] } as unknown as VideoScene
  const asset = { image: null, overlay: null, slide: { mockReport: { category, scroll: 0 } } as ContentSlide, regions: mockReportRegions(native.ctx, category), initialScroll: 0, scrollMax: 0 }
  drawFeatureMetric(native.ctx, asset, scene, 2000, true, createCanvasPainter(undefined, element => elements.push(element)))
  expect(elements.map(element => element.id)).toEqual([scene.focus, `${scene.focus}/label`, `${scene.focus}/value`, `${scene.focus}/visual`])
  expect(native.glyphs.filter(glyph => glyph.text === 'Mogging: Face Scan')).toHaveLength(0)
  const stage = elements[0].frame
  for (const element of elements.slice(1)) {
    expect(element.frame.y).toBeGreaterThanOrEqual(stage.y)
    expect(element.frame.y + element.frame.height).toBeLessThanOrEqual(stage.y + stage.height)
  }
})

test('all portrait score stages are borderless, animate on entry and keep qualitative values under their cursors', () => {
  const category = reportCategories.find(category => category.id === 'eyes')!
  for (const focus of ['category-score', 'scores', 'potential', 'feature:eyes.spacing']) {
    const native = context(), elements: CanvasElement[] = []
    const scene = { source: { kind: 'portrait' }, focus, layout: 'stacked', tracks: [] } as unknown as VideoScene
    const asset = { image: null, overlay: null, slide: { currentScore: '7.1', potentialScore: '8.2', mockReport: { category, scroll: 0 } } as ContentSlide, regions: mockReportRegions(native.ctx, category), initialScroll: 0, scrollMax: 0 }
    drawFeatureMetric(native.ctx, asset, scene, 2000, true, createCanvasPainter(undefined, element => elements.push(element)))
    expect(elements.some(element => element.id.endsWith('/surface'))).toBe(false)
    expect(elements.filter(element => element.id.endsWith('/visual'))).toHaveLength(focus === 'scores' ? 2 : 1)
  }
  const native = context()
  const qualitative = { ...category, features: [{ id: 'shape', label: 'Jaw shape', value: 'Tapered', positions: [.64] }] }
  const scene = { source: { kind: 'component' }, focus: 'feature:shape', layout: 'stacked', tracks: [] } as unknown as VideoScene
  const asset = { image: null, overlay: null, slide: { mockReport: { category: qualitative, scroll: 0 } } as ContentSlide, regions: [], initialScroll: 0, scrollMax: 0 }
  drawFeatureMetric(native.ctx, asset, scene, 2000, true)
  expect(native.glyphs.filter(glyph => glyph.text === 'Tapered')).toHaveLength(1)
})

test('a moving card paints each label and value exactly once in its own local layout', () => {
  const { ctx, glyphs } = context()
  const elements: CanvasElement[] = []
  const paint = createCanvasPainter(node => node.id === 'card' ? { x: 10, scale: 1.5, highlight: { color: '#00a8ef', amount: 1 } } : {}, element => elements.push(element))
  const node: CanvasNode = { id: 'card', frame: { x: 40, y: 800, width: 300, height: 200 }, children: [
    { id: 'label', frame: { x: 20, y: 20, width: 200, height: 30 }, draw: ctx => ctx.fillText('Jaw width', 0, 0) },
    { id: 'value', frame: { x: 20, y: 140, width: 200, height: 40 }, draw: ctx => ctx.fillText('0.79×', 0, 0) },
  ] }
  paint(ctx, node)
  expect(glyphs.map(glyph => glyph.text)).toEqual(['Jaw width', '0.79×'])
  expect(glyphs[0].x).toBe(glyphs[1].x)
  expect(glyphs[1].y - glyphs[0].y).toBe(180)
  expect(elements.map(element => element.id)).toEqual(['card', 'label', 'value'])
})

test('changing a value transform leaves its card and sibling label untouched', () => {
  const tree: CanvasNode = { id: 'card', frame: { x: 30, y: 40, width: 300, height: 200 }, children: [
    { id: 'label', frame: { x: 20, y: 20, width: 200, height: 30 } },
    { id: 'value', frame: { x: 20, y: 140, width: 200, height: 40 } },
  ] }
  const baseline: CanvasElement[] = [], changed: CanvasElement[] = []
  createCanvasPainter(undefined, element => baseline.push(element))(context().ctx, tree)
  createCanvasPainter(node => node.id === 'value' ? { y: -25 } : {}, element => changed.push(element))(context().ctx, tree)
  expect(changed[0]).toEqual(baseline[0])
  expect(changed[1]).toEqual(baseline[1])
  expect(changed[2].frame.y).toBe(baseline[2].frame.y - 10)
  expect(changed[2].frame.width).toBe(baseline[2].frame.width)
})

test('an authored element track moves the native metric value without moving its label or painting a copy', () => {
  const category = reportCategories.find(category => category.id === 'jaw')!
  const slide = { currentScore: '7.1', potentialScore: '8.2', mockReport: { category, scroll: 0 } } as ContentSlide
  const region = mockReportRegions(context().ctx, category).find(region => region.id.startsWith('feature:'))!
  const input = { overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2' } as AnalysisPostInput
  const scene = compileAnalysisVideo(scriptToPlan('Open the jaw report.'), input, ['face'], 'brand', reportCategories).scenes[0]
  scene.tracks = [{ ...createMotionTrack('pan-right', 'element', 1000), elementId: `${region.id}/value`, durationMs: 1000 }]
  const baseline: CanvasElement[] = [], changed: CanvasElement[] = []
  const original = context(), animated = context()
  drawReportComponent(original.ctx, slide, region, region, 1, createCanvasPainter(undefined, element => baseline.push(element)))
  drawReportComponent(animated.ctx, slide, region, region, 1, createVideoPainter(scene, 1000, false, element => changed.push(element)))
  expect(changed.find(element => element.id === `${region.id}/label`)).toEqual(baseline.find(element => element.id === `${region.id}/label`))
  expect(changed.find(element => element.id === `${region.id}/value`)!.frame.x).toBeGreaterThan(baseline.find(element => element.id === `${region.id}/value`)!.frame.x)
  expect(changed.map(element => element.id)).toEqual(baseline.map(element => element.id))
  expect(animated.glyphs.map(glyph => glyph.text)).toEqual(original.glyphs.map(glyph => glyph.text))
})
test('editorial shadows belong only to the native card surface, not its content or full reports', () => {
  const scene = { source: { kind: 'component' }, framing: 'captioned', tracks: [] } as unknown as VideoScene
  const shadows: Array<{ id: string; color: unknown }> = []
  let state: Record<string, unknown> = { globalAlpha: 1, shadowColor: 'transparent' }
  const stack: Array<Record<string, unknown>> = []
  const ctx = new Proxy({}, {
    get: (_, key) => key === 'save' ? () => stack.push({ ...state }) : key === 'restore' ? () => { state = stack.pop()! } : state[String(key)] ?? (() => {}),
    set: (_, key, value) => { state[String(key)] = value; return true },
  }) as CanvasRenderingContext2D
  const paint = createVideoPainter(scene, 2000, false)
  for (const id of ['feature:width/surface', 'feature:width/label', 'feature:width/value']) paint(ctx, {
    id, frame: featureStageLayout({ width: 354, height: 145 }).metric,
    draw: ctx => shadows.push({ id, color: ctx.shadowColor }),
  })
  expect(shadows[0].color).toBe('rgba(20,30,44,.12)')
  expect(shadows.slice(1).map(item => item.color)).toEqual(['transparent', 'transparent'])
  createVideoPainter({ ...scene, source: { ...scene.source, kind: 'report' } }, 2000, false)(ctx, {
    id: 'feature:width/surface', frame: { x: 0, y: 0, width: 354, height: 145 },
    draw: ctx => expect(ctx.shadowColor).toBe('transparent'),
  })
})


test('the report photograph and its fade stay registered throughout scrolling', () => {
  const category = reportCategories.find(category => category.id === 'overall')!
  for (const scroll of [0, 60, 120, 260]) {
    const native = context(), elements: CanvasElement[] = [], photos: Array<{ e: number; f: number; a: number; d: number }> = []
    const ctx = new Proxy(native.ctx, { get: (target, key) => key === 'drawImage' ? () => photos.push(target.getTransform()) : Reflect.get(target, key) })
    const paint = createCanvasPainter(undefined, element => elements.push(element))
    const slide = { currentScore: '7.1', potentialScore: '8.2', mockReport: { category, scroll } } as ContentSlide
    drawMockReport(ctx, slide, { width: 390, height: 500 } as HTMLImageElement, null, 1080, 1920, 2000, undefined, { presentation: 'video', paint })
    const fade = elements.find(element => element.id === 'hero-fade')!
    expect(photos[0].e).toBeCloseTo(fade.placement.e)
    expect(photos[0].f).toBeCloseTo(fade.placement.f)
  }
})

test('score summaries reject highlight boxes and beams even from legacy effect overrides', () => {
  let strokes = 0
  const ctx = new Proxy({}, { get: (_, key) => key === 'globalAlpha' ? 1 : key === 'stroke' ? () => strokes++ : key === 'getTransform' ? () => ({ a: 1, b: 0 }) : key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true }) as CanvasRenderingContext2D
  const paint = createCanvasPainter(() => ({ highlight: { color: '#fff', amount: 1 }, beam: { phase: .5, amount: 1 } }))
  for (const id of ['scores', 'scores/surface', 'scores/current', 'scores/current/value', 'scores/potential/value', 'potential', 'potential/value', 'category-score', 'category-score/value']) {
    paint(ctx, { id, frame: { x: 0, y: 0, width: 360, height: 100 } })
    expect(strokes).toBe(0)
  }
  paint(ctx, { id: 'feature:eye', frame: { x: 0, y: 0, width: 360, height: 100 } })
  expect(strokes).toBeGreaterThan(0)
})

test('every report emphasis primitive animates score values directly and leaves the summary layout fixed', () => {
  const { ctx } = context()
  for (const primitive of ['border-beam', 'gradient-outline', 'section-spotlight', 'section-expand', 'section-lift'] as const) {
    for (const section of ['scores', 'potential', 'category-score']) {
      const scene = { source: { kind: 'report' }, focus: section, tracks: [{ ...createMotionTrack(primitive, 'report', 5000), section }] } as VideoScene
      const effects = new Map<string, CanvasEffect>()
      const paint = createVideoPainter(scene, 500, false, undefined, (node, effect) => { effects.set(node.id, effect); return effect })
      const value = section === 'scores' ? 'scores/current/value' : `${section}/value`
      for (const id of [section, value]) paint(ctx, { id, frame: { x: 0, y: 0, width: 140, height: 50 } })
      expect(effects.get(section)!.scale).toBe(1)
      expect(effects.get(value)!.scale).toBeGreaterThan(1)
      expect(effects.get(section)!.highlight).toBeUndefined()
      expect(effects.get(value)!.highlight).toBeUndefined()
      const quiet = createVideoPainter(scene, 500, true, undefined, (node, effect) => { effects.set(node.id, effect); return effect })
      quiet(ctx, { id: value, frame: { x: 0, y: 0, width: 140, height: 50 } })
      expect(effects.get(value)!.scale).toBe(1)
    }
  }
})


test('TikTok branding stays centered, clear of facial features, and above the interface', () => {
  const face = { x: 260, y: 900, width: 560, height: 1100, weight: 5 }
  const eyes = { x: 300, y: 1050, width: 480, height: 180, weight: 100 }
  const cta = videoBrandFrame(true, [face, eyes])
  expect(cta.x+cta.width/2).toBe(videoSize.width/2)
  expect(cta.y+cta.height).toBeLessThanOrEqual(face.y)
  for (const cta of [true,false]) {
    const frame = videoBrandFrame(cta,[face,eyes])
    expect(frame.x).toBeGreaterThanOrEqual(videoBrandSafeArea.x)
    expect(frame.x+frame.width).toBeLessThanOrEqual(videoBrandSafeArea.x+videoBrandSafeArea.width)
    expect(frame.y+frame.height).toBeLessThanOrEqual(videoBrandSafeArea.y+videoBrandSafeArea.height)
  }
  const fullHeightFace = { ...face, y: 0, height: 2340 }
  const centered = videoBrandFrame(true,[fullHeightFace,eyes])
  expect(centered.y+centered.height<=eyes.y || centered.y>=eyes.y+eyes.height).toBe(true)
})

test('the scan ticker repeats on the video clock with a readable hold and quiet gaps', () => {
  expect(videoTickerMotion(7999)).toBeNull()
  expect(videoTickerMotion(8000)!.opacity).toBe(0)
  expect(videoTickerMotion(8420)!.opacity).toBe(1)
  expect(videoTickerMotion(10000)!.opacity).toBe(1)
  expect(videoTickerMotion(11000)!.opacity).toBeGreaterThan(0)
  expect(videoTickerMotion(10920)!.opacity).toBe(1)
  expect(videoTickerMotion(11200)!.opacity).toBeGreaterThan(0)
  expect(videoTickerMotion(11340)).toBeNull()
  for (const start of [8000,17000,26000,35000]) {
    expect(videoTickerMotion(start+700)).toEqual({opacity:1,offset:0,blur:0})
    expect(videoTickerMotion(start+5000)).toBeNull()
    expect(videoTickerMotion(start+100,true)).toEqual({opacity:1,offset:0,blur:0})
  }
})
