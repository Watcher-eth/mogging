import { videoSize, videoContent } from './video-layout'
import { expect, test } from 'bun:test'
import { scriptToPlan, planScriptShots } from './script-edit'
import { compileAnalysisVideo, inferScriptCategory, parseComposition } from './video-composition'
import { reportCategories } from './mock-report-data'
import type { AnalysisPostInput } from './analysis-post'
import { reportUi } from './mobile-report-ui'
import { mockReportRegions, drawMockReport } from './mock-report'
import { reportMotion, sectionScroll, expandInPlace } from './report-choreography'
import type { ContentSlide } from './content-generator'
import { appReportFrame, sceneFrame, featureStageLayout, elementEntrance } from './video-layout'
import { animateMetricText } from './mock-report'
import { reportEntryTimes } from './report-choreography'

const input: AnalysisPostInput = { formatId: 'score-reveal', subject: 'Test', hook: 'Your report', overallScore: '7.1', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2', recommendation: 'Keep a routine.', productFeatures: [], cta: 'Mogging.com' }
const context = () => {
  let x = 0, y = 0, sx = 1, sy = 1
  const stack: number[][] = []
  return new Proxy({}, { get: (target, key) => {
    if (key === 'save') return () => stack.push([x, y, sx, sy])
    if (key === 'restore') return () => { [x, y, sx, sy] = stack.pop() ?? [0, 0, 1, 1] }
    if (key === 'translate') return (dx: number, dy: number) => { x += dx * sx; y += dy * sy }
    if (key === 'scale') return (dx: number, dy: number) => { sx *= dx; sy *= dy }
    if (key === 'fillText') return (text: string, left: number, top: number) => { const record = Reflect.get(target, key); if (record) record(text, x + left * sx, y + top * sy) }
    return Reflect.has(target, key) ? Reflect.get(target, key) : key === 'measureText' ? (text: string) => ({ width: text.length * 6 }) : key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}
  } }) as CanvasRenderingContext2D
}

test('changing the script changes shot order, app category, section emphasis and runtime', () => {
  const first = scriptToPlan('Your jawline scores 6.2. Next, see growth potential and your action plan.')
  const second = scriptToPlan('The eye spacing is balanced. The nose width and lip proportions work together. Open your personalized routine and follow the action plan every day.')
  const a = compileAnalysisVideo(first, input, ['face'], 'brand', reportCategories)
  const b = compileAnalysisVideo(second, input, ['face'], 'brand', reportCategories)
  expect(a.scenes[0].source.categoryId).toBe('jaw')
  expect(a.scenes[0].focus).toBe('category-score')
  expect(b.scenes[0].source.categoryId).toBe('eyes')
  expect(a.durationMs).not.toBe(b.durationMs)
  expect(a.scenes.some(scene => scene.tracks.some(track => track.primitive === 'scroll-to-section' && track.section === 'potential'))).toBe(true)
  expect(b.scenes.some(scene => scene.focus === 'action-plan')).toBe(true)
  expect(inferScriptCategory('Jaw and then eyes')).toBe('jaw')
})

test('script reading pace changes timing, while cuts remain contiguous and under three seconds', () => {
  const script = 'Mogging maps your face and explains the strongest features in a complete evaluation. Open the eye area and compare the proportions before exploring the personalized routine.'
  const slow = scriptToPlan(script, 145), fast = scriptToPlan(script, 190)
  expect(slow.duration).toBeGreaterThan(fast.duration)
  const shots = planScriptShots(slow)
  expect(shots[0].startMs).toBe(0)
  for (const [index, shot] of shots.entries()) {
    expect(shot.durationMs).toBeLessThanOrEqual(3000)
    if (index) expect(shot.startMs).toBe(shots[index - 1].startMs + shots[index - 1].durationMs)
  }
  expect(shots.at(-1)!.startMs + shots.at(-1)!.durationMs).toBe(Math.round(slow.duration * 1000))
  expect(() => scriptToPlan('')).toThrow()
})

test('highlight bounds follow the actual report card layout for every category and content reflow', () => {
  for (const base of reportCategories) {
    for (const expand of [false, true]) {
      const category = { ...base, features: base.features.map((feature, index) => index === 0 && expand ? { ...feature, value: 'A much longer metric value that forces the actual mobile card into a full-width row' } : feature) }
      const drawn: Array<{ text: string; x: number; y: number }> = []
      const ctx = context()
      ctx.fillText = (text, x, y) => { drawn.push({ text, x, y }) }
      const slide = { currentScore: '7.1', potentialScore: '8.2', mockReport: { category, scroll: 0 } } as ContentSlide
      drawMockReport(ctx, slide, null, null, 390, 620, 1000, undefined, { viewportHeight: 620 })
      const regions = mockReportRegions(ctx, category)
      for (const feature of category.features) {
        const region = regions.find(item => item.label === feature.label)!
        const label = drawn.find(item => item.text === feature.label.toUpperCase())!
        expect(label.x).toBe(region.x + reportUi.padding)
        expect(label.y).toBe(region.y + reportUi.padding)
      }
      const potential = regions.find(item => item.id === 'potential')!
      expect(drawn.find(item => item.text === 'Your potential')!.y).toBe(potential.y)
      const action = regions.find(item => item.id === 'action-plan')!
      expect(drawn.find(item => item.text === (category.id === 'overall' ? 'Your priorities' : 'Action Plan'))!.y).toBe(action.y)
    }
  }
})

test('section scroll settles on the actual target and supports arbitrary-time scrubbing', () => {
  const composition = compileAnalysisVideo(scriptToPlan('See your growth potential.'), input, ['face'], 'brand', reportCategories)
  const scene = composition.scenes[0]
  const category = scene.source.report!
  const asset = { image: null, overlay: null, slide: {} as ContentSlide, regions: mockReportRegions(context(), category), scrollMax: 1800, initialScroll: 0 }
  const start = reportMotion(scene, asset, 0), end = reportMotion(scene, asset, 1200)
  expect(start.scroll).toBe(0)
  expect(end.scroll).toBeGreaterThan(start.scroll)
  expect(reportMotion(scene, asset, 500)).toEqual(reportMotion(scene, asset, 500))
  expect(sectionScroll({ id: 'hero', label: 'Face', x: 0, y: 0, width: 390, height: 465 }, 620, 1800)).toBe(0)
  expect(sectionScroll({ id: 'scores', label: 'Overall', x: 12, y: 385, width: 366, height: 110 }, 620, 1800)).toBe(0)
})

test('report framing stays edge-to-edge even with legacy scale tracks and imported framing', () => {
  const composition = compileAnalysisVideo(scriptToPlan('Open the eye evaluation. Scroll to your growth potential. Get your report with Mogging.'), input, ['face'], 'brand', reportCategories)
  expect(composition.width).toBe(videoSize.width)
  expect(composition.height).toBe(2340)
  const full = appReportFrame('full'), caption = appReportFrame('captioned')
  expect(full).toEqual({ x: 0, y: 0, ...videoSize })
  expect(caption).toEqual(full)
  for (const framing of ['full', 'captioned', 'detail', 'device'] as const) {
    const scene = { ...composition.scenes[0], framing }
    const previous = { x: 162, y: 510, width: 756, height: 1344 }, duration = scene.durationMs
    for (const t of [0, .01, .25, .5, .75, .99, 1]) {
      const frame = sceneFrame(scene, duration * t, previous)
      expect(frame.width / frame.height).toBeCloseTo(9 / 19.5, 8)
      expect(frame).toEqual(full)
      expect(sceneFrame(scene, duration * t, previous)).toEqual(frame)
    }
    expect(sceneFrame(scene, duration, previous)).toEqual(appReportFrame(framing))
    expect(sceneFrame(scene, 0, previous, true)).toEqual(appReportFrame(framing))
  }
})

test('feature portrait cues use the subject image and category geometry; app cues keep the report', () => {
  // Keep this cue-mapping clip below ten seconds; longer videos reserve early app proof separately.
  const composition = compileAnalysisVideo(scriptToPlan('Start here. Highlight eye spacing on the image with overlays. Open the eye evaluation score. Show jaw contour on the portrait without the report. Scroll to the action plan.', 230), input, ['subject'], 'brand', reportCategories)
  const eyes = composition.scenes.find(scene => scene.source.kind === 'portrait' && scene.source.categoryId === 'eyes')!
  const jaw = composition.scenes.find(scene => scene.source.kind === 'portrait' && scene.source.categoryId === 'jaw')!
  expect(eyes.source.imageId).toBe('subject')
  expect(eyes.source.overlay).toBe('category')
  expect(jaw.source.overlay).toBe('category')
  expect(eyes.tracks.some(track => track.primitive === 'contour-trace')).toBe(true)
  expect(eyes.framing).toBe('captioned')
  expect(jaw.tracks.some(track => track.primitive === 'caption-swish')).toBe(true)
  expect(composition.scenes.some(scene => scene.source.kind === 'report' && scene.focus === 'category-score')).toBe(true)
  expect(composition.scenes.some(scene => scene.source.kind === 'report' && scene.focus === 'action-plan')).toBe(true)
})

test('opening layout stays full-screen even when importing an old title or component first', () => {
  const composition = compileAnalysisVideo(scriptToPlan('Open the eye report. Show the eye spacing slider big in the center.'), input, ['face'], 'brand', reportCategories)
  expect(composition.scenes[0].framing).toBe('full')
  for (const kind of ['title', 'component'] as const) {
    const first = { ...composition.scenes[0], framing: 'captioned', source: { ...composition.scenes[0].source, kind } }
    const parsed = parseComposition({ ...composition, scenes: [first, ...composition.scenes.slice(1)] })
    expect(parsed.scenes[0].framing).toBe('full')
    expect(parsed.scenes[0].source.kind).toBe('report')
  }
  const component = composition.scenes.find(scene => scene.source.kind === 'component')!
  expect(component.focus.startsWith('feature:')).toBe(true)
  expect(component.tracks.some(track => track.primitive === 'component-focus')).toBe(true)
})

test('native expansion keeps its original center and returns exactly; focused components fit the stage', () => {
  const frame = appReportFrame('full'), rect = { x: 48, y: 520, width: 480, height: 300 }
  expect(expandInPlace(rect, frame, 0, 1)).toEqual(rect)
  const expanded = expandInPlace(rect, frame, 1, 1)
  expect(expanded.width).toBeGreaterThan(rect.width)
  expect(expanded.x + expanded.width / 2).toBe(rect.x + rect.width / 2)
  expect(expanded.y + expanded.height / 2).toBe(rect.y + rect.height / 2)
  const focused = featureStageLayout(rect).metric
  expect(focused.x + focused.width / 2).toBe(540)
  expect(focused.y).toBeGreaterThan(400)
  expect(focused.y + focused.height).toBeLessThan(videoSize.height - 100)
})

test('report exports omit operating-system chrome while retaining actual app controls', () => {
  const drawn: string[] = [], ctx = context()
  ctx.fillText = value => { drawn.push(value) }
  const category = reportCategories[0]
  drawMockReport(ctx, { currentScore: '7.1', potentialScore: '8.2', mockReport: { category, scroll: 0 } } as ContentSlide, null, null, 390, 693, 1000)
  expect(drawn).not.toContain('9:41')
  expect(drawn).toContain('SHARE YOUR SCORE')
  expect(drawn).toContain(category.title)
})

test('a feature explanation holds one scene with the face, category geometry and native metric', () => {
  const composition = compileAnalysisVideo(scriptToPlan('Open the eye report. Show the eye spacing slider big in the center. Return to the eye report.'), input, ['subject'], 'brand', reportCategories)
  const stages = composition.scenes.filter(scene => scene.source.kind === 'component')
  expect(stages).toHaveLength(1)
  expect(stages[0].narration).toContain('slider big in the center')
  expect(stages[0].durationMs).toBeGreaterThan(3000)
  expect(stages[0].source.imageId).toBe('subject')
  expect(stages[0].source.overlay).toBe('category')
  expect(stages[0].focus).toBe('feature:eyes.spacing')
  expect(stages[0].tracks.some(track => track.primitive === 'cinematic-flow')).toBe(true)
  const layout = featureStageLayout({ width: 354, height: 145 })
  expect(layout.face.width).toBeGreaterThanOrEqual(880)
  expect(layout.metric.width).toBeCloseTo(videoContent.width)
  expect(layout.face.y + layout.face.height - layout.metric.y).toBeGreaterThan(150)
  expect(layout.face.y + layout.face.height - layout.metric.y).toBeLessThanOrEqual(400)
  expect(layout.metric.y + layout.metric.height).toBeLessThan(videoSize.height - 100)
})

test('meter entrances build from zero and retain exact final values', () => {
  expect(elementEntrance(0, 200, 800)).toBe(0)
  expect(elementEntrance(600, 200, 800)).toBe(.5)
  expect(elementEntrance(1000, 200, 800)).toBe(1)
  expect(animateMetricText('L 1.60× · R 1.60×', 0)).toBe('L 0.00× · R 0.00×')
  expect(animateMetricText('6.2 / 10', 1)).toBe('6.2 / 10')
  expect(animateMetricText('6.2 / 10', .5)).toBe('3.1 / 10')
  const scene = compileAnalysisVideo(scriptToPlan('Open the eye spacing report.'), input, ['face'], 'brand', reportCategories).scenes[0]
  const asset = { image: null, overlay: null, slide: {} as ContentSlide, regions: mockReportRegions(context(), scene.source.report!), scrollMax: 1800, initialScroll: 0 }
  const entries = reportEntryTimes(scene, asset)
  expect(entries).toEqual(reportEntryTimes(scene, asset))
  expect(entries['feature:eyes.spacing']).toBeGreaterThanOrEqual(0)
  expect(elementEntrance(entries['feature:eyes.spacing'] - 1, entries['feature:eyes.spacing'], 650)).toBe(0)
})
