import { describe, expect, test } from 'bun:test'
import { buildAnalysisPost, type AnalysisPostInput } from './analysis-post'
import { activeScene, allowedPrimitives, arrangeVideoScenes, compileAnalysisVideo, createMotionTrack, parseComposition, retimeVideoScene, videoStyles, type VideoStyleId } from './video-composition'
import { motionPrimitives, primitiveProgress, sampleMotionPrimitive, type MotionPrimitiveId } from './motion-primitives'
import { reportCategories } from './mock-report-data'

const input: AnalysisPostInput = { formatId: 'score-reveal', subject: 'Test subject', hook: 'What makes this face stand out?', overallScore: '0', potentialScore: '8.2', strongestFeature: 'Eyes', strongestScore: '8.1', opportunityFeature: 'Jaw', opportunityScore: '6.2', recommendation: 'Repeat in consistent lighting.', productFeatures: ['Category scores'], cta: 'Get your report at Mogging.com' }
const build = (style: VideoStyleId = 'creator') => compileAnalysisVideo(buildAnalysisPost(input), input, ['face-1', 'face-2'], style, reportCategories)

describe('video motion system', () => {
  test('editorial cuts resolve to sharp resting frames and hide the chapter exchange', () => {
    for (const primitive of ['focus-cut', 'luma-cut'] as const) {
      for (const time of [0, 1]) {
        const sample = sampleMotionPrimitive(primitive, time)
        expect(sample.scale).toBeCloseTo(1)
        expect(sample.blur).toBeCloseTo(0)
        expect(sample.brightness).toBeCloseTo(1)
      }
    }
    expect(sampleMotionPrimitive('focus-cut', .5).blur).toBe(7)
    expect(sampleMotionPrimitive('luma-cut', .5).brightness).toBe(0)
    expect(build('brand').scenes.at(-1)!.tracks[0].primitive).toBe('crossfade')
  })
  test('all registered primitives are unique and deterministic at arbitrary frame times', () => {
    expect(motionPrimitives.length).toBeGreaterThanOrEqual(70)
    expect(new Set(motionPrimitives.map(item => item.id)).size).toBe(motionPrimitives.length)
    for (const primitive of motionPrimitives) for (const time of [-1, 0, .17, .5, .99, 1, 2]) {
      const sample = sampleMotionPrimitive(primitive.id as MotionPrimitiveId, time)
      expect(Object.values(sample).every(Number.isFinite)).toBe(true)
      expect(sample).toEqual(sampleMotionPrimitive(primitive.id as MotionPrimitiveId, time))
      expect(sample.opacity).toBeGreaterThanOrEqual(0)
      expect(sample.opacity).toBeLessThanOrEqual(1)
    }
  })

  test('every style and duration compiles to a gap-free validated timeline with report and face sources', () => {
    for (const style of Object.keys(videoStyles) as VideoStyleId[]) for (const formatId of ['score-reveal', 'feature-audit', 'brand-explainer'] as const) {
      const next = { ...input, formatId }
      const composition = compileAnalysisVideo(buildAnalysisPost(next), next, ['face-1'], style, reportCategories)
      expect(parseComposition(JSON.parse(JSON.stringify(composition)))).toEqual(composition)
      expect(composition.theme).toBe('light')
      expect(composition.scenes.every(scene => scene.source.report)).toBe(true)
      expect(composition.scenes[0].framing).toBe('full')
      expect(composition.scenes.filter(scene => scene.source.kind === 'report').every(scene => (scene.durationMs <= 3100 || scene.label === 'Report · Early app proof') && scene.framing === 'full')).toBe(true)
      expect(composition.scenes.some(scene => scene.tracks.some(track => ['fade-in','fade-out','blur-in'].includes(track.primitive)))).toBe(false)
      expect(composition.scenes.some(scene => scene.source.kind === 'report')).toBe(true)
      expect(composition.scenes[0].source.currentScore).toBe(0)
      expect(composition.scenes.at(-1)?.source.kind).toBe('title')
    }
  })

  test('hard cuts select the new scene exactly on its boundary and clamp out-of-range seeks', () => {
    const composition = build()
    expect(activeScene(composition, -1).id).toBe(composition.scenes[0].id)
    expect(activeScene(composition, composition.scenes[1].startMs - .01).id).toBe(composition.scenes[0].id)
    expect(activeScene(composition, composition.scenes[1].startMs).id).toBe(composition.scenes[1].id)
    expect(activeScene(composition, 999999).id).toBe(composition.scenes.at(-1)!.id)
  })

  test('rejects malformed imports, invalid primitive targets, duplicate IDs and tracks beyond scene bounds', () => {
    const composition = build()
    expect(() => parseComposition({ ...composition, durationMs: 4 })).toThrow()
    expect(() => parseComposition({ ...composition, width: 200000 })).toThrow()
    const change = (track: unknown) => ({ ...composition, scenes: [{ ...composition.scenes[0], tracks: [track] }, ...composition.scenes.slice(1)] })
    const track = composition.scenes[0].tracks[0]
    expect(() => parseComposition(change({ ...track, primitive: 'not-a-primitive' }))).toThrow()
    expect(() => parseComposition(change({ ...track, primitive: 'cursor-tap', target: 'camera' }))).toThrow()
    expect(() => parseComposition(change({ ...track, durationMs: 99999 }))).toThrow()
    expect(() => parseComposition({ ...composition, scenes: [composition.scenes[0], { ...composition.scenes[1], id: composition.scenes[0].id }, ...composition.scenes.slice(2)] })).toThrow()
  })

  test('exit defaults land at the end of a scene and all primitives have an authorable target', () => {
    expect(createMotionTrack('fade-out', 'content', 1600).startMs).toBe(1340)
    for (const primitive of motionPrimitives) expect(['camera', 'content', 'text', 'overlay', 'decoration', 'report'].some(target => allowedPrimitives(target as Parameters<typeof allowedPrimitives>[0]).some(item => item.id === primitive.id))).toBe(true)
    expect(primitiveProgress(100, 200, 500)).toBe(0)
    expect(primitiveProgress(450, 200, 500)).toBe(.5)
    expect(primitiveProgress(1000, 200, 500)).toBe(1)
  })

  test('retiming scales relative track timing and reflows all later scenes', () => {
    const composition = build()
    const first = composition.scenes[0]
    const retimed = retimeVideoScene(first, first.durationMs * 2)
    const next = arrangeVideoScenes(composition, [retimed, ...composition.scenes.slice(1)])
    expect(next.scenes[1].startMs).toBe(first.durationMs * 2)
    expect(next.durationMs).toBe(composition.durationMs + first.durationMs)
    expect(retimed.tracks[1].durationMs).toBe(first.tracks[1].durationMs * 2)
  })
})


test('ripples accent occasional report entrances with quick dissolves on exits', () => {
  const composition = build('brand')
  let lastRippleMs = -Infinity, count = 0
  for (const [index, scene] of composition.scenes.entries()) {
    const previous = composition.scenes[index - 1]
    if (!previous) continue
    const transition = scene.tracks.find(track => track.target === 'content')!
    if (transition.primitive === 'liquid-ripple') {
      expect(scene.source.kind).toBe('report')
      expect(previous.source.kind).not.toBe('report')
      expect(scene.startMs - lastRippleMs).toBeGreaterThanOrEqual(12000)
      expect(transition.durationMs).toBeLessThanOrEqual(260)
      lastRippleMs = scene.startMs; count++
    } else if ((previous.source.kind === 'report') !== (scene.source.kind === 'report')) {
      expect(transition.primitive).toBe('crossfade')
      expect(transition.durationMs).toBeLessThanOrEqual(180)
    }
  }
  expect(count).toBeGreaterThan(0)
  expect(count).toBeLessThanOrEqual(2)
})


test('consecutive native report views keep one viewport instead of dissolving duplicate grids', async () => {
  const { choreographVideoTransitions, createMotionTrack } = await import('./video-composition')
  const { sharesReport } = await import('./video-layout')
  const source = { kind: 'report' as const, imageId: 'face', categoryId: 'jaw', overlay: 'none' as const, currentScore: 7.1, potentialScore: 8.2, metricScore: 7.4 }
  const first = { id: 'a', startMs: 0, durationMs: 3000, source, tracks: [createMotionTrack('layout-morph', 'content', 3000)] } as import('./video-composition').VideoScene
  const same = { ...first, id: 'b', startMs: 3000 }
  const changed = { ...first, id: 'c', startMs: 6000, source: { ...source, categoryId: 'eyes' } }
  const result = choreographVideoTransitions({ scenes: [first, same, changed] } as import('./video-composition').VideoComposition)
  expect(sharesReport(first, same)).toBe(true)
  expect(result.scenes[1].tracks[0].primitive).toBe('hard-cut')
  expect(result.scenes[2].tracks[0].primitive).toBe('crossfade')
  expect(result.scenes[2].tracks[0].durationMs).toBeLessThanOrEqual(180)
  expect(sharesReport(first, { ...same, source: { ...source, metricScore: 8 } })).toBe(false)
})
